"use client";

import { useRouter } from "next/navigation";
import { useCreateSession } from "@/hooks/useChat";

export default function NewChatButton() {
  const router = useRouter();
  const createSession = useCreateSession();

  async function handleClick() {
    try {
      const newSession = await createSession.mutateAsync();
      router.push(`/chat/${newSession.id}`);
    } catch (err) {
      alert("Couldn't create a session — check that the backend is running on port 8000");
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={createSession.isPending}
      className="px-4 py-2 bg-cixio-blue hover:bg-cixio-hover active:bg-cixio-dark text-white rounded-lg text-sm disabled:opacity-50 transition-colors w-full flex items-center justify-center gap-1.5 font-medium shadow-sm"
    >
      {createSession.isPending ? "Creating…" : (
        <>
          <span>+</span>
          <span>New chat</span>
        </>
      )}
    </button>
  );
}