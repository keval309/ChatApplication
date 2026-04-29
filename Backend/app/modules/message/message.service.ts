import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import { prisma } from "../../client/prisma";
import * as conversationRepository from "../conversation/conversation.repository";
import { loadBlockMaps } from "../user/block-lookup";
import * as messageRepository from "./message.repository";
import { computeAllRead, type ConvTickContext } from "./message-ticks";
import {
  MESSAGE_EDIT_WINDOW_MS,
  MESSAGE_MAX_LENGTH,
  MESSAGE_PAGE_SIZE,
  MESSAGE_RATE_LIMIT_MAX,
  MESSAGE_RATE_LIMIT_WINDOW_MS,
} from "./message.types";
import type {
  DeleteMessageInput,
  EditMessageInput,
  MessageDTO,
  MessagesPageDTO,
  SendMessageInput,
} from "./message.types";
import { assertGroupMessageSendAllowed } from "../group/group-permissions";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory token bucket for per-user-per-conversation send rate limiting.
// 30 messages / 60 seconds (PRD §18). Replace with Redis when scaling out.
// ─────────────────────────────────────────────────────────────────────────────
const rateBuckets: Map<string, number[]> = new Map();

function rateBucketKey(userId: string, conversationId: string): string {
  return `${userId}::${conversationId}`;
}

function checkRateLimit(userId: string, conversationId: string): void {
  const key = rateBucketKey(userId, conversationId);
  const now = Date.now();
  const window = now - MESSAGE_RATE_LIMIT_WINDOW_MS;
  const arr = (rateBuckets.get(key) ?? []).filter((t) => t > window);
  if (arr.length >= MESSAGE_RATE_LIMIT_MAX) {
    throw new ApiException({
      ...ErrorCodes.TOO_MANY_REQUESTS,
      errorDescription: `You're sending messages too fast. Try again in a moment.`,
    });
  }
  arr.push(now);
  rateBuckets.set(key, arr);
}

// ─────────────────────────────────────────────────────────────────────────────
// Projection
// ─────────────────────────────────────────────────────────────────────────────

async function loadConvTickContext(
  conversationId: string,
): Promise<ConvTickContext> {
  const c = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      type: true,
      members: {
        select: {
          userId: true,
          user: { select: { sendReadReceipts: true } },
        },
      },
    },
  });
  if (!c) {
    return { type: "DM", members: [] };
  }
  return {
    type: c.type,
    members: c.members.map((m) => ({
      userId: m.userId,
      sendReadReceipts: m.user.sendReadReceipts,
    })),
  };
}

function toMessageDTO(
  row: messageRepository.MessageRow,
  allRead: boolean,
): MessageDTO {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    content: row.deletedAt ? "" : row.content,
    type: row.type,
    parentId: row.parentId,
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sender: row.sender,
    reactions: row.reactions,
    replyCount: row._count.replies,
    readBy: row.readReceipts
      .filter((r) => r.userId !== row.senderId)
      .map((r) => ({ userId: r.userId, seenAt: r.seenAt.toISOString() })),
    allRead,
  };
}

async function rowToDto(
  row: messageRepository.MessageRow,
): Promise<MessageDTO> {
  const ctx = await loadConvTickContext(row.conversationId);
  return toMessageDTO(row, computeAllRead(row, ctx));
}

// ─────────────────────────────────────────────────────────────────────────────
// Membership / block guards
// ─────────────────────────────────────────────────────────────────────────────

