import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import { prisma } from "../../client/prisma";
import * as conversationRepository from "./conversation.repository";
import type {
  ConversationListItemDTO,
  ConversationMemberDTO,
  ConversationsPageDTO,
  LastMessagePreviewDTO,
} from "./conversation.types";

const PAGE_SIZE = 30;

function readMutedAt(mutedBy: unknown, userId: string): string | null {
  if (!mutedBy || typeof mutedBy !== "object") return null;
  const map = mutedBy as Record<string, string | null>;
  const value = map[userId];
  if (!value) return null;
  if (new Date(value).getTime() <= Date.now()) return null;
  return value;
}

function toMemberDTO(
  m: conversationRepository.ConversationListRow["members"][number],
): ConversationMemberDTO {
  return {
    userId: m.userId,
    role: m.role,
    joinedAt: m.joinedAt.toISOString(),
    lastReadAt: m.lastReadAt ? m.lastReadAt.toISOString() : null,
    user: m.user,
  };
}

function toLastMessage(
  msg: conversationRepository.ConversationListRow["messages"][number] | undefined,
): LastMessagePreviewDTO | null {
  if (!msg) return null;
  return {
    id: msg.id,
    senderId: msg.senderId,
    content: msg.content,
    type: msg.type,
    createdAt: msg.createdAt.toISOString(),
    deletedAt: msg.deletedAt ? msg.deletedAt.toISOString() : null,
  };
}

async function projectListItem(args: {
  row: conversationRepository.ConversationListRow;
  userId: string;
}): Promise<ConversationListItemDTO> {
  const { row, userId } = args;
  const meMember = row.members.find((m) => m.userId === userId);
  const otherMember = row.members.find((m) => m.userId !== userId) ?? null;
  const unreadCount = await conversationRepository.countUnreadForMember({
    conversationId: row.id,
    userId,
    lastReadAt: meMember?.lastReadAt ?? null,
  });

  return {
    id: row.id,
    type: row.type,
    isArchived: row.archivedBy.includes(userId),
    muteUntil: readMutedAt(row.mutedBy, userId),
    members: row.members.map(toMemberDTO),
    lastMessage: toLastMessage(row.messages[0]),
    unreadCount,
    otherUser: row.type === "DM" && otherMember ? otherMember.user : null,
    groupName: row.groupInfo?.name ?? null,
    groupAvatarUrl: row.groupInfo?.avatarUrl ?? null,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listForUser(args: {
  userId: string;
  cursor?: string | null;
  filter?: "ALL" | "ARCHIVED" | "GROUPS";
}): Promise<ConversationsPageDTO> {
  const filter = args.filter ?? "ALL";
  const rows = await conversationRepository.findConversationsForUser({
    userId: args.userId,
    cursor: args.cursor ?? null,
    limit: PAGE_SIZE,
    filter,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const trimmed = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = trimmed[trimmed.length - 1];
  const nextCursor = hasMore && last ? last.id : null;

  const conversations = await Promise.all(
    trimmed.map((row) => projectListItem({ row, userId: args.userId })),
  );

  return { conversations, nextCursor, hasMore };
}

export async function getOrCreateDm(args: {
  selfUserId: string;
  otherUserId: string;
}): Promise<ConversationListItemDTO> {
  const { selfUserId, otherUserId } = args;
  if (selfUserId === otherUserId) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "You cannot start a DM with yourself",
    });
  }

  const otherExists = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, deletedAt: true },
  });
  if (!otherExists || otherExists.deletedAt) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "User not found",
    });
  }

  // Check mutual block (either direction blocks the conversation start)
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: selfUserId, blockedId: otherUserId },
        { blockerId: otherUserId, blockedId: selfUserId },
      ],
    },
    select: { id: true },
  });
  if (block) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You cannot message this user",
    });
  }

  const existing = await conversationRepository.findDmBetween(
    selfUserId,
    otherUserId,
  );
  const id = existing?.id ?? (
    await conversationRepository.createDmConversation({
      userIdA: selfUserId,
      userIdB: otherUserId,
    })
  ).id;

  const row = await conversationRepository.findById(id);
  if (!row) {
    throw new ApiException({
      ...ErrorCodes.INTERNAL,
      errorDescription: "Failed to load conversation",
    });
  }
  return projectListItem({ row, userId: selfUserId });
}

export async function setArchived(args: {
  userId: string;
  conversationId: string;
  archived: boolean;
}): Promise<void> {
  const isMember = await conversationRepository.isMember({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!isMember) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are not a member of this conversation",
    });
  }
  await conversationRepository.setArchived(args);
}

export async function markRead(args: {
  userId: string;
  conversationId: string;
}): Promise<void> {
  const isMember = await conversationRepository.isMember({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!isMember) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are not a member of this conversation",
    });
  }
  await conversationRepository.updateLastReadAt({
    conversationId: args.conversationId,
    userId: args.userId,
    at: new Date(),
  });
}

export async function getById(args: {
  userId: string;
  conversationId: string;
}): Promise<ConversationListItemDTO> {
  const isMember = await conversationRepository.isMember({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!isMember) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are not a member of this conversation",
    });
  }
  const row = await conversationRepository.findById(args.conversationId);
  if (!row) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "Conversation not found",
    });
  }
  return projectListItem({ row, userId: args.userId });
}
