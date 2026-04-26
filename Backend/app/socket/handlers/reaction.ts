import { z } from "zod";
import { ApiException } from "../../utils/errorHandler";
import { logger } from "../../utils/logger";
import * as conversationRepository from "../../modules/conversation/conversation.repository";
import { reactionService } from "../../modules/reaction";
import { SOCKET_EVENTS } from "../events";
import { emitToUsers } from "../rooms";
import type {
  AckResponse,
  AppIOServer,
  AppSocket,
  ReactionUpdatedEvent,
} from "../types";

const toggleSchema = z.object({
  messageId: z.string().min(1),
  emoji: z.string().min(1).max(64),
});

function ackError(err: unknown): AckResponse<never> {
  if (err instanceof ApiException) {
    return {
      ok: false,
      error: {
        message: err.errorDescription ?? err.message ?? "Request failed",
        code: err.status,
      },
    };
  }
  if (err instanceof z.ZodError) {
    return {
      ok: false,
      error: { message: err.issues.map((i) => i.message).join(", "), code: 400 },
    };
  }
  logger.error("[socket.reaction] unexpected handler error", err as Error);
  return { ok: false, error: { message: "Internal server error", code: 500 } };
}

export function registerReactionHandlers(
  io: AppIOServer,
  socket: AppSocket,
): void {
  const userId = socket.data.auth.userId;

  socket.on(SOCKET_EVENTS.REACTION_TOGGLE, async (rawPayload, ack) => {
    try {
      const payload = toggleSchema.parse(rawPayload);
      const result = await reactionService.toggle({
        userId,
        messageId: payload.messageId,
        emoji: payload.emoji,
      });
      const event: ReactionUpdatedEvent = {
        messageId: result.messageId,
        conversationId: result.conversationId,
        reactions: result.reactions,
      };
      const memberIds = await conversationRepository.listMemberUserIds(
        result.conversationId,
      );
      emitToUsers(io, memberIds, SOCKET_EVENTS.REACTION_UPDATED, event);
      ack?.({ ok: true, data: event });
    } catch (err) {
      ack?.(ackError(err));
    }
  });
}
