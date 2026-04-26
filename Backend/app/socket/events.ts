/**
 * Single source of truth for Socket.io event names.
 *
 * Naming convention (per .cursor/rules/chatflow.mdc §6):
 *   - domain:action
 *   - Client → Server: imperative ("message:send", "reaction:toggle")
 *   - Server → Client: past-tense / declarative ("message:new", "reaction:updated")
 *
 * Never inline a magic string anywhere — always reference SOCKET_EVENTS.
 */
export const SOCKET_EVENTS = {
  // Messages
  MESSAGE_SEND: "message:send",
  MESSAGE_NEW: "message:new",
  MESSAGE_EDIT: "message:edit",
  MESSAGE_UPDATED: "message:updated",
  MESSAGE_DELETE: "message:delete",
  MESSAGE_DELETED: "message:deleted",

  // Reactions
  REACTION_TOGGLE: "reaction:toggle",
  REACTION_UPDATED: "reaction:updated",

  // Typing
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
  TYPING_UPDATE: "typing:update",

  // Read receipts
  RECEIPT_READ: "receipt:read",
  RECEIPT_UPDATE: "receipt:update",

  // Presence
  PRESENCE_CHANGED: "presence:changed",
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
