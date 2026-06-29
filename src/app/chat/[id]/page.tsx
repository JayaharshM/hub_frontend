"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useSessions, useMessages, useCreateSession } from "@/hooks/useChat";
import api from "@/lib/api";
import ChatInput from "@/components/chat/ChatInput";
import AIMessage from "@/components/chat/AIMessage";
import ReasoningBlock from "@/components/chat/ReasoningBlock";
import { Info, BookOpen, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessage = {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  thinking_enabled?: boolean;
  sources?: { filename: string; text: string; score?: number; page_number?: number }[];
  created_at?: string;
};

export default function ChatSessionPage() {
  const params = useParams();
  const sessionId = params?.id as string | undefined;
  const queryClient = useQueryClient();
  const createSession = useCreateSession();

  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: dbMessages, isLoading: messagesLoading } = useMessages(sessionId || null);

  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [activeDrawerSources, setActiveDrawerSources] = useState<any[] | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSessionIdRef = useRef<string>("");

  // Sync DB messages into local state when not actively streaming
  useEffect(() => {
    if (dbMessages && !isAsking && sessionId) {
      const sessionChanged = sessionId !== lastSessionIdRef.current;
      if (sessionChanged) {
        setLocalMessages(dbMessages as ChatMessage[]);
        lastSessionIdRef.current = sessionId;
      } else {
        if (dbMessages.length >= localMessages.length) {
          setLocalMessages(dbMessages as ChatMessage[]);
        }
      }
    }
  }, [dbMessages, isAsking, sessionId, localMessages.length]);

  // Fetch all documents for selection
  const { data: allDocuments } = useQuery<any[]>({
    queryKey: ["all-documents"],
    queryFn: async () => {
      const res = await api.get("/documents");
      return res.data;
    },
  });

  // Filter documents to show those belonging to the current session or global ones (session_id is null)
  const sessionDocuments = allDocuments?.filter(
    (doc) => doc.processed && (doc.session_id === sessionId || doc.session_id === null)
  ) ?? [];

  const isLoading = sessionsLoading || messagesLoading;

  // Auto-scroll
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
    return () => clearTimeout(timer);
  }, [localMessages]);

  // Stop generation
  function stopGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsAsking(false);
    }
  }

  // Send message and stream response inline
  async function handleSend(
    text: string,
    useRag: boolean,
    thinkingMode: boolean,
    webSearch: boolean = false,
    useHyde: boolean = false,
    retrievalMode: string = "semantic",
    useReranker: boolean = false,
    ragChunkLimit: number = 4,
    documentIds: string[] | null = null
  ) {
    const currentQuestion = text.trim();
    if (!currentQuestion || isAsking || !sessionId) return;

    setIsAsking(true);

    // Append user message and empty assistant placeholder immediately
    const tempAssistantId = `asst-${Date.now()}`;
    setLocalMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        session_id: sessionId,
        role: "user",
        content: currentQuestion,
        created_at: new Date().toISOString(),
      },
      {
        id: tempAssistantId,
        session_id: sessionId,
        role: "assistant",
        content: "",
        thinking: "",
        thinking_enabled: thinkingMode,
        sources: [],
        created_at: new Date().toISOString(),
      },
    ]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let token = localStorage.getItem("access_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const url = `${apiUrl}/api/v1/chat/sessions/${sessionId}/messages`;

      let res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          content: currentQuestion,
          use_rag: useRag,
          thinking_mode: thinkingMode,
          web_search: webSearch,
          use_hyde: useHyde,
          retrieval_mode: retrievalMode,
          use_reranker: useReranker,
          rag_chunk_limit: ragChunkLimit,
          document_ids: documentIds,
        }),
        signal: controller.signal,
      });

      // Handle 401 with token refresh
      if (res.status === 401) {
        const refreshToken = localStorage.getItem("refresh_token");
        if (refreshToken) {
          try {
            const refreshRes = await fetch(`${apiUrl}/api/v1/auth/refresh`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refresh_token: refreshToken }),
            });
            if (refreshRes.ok) {
              const data = await refreshRes.json();
              token = data.access_token;
              localStorage.setItem("access_token", token!);
              res = await fetch(url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  content: currentQuestion,
                  use_rag: useRag,
                  thinking_mode: thinkingMode,
                  web_search: webSearch,
                  use_hyde: useHyde,
                  retrieval_mode: retrievalMode,
                  use_reranker: useReranker,
                  rag_chunk_limit: ragChunkLimit,
                  document_ids: documentIds,
                }),
                signal: controller.signal,
              });
            }
          } catch {
            // refresh failed
          }
        }
      }

      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`);
      }

      // Read the SSE stream inline
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantAnswer = "";
      let assistantThinking = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const raw = part.slice(6).trim();
          if (raw === "[DONE]") break;

          try {
            const parsed = JSON.parse(raw);
            console.log("🔍 Stream parsed chunk:", parsed);
            if ("sources" in parsed) {
              setLocalMessages((prev) =>
                prev.map((msg) =>
                  msg.id === tempAssistantId ? { ...msg, sources: parsed.sources } : msg
                )
              );
            } else if ("thinking" in parsed) {
              console.log("💡 Received thinking token:", parsed.thinking);
              assistantThinking += parsed.thinking;
              setLocalMessages((prev) =>
                prev.map((msg) =>
                  msg.id === tempAssistantId ? { ...msg, thinking: assistantThinking } : msg
                )
              );
            } else if ("delta" in parsed) {
              assistantAnswer += parsed.delta;
              setLocalMessages((prev) =>
                prev.map((msg) =>
                  msg.id === tempAssistantId ? { ...msg, content: assistantAnswer } : msg
                )
              );
            }
          } catch (e) {
            console.error("❌ Stream parse error:", e, "on raw data:", raw);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setLocalMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempAssistantId
              ? { ...msg, content: msg.content || "Generation stopped." }
              : msg
          )
        );
      } else {
        console.error("Stream error:", err);
        setLocalMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempAssistantId
              ? {
                  ...msg,
                  content:
                    "Sorry, I encountered a communication error. Please check if the backend and Ollama are running.",
                }
              : msg
          )
        );
      }
    } finally {
      setIsAsking(false);
      abortControllerRef.current = null;
      queryClient.invalidateQueries({ queryKey: ["chat-messages", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    }
  }

  const currentSession = sessions?.find((s) => s.id === sessionId);
  const isLocal = sessionId?.startsWith("local-");

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950">
      {/* Demo Banner */}
      {isLocal && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
          ⚠️ Demo Mode: Using mock data (local storage). Connect your backend to use real chat API.
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-slate-900 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white">
            {currentSession?.title ?? "Conversation"}
          </h1>
          {currentSession?.created_at && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Created on {new Date(currentSession.created_at).toLocaleDateString()}
            </p>
          )}
        </div>
        {isAsking && (
          <button
            onClick={stopGeneration}
            className="text-xs px-2.5 py-1 rounded bg-red-500 text-white font-medium hover:bg-red-600 transition"
          >
            Stop
          </button>
        )}
      </div>

      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
      >
        {isLoading && !isAsking && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-cixio-blue mb-2"></div>
              <p className="text-sm text-gray-400">Loading messages…</p>
            </div>
          </div>
        )}

        {!isLoading && localMessages.length === 0 && !isAsking && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 max-w-sm mx-auto">
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">✨ Start a new conversation</p>
            <p className="text-sm text-gray-500">Ask a question or request assistance from your college helper.</p>
          </div>
        )}

        {/* Messages */}
        {localMessages.map((m, index) => (
          <div
            key={m.id}
            className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cixio-dark to-cixio-blue flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-xs text-white font-bold">AI</span>
              </div>
            )}

            <div className="flex flex-col gap-1 max-w-[80%]">
              {m.role === "assistant" ? (
                <>
                  {/* Citations references */}
                  {m.sources && m.sources.length > 0 && (
                    <button
                      onClick={() => setActiveDrawerSources(m.sources || null)}
                      className="inline-flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700 bg-purple-500/10 dark:bg-purple-500/5 border border-purple-500/20 dark:border-purple-800/30 px-2.5 py-1 rounded-full cursor-pointer hover:bg-purple-500/20 transition-all mb-2 w-fit select-none"
                    >
                      <Info className="h-3 w-3" />
                      Grounded in {m.sources.length} document sources · Click to inspect
                    </button>
                  )}

                  {/* Thinking / Reasoning Process */}
                  {(m.thinking_enabled || !!m.thinking) && (
                    <ReasoningBlock
                      thinking={m.thinking || ""}
                      isStreaming={isAsking && !m.content && index === localMessages.length - 1}
                    />
                  )}

                  {/* Answer or typing indicator */}
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-xl rounded-bl-sm px-3 py-2 text-sm prose prose-sm dark:prose-invert max-w-none min-w-[140px]">
                    {m.content ? (
                      <AIMessage content={m.content} />
                    ) : (
                      <div className="flex items-center gap-2 py-1 text-gray-500 dark:text-gray-400">
                        <span className="text-xs font-medium animate-pulse">Typing</span>
                        <div className="flex items-center space-x-1 h-2">
                          <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                          <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                          <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="bg-cixio-blue text-white rounded-xl rounded-tr-sm px-4 py-2.5 text-sm break-words shadow-sm">
                  {m.content}
                </div>
              )}
            </div>

            {m.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cixio-navy to-cixio-blue flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-xs text-white font-bold">U</span>
              </div>
            )}
          </div>
        ))}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <ChatInput
        onSend={handleSend}
        disabled={isAsking || !sessionId}
        activeSessionId={sessionId}
        documents={sessionDocuments}
      />

      {/* Citations inspect sliding drawer */}
      {activeDrawerSources && (
        <section className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="h-full w-full max-w-xl bg-white dark:bg-[#171717] border-l border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col animate-slideIn">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-purple-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Retrieved Citations</h3>
              </div>
              <button
                onClick={() => setActiveDrawerSources(null)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* List of matched vector chunks */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 font-sans">
              {activeDrawerSources.map((source, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 p-4 hover:border-purple-500/30 transition-all duration-200 text-left"
                >
                  {/* Metadata */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-purple-600 bg-purple-500/10 px-2 py-0.5 rounded font-mono">
                      Chunk {idx + 1} {source.score ? `· Match ${(source.score * 100).toFixed(1)}%` : ""}
                    </span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                      File: {source.filename || "Unknown"}{" "}
                      {source.page_number ? `· Page ${source.page_number}` : ""}
                    </span>
                  </div>

                  {/* Extract Text */}
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed bg-white dark:bg-[#212121] p-3 rounded-lg border border-gray-200 dark:border-gray-800 font-mono select-text whitespace-pre-wrap max-h-56 overflow-y-auto">
                    {source.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
