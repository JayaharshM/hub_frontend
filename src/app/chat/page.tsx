"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessions, useCreateSession } from "@/hooks/useChat";

export default function ChatPage() {
  const router = useRouter();
  const { data: sessions, isLoading } = useSessions();
  const { mutate: createSession, isPending } = useCreateSession();

  useEffect(() => {
    if (!isLoading && !isPending) {
      if (sessions && sessions.length > 0) {
        // Redirect to the most recent session
        router.push(`/chat/${sessions[0].id}`);
      } else {
        // Otherwise create a new session and redirect to it
        createSession(undefined, {
          onSuccess: (newSession) => {
            router.push(`/chat/${newSession.id}`);
          },
        });
      }
    }
  }, [sessions, isLoading, isPending, createSession, router]);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cixio-blue mb-4"></div>
        <p className="text-gray-500 dark:text-gray-400">Loading chat...</p>
      </div>
    </div>
  );
}
