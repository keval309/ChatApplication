"use client";

import { useEffect } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { listMessages } from "@/lib/chat-api";
import type {
  Message,
  MessageReaction,
  ConversationsPage,
  MessagesPage,
  ReadReceiptEntry,
} from "@/types/chat";
import { conversationsQueryKey } from "./useConversations";
import {
  SOCKET_EVENTS,
  type MessageDeletedEvent,
  type MessageDeliveredEvent,
  type MessageNewEvent,
  type MessageUpdatedEvent,
  type ReactionUpdatedEvent,
  type ReceiptUpdateEvent,
} from "@/types/socket";
import { useSocket } from "./useSocket";

export const messagesQueryKey = (conversationId: string) =>
  ["messages", conversationId] as const;

const PAGE_SIZE = 50;

function newEventToMessage(e: MessageNewEvent): Message {
  return {
    id: e.id,
    conversationId: e.conversationId,
    senderId: e.senderId,
    content: e.content,
    type: e.type,
    parentId: e.parentId,
    editedAt: e.editedAt,
    deliveredAt: e.deliveredAt,
    deletedAt: e.deletedAt,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    sender: e.sender,
    reactions: e.reactions,
    replyCount: e.replyCount,
    readBy: [],
    allRead: e.allRead,
    status: "sent",
    idempotencyKey: e.idempotencyKey,
  };
}

export function useMessages(conversationId: string | null) {
  const qc = useQueryClient();
  const { socket } = useSocket();

  const query = useInfiniteQuery<
    MessagesPage,
    Error,
    InfiniteData<MessagesPage>,
    ReturnType<typeof messagesQueryKey>,
    string | null
  >({
    queryKey: conversationId
      ? messagesQueryKey(conversationId)
      : ["messages", "__none__"],
    queryFn: ({ pageParam = null }) =>
      listMessages({
        conversationId: conversationId!,
        cursor: pageParam ?? undefined,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(conversationId),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!socket || !conversationId) return;
    const queryKey = messagesQueryKey(conversationId);

    function applyToMessages(
      data: InfiniteData<MessagesPage> | undefined,
      patcher: (msgs: Message[]) => Message[],
    ): InfiniteData<MessagesPage> | undefined {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((p) => ({ ...p, messages: patcher(p.messages) })),
      };
    }

    const onNew = (e: MessageNewEvent) => {
      if (e.conversationId !== conversationId) return;
      qc.setQueryData<InfiniteData<MessagesPage>>(queryKey, (data) => {
        if (!data) return data;

        // Reconcile optimistic temp by idempotencyKey.
        const idem = e.idempotencyKey;
        const replaced = idem
          ? applyToMessages(data, (msgs) =>
              msgs.map((m) =>
                m.idempotencyKey && m.idempotencyKey === idem
                  ? newEventToMessage(e)
                  : m,
              ),
            )
          : data;

        if (idem) {
          // Did we replace anything? If so, return early.
          const found =
            replaced &&
            replaced.pages.some((p) =>
              p.messages.some((m) => m.id === e.id && !m.tempId),
            );
          if (found) return replaced;
        }

        // Otherwise append to the FIRST page (which holds the most recent
        // messages — pages 1..N are progressively older). Each page is
        // sorted ASC by createdAt so the new message goes to the end of
        // page[0].messages. Skip if it already exists (de-dupe).
        const next = replaced ?? data;
        if (next.pages.length === 0) return next;
        const firstPage = next.pages[0];
        const exists = firstPage.messages.some((m) => m.id === e.id);
        if (exists) return next;
        return {
          ...next,
          pages: next.pages.map((p, i) =>
            i === 0
              ? { ...p, messages: [...p.messages, newEventToMessage(e)] }
              : p,
          ),
        };
      });
    };

    const onUpdated = (e: MessageUpdatedEvent) => {
      if (e.conversationId !== conversationId) return;
      qc.setQueryData<InfiniteData<MessagesPage>>(queryKey, (data) =>
        applyToMessages(data, (msgs) =>
          msgs.map((m) =>
            m.id === e.id
              ? {
                  ...m,
                  content: e.content,
                  editedAt: e.editedAt,
                  updatedAt: e.updatedAt,
                }
              : m,
          ),
        ),
      );
    };

    const onDelivered = (e: MessageDeliveredEvent) => {
      if (e.conversationId !== conversationId) return;
      qc.setQueryData<InfiniteData<MessagesPage>>(queryKey, (data) =>
        applyToMessages(data, (msgs) =>
          msgs.map((m) =>
            m.id === e.messageId
              ? {
                  ...m,
                  deliveredAt: e.deliveredAt,
                }
              : m,
          ),
        ),
      );
    };

    const onDeleted = (e: MessageDeletedEvent) => {
      if (e.conversationId !== conversationId) return;
      qc.setQueryData<InfiniteData<MessagesPage>>(queryKey, (data) =>
        applyToMessages(data, (msgs) =>
          msgs.map((m) =>
            m.id === e.id
              ? {
                  ...m,
                  deletedAt: e.deletedAt,
                  content: "",
                }
              : m,
          ),
        ),
      );
    };

    const onReaction = (e: ReactionUpdatedEvent) => {
      if (e.conversationId !== conversationId) return;
      qc.setQueryData<InfiniteData<MessagesPage>>(queryKey, (data) =>
        applyToMessages(data, (msgs) =>
          msgs.map((m) =>
            m.id === e.messageId
              ? { ...m, reactions: dedupeReactions(e.reactions) }
              : m,
          ),
        ),
      );
    };

    const onReceipt = (e: ReceiptUpdateEvent) => {
      if (e.conversationId !== conversationId) return;
      qc.setQueryData<InfiniteData<MessagesPage>>(queryKey, (data) =>
        applyToMessages(data, (msgs) =>
          msgs.map((m) => {
            const u = e.updates.find((x) => x.messageId === m.id);
            if (!u) return m;
            return {
              ...m,
              readBy: dedupeReceipts(u.readBy),
              allRead: u.allRead,
            };
          }),
        ),
      );
      const filters = ["ALL", "ARCHIVED", "GROUPS"] as const;
      for (const filter of filters) {
        qc.setQueryData<InfiniteData<ConversationsPage>>(
          conversationsQueryKey(filter),
          (data) => {
            if (!data) return data;
            return {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                conversations: page.conversations.map((c) =>
                  c.id === e.conversationId ? { ...c, unreadCount: 0 } : c,
                ),
              })),
            };
          },
        );
      }
    };

    const onHistoryCleared = (payload: { conversationId: string }) => {
      if (payload.conversationId !== conversationId) return;
      qc.setQueryData<InfiniteData<MessagesPage>>(queryKey, {
        pages: [{ messages: [], nextCursor: null, hasMore: false }],
        pageParams: [null],
      });
    };

    socket.on(SOCKET_EVENTS.MESSAGE_NEW, onNew);
    socket.on(SOCKET_EVENTS.MESSAGE_DELIVERED, onDelivered);
    socket.on(SOCKET_EVENTS.MESSAGE_UPDATED, onUpdated);
    socket.on(SOCKET_EVENTS.MESSAGE_DELETED, onDeleted);
    socket.on(SOCKET_EVENTS.REACTION_UPDATED, onReaction);
    socket.on(SOCKET_EVENTS.RECEIPT_UPDATE, onReceipt);
    socket.on(SOCKET_EVENTS.CONVERSATION_HISTORY_CLEARED, onHistoryCleared);

    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, onNew);
      socket.off(SOCKET_EVENTS.MESSAGE_DELIVERED, onDelivered);
      socket.off(SOCKET_EVENTS.MESSAGE_UPDATED, onUpdated);
      socket.off(SOCKET_EVENTS.MESSAGE_DELETED, onDeleted);
      socket.off(SOCKET_EVENTS.REACTION_UPDATED, onReaction);
      socket.off(SOCKET_EVENTS.RECEIPT_UPDATE, onReceipt);
      socket.off(SOCKET_EVENTS.CONVERSATION_HISTORY_CLEARED, onHistoryCleared);
    };
  }, [socket, conversationId, qc]);

  // Pages are returned newest-page-first by the cursor pagination, but each
  // page is sorted ASC by createdAt internally. To render chronologically
  // (oldest → newest, top → bottom) we reverse the page order then flatten.
  const messages: Message[] = query.data
    ? query.data.pages.slice().reverse().flatMap((p) => p.messages)
    : [];

  return {
    ...query,
    messages,
  };
}

