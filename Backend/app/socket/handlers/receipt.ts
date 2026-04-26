import { z } from "zod";
import { logger } from "../../utils/logger";
import { receiptService } from "../../modules/receipt";
import * as conversationRepository from "../../modules/conversation/conversation.repository";
import { SOCKET_EVENTS } from "../events";
import { emitToUser } from "../rooms";
import type { AppIOServer, AppSocket } from "../types";

const DEBOUNCE_MS = 250;

const readSchema = z.object({
  conversationId: z.string().min(1),
  messageIds: z.array(z.string().min(1)).min(1).max(200),
});

interface BufferState {
  ids: Set<string>;
  timer: NodeJS.Timeout | null;
}

export function registerReceiptHandlers(
  io: AppIOServer,
  socket: AppSocket,
): void {
  const userId = socket.data.auth.userId;
  // Per-socket buffer keyed by conversationId.
  const buffers: Map<string, BufferState> = new Map();

  async function flush(conversationId: string): Promise<void> {
    const buffer = buffers.get(conversationId);
    if (!buffer) return;
    buffer.timer = null;
    const ids = Array.from(buffer.ids);
    buffer.ids.clear();
    if (ids.length === 0) return;

    try {
      const updates = await receiptService.markRead({
        userId,
        messageIds: ids,
      });
      const grouped = new Map<
        string,
        Array<{ messageId: string; readBy: Array<{ userId: string; seenAt: string }> }>
      >();
      for (const update of updates) {
        const arr = grouped.get(update.senderId) ?? [];
        arr.push({ messageId: update.messageId, readBy: update.readBy });
        grouped.set(update.senderId, arr);
      }
      for (const [senderId, senderUpdates] of grouped.entries()) {
        emitToUser(io, senderId, SOCKET_EVENTS.RECEIPT_UPDATE, {
          conversationId,
          updates: senderUpdates,
        });
      }
    } catch (err) {
      logger.error("[socket.receipt] flush failed", err as Error);
    }
  }

  socket.on(SOCKET_EVENTS.RECEIPT_READ, async (raw) => {
    try {
      const payload = readSchema.parse(raw);
      const isMember = await conversationRepository.isMember({
        conversationId: payload.conversationId,
        userId,
      });
      if (!isMember) return;
      const allowed = await receiptService.canSendReadReceipts(userId);
      if (!allowed) return;
      const buffer =
        buffers.get(payload.conversationId) ??
        ({ ids: new Set<string>(), timer: null } as BufferState);
      for (const id of payload.messageIds) buffer.ids.add(id);
      buffers.set(payload.conversationId, buffer);

      if (!buffer.timer) {
        buffer.timer = setTimeout(() => {
          void flush(payload.conversationId);
        }, DEBOUNCE_MS);
      }
    } catch (err) {
      logger.warn("[socket.receipt] read ignored", err as Error);
    }
  });

  socket.on("disconnect", () => {
    for (const buffer of buffers.values()) {
      if (buffer.timer) clearTimeout(buffer.timer);
    }
    buffers.clear();
  });
}
