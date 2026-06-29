"use client";

import React from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useSessions, useDeleteSession } from "@/hooks/useChat";
import NewChatButton from "@/components/chat/newchatbutton";
import { MessageSquare, Trash2 } from "lucide-react";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const activeSessionId = params?.id as string | undefined;

  const { data: sessions, isLoading, error } = useSessions();
  const deleteSession = useDeleteSession();

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (confirm("Are you sure you want to delete this chat?")) {
      try {
        await deleteSession.mutateAsync(id);
        // If we deleted the currently active session, redirect to /chat to select/create a new one
        if (activeSessionId === id) {
          router.push("/chat");
        }
      } catch (err) {
        alert("Failed to delete session");
      }
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Sidebar - Chat History */}
      <aside className="w-80 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-slate-900 flex flex-col flex-shrink-0">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 px-1">
            Chat History
          </h2>
          <NewChatButton />
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading && (
            <div className="flex items-center justify-center p-4">
              <span className="text-xs text-gray-400">Loading history…</span>
            </div>
          )}

          {error && (
            <div className="p-4 text-center">
              <span className="text-xs text-red-500">Error loading history</span>
            </div>
          )}

          {!isLoading && (!sessions || sessions.length === 0) && (
            <div className="p-4 text-center">
              <span className="text-xs text-gray-400">No chat sessions</span>
            </div>
          )}

          {sessions?.map((session) => {
            const isActive = activeSessionId === session.id;
            return (
              <div
                key={session.id}
                onClick={() => router.push(`/chat/${session.id}`)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 ${
                  isActive
                    ? "bg-cixio-light dark:bg-cixio-blue/10 text-cixio-blue dark:text-cixio-muted font-medium"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800/60"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <MessageSquare
                    className={`w-4 h-4 flex-shrink-0 ${
                      isActive
                        ? "text-cixio-blue dark:text-cixio-muted"
                        : "text-gray-400 group-hover:text-gray-500"
                    }`}
                  />
                  <span className="text-sm truncate">
                    {session.title || "Untitled Chat"}
                  </span>
                </div>

                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  disabled={deleteSession.isPending}
                  className="opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-slate-700 p-1 rounded transition-all duration-150 text-gray-400 hover:text-red-500 flex-shrink-0"
                  title="Delete chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main Chat Content Area */}
      <main className="flex-1 min-w-0 relative flex flex-col h-full bg-white dark:bg-slate-950">
        {children}
      </main>
    </div>
  );
}
