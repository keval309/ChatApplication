import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import { prisma } from "../../client/prisma";
import * as conversationRepository from "../conversation/conversation.repository";
import * as messageRepository from "./message.repository";
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

// ─────────────────────────────────────────────────────────────────────────────
// In-memory token bucket for per-user-per-conversation send rate limiting.
// 30 messages / 60 seconds (PRD §19). Replace with Redis when scaling out.
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

function toMessageDTO(row: messageRepository.MessageRow): MessageDTO {
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
  };
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

/**
 * For DMs: ensure neither user has blocked the other.
 * No-op for groups (block hides messages client-side per PRD §10.1).
 */
async function assertNotBlocked(args: {
  conversationId: string;
  senderId: string;
}): Promise<void> {
  const conv = await prisma.conversation.findUnique({
    where: { id: args.conversationId },
    select: {
      type: true,
      members: { select: { userId: true } },
    },
  });
  if (!conv || conv.type !== "DM") return;
  const otherUserId = conv.members
    .map((m) => m.userId)
    .find((id) => id !== args.senderId);
  if (!otherUserId) return;
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: args.senderId, blockedId: otherUserId },
        { blockerId: otherUserId, blockedId: args.senderId },
      ],
    },
    select: { id: true },
  });
  if (block) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You can't message this person",
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
  const limit = Math.min(args.limit ?? MESSAGE_PAGE_SIZE, 100);
  const rows = await messageRepository.findPage({
    conversationId: args.conversationId,
    cursor: args.cursor ?? null,
    limit,
  });
  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  const oldest = trimmed[trimmed.length - 1];
  const nextCursor = hasMore && oldest ? oldest.id : null;

  // Server returns DESC for cursor logic; flip to ASC for direct rendering.
  const messages = trimmed.map(toMessageDTO).reverse();

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
  await assertNotBlocked({
    conversationId: input.conversationId,
    senderId: input.senderId,
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

  const row = await messageRepository.createMessage({
    conversationId: input.conversationId,
    senderId: input.senderId,
    content: trimmed,
    type: input.type,
    parentId: input.parentId ?? null,
  });

  await conversationRepository.touchConversation(input.conversationId);

  return toMessageDTO(row);
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
  return toMessageDTO(row);
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
    return toMessageDTO(existing);
  }
  const row = await messageRepository.softDelete(input.messageId);
  return toMessageDTO(row);
}

export async function markDelivered(args: {
  messageId: string;
  at?: Date;
}): Promise<MessageDTO> {
  const row = await messageRepository.setDeliveredAt(
    args.messageId,
    args.at ?? new Date(),
  );
  return toMessageDTO(row);
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

export { toMessageDTO };
