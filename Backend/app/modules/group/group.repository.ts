import { randomBytes } from "crypto";
import { prisma } from "../../client/prisma";
import ApiException from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import {
  ConversationMemberRole,
  ConversationType,
  MemberJoinSource,
} from "../../generated/prisma/client";
import * as messageRepository from "../message/message.repository";
import type { MessageRow } from "../message/message.repository";

const INVITE_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";

export function generateInviteCode(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += INVITE_ALPHABET[bytes[i]! % INVITE_ALPHABET.length];
  }
  return out;
}

export async function createGroupTransaction(args: {
  creatorId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  otherMemberIds: string[];
}): Promise<{ conversationId: string; memberUserIds: string[] }> {
  const { creatorId, name, description, avatarUrl, otherMemberIds } = args;
  const uniqueOthers = Array.from(new Set(otherMemberIds)).filter(
    (id) => id !== creatorId,
  );

  const conv = await prisma.$transaction(async (tx) => {
    const created = await tx.conversation.create({
      data: {
        type: ConversationType.GROUP,
        members: {
          create: [
            {
              userId: creatorId,
              role: ConversationMemberRole.OWNER,
              joinSource: MemberJoinSource.FOUNDING,
            },
            ...uniqueOthers.map((userId) => ({
              userId,
              role: ConversationMemberRole.MEMBER,
              joinSource: MemberJoinSource.FOUNDING,
            })),
          ],
        },
        groupInfo: {
          create: {
            name,
            description,
            avatarUrl,
            ownerId: creatorId,
          },
        },
      },
      select: { id: true },
    });
    return created;
  });

  return {
    conversationId: conv.id,
    memberUserIds: [creatorId, ...uniqueOthers],
  };
}

export async function upsertActiveMembers(args: {
  conversationId: string;
  userIds: string[];
  joinSource: MemberJoinSource;
}): Promise<void> {
  const { conversationId, userIds, joinSource } = args;
  for (const userId of userIds) {
    await prisma.conversationMember.upsert({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      create: {
        conversationId,
        userId,
        role: ConversationMemberRole.MEMBER,
        leftAt: null,
        joinSource,
      },
      update: {
        leftAt: null,
        role: ConversationMemberRole.MEMBER,
        joinSource,
      },
    });
  }
}

export async function setMemberLeft(args: {
  conversationId: string;
  userId: string;
}): Promise<void> {
  await prisma.conversationMember.update({
    where: {
      conversationId_userId: {
        conversationId: args.conversationId,
        userId: args.userId,
      },
    },
    data: { leftAt: new Date() },
  });
}

export async function updateMemberRole(args: {
  conversationId: string;
  userId: string;
  role: ConversationMemberRole;
}): Promise<void> {
  await prisma.conversationMember.update({
    where: {
      conversationId_userId: {
        conversationId: args.conversationId,
        userId: args.userId,
      },
    },
    data: { role: args.role },
  });
}

export async function updateGroupInfoFields(args: {
  conversationId: string;
  data: {
    name?: string;
    description?: string | null;
    avatarUrl?: string | null;
    slowModeSeconds?: number;
    whoCanAddMembers?: string;
    whoCanSendMessages?: string;
    messageHistoryForNewMembers?: string;
    inviteCode?: string | null;
    inviteCodeExpiresAt?: Date | null;
    inviteCodeMaxUses?: number | null;
    inviteCodeUseCount?: number;
    ownerId?: string;
  };
}): Promise<void> {
  await prisma.groupInfo.update({
    where: { conversationId: args.conversationId },
    data: args.data,
  });
}

export async function setConversationPinnedMessage(args: {
  conversationId: string;
  messageId: string | null;
}): Promise<void> {
  await prisma.conversation.update({
    where: { id: args.conversationId },
    data: { pinnedMessageId: args.messageId },
  });
}

export async function dissolveConversation(args: {
  conversationId: string;
}): Promise<void> {
  await prisma.conversation.update({
    where: { id: args.conversationId },
    data: { deletedAt: new Date() },
  });
}

export async function getGroupForPermissionMeta(args: {
  conversationId: string;
  targetUserId: string;
}): Promise<{ role: ConversationMemberRole } | null> {
  const m = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: args.conversationId,
        userId: args.targetUserId,
      },
    },
    select: { role: true, leftAt: true },
  });
  if (!m || m.leftAt !== null) return null;
  return { role: m.role };
}

export async function getMessageHistorySetting(
  conversationId: string,
): Promise<string> {
  const g = await prisma.groupInfo.findUnique({
    where: { conversationId },
    select: { messageHistoryForNewMembers: true },
  });
  return g?.messageHistoryForNewMembers ?? "FULL";
}

export async function messageBelongsToConversation(args: {
  messageId: string;
  conversationId: string;
}): Promise<boolean> {
  const m = await prisma.message.findFirst({
    where: {
      id: args.messageId,
      conversationId: args.conversationId,
      deletedAt: null,
    },
    select: { id: true },
  });
  return !!m;
}

