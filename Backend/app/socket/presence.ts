import type { AppIOServer, PresenceStatusWire } from "./types";
import { SOCKET_EVENTS } from "./events";

/**
 * In-memory presence store.
 *
 * - `userSockets` tracks every active socket per user — a user is only marked
 *   offline when ALL their sockets close.
 * - `lastSeen` records the most recent disconnect timestamp.
 *
 * Replace with Redis when scaling out (per ChatFlow PRD §21 / chatflow.mdc §6).
 */
const userSockets: Map<string, Set<string>> = new Map();
const lastSeen: Map<string, Date> = new Map();

export interface PresenceSnapshot {
  status: PresenceStatusWire;
  lastSeen: Date | null;
}

export function markOnline(userId: string, socketId: string): boolean {
  const set = userSockets.get(userId);
  if (set) {
    const wasEmpty = set.size === 0;
    set.add(socketId);
    return wasEmpty;
  }
  userSockets.set(userId, new Set([socketId]));
  return true;
}

/**
 * Removes a socket from the user's set. Returns true when the user has no
 * sockets remaining (i.e. the caller should broadcast OFFLINE).
 */
export function markOffline(userId: string, socketId: string): boolean {
  const set = userSockets.get(userId);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    userSockets.delete(userId);
    lastSeen.set(userId, new Date());
    return true;
  }
  return false;
}

export function getStatus(userId: string): PresenceSnapshot {
  if ((userSockets.get(userId)?.size ?? 0) > 0) {
    return { status: "ONLINE", lastSeen: null };
  }
  return { status: "OFFLINE", lastSeen: lastSeen.get(userId) ?? null };
}

export function broadcastPresence(io: AppIOServer, userId: string): void {
  const snap = getStatus(userId);
  io.emit(SOCKET_EVENTS.PRESENCE_CHANGED, {
    userId,
    status: snap.status,
    lastSeen: snap.lastSeen ? snap.lastSeen.toISOString() : null,
  });
}
