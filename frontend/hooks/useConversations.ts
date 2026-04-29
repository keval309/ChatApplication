"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import * as chatApi from "@/lib/chat-api";
import type { ConversationFilter, MuteDuration } from "@/lib/chat-api";
import type { ConversationListItem, ConversationsPage } from "@/types/chat";
import { toast } from "@/components/ui/Toaster";
import { messagesQueryKey } from "./useMessages";
import {
  conversationsQueryKey,
  sortConversationsByInboxOrder,
  resortFirstPageAllFilters,
} from "./conversation-list-cache";

export { conversationsQueryKey } from "./conversation-list-cache";

function estimatedMuteUntil(duration: MuteDuration): string | null {
  if (duration === "forever") return null;
  const ms =
    duration === "1h"
      ? 3600_000
      : duration === "8h"
        ? 8 * 3600_000
        : duration === "1d"
          ? 86400_000
          : 7 * 86400_000;
  return new Date(Date.now() + ms).toISOString();
}

type ConversationListsSnapshot = Partial<
  Record<ConversationFilter, InfiniteData<ConversationsPage>>
>;

function captureConversationListsSnapshot(
  qc: ReturnType<typeof useQueryClient>,
): ConversationListsSnapshot {
  const snap: ConversationListsSnapshot = {};
  const filters: ConversationFilter[] = ["ALL", "ARCHIVED", "GROUPS"];
  for (const f of filters) {
    const data = qc.getQueryData<InfiniteData<ConversationsPage>>(
      conversationsQueryKey(f),
    );
    if (data !== undefined) {
      snap[f] = structuredClone(data);
    }
  }
  return snap;
}

function restoreConversationListsSnapshot(
  qc: ReturnType<typeof useQueryClient>,
  snap: ConversationListsSnapshot,
): void {
  for (const [f, data] of Object.entries(snap) as [
    ConversationFilter,
    InfiniteData<ConversationsPage>,
  ][]) {
    qc.setQueryData(conversationsQueryKey(f), data);
  }
}

function findConversationInListCaches(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
): ConversationListItem | undefined {
  const filters: ConversationFilter[] = ["ALL", "ARCHIVED", "GROUPS"];
  for (const f of filters) {
    const data = qc.getQueryData<InfiniteData<ConversationsPage>>(
      conversationsQueryKey(f),
    );
    if (!data) continue;
    for (const page of data.pages) {
      const hit = page.conversations.find((c) => c.id === id);
      if (hit) return hit;
    }
  }
  return undefined;
}

function removeConversationFromFilterCache(
  qc: ReturnType<typeof useQueryClient>,
  filter: ConversationFilter,
  id: string,
): void {
  qc.setQueryData<InfiniteData<ConversationsPage>>(
    conversationsQueryKey(filter),
    (data) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          conversations: page.conversations.filter((c) => c.id !== id),
        })),
      };
    },
  );
}

function prependConversationToFilterCache(
  qc: ReturnType<typeof useQueryClient>,
  filter: ConversationFilter,
  item: ConversationListItem,
): void {
  qc.setQueryData<InfiniteData<ConversationsPage>>(
    conversationsQueryKey(filter),
    (data) => {
      const withoutId = (pages: ConversationsPage[]) =>
        pages.map((page) => ({
          ...page,
          conversations: page.conversations.filter((c) => c.id !== item.id),
        }));

      if (!data || data.pages.length === 0) {
        return {
          pages: [
            {
              conversations: [item],
              nextCursor: null,
              hasMore: false,
            },
          ],
          pageParams: [null],
        };
      }
      const cleanedPages = withoutId(data.pages);
      const [first, ...rest] = cleanedPages;
      return {
        ...data,
        pages: [
          {
            ...first,
            conversations: sortConversationsByInboxOrder([
              item,
              ...first.conversations,
            ]),
          },
          ...rest,
        ],
      };
    },
  );
}

function patchConversationAllFilters(
  qc: ReturnType<typeof useQueryClient>,
  conversationId: string,
  patcher: (item: ConversationListItem) => ConversationListItem,
): void {
  const filters: ConversationFilter[] = ["ALL", "ARCHIVED", "GROUPS"];
  for (const f of filters) {
    qc.setQueryData<InfiniteData<ConversationsPage>>(
      conversationsQueryKey(f),
      (data) => {
        if (!data) return data;
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            conversations: page.conversations.map((c) =>
              c.id === conversationId ? patcher(c) : c,
            ),
          })),
        };
      },
    );
  }
}

export function useConversations(filter: ConversationFilter = "ALL") {
  const qc = useQueryClient();

  const query = useInfiniteQuery<
    ConversationsPage,
    Error,
    InfiniteData<ConversationsPage>,
    ReturnType<typeof conversationsQueryKey>,
    string | null
  >({
    queryKey: conversationsQueryKey(filter),
    queryFn: ({ pageParam = null }) =>
      chatApi.listConversations({ cursor: pageParam ?? undefined, filter }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const conversations = query.data?.pages.flatMap((p) => p.conversations) ?? [];

  return {
    ...query,
    conversations,
  };
}

export function useGetOrCreateDm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => chatApi.getOrCreateDm(userId),
    onSuccess: (conversation) => {
      // Insert at top of the cached "ALL" list if not already present.
      qc.setQueryData<InfiniteData<ConversationsPage>>(
        conversationsQueryKey("ALL"),
        (data) => {
          if (!data) return data;
          const exists = data.pages.some((p) =>
            p.conversations.some((c) => c.id === conversation.id),
          );
          if (exists) return data;
          const [first, ...rest] = data.pages;
          if (!first) return data;
          return {
            ...data,
            pages: [
              {
                ...first,
                conversations: sortConversationsByInboxOrder([
                  conversation,
                  ...first.conversations.filter(
                    (c) => c.id !== conversation.id,
                  ),
                ]),
              },
              ...rest,
            ],
          };
        },
      );
    },
  });
}

