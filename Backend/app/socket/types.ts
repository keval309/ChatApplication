import type { Server as IOServer, Socket as IOSocket } from "socket.io";
import type { MessageDTO } from "../modules/message/message.types";
import type { ConversationMemberRole } from "../generated/prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// DTOs that travel over the wire. Keep these flat and serializable.
// Never include sensitive fields (passwordHash, tokens, raw user objects).
// ─────────────────────────────────────────────────────────────────────────────

export type MessageType = "TEXT" | "IMAGE" | "GIF" | "FILE";
export type PresenceStatusWire =
  | "ONLINE"
  | "AWAY"
  | "DND"
  | "INVISIBLE"
  | "OFFLINE";

export interface SenderWire {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ReactionWire {
  emoji: string;
  userId: string;
}

export interface ReadReceiptWire {
  userId: string;
  seenAt: string; // ISO
}

export interface MessageWire {
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
  sender: SenderWire;
  reactions: ReactionWire[];
  replyCount: number;
  allRead: boolean;
  /** Echoed back so the client can reconcile its optimistic temp. */
  idempotencyKey?: string;
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

// ─────────────────────────────────────────────────────────────────────────────
// Client → Server payloads
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Server → Client payloads
// ─────────────────────────────────────────────────────────────────────────────

export interface MessageNewEvent extends MessageWire {}

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
  reactions: ReactionWire[];
}

export interface TypingUpdateEvent {
  conversationId: string;
  typingUserIds: string[];
}

export interface ReceiptUpdateEvent {
  conversationId: string;
  updates: Array<{
    messageId: string;
    readBy: ReadReceiptWire[];
    allRead: boolean;
  }>;
}

export interface PresenceChangedEvent {
  userId: string;
  status: PresenceStatusWire;
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
  /** Present for clients that support it; omitted on very old payloads. */
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
  message: MessageDTO;
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

// ─────────────────────────────────────────────────────────────────────────────
// Standard ack envelope returned for emitWithAck flows.
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Typed Socket.io maps. Use everywhere the io / socket types are needed.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientToServerEvents {
  "message:send": (
    payload: MessageSendPayload,
    ack: (res: AckResponse<MessageWire>) => void,
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

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketAuthData {
  userId: string;
  email: string;
  sessionId: string;
}

export interface SocketData {
  auth: SocketAuthData;
}

// Re-exports as ergonomic aliases used across the socket module.
export type AppIOServer = IOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type AppSocket = IOSocket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
