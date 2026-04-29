"use client";

import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { ConversationFilter } from "@/lib/chat-api";
import type { ConversationListItem, ConversationsPage } from "@/types/chat";

export const conversationsQueryKey = (filter: ConversationFilter) =>
  ["conversations", filter] as const;

/** Matches API order: pinned (for you) first, then `updatedAt` desc, then id desc. */
export function sortConversationsByInboxOrder(
  items: ConversationListItem[],
): ConversationListItem[] {
  return [...items].sort((a, b) => {
    const pinA = a.pinnedByMe ? 1 : 0;
    const pinB = b.pinnedByMe ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    const tA = new Date(a.updatedAt).getTime();
    const tB = new Date(b.updatedAt).getTime();
    if (tA !== tB) return tB - tA;
    return b.id.localeCompare(a.id);
  });
}

export function resortFirstPageAllFilters(qc: QueryClient): void {
  const filters: ConversationFilter[] = ["ALL", "ARCHIVED", "GROUPS"];
  for (const f of filters) {
    qc.setQueryData<InfiniteData<ConversationsPage>>(
      conversationsQueryKey(f),
      (data) => {
        if (!data?.pages[0]) return data;
        const [first, ...rest] = data.pages;
        return {
          ...data,
          pages: [
            {
              ...first,
              conversations: sortConversationsByInboxOrder(first.conversations),
            },
            ...rest,
          ],
        };
      },
    );
  }
}
