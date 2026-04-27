"use client";

import { use } from "react";
import { ConversationView } from "@/components/chat/ConversationView";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ConversationPage({ params }: PageProps) {
  const { id } = use(params);
  return <ConversationView conversationId={id} />;
}
