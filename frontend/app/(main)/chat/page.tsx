"use client";

import { MessageSquareDashed } from "lucide-react";

export default function ChatHomePage() {
  return (
    <section className="hidden md:flex flex-col items-center justify-center flex-1 p-8 text-center">
      <div className="h-20 w-20 rounded-full bg-bg-subtle grid place-items-center text-text-muted">
        <MessageSquareDashed className="h-10 w-10" aria-hidden />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-text">
        Pick a conversation
      </h1>
      <p className="mt-1 text-sm text-text-muted max-w-sm">
        Choose a chat from the list on the left, or start a new conversation to
        begin messaging.
      </p>
    </section>
  );
}