export async function findPinnedMessageRow(
  messageId: string,
): Promise<MessageRow | null> {
  return messageRepository.findById(messageId);
}

export async function transferOwnershipInDb(args: {
  conversationId: string;
  previousOwnerId: string;
  newOwnerId: string;
}): Promise<void> {
  await prisma.$transaction([
    prisma.groupInfo.update({
      where: { conversationId: args.conversationId },
      data: { ownerId: args.newOwnerId },
    }),
    prisma.conversationMember.update({
      where: {
        conversationId_userId: {
          conversationId: args.conversationId,
          userId: args.previousOwnerId,
        },
      },
      data: { role: ConversationMemberRole.ADMIN },
    }),
    prisma.conversationMember.update({
      where: {
        conversationId_userId: {
          conversationId: args.conversationId,
          userId: args.newOwnerId,
        },
      },
      data: { role: ConversationMemberRole.OWNER },
    }),
  ]);
}

export async function setInviteOnGroup(args: {
  conversationId: string;
  code: string;
  inviteCodeExpiresAt: Date | null;
  inviteCodeMaxUses: number | null;
}): Promise<void> {
  await prisma.groupInfo.update({
    where: { conversationId: args.conversationId },
    data: {
      inviteCode: args.code,
      inviteCodeExpiresAt: args.inviteCodeExpiresAt,
      inviteCodeMaxUses: args.inviteCodeMaxUses,
      inviteCodeUseCount: 0,
    },
  });
}

export async function revokeInvite(args: {
  conversationId: string;
}): Promise<void> {
  await prisma.groupInfo.update({
    where: { conversationId: args.conversationId },
    data: {
      inviteCode: null,
      inviteCodeExpiresAt: null,
      inviteCodeMaxUses: null,
      inviteCodeUseCount: 0,
    },
  });
}

/**
 * Atomically validates invite and increments use count (optimistic locking on useCount).
 */
export async function joinByInviteCodeTransaction(args: {
  inviteCode: string;
  userId: string;
}): Promise<{ conversationId: string }> {
  return prisma.$transaction(async (tx) => {
    const gi = await tx.groupInfo.findFirst({
      where: { inviteCode: args.inviteCode },
      select: {
        conversationId: true,
        inviteCode: true,
        inviteCodeExpiresAt: true,
        inviteCodeMaxUses: true,
        inviteCodeUseCount: true,
      },
    });
    if (!gi || gi.inviteCode !== args.inviteCode) {
      throw new ApiException({
        ...ErrorCodes.NOT_FOUND,
        errorDescription: "Invalid or expired invite",
      });
    }
    const conv = await tx.conversation.findUnique({
      where: { id: gi.conversationId },
      select: { deletedAt: true, type: true },
    });
    if (!conv || conv.deletedAt || conv.type !== ConversationType.GROUP) {
      throw new ApiException({
        ...ErrorCodes.NOT_FOUND,
        errorDescription: "Invalid or expired invite",
      });
    }
    const now = new Date();
    if (
      gi.inviteCodeExpiresAt &&
      gi.inviteCodeExpiresAt.getTime() <= now.getTime()
    ) {
      throw new ApiException({
        ...ErrorCodes.BAD_REQUEST,
        errorDescription: "This invite has expired",
      });
    }
    if (
      gi.inviteCodeMaxUses != null &&
      gi.inviteCodeUseCount >= gi.inviteCodeMaxUses
    ) {
      throw new ApiException({
        ...ErrorCodes.BAD_REQUEST,
        errorDescription: "This invite has reached its maximum uses",
      });
    }

    const maxUsesWhere =
      gi.inviteCodeMaxUses == null
        ? {}
        : { inviteCodeUseCount: { lt: gi.inviteCodeMaxUses } };

    const updated = await tx.groupInfo.updateMany({
      where: {
        conversationId: gi.conversationId,
        inviteCode: args.inviteCode,
        inviteCodeUseCount: gi.inviteCodeUseCount,
        OR: [
          { inviteCodeExpiresAt: null },
          { inviteCodeExpiresAt: { gt: now } },
        ],
        ...maxUsesWhere,
      },
      data: { inviteCodeUseCount: { increment: 1 } },
    });

    if (updated.count !== 1) {
      throw new ApiException({
        ...ErrorCodes.CONFLICT,
        errorDescription: "Could not use invite; please try again",
      });
    }

    await tx.conversationMember.upsert({
      where: {
        conversationId_userId: {
          conversationId: gi.conversationId,
          userId: args.userId,
        },
      },
      create: {
        conversationId: gi.conversationId,
        userId: args.userId,
        role: ConversationMemberRole.MEMBER,
        leftAt: null,
        joinSource: MemberJoinSource.INVITE,
      },
      update: {
        leftAt: null,
        role: ConversationMemberRole.MEMBER,
        joinSource: MemberJoinSource.INVITE,
      },
    });

    return { conversationId: gi.conversationId };
  });
}
