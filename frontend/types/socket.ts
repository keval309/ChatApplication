import type { Message, MessageReaction, MessageType, ReadReceiptEntry, ConversationMemberRole } from "./chat";
import type { PresenceStatus } from "./auth";

/**
 * Single source-of-truth event names. Mirrors Backend/app/socket/events.ts
 * exactly — keep them in lock-step. NEVER inline a magic string.
 */
export const SOCKET_EVENTS = {
  MESSAGE_SEND: "message:send",
  MESSAGE_NEW: "message:new",
  MESSAGE_DELIVERED: "message:delivered",
  MESSAGE_EDIT: "message:edit",
  MESSAGE_UPDATED: "message:updated",
  MESSAGE_DELETE: "message:delete",
  MESSAGE_DELETED: "message:deleted",

  REACTION_TOGGLE: "reaction:toggle",
  REACTION_UPDATED: "reaction:updated",

  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
  TYPING_UPDATE: "typing:update",

  RECEIPT_READ: "receipt:read",
  RECEIPT_UPDATE: "receipt:update",

  PRESENCE_CHANGED: "presence:changed",

  NOTIFICATION_PUSH: "notification:push",
  NOTIFICATION_UNMUTED: "notification:unmuted",
  CONVERSATION_HISTORY_CLEARED: "conversation:history-cleared",
  CONVERSATION_REMOVED_FOR_ME: "conversation:removed-for-me",
  CONVERSATION_DELETED: "conversation:deleted",
  CONVERSATION_BLOCKED: "conversation:blocked",
  CONVERSATION_UNBLOCKED: "conversation:unblocked",

  GROUP_MEMBER_ADDED: "group:member_added",
  GROUP_MEMBER_REMOVED: "group:member_removed",
  GROUP_MEMBER_LEFT: "group:member_left",
  GROUP_ROLE_CHANGED: "group:role_changed",
  GROUP_OWNERSHIP_TRANSFERRED: "group:ownership_transferred",
  GROUP_SETTINGS_UPDATED: "group:settings_updated",
  GROUP_MESSAGE_PINNED: "group:message_pinned",
  GROUP_MESSAGE_UNPINNED: "group:message_unpinned",
  GROUP_DISSOLVED: "group:dissolved",
  GROUP_CREATED: "group:created",
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

export interface MessageSendPayload {
  conversationId: string;
  content: string;
  type: MessageType;
  parentId?: string | null;
  idempotencyKey: string;
}

export interface MessageEditPayload {
  messageId: string;
  newContent: string;
}

export interface MessageDeletePayload {
  messageId: string;
}

export interface ReactionTogglePayload {
  messageId: string;
  emoji: string;
}

export interface TypingStartPayload {
  conversationId: string;
}

export interface TypingStopPayload {
  conversationId: string;
}

export interface ReceiptReadPayload {
  conversationId: string;
  messageIds: string[];
}

// ─── Server → Client payloads ────────────────────────────────────────────────

export interface MessageNewEvent {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  parentId: string | null;
  editedAt: string | null;
  deliveredAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  reactions: MessageReaction[];
  replyCount: number;
  allRead: boolean;
  idempotencyKey?: string;
}

export interface MessageUpdatedEvent {
  id: string;
  conversationId: string;
  content: string;
  editedAt: string;
  updatedAt: string;
}

export interface MessageDeliveredEvent {
  messageId: string;
  conversationId: string;
  deliveredAt: string;
}

export interface MessageDeletedEvent {
  id: string;
  conversationId: string;
  deletedAt: string;
}

export interface ReactionUpdatedEvent {
  messageId: string;
  conversationId: string;
  reactions: MessageReaction[];
}

export interface TypingUpdateEvent {
  conversationId: string;
  typingUserIds: string[];
}

export interface ReceiptUpdateEvent {
  conversationId: string;
  updates: Array<{
    messageId: string;
    readBy: ReadReceiptEntry[];
    allRead: boolean;
  }>;
}

export interface NotificationPushEvent {
  conversationId: string;
  messageId: string;
  preview: string;
}

export interface NotificationUnmutedEvent {
  conversationId: string;
  conversationName?: string;
}

export interface ConversationHistoryClearedEvent {
  conversationId: string;
}

export interface ConversationDeletedEvent {
  conversationId: string;
}

export interface ConversationRemovedForMeEvent {
  conversationId: string;
}

export interface ConversationBlockedEvent {
  conversationId: string | null;
  blockerId: string;
}

export interface ConversationUnblockedEvent {
  conversationId: string | null;
  blockerId: string;
}

export interface PresenceChangedEvent {
  userId: string;
  status: PresenceStatus;
  lastSeen: string | null;
}

export interface GroupMemberAddedUserWire {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: ConversationMemberRole;
}

export interface GroupMemberAddedEvent {
  conversationId: string;
  addedUsers: GroupMemberAddedUserWire[];
  addedVia?: "INVITE" | "DIRECT_ADD";
}

export interface GroupMemberRemovedEvent {
  conversationId: string;
  removedUserId: string;
  removedBy: string;
}

export interface GroupMemberLeftEvent {
  conversationId: string;
  userId: string;
}

export interface GroupRoleChangedEvent {
  conversationId: string;
  userId: string;
  newRole: "ADMIN" | "MEMBER";
  changedBy: string;
}

export interface GroupOwnershipTransferredEvent {
  conversationId: string;
  newOwnerId: string;
  previousOwnerId: string;
}

export interface GroupSettingsUpdatedEvent {
  conversationId: string;
  changes: Record<string, string | number>;
}

export interface GroupMessagePinnedEvent {
  conversationId: string;
  message: Message;
}

export interface GroupMessageUnpinnedEvent {
  conversationId: string;
}

export interface GroupDissolvedEvent {
  conversationId: string;
}

export interface GroupCreatedEvent {
  conversationId: string;
  groupName: string;
}

export type AckResponse<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        message: string;
        code?: number;
        error?: string;
        retryAfter?: number;
      };
    };