function dedupeReactions(rs: MessageReaction[]): MessageReaction[] {
  const seen = new Set<string>();
  const out: MessageReaction[] = [];
  for (const r of rs) {
    const key = `${r.userId}:${r.emoji}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function dedupeReceipts(rs: ReadReceiptEntry[]): ReadReceiptEntry[] {
  const map = new Map<string, ReadReceiptEntry>();
  for (const r of rs) map.set(r.userId, r);
  return Array.from(map.values());
}

/**
 * Helpers used by the composer to write optimistic temps and reconcile failures.
 */
export function pushOptimisticMessage(
  qc: ReturnType<typeof useQueryClient>,
  conversationId: string,
  msg: Message,
): void {
  qc.setQueryData<InfiniteData<MessagesPage>>(
    messagesQueryKey(conversationId),
    (data) => {
      if (!data) {
        return {
          pages: [{ messages: [msg], nextCursor: null, hasMore: false }],
          pageParams: [null],
        };
      }
      if (data.pages.length === 0) return data;
      // page[0] holds the most recent messages; append optimistic msg there.
      return {
        ...data,
        pages: data.pages.map((p, i) =>
          i === 0 ? { ...p, messages: [...p.messages, msg] } : p,
        ),
      };
    },
  );
}

export function removeOptimisticMessage(
  qc: ReturnType<typeof useQueryClient>,
  conversationId: string,
  tempId: string,
): void {
  qc.setQueryData<InfiniteData<MessagesPage>>(
    messagesQueryKey(conversationId),
    (data) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((p) => ({
          ...p,
          messages: p.messages.filter((m) => m.tempId !== tempId),
        })),
      };
    },
  );
}

export function markOptimisticFailed(
  qc: ReturnType<typeof useQueryClient>,
  conversationId: string,
  tempId: string,
): void {
  qc.setQueryData<InfiniteData<MessagesPage>>(
    messagesQueryKey(conversationId),
    (data) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((p) => ({
          ...p,
          messages: p.messages.map((m) =>
            m.tempId === tempId ? { ...m, status: "failed" as const } : m,
          ),
        })),
      };
    },
  );
}
