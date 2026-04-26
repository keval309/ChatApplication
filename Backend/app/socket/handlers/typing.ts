import { z } from "zod";
import { logger } from "../../utils/logger";
import * as conversationRepository from "../../modules/conversation/conversation.repository";
import { SOCKET_EVENTS } from "../events";
import { emitToUsers } from "../rooms";
import type { AppIOServer, AppSocket } from "../types";

const TYPING_TTL_MS = 4_000;
const SWEEP_INTERVAL_MS = 1_000;

interface TypingEntry {
  expiresAt: number;
}

/**
 * Per-conversation typing state. The sweeper drops entries older than 4s
 * to defend against clients that disconnect without sending a stop event.
 */
const typingByConv: Map<string, Map<string, TypingEntry>> = new Map();

let sweeperStarted = false;
function ensureSweeper(io: AppIOServer): void {
  if (sweeperStarted) return;
  sweeperStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [conversationId, users] of typingByConv) {
      let changed = false;
      for (const [userId, entry] of users) {
        if (entry.expiresAt <= now) {
          users.delete(userId);
          changed = true;
        }
      }
      if (users.size === 0) typingByConv.delete(conversationId);
      if (changed) {
        void broadcastTyping(io, conversationId).catch((err) => {
          logger.error("[socket.typing] sweeper broadcast failed", err as Error);
        });
      }
    }
  }, SWEEP_INTERVAL_MS).unref?.();
}

async function broadcastTyping(
  io: AppIOServer,
  conversationId: string,
): Promise<void> {
  const users = typingByConv.get(conversationId);
  const typingUserIds = users ? Array.from(users.keys()) : [];
  const memberIds = await conversationRepository.listMemberUserIds(conversationId);
  emitToUsers(io, memberIds, SOCKET_EVENTS.TYPING_UPDATE, {
    conversationId,
    typingUserIds,
  });
}

const startSchema = z.object({ conversationId: z.string().min(1) });
const stopSchema = z.object({ conversationId: z.string().min(1) });

export function registerTypingHandlers(
  io: AppIOServer,
  socket: AppSocket,
): void {
  ensureSweeper(io);
  const userId = socket.data.auth.userId;

  socket.on(SOCKET_EVENTS.TYPING_START, async (raw) => {
    try {
      const { conversationId } = startSchema.parse(raw);
      const isMember = await conversationRepository.isMember({
        conversationId,
        userId,
      });
      if (!isMember) return;
      const set = typingByConv.get(conversationId) ?? new Map<string, TypingEntry>();
      set.set(userId, { expiresAt: Date.now() + TYPING_TTL_MS });
      typingByConv.set(conversationId, set);
      await broadcastTyping(io, conversationId);
    } catch (err) {
      logger.warn("[socket.typing] start ignored", err as Error);
    }
  });

  socket.on(SOCKET_EVENTS.TYPING_STOP, async (raw) => {
    try {
      const { conversationId } = stopSchema.parse(raw);
      const set = typingByConv.get(conversationId);
      if (!set) return;
      if (set.delete(userId)) {
        if (set.size === 0) typingByConv.delete(conversationId);
        await broadcastTyping(io, conversationId);
      }
    } catch (err) {
      logger.warn("[socket.typing] stop ignored", err as Error);
    }
  });

  socket.on("disconnect", () => {
    // Clear any active typing entries for this user across conversations.
    for (const [conversationId, set] of typingByConv) {
      if (set.delete(userId)) {
        if (set.size === 0) typingByConv.delete(conversationId);
        void broadcastTyping(io, conversationId).catch(() => {});
      }
    }
  });
}