// ─── Typed event maps for socket.io-client ───────────────────────────────────

export interface ClientToServerEvents {
  "message:send": (
    payload: MessageSendPayload,
    ack: (res: AckResponse<MessageNewEvent>) => void,
  ) => void;
  "message:edit": (
    payload: MessageEditPayload,
    ack?: (res: AckResponse<MessageUpdatedEvent>) => void,
  ) => void;
  "message:delete": (
    payload: MessageDeletePayload,
    ack?: (res: AckResponse<MessageDeletedEvent>) => void,
  ) => void;
  "reaction:toggle": (
    payload: ReactionTogglePayload,
    ack?: (res: AckResponse<ReactionUpdatedEvent>) => void,
  ) => void;
  "typing:start": (payload: TypingStartPayload) => void;
  "typing:stop": (payload: TypingStopPayload) => void;
  "receipt:read": (payload: ReceiptReadPayload) => void;
}

export interface ServerToClientEvents {
  "message:new": (payload: MessageNewEvent) => void;
  "message:delivered": (payload: MessageDeliveredEvent) => void;
  "message:updated": (payload: MessageUpdatedEvent) => void;
  "message:deleted": (payload: MessageDeletedEvent) => void;
  "reaction:updated": (payload: ReactionUpdatedEvent) => void;
  "typing:update": (payload: TypingUpdateEvent) => void;
  "receipt:update": (payload: ReceiptUpdateEvent) => void;
  "presence:changed": (payload: PresenceChangedEvent) => void;
  "notification:push": (payload: NotificationPushEvent) => void;
  "notification:unmuted": (payload: NotificationUnmutedEvent) => void;
  "conversation:history-cleared": (payload: ConversationHistoryClearedEvent) => void;
  "conversation:removed-for-me": (payload: ConversationRemovedForMeEvent) => void;
  "conversation:deleted": (payload: ConversationDeletedEvent) => void;
  "conversation:blocked": (payload: ConversationBlockedEvent) => void;
  "conversation:unblocked": (payload: ConversationUnblockedEvent) => void;
  "group:member_added": (payload: GroupMemberAddedEvent) => void;
  "group:member_removed": (payload: GroupMemberRemovedEvent) => void;
  "group:member_left": (payload: GroupMemberLeftEvent) => void;
  "group:role_changed": (payload: GroupRoleChangedEvent) => void;
  "group:ownership_transferred": (payload: GroupOwnershipTransferredEvent) => void;
  "group:settings_updated": (payload: GroupSettingsUpdatedEvent) => void;
  "group:message_pinned": (payload: GroupMessagePinnedEvent) => void;
  "group:message_unpinned": (payload: GroupMessageUnpinnedEvent) => void;
  "group:dissolved": (payload: GroupDissolvedEvent) => void;
  "group:created": (payload: GroupCreatedEvent) => void;
}