export async function assertMember(args: {
  conversationId: string;
  userId: string;
}): Promise<void> {
  const ok = await conversationRepository.isMember(args);
  if (!ok) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are not a member of this conversation",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API used by both REST routes and socket handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function listForConversation(args: {
  userId: string;
  conversationId: string;
  cursor?: string | null;
  limit?: number;
}): Promise<MessagesPageDTO> {
  await assertMember({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  const conv = await prisma.conversation.findUnique({
    where: { id: args.conversationId },
    select: { deletedAt: true, type: true },
  });
  if (conv?.deletedAt) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "Conversation not found",
    });
  }
  const mem = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: args.conversationId,
        userId: args.userId,
      },
    },
    select: { historyClearedAt: true, joinedAt: true },
  });
  let visibilityLowerBound: Date | null = null;
  if (conv?.type === "GROUP") {
    const gi = await prisma.groupInfo.findUnique({
      where: { conversationId: args.conversationId },
      select: { messageHistoryForNewMembers: true },
    });
    const pol = gi?.messageHistoryForNewMembers ?? "FULL";
    const joinedAt = mem?.joinedAt ?? new Date();
    if (pol === "LAST_7_DAYS") {
      visibilityLowerBound = new Date(joinedAt.getTime() - 7 * 86_400_000);
    } else if (pol === "NONE") {
      visibilityLowerBound = joinedAt;
    }
  }
  const limit = Math.min(args.limit ?? MESSAGE_PAGE_SIZE, 100);
  const rows = await messageRepository.findPage({
    conversationId: args.conversationId,
    cursor: args.cursor ?? null,
    limit,
    viewerUserId: args.userId,
    historyClearedAt: mem?.historyClearedAt ?? null,
    visibilityLowerBound,
  });
  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  const oldest = trimmed[trimmed.length - 1];
  const nextCursor = hasMore && oldest ? oldest.id : null;

  const ctx = await loadConvTickContext(args.conversationId);

  const convBrief = await prisma.conversation.findUnique({
    where: { id: args.conversationId },
    select: { type: true, members: { select: { userId: true } } },
  });
  let hidePeerAvatarInDm = false;
  let dmPeerId: string | null = null;
  if (convBrief?.type === "DM") {
    dmPeerId =
      convBrief.members.find((m) => m.userId !== args.userId)?.userId ?? null;
    if (dmPeerId) {
      const bm = await loadBlockMaps(args.userId);
      hidePeerAvatarInDm =
        bm.iBlockedUserIds.has(dmPeerId) ||
        bm.blockedMeByUserIds.has(dmPeerId);
    }
  }

  // Server returns DESC for cursor logic; flip to ASC for direct rendering.
  const messages = trimmed
    .map((row) => {
      const dto = toMessageDTO(row, computeAllRead(row, ctx));
      if (hidePeerAvatarInDm && dmPeerId && row.senderId === dmPeerId) {
        return {
          ...dto,
          sender: { ...dto.sender, avatarUrl: null },
        };
      }
      return dto;
    })
    .reverse();

  return { messages, nextCursor, hasMore };
}

export async function sendMessage(input: SendMessageInput): Promise<MessageDTO> {
  if (typeof input.content !== "string") {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "content must be a string",
    });
  }
  const trimmed = input.content.trim();
  if (trimmed.length === 0) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Message cannot be empty",
    });
  }
  if (trimmed.length > MESSAGE_MAX_LENGTH) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: `Message exceeds ${MESSAGE_MAX_LENGTH} characters`,
    });
  }

  await assertMember({
    conversationId: input.conversationId,
    userId: input.senderId,
  });
  checkRateLimit(input.senderId, input.conversationId);

  if (input.parentId) {
    const parent = await prisma.message.findUnique({
      where: { id: input.parentId },
      select: { conversationId: true, deletedAt: true },
    });
    if (!parent || parent.conversationId !== input.conversationId) {
      throw new ApiException({
        ...ErrorCodes.BAD_REQUEST,
        errorDescription: "Reply target is invalid",
      });
    }
  }

  const convBrief = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: {
      type: true,
      deletedAt: true,
      members: { select: { userId: true } },
    },
  });
  if (!convBrief) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "Conversation not found",
    });
  }
  if (convBrief.deletedAt) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "This group has been deleted",
    });
  }

  if (convBrief.type === "GROUP") {
    await assertGroupMessageSendAllowed(
      input.conversationId,
      input.senderId,
    );
    const gi = await prisma.groupInfo.findUnique({
      where: { conversationId: input.conversationId },
      select: { slowModeSeconds: true },
    });
    if (gi && gi.slowModeSeconds > 0) {
      const last = await prisma.message.findFirst({
        where: {
          conversationId: input.conversationId,
          senderId: input.senderId,
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (last) {
        const elapsedSec =
          (Date.now() - last.createdAt.getTime()) / 1000;
        const need = gi.slowModeSeconds;
        if (elapsedSec < need) {
          const retryAfter = Math.max(1, Math.ceil(need - elapsedSec));
          throw new ApiException({
            ...ErrorCodes.TOO_MANY_REQUESTS,
            errorDescription: "Slow mode is enabled for this group",
            clientError: "SLOW_MODE",
            retryAfterSeconds: retryAfter,
          });
        }
      }
    }
  }

  let suppressedForUserIds: string[] = [];
  if (convBrief.type === "DM") {
    const peerId = convBrief.members
      .map((m) => m.userId)
      .find((id) => id !== input.senderId);
    if (!peerId) {
      throw new ApiException({
        ...ErrorCodes.BAD_REQUEST,
        errorDescription: "Invalid DM membership",
      });
    }
    const iBlockedThem = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: input.senderId,
          blockedId: peerId,
        },
      },
      select: { id: true },
    });
    if (iBlockedThem) {
      throw new ApiException({
        ...ErrorCodes.FORBIDDEN,
        errorDescription:
          "You blocked this contact. Unblock them to send messages.",
      });
    }
    const theyBlockedMe = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: peerId,
          blockedId: input.senderId,
        },
      },
      select: { id: true },
    });
    if (theyBlockedMe) {
      suppressedForUserIds = [peerId];
    }

    // Peer "deleted chat" (leftAt) — new incoming message restores the DM in their inbox.
    const peerMembership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: peerId,
        },
      },
      select: { leftAt: true },
    });
    if (peerMembership?.leftAt != null) {
      await prisma.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId: input.conversationId,
            userId: peerId,
          },
        },
        data: { leftAt: null },
      });
    }
  }

  const row = await messageRepository.createMessage({
    conversationId: input.conversationId,
    senderId: input.senderId,
    content: trimmed,
    type: input.type,
    parentId: input.parentId ?? null,
    suppressedForUserIds,
  });

  await conversationRepository.touchConversation(input.conversationId);

  return rowToDto(row);
}

