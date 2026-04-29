"use client";

import { useEffect } from "react";
import type { InfiniteData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import type { ConversationFilter } from "@/lib/chat-api";
import type {
  ConversationListItem,
  ConversationsPage,
  GroupInfo,
  MemberJoinSource,
} from "@/types/chat";
import {
  SOCKET_EVENTS,
  type ConversationBlockedEvent,
  type ConversationDeletedEvent,
  type ConversationHistoryClearedEvent,
  type ConversationRemovedForMeEvent,
  type ConversationUnblockedEvent,
  type GroupCreatedEvent,
  type GroupDissolvedEvent,
  type GroupMemberAddedEvent,
  type GroupMemberLeftEvent,
  type GroupMemberRemovedEvent,
  type GroupMessagePinnedEvent,
  type GroupMessageUnpinnedEvent,
  type GroupOwnershipTransferredEvent,
  type GroupRoleChangedEvent,
  type GroupSettingsUpdatedEvent,
  type MessageDeletedEvent,
  type MessageNewEvent,
  type MessageUpdatedEvent,
  type NotificationPushEvent,
  type NotificationUnmutedEvent,
  type ReceiptUpdateEvent,
} from "@/types/socket";
import { toast } from "@/components/ui/Toaster";
import { useMe } from "./useAuth";
import { useSocket } from "./useSocket";
import { messagesQueryKey } from "./useMessages";
import {
  conversationsQueryKey,
  resortFirstPageAllFilters,
} from "./conversation-list-cache";

type WritableRecord = Record<string, unknown>;

function joinSourceFromMemberAdded(
  addedVia: GroupMemberAddedEvent["addedVia"],
): MemberJoinSource {
  if (addedVia === "INVITE") return "INVITE";
  return "DIRECT_ADD";
}

/**
 * Global socket listeners that patch conversation list + detail caches.
 * Mounted once from `AppShell` so non-chat routes (e.g. `/groups`) still receive realtime updates.
 */
export function useConversationSocketSubscriptions(): void {
  const qc = useQueryClient();
  const { socket } = useSocket();
  const { data: me } = useMe();

  useEffect(() => {
    if (!socket) return;

    const filters: ConversationFilter[] = ["ALL", "ARCHIVED", "GROUPS"];

    function patchConversation(
      conversationId: string,
      patcher: (item: ConversationListItem) => ConversationListItem,
    ): void {
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

    function patchConversationDetail(
      conversationId: string,
      patcher: (item: ConversationListItem) => ConversationListItem,
    ): void {
      qc.setQueryData<ConversationListItem>(
        ["conversation", conversationId],
        (old) => {
          if (!old || old.id !== conversationId) return old;
          return patcher(old);
        },
      );
    }

    function applyConversationPatch(
      conversationId: string,
      patcher: (item: ConversationListItem) => ConversationListItem,
    ): void {
      patchConversation(conversationId, patcher);
      patchConversationDetail(conversationId, patcher);
    }

    const onNew = (msg: MessageNewEvent): void => {
      let inList = false;
      for (const f of filters) {
        const data = qc.getQueryData<InfiniteData<ConversationsPage>>(
          conversationsQueryKey(f),
        );
        if (
          data?.pages.some((p) =>
            p.conversations.some((c) => c.id === msg.conversationId),
          )
        ) {
          inList = true;
          break;
        }
      }
      if (!inList) {
        void qc.invalidateQueries({ queryKey: ["conversations"] });
        return;
      }
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
      resortFirstPageAllFilters(qc);
    };

    const onUpdated = (msg: MessageUpdatedEvent): void => {
      patchConversation(msg.conversationId, (c) =>
        c.lastMessage?.id === msg.id
          ? {
              ...c,
              lastMessage: { ...c.lastMessage, content: msg.content },
            }
          : c,
      );
    };

    const onDeleted = (msg: MessageDeletedEvent): void => {
      patchConversation(msg.conversationId, (c) =>
        c.lastMessage?.id === msg.id
          ? {
              ...c,
              lastMessage: { ...c.lastMessage, deletedAt: msg.deletedAt },
            }
          : c,
      );
    };

    const onReceipt = (e: ReceiptUpdateEvent): void => {
      patchConversation(e.conversationId, (c) => ({ ...c, unreadCount: 0 }));
    };

    const onHistoryCleared = (e: ConversationHistoryClearedEvent): void => {
      patchConversation(e.conversationId, (c) => ({
        ...c,
        lastMessage: null,
        unreadCount: 0,
      }));
      qc.setQueryData(messagesQueryKey(e.conversationId), {
        pages: [{ messages: [], nextCursor: null, hasMore: false }],
        pageParams: [null],
      });
    };

    const onConversationDeleted = (e: ConversationDeletedEvent): void => {
      for (const f of filters) {
        qc.setQueryData<InfiniteData<ConversationsPage>>(
          conversationsQueryKey(f),
          (data) => {
            if (!data) return data;
            return {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                conversations: page.conversations.filter(
                  (c) => c.id !== e.conversationId,
                ),
              })),
            };
          },
        );
      }
      qc.removeQueries({ queryKey: messagesQueryKey(e.conversationId) });
      qc.removeQueries({ queryKey: ["conversation", e.conversationId] });
    };

    const onRemovedForMe = (e: ConversationRemovedForMeEvent): void => {
      onConversationDeleted(e);
    };

    const onNotificationPush = (e: NotificationPushEvent): void => {
      const preview =
        e.preview.length > 80 ? `${e.preview.slice(0, 80)}…` : e.preview;
      toast("New message", { description: preview });
    };

    const onNotificationUnmuted = (_e: NotificationUnmutedEvent): void => {
      toast.success("Notifications on again for a muted chat.");
    };

    const onConversationBlocked = (e: ConversationBlockedEvent): void => {
      if (e.conversationId) {
        void qc.invalidateQueries({ queryKey: ["conversation", e.conversationId] });
      }
      void qc.invalidateQueries({ queryKey: ["user", "blocked-users"] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    };

    const onConversationUnblocked = (e: ConversationUnblockedEvent): void => {
      if (e.conversationId) {
        void qc.invalidateQueries({ queryKey: ["conversation", e.conversationId] });
      }
      void qc.invalidateQueries({ queryKey: ["user", "blocked-users"] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    };

    const onGroupCreated = (_e: GroupCreatedEvent): void => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    };

    const onGroupDissolved = (e: GroupDissolvedEvent): void => {
      onConversationDeleted({ conversationId: e.conversationId });
    };

    const onGroupMemberAdded = (e: GroupMemberAddedEvent): void => {
      const joinSource = joinSourceFromMemberAdded(e.addedVia);
      applyConversationPatch(e.conversationId, (c) => {
        const existing = new Set(c.members.map((m) => m.userId));
        const appended = e.addedUsers
          .filter((u) => !existing.has(u.id))
          .map((u) => ({
            userId: u.id,
            role: u.role,
            joinedAt: new Date().toISOString(),
            lastReadAt: null as string | null,
            joinSource,
            user: {
              id: u.id,
              username: null as string | null,
              displayName: u.displayName,
              avatarUrl: u.avatarUrl,
            },
          }));
        return { ...c, members: [...c.members, ...appended] };
      });
    };

    const dropMember = (
      c: ConversationListItem,
      userId: string,
    ): ConversationListItem => ({
      ...c,
      members: c.members.filter((m) => m.userId !== userId),
    });

    const onGroupMemberRemoved = (e: GroupMemberRemovedEvent): void => {
      applyConversationPatch(e.conversationId, (c) =>
        dropMember(c, e.removedUserId),
      );
    };

    const onGroupMemberLeft = (e: GroupMemberLeftEvent): void => {
      applyConversationPatch(e.conversationId, (c) => dropMember(c, e.userId));
    };

    const onGroupRoleChanged = (e: GroupRoleChangedEvent): void => {
      applyConversationPatch(e.conversationId, (c) => ({
        ...c,
        members: c.members.map((m) =>
          m.userId === e.userId ? { ...m, role: e.newRole } : m,
        ),
      }));
    };

    const onGroupOwnershipTransferred = (
      e: GroupOwnershipTransferredEvent,
    ): void => {
      applyConversationPatch(e.conversationId, (c) => {
        const members = c.members.map((m) => {
          if (m.userId === e.previousOwnerId) return { ...m, role: "ADMIN" as const };
          if (m.userId === e.newOwnerId) return { ...m, role: "OWNER" as const };
          return m;
        });
        const groupInfo: GroupInfo | null = c.groupInfo
          ? { ...c.groupInfo, ownerId: e.newOwnerId }
          : null;
        return { ...c, members, groupInfo };
      });
    };

    const onGroupSettingsUpdated = (e: GroupSettingsUpdatedEvent): void => {
      applyConversationPatch(e.conversationId, (c) => {
        if (!c.groupInfo) return c;
        const next: GroupInfo = { ...c.groupInfo };
        for (const [k, v] of Object.entries(e.changes)) {
          if (k in next) {
            (next as unknown as WritableRecord)[k] = v;
          }
        }
        return {
          ...c,
          groupInfo: next,
          groupName: typeof e.changes.name === "string" ? e.changes.name : c.groupName,
          groupAvatarUrl:
            typeof e.changes.avatarUrl === "string"
              ? e.changes.avatarUrl
              : c.groupAvatarUrl,
        };
      });
    };

    const onGroupMessagePinned = (e: GroupMessagePinnedEvent): void => {
      applyConversationPatch(e.conversationId, (c) => ({
        ...c,
        pinnedMessageId: e.message.id,
      }));
      void qc.invalidateQueries({ queryKey: messagesQueryKey(e.conversationId) });
    };

    const onGroupMessageUnpinned = (e: GroupMessageUnpinnedEvent): void => {
      applyConversationPatch(e.conversationId, (c) => ({
        ...c,
        pinnedMessageId: null,
      }));
    };

    socket.on(SOCKET_EVENTS.MESSAGE_NEW, onNew);
    socket.on(SOCKET_EVENTS.MESSAGE_UPDATED, onUpdated);
    socket.on(SOCKET_EVENTS.MESSAGE_DELETED, onDeleted);
    socket.on(SOCKET_EVENTS.RECEIPT_UPDATE, onReceipt);
    socket.on(SOCKET_EVENTS.CONVERSATION_HISTORY_CLEARED, onHistoryCleared);
    socket.on(SOCKET_EVENTS.CONVERSATION_REMOVED_FOR_ME, onRemovedForMe);
    socket.on(SOCKET_EVENTS.CONVERSATION_DELETED, onConversationDeleted);
    socket.on(SOCKET_EVENTS.NOTIFICATION_PUSH, onNotificationPush);
    socket.on(SOCKET_EVENTS.NOTIFICATION_UNMUTED, onNotificationUnmuted);
    socket.on(SOCKET_EVENTS.CONVERSATION_BLOCKED, onConversationBlocked);
    socket.on(SOCKET_EVENTS.CONVERSATION_UNBLOCKED, onConversationUnblocked);
    socket.on(SOCKET_EVENTS.GROUP_CREATED, onGroupCreated);
    socket.on(SOCKET_EVENTS.GROUP_DISSOLVED, onGroupDissolved);
    socket.on(SOCKET_EVENTS.GROUP_MEMBER_ADDED, onGroupMemberAdded);
    socket.on(SOCKET_EVENTS.GROUP_MEMBER_REMOVED, onGroupMemberRemoved);
    socket.on(SOCKET_EVENTS.GROUP_MEMBER_LEFT, onGroupMemberLeft);
    socket.on(SOCKET_EVENTS.GROUP_ROLE_CHANGED, onGroupRoleChanged);
    socket.on(SOCKET_EVENTS.GROUP_OWNERSHIP_TRANSFERRED, onGroupOwnershipTransferred);
    socket.on(SOCKET_EVENTS.GROUP_SETTINGS_UPDATED, onGroupSettingsUpdated);
    socket.on(SOCKET_EVENTS.GROUP_MESSAGE_PINNED, onGroupMessagePinned);
    socket.on(SOCKET_EVENTS.GROUP_MESSAGE_UNPINNED, onGroupMessageUnpinned);

    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, onNew);
      socket.off(SOCKET_EVENTS.MESSAGE_UPDATED, onUpdated);
      socket.off(SOCKET_EVENTS.MESSAGE_DELETED, onDeleted);
      socket.off(SOCKET_EVENTS.RECEIPT_UPDATE, onReceipt);
      socket.off(SOCKET_EVENTS.CONVERSATION_HISTORY_CLEARED, onHistoryCleared);
      socket.off(SOCKET_EVENTS.CONVERSATION_REMOVED_FOR_ME, onRemovedForMe);
      socket.off(SOCKET_EVENTS.CONVERSATION_DELETED, onConversationDeleted);
      socket.off(SOCKET_EVENTS.NOTIFICATION_PUSH, onNotificationPush);
      socket.off(SOCKET_EVENTS.NOTIFICATION_UNMUTED, onNotificationUnmuted);
      socket.off(SOCKET_EVENTS.CONVERSATION_BLOCKED, onConversationBlocked);
      socket.off(SOCKET_EVENTS.CONVERSATION_UNBLOCKED, onConversationUnblocked);
      socket.off(SOCKET_EVENTS.GROUP_CREATED, onGroupCreated);
      socket.off(SOCKET_EVENTS.GROUP_DISSOLVED, onGroupDissolved);
      socket.off(SOCKET_EVENTS.GROUP_MEMBER_ADDED, onGroupMemberAdded);
      socket.off(SOCKET_EVENTS.GROUP_MEMBER_REMOVED, onGroupMemberRemoved);
      socket.off(SOCKET_EVENTS.GROUP_MEMBER_LEFT, onGroupMemberLeft);
      socket.off(SOCKET_EVENTS.GROUP_ROLE_CHANGED, onGroupRoleChanged);
      socket.off(
        SOCKET_EVENTS.GROUP_OWNERSHIP_TRANSFERRED,
        onGroupOwnershipTransferred,
      );
      socket.off(SOCKET_EVENTS.GROUP_SETTINGS_UPDATED, onGroupSettingsUpdated);
      socket.off(SOCKET_EVENTS.GROUP_MESSAGE_PINNED, onGroupMessagePinned);
      socket.off(SOCKET_EVENTS.GROUP_MESSAGE_UNPINNED, onGroupMessageUnpinned);
    };
  }, [socket, qc, me?.id]);
}
