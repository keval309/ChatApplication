import type { MessageReaction, MessageType, ReadReceiptEntry } from "./chat";
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
  }>;
}

export interface PresenceChangedEvent {
  userId: string;
  status: PresenceStatus;
  lastSeen: string | null;
}

export type AckResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; code?: number } };

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
}
