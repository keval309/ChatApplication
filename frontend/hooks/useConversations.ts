"use client";

import { useEffect } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import * as chatApi from "@/lib/chat-api";
import type { ConversationFilter } from "@/lib/chat-api";
import type {
  ConversationListItem,
  ConversationsPage,
} from "@/types/chat";
import {
  SOCKET_EVENTS,
  type MessageDeletedEvent,
  type MessageNewEvent,
  type MessageUpdatedEvent,
  type ReceiptUpdateEvent,
} from "@/types/socket";
import { useSocket } from "./useSocket";
import { useMe } from "./useAuth";

export const conversationsQueryKey = (filter: ConversationFilter) =>
  ["conversations", filter] as const;

export function useConversations(filter: ConversationFilter = "ALL") {
  const qc = useQueryClient();
  const { socket } = useSocket();
  const { data: me } = useMe();

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

  // ── Surgical cache mutations on real-time events ──────────────────────────
  useEffect(() => {
    if (!socket) return;

    const filters: ConversationFilter[] = ["ALL", "ARCHIVED", "GROUPS"];

    function patchConversation(
      conversationId: string,
      patcher: (item: ConversationListItem) => ConversationListItem,
    ) {
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

    const onNew = (msg: MessageNewEvent) => {
      patchConversation(msg.conversationId, (c) => ({
        ...c,
        lastMessage: {
          id: msg.id,
          senderId: msg.senderId,
          content: msg.content,
          type: msg.type,
          createdAt: msg.createdAt,
          deletedAt: msg.deletedAt,
        },
        unreadCount: msg.senderId === me?.id ? c.unreadCount : c.unreadCount + 1,
        updatedAt: msg.createdAt,
      }));
    };

    const onUpdated = (msg: MessageUpdatedEvent) => {
      patchConversation(msg.conversationId, (c) =>
        c.lastMessage?.id === msg.id
          ? {
              ...c,
              lastMessage: { ...c.lastMessage, content: msg.content },
            }
          : c,
      );
    };

    const onDeleted = (msg: MessageDeletedEvent) => {
      patchConversation(msg.conversationId, (c) =>
        c.lastMessage?.id === msg.id
          ? {
              ...c,
              lastMessage: { ...c.lastMessage, deletedAt: msg.deletedAt },
            }
          : c,
      );
    };

    const onReceipt = (e: ReceiptUpdateEvent) => {
      patchConversation(e.conversationId, (c) => ({ ...c, unreadCount: 0 }));
    };

    socket.on(SOCKET_EVENTS.MESSAGE_NEW, onNew);
    socket.on(SOCKET_EVENTS.MESSAGE_UPDATED, onUpdated);
    socket.on(SOCKET_EVENTS.MESSAGE_DELETED, onDeleted);
    socket.on(SOCKET_EVENTS.RECEIPT_UPDATE, onReceipt);

    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, onNew);
      socket.off(SOCKET_EVENTS.MESSAGE_UPDATED, onUpdated);
      socket.off(SOCKET_EVENTS.MESSAGE_DELETED, onDeleted);
      socket.off(SOCKET_EVENTS.RECEIPT_UPDATE, onReceipt);
    };
  }, [socket, qc, me?.id]);

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
                conversations: [conversation, ...first.conversations],
              },
              ...rest,
            ],
          };
        },
      );
    },
  });
}

export function useArchiveConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; archived: boolean }) =>
      chatApi.archiveConversation(args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
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
