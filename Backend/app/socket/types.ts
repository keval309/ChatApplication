import type { Server as IOServer, Socket as IOSocket } from "socket.io";

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
  /** Echoed back so the client can reconcile its optimistic temp. */
  idempotencyKey?: string;
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
  }>;
}

export interface PresenceChangedEvent {
  userId: string;
  status: PresenceStatusWire;
  lastSeen: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard ack envelope returned for emitWithAck flows.
// ─────────────────────────────────────────────────────────────────────────────

export type AckResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; code?: number } };

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
