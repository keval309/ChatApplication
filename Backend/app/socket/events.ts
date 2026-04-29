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
  MESSAGE_DELIVERED: "message:delivered",
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

  // Notifications / conversation lifecycle
  NOTIFICATION_PUSH: "notification:push",
  NOTIFICATION_UNMUTED: "notification:unmuted",
  CONVERSATION_HISTORY_CLEARED: "conversation:history-cleared",
  CONVERSATION_REMOVED_FOR_ME: "conversation:removed-for-me",
  CONVERSATION_DELETED: "conversation:deleted",
  CONVERSATION_BLOCKED: "conversation:blocked",
  CONVERSATION_UNBLOCKED: "conversation:unblocked",

  // Group lifecycle (server → client)
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

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
