import type { AppIOServer, ServerToClientEvents } from "./types";

/**
 * Returns the personal room name for a user. Every authenticated socket joins
 * `user:{userId}` on connect; messages are emitted to these rooms — never via
 * a global broadcast.
 */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

/**
 * Emit an event to every socket associated with the given userId.
 */
export function emitToUser<E extends keyof ServerToClientEvents>(
  io: AppIOServer,
  userId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  io.to(userRoom(userId)).emit(event, ...args);
}

/**
 * Emit an event to multiple userIds (deduped).
 */
export function emitToUsers<E extends keyof ServerToClientEvents>(
  io: AppIOServer,
  userIds: readonly string[],
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  const rooms = Array.from(new Set(userIds)).map(userRoom);
  if (rooms.length === 0) return;
  io.to(rooms).emit(event, ...args);
}
