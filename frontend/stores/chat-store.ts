"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ReplyTarget {
  messageId: string;
  senderName: string;
  preview: string;
}

interface ChatStoreState {
  /** Per-conversation drafts; survive page reload via localStorage. */
  drafts: Record<string, string>;
  setDraft: (conversationId: string, value: string) => void;
  clearDraft: (conversationId: string) => void;

  /** Per-conversation reply target (NOT persisted). */
  replyTargets: Record<string, ReplyTarget | null>;
  setReplyTarget: (conversationId: string, target: ReplyTarget | null) => void;

  /** UI: side panel open state. */
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
}

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (conversationId, value) =>
        set((s) => ({ drafts: { ...s.drafts, [conversationId]: value } })),
      clearDraft: (conversationId) =>
        set((s) => {
          const next = { ...s.drafts };
          delete next[conversationId];
          return { drafts: next };
        }),

      replyTargets: {},
      setReplyTarget: (conversationId, target) =>
        set((s) => ({
          replyTargets: { ...s.replyTargets, [conversationId]: target },
        })),

      rightPanelOpen: false,
      setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
    }),
    {
      name: "chatflow:chat-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ drafts: state.drafts }),
    },
  ),
);
