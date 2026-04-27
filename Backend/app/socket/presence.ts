import { prisma } from "../client/prisma";
import type { AppIOServer, PresenceStatusWire } from "./types";
import { SOCKET_EVENTS } from "./events";
import { emitToUsers } from "./rooms";

/**
 * In-memory presence store.
 *
 * - `userSockets` tracks every active socket per user — a user is only marked
 *   offline when ALL their sockets close.
 * - `lastSeen` records the most recent disconnect timestamp.
 *
 * Replace with Redis when scaling out (per ChatFlow PRD §20 / chatflow.mdc §6).
 */
interface PresenceEntry {
  status: PresenceStatusWire;
  lastSeen: Date | null;
  socketIds: Set<string>;
}

const presenceByUser: Map<string, PresenceEntry> = new Map();

export interface PresenceSnapshot {
  status: PresenceStatusWire;
  lastSeen: Date | null;
}

export function markOnline(userId: string, socketId: string): boolean {
  return markOnlineWithStatus(userId, socketId, "ONLINE");
}

export function markOnlineWithStatus(
  userId: string,
  socketId: string,
  status: PresenceStatusWire,
): boolean {
  const existing = presenceByUser.get(userId);
  if (existing) {
    const wasOffline = existing.socketIds.size === 0;
    existing.socketIds.add(socketId);
    existing.status = status;
    existing.lastSeen = null;
    presenceByUser.set(userId, existing);
    return wasOffline;
  }
  presenceByUser.set(userId, {
    status,
    lastSeen: null,
    socketIds: new Set([socketId]),
  });
  return true;
}

/**
 * Removes a socket from the user's set. Returns true when the user has no
 * sockets remaining (i.e. the caller should broadcast OFFLINE).
 */
export function markOffline(userId: string, socketId: string): boolean {
  const entry = presenceByUser.get(userId);
  if (!entry) return false;
  entry.socketIds.delete(socketId);
  if (entry.socketIds.size === 0) {
    entry.status = "OFFLINE";
    entry.lastSeen = new Date();
    presenceByUser.set(userId, entry);
    return true;
  }
  presenceByUser.set(userId, entry);
  return false;
}

export function getStatus(userId: string): PresenceSnapshot {
  const entry = presenceByUser.get(userId);
  if (!entry) {
    return { status: "OFFLINE", lastSeen: null };
  }
  return {
    status: entry.status,
    lastSeen: entry.lastSeen,
  };
}

export function hasActiveSocket(userId: string): boolean {
  return (presenceByUser.get(userId)?.socketIds.size ?? 0) > 0;
}

export function setPresenceStatus(
  userId: string,
  status: PresenceStatusWire,
): boolean {
  const entry = presenceByUser.get(userId);
  if (!entry || entry.socketIds.size === 0) return false;
  entry.status = status;
  entry.lastSeen = status === "OFFLINE" ? new Date() : null;
  presenceByUser.set(userId, entry);
  return true;
}

export async function markOnlineFromDb(
  userId: string,
  socketId: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { presenceStatus: true },
  });
  const stored = (user?.presenceStatus ?? "ONLINE") as PresenceStatusWire;
  // OFFLINE is a connectivity state, not a persisted "connected preference".
  // When a user connects, default OFFLINE -> ONLINE while preserving
  // explicit statuses like AWAY/DND/INVISIBLE.
  const status = stored === "OFFLINE" ? "ONLINE" : stored;
  return markOnlineWithStatus(userId, socketId, status);
}

async function relatedUsers(userId: string): Promise<string[]> {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    select: { conversationId: true },
  });
  if (memberships.length === 0) return [userId];
  const conversationIds = memberships.map((m) => m.conversationId);
  const members = await prisma.conversationMember.findMany({
    where: { conversationId: { in: conversationIds } },
    select: { userId: true },
  });
  return Array.from(new Set([userId, ...members.map((m) => m.userId)]));
}

export async function broadcastPresenceToRelevant(
  io: AppIOServer,
  userId: string,
): Promise<void> {
  const snap = getStatus(userId);
  const userPrefs = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastSeenVisible: true, lastSeenAt: true },
  });
  const visibleLastSeen = userPrefs?.lastSeenVisible
    ? (snap.lastSeen ?? userPrefs.lastSeenAt ?? null)
    : null;
  const targetUserIds = await relatedUsers(userId);
  emitToUsers(io, targetUserIds, SOCKET_EVENTS.PRESENCE_CHANGED, {
    userId,
    status: snap.status,
    lastSeen: visibleLastSeen ? visibleLastSeen.toISOString() : null,
  });
}
