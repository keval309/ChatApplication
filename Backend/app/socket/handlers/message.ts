import { z } from "zod";
import { ApiException } from "../../utils/errorHandler";
import { logger } from "../../utils/logger";
import * as conversationRepository from "../../modules/conversation/conversation.repository";
import { messageService, MESSAGE_MAX_LENGTH } from "../../modules/message";
import type { MessageDTO } from "../../modules/message";
import { SOCKET_EVENTS } from "../events";
import { emitToUsers } from "../rooms";
import type {
  AckResponse,
  AppIOServer,
  AppSocket,
  MessageDeletedEvent,
  MessageUpdatedEvent,
  MessageWire,
} from "../types";

const sendSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1).max(MESSAGE_MAX_LENGTH),
  type: z.enum(["TEXT", "IMAGE", "GIF", "FILE"]),
  parentId: z.string().nullish(),
  idempotencyKey: z.string().min(1).max(64),
});

const editSchema = z.object({
  messageId: z.string().min(1),
  newContent: z.string().min(1).max(MESSAGE_MAX_LENGTH),
});

const deleteSchema = z.object({
  messageId: z.string().min(1),
});

function asWire(msg: MessageDTO, idempotencyKey?: string): MessageWire {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    content: msg.content,
    type: msg.type,
    parentId: msg.parentId,
    editedAt: msg.editedAt,
    deletedAt: msg.deletedAt,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
    sender: msg.sender,
    reactions: msg.reactions,
    replyCount: msg.replyCount,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };
}

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
      error: {
        message: err.issues.map((i) => i.message).join(", "),
        code: 400,
      },
    };
  }
  logger.error("[socket.message] unexpected handler error", err as Error);
  return { ok: false, error: { message: "Internal server error", code: 500 } };
}

export function registerMessageHandlers(
  io: AppIOServer,
  socket: AppSocket,
): void {
  const senderId = socket.data.auth.userId;

  socket.on(SOCKET_EVENTS.MESSAGE_SEND, async (rawPayload, ack) => {
    try {
      const payload = sendSchema.parse(rawPayload);
      const created = await messageService.sendMessage({
        conversationId: payload.conversationId,
        senderId,
        content: payload.content,
        type: payload.type,
        parentId: payload.parentId ?? null,
      });

      const memberIds = await conversationRepository.listMemberUserIds(
        payload.conversationId,
      );
      const wire = asWire(created, payload.idempotencyKey);
      emitToUsers(io, memberIds, SOCKET_EVENTS.MESSAGE_NEW, wire);

      ack({ ok: true, data: wire });
    } catch (err) {
      ack(ackError(err));
    }
  });

  socket.on(SOCKET_EVENTS.MESSAGE_EDIT, async (rawPayload, ack) => {
    try {
      const payload = editSchema.parse(rawPayload);
      const updated = await messageService.editMessage({
        messageId: payload.messageId,
        senderId,
        newContent: payload.newContent,
      });

      const memberIds = await conversationRepository.listMemberUserIds(
        updated.conversationId,
      );
      const event: MessageUpdatedEvent = {
        id: updated.id,
        conversationId: updated.conversationId,
        content: updated.content,
        editedAt: updated.editedAt!,
        updatedAt: updated.updatedAt,
      };
      emitToUsers(io, memberIds, SOCKET_EVENTS.MESSAGE_UPDATED, event);
      ack?.({ ok: true, data: event });
    } catch (err) {
      ack?.(ackError(err));
    }
  });

  socket.on(SOCKET_EVENTS.MESSAGE_DELETE, async (rawPayload, ack) => {
    try {
      const payload = deleteSchema.parse(rawPayload);
      const deleted = await messageService.deleteMessage({
        messageId: payload.messageId,
        senderId,
      });

      const memberIds = await conversationRepository.listMemberUserIds(
        deleted.conversationId,
      );
      const event: MessageDeletedEvent = {
        id: deleted.id,
        conversationId: deleted.conversationId,
        deletedAt: deleted.deletedAt!,
      };
      emitToUsers(io, memberIds, SOCKET_EVENTS.MESSAGE_DELETED, event);
      ack?.({ ok: true, data: event });
    } catch (err) {
      ack?.(ackError(err));
    }
  });
}