export function useSetConversationPinned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; pinned: boolean }) =>
      chatApi.setConversationPinned(args),
    onMutate: async (args) => {
      const snap = captureConversationListsSnapshot(qc);
      patchConversationAllFilters(qc, args.id, (c) => ({
        ...c,
        pinnedByMe: args.pinned,
      }));
      resortFirstPageAllFilters(qc);
      return { snap };
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.snap) {
        restoreConversationListsSnapshot(qc, ctx.snap);
      }
      toast.error("Could not update pin. Try again.");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useArchiveConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; archived: boolean }) =>
      chatApi.archiveConversation(args),
    onMutate: async (args) => {
      const snap = captureConversationListsSnapshot(qc);
      const existing = findConversationInListCaches(qc, args.id);
      if (existing) {
        const updated: ConversationListItem = {
          ...existing,
          isArchived: args.archived,
        };
        if (args.archived) {
          removeConversationFromFilterCache(qc, "ALL", args.id);
          if (existing.type === "GROUP") {
            removeConversationFromFilterCache(qc, "GROUPS", args.id);
          }
          prependConversationToFilterCache(qc, "ARCHIVED", updated);
        } else {
          removeConversationFromFilterCache(qc, "ARCHIVED", args.id);
          prependConversationToFilterCache(qc, "ALL", updated);
          if (existing.type === "GROUP") {
            prependConversationToFilterCache(qc, "GROUPS", updated);
          }
        }
      }
      return { snap };
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.snap) {
        restoreConversationListsSnapshot(qc, ctx.snap);
      }
      toast.error("Could not update archive. Try again.");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chatApi.markConversationRead(id),
    onSuccess: (_void, id) => {
      const filters: ConversationFilter[] = ["ALL", "ARCHIVED", "GROUPS"];
      for (const f of filters) {
        qc.setQueryData<InfiniteData<ConversationsPage>>(
          conversationsQueryKey(f),
          (data) => {
            if (!data) return data;
            return {
              ...data,
              pages: data.pages.map((p) => ({
                ...p,
                conversations: p.conversations.map((c) =>
                  c.id === id ? { ...c, unreadCount: 0 } : c,
                ),
              })),
            };
          },
        );
      }
    },
  });
}

export function useClearConversationHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chatApi.clearConversationHistory(id),
    onSuccess: (_void, id) => {
      qc.setQueryData(messagesQueryKey(id), {
        pages: [{ messages: [], nextCursor: null, hasMore: false }],
        pageParams: [null],
      });
      patchConversationAllFilters(qc, id, (c) => ({
        ...c,
        lastMessage: null,
        unreadCount: 0,
      }));
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chatApi.deleteConversation(id),
    onSuccess: (_void, id) => {
      const filters: ConversationFilter[] = ["ALL", "ARCHIVED", "GROUPS"];
      for (const f of filters) {
        qc.setQueryData<InfiniteData<ConversationsPage>>(
          conversationsQueryKey(f),
          (data) => {
            if (!data) return data;
            return {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                conversations: page.conversations.filter((c) => c.id !== id),
              })),
            };
          },
        );
      }
      qc.removeQueries({ queryKey: messagesQueryKey(id) });
      qc.removeQueries({ queryKey: ["conversation", id] });
    },
  });
}

export function useMuteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      duration: MuteDuration;
      autoUnmuteReminder?: boolean;
    }) => chatApi.muteConversation(args),
    onMutate: async (args) => {
      const muteUntil = estimatedMuteUntil(args.duration);
      patchConversationAllFilters(qc, args.id, (c) => ({
        ...c,
        isMuted: true,
        muteUntil,
      }));
      await qc.cancelQueries({ queryKey: ["conversation", args.id] });
      const prev = qc.getQueryData<ConversationListItem>([
        "conversation",
        args.id,
      ]);
      if (prev) {
        qc.setQueryData<ConversationListItem>(["conversation", args.id], {
          ...prev,
          isMuted: true,
          muteUntil,
        });
      }
      return { prev };
    },
    onError: (_err, args, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(["conversation", args.id], ctx.prev);
      }
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onSettled: (_d, _e, args) => {
      void qc.invalidateQueries({ queryKey: ["conversation", args.id] });
    },
  });
}

export function useUnmuteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chatApi.unmuteConversation(id),
    onMutate: async (id) => {
      patchConversationAllFilters(qc, id, (c) => ({
        ...c,
        isMuted: false,
        muteUntil: null,
      }));
      await qc.cancelQueries({ queryKey: ["conversation", id] });
      const prev = qc.getQueryData<ConversationListItem>(["conversation", id]);
      if (prev) {
        qc.setQueryData<ConversationListItem>(["conversation", id], {
          ...prev,
          isMuted: false,
          muteUntil: null,
        });
      }
      return { prev };
    },
    onError: (_err, id, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(["conversation", id], ctx.prev);
      }
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onSettled: (_d, _e, id) => {
      void qc.invalidateQueries({ queryKey: ["conversation", id] });
    },
  });
}