export async function editMessage(input: EditMessageInput): Promise<MessageDTO> {
  const existing = await messageRepository.findById(input.messageId);
  if (!existing) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "Message not found",
    });
  }
  if (existing.senderId !== input.senderId) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You can only edit your own messages",
    });
  }
  if (existing.deletedAt) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Cannot edit a deleted message",
    });
  }
  const ageMs = Date.now() - new Date(existing.createdAt).getTime();
  if (ageMs > MESSAGE_EDIT_WINDOW_MS) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "Edit window has expired",
    });
  }
  const trimmed = input.newContent.trim();
  if (trimmed.length === 0) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Message cannot be empty",
    });
  }
  if (trimmed.length > MESSAGE_MAX_LENGTH) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: `Message exceeds ${MESSAGE_MAX_LENGTH} characters`,
    });
  }

  const row = await messageRepository.updateContent({
    messageId: input.messageId,
    newContent: trimmed,
  });
  return rowToDto(row);
}

export async function deleteMessage(
  input: DeleteMessageInput,
): Promise<MessageDTO> {
  const existing = await messageRepository.findById(input.messageId);
  if (!existing) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "Message not found",
    });
  }
  if (existing.senderId !== input.senderId) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You can only delete your own messages",
    });
  }
  if (existing.deletedAt) {
    return rowToDto(existing);
  }
  const row = await messageRepository.softDelete(input.messageId);
  return rowToDto(row);
}

export async function markDelivered(args: {
  messageId: string;
  at?: Date;
}): Promise<MessageDTO> {
  const row = await messageRepository.setDeliveredAt(
    args.messageId,
    args.at ?? new Date(),
  );
  return rowToDto(row);
}

export async function catchUpDeliveredForRecipient(args: {
  recipientId: string;
  limit?: number;
}): Promise<
  Array<{
    messageId: string;
    senderId: string;
    conversationId: string;
    deliveredAt: string;
  }>
> {
  const pending = await messageRepository.findUndeliveredForRecipient({
    recipientId: args.recipientId,
    limit: args.limit ?? 500,
  });
  if (pending.length === 0) return [];

  const deliveredAt = new Date();
  await messageRepository.setDeliveredAtMany({
    messageIds: pending.map((m) => m.id),
    at: deliveredAt,
  });

  return pending.map((m) => ({
    messageId: m.id,
    senderId: m.senderId,
    conversationId: m.conversationId,
    deliveredAt: deliveredAt.toISOString(),
  }));
}

export { toMessageDTO, rowToDto, loadConvTickContext };
