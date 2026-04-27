import { z } from "zod";
import { ApiException } from "../../utils/errorHandler";
import { logger } from "../../utils/logger";
import * as conversationRepository from "../../modules/conversation/conversation.repository";
import * as dmDelivery from "../../modules/message/dm-delivery";
import { messageService, MESSAGE_MAX_LENGTH } from "../../modules/message";
import type { MessageDTO } from "../../modules/message";
import { prisma } from "../../client/prisma";
import { shouldEmitNotificationPush } from "../../utils/notification-gate";
import { SOCKET_EVENTS } from "../events";
import { hasActiveSocket } from "../presence";
import { emitToUser, emitToUsers } from "../rooms";
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
    deliveredAt: msg.deliveredAt,
    deletedAt: msg.deletedAt,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
    sender: msg.sender,
    reactions: msg.reactions,
    replyCount: msg.replyCount,
    allRead: msg.allRead,
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
      const unreadTargets = await dmDelivery.getUnreadIncrementUserIds({
        conversationId: payload.conversationId,
        senderId,
        memberUserIds: memberIds,
      });
      if (unreadTargets.length > 0) {
        await prisma.conversationMember.updateMany({
          where: {
            conversationId: payload.conversationId,
            userId: { in: unreadTargets },
          },
          data: { unreadCount: { increment: 1 } },
        });
      }

      const emitRecipients = await dmDelivery.getMessageNewRecipientIds({
        conversationId: payload.conversationId,
        senderId,
        memberUserIds: memberIds,
      });
      const wire = asWire(created, payload.idempotencyKey);
      emitToUsers(io, emitRecipients, SOCKET_EVENTS.MESSAGE_NEW, wire);

      const markDel = await dmDelivery.shouldMarkMessageDelivered({
        conversationId: payload.conversationId,
        senderId,
        memberUserIds: memberIds,
        hasActiveSocket,
      });
      if (markDel && !created.deliveredAt) {
        const delivered = await messageService.markDelivered({
          messageId: created.id,
        });
        emitToUser(io, senderId, SOCKET_EVENTS.MESSAGE_DELIVERED, {
          messageId: delivered.id,
          conversationId: delivered.conversationId,
          deliveredAt: delivered.deliveredAt ?? delivered.updatedAt,
        });
      }

      const pushTargets = emitRecipients.filter((id) => id !== senderId);
      if (pushTargets.length > 0) {
        const now = new Date();
        const [users, prefs, parentRow] = await Promise.all([
          prisma.user.findMany({
            where: { id: { in: pushTargets } },
            select: {
              id: true,
              username: true,
              globalNotificationLevel: true,
            },
          }),
          prisma.conversationNotificationPreference.findMany({
            where: {
              conversationId: payload.conversationId,
              userId: { in: pushTargets },
            },
          }),
          payload.parentId
            ? prisma.message.findFirst({
                where: { id: payload.parentId, deletedAt: null },
                select: { senderId: true },
              })
            : Promise.resolve(null),
        ]);
        const userById = new Map(users.map((u) => [u.id, u]));
        const prefByUser = new Map(prefs.map((p) => [p.userId, p]));
        for (const uid of pushTargets) {
          const user = userById.get(uid);
          if (!user) continue;
          const pref = prefByUser.get(uid);
          const muted =
            pref?.isMuted === true &&
            (pref.muteUntil === null || pref.muteUntil.getTime() > now.getTime());
          if (muted) continue;
          const level = pref?.notificationLevel ?? user.globalNotificationLevel;
          if (
            !shouldEmitNotificationPush({
              level,
              recipientUsername: user.username,
              messageContent: wire.content,
              parentMessageSenderId: parentRow?.senderId ?? null,
              recipientUserId: uid,
            })
          ) {
            continue;
          }
          emitToUser(io, uid, SOCKET_EVENTS.NOTIFICATION_PUSH, {
            conversationId: wire.conversationId,
            messageId: wire.id,
            preview: wire.content.slice(0, 120),
          });
        }
      }

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
