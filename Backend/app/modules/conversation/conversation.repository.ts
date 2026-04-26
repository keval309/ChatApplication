import { prisma } from "../../client/prisma";
import {
  ConversationType,
  ConversationMemberRole,
} from "../../generated/prisma/client";

const conversationListSelect = {
  id: true,
  type: true,
  archivedBy: true,
  mutedBy: true,
  createdAt: true,
  updatedAt: true,
  groupInfo: {
    select: {
      name: true,
      avatarUrl: true,
    },
  },
  members: {
    select: {
      userId: true,
      role: true,
      joinedAt: true,
      lastReadAt: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  },
  messages: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      id: true,
      senderId: true,
      content: true,
      type: true,
      createdAt: true,
      deletedAt: true,
    },
  },
} as const;

export type ConversationListRow = Awaited<
  ReturnType<typeof findConversationsForUser>
>[number];

/**
 * Cursor-paginated list of conversations the user is a member of.
 * Cursor = conversation id from the previous page (we order by updatedAt desc,
 * id desc as a stable tiebreaker).
 */
export async function findConversationsForUser(args: {
  userId: string;
  cursor?: string | null;
  limit: number;
  filter: "ALL" | "ARCHIVED" | "GROUPS";
}) {
  const { userId, cursor, limit, filter } = args;

  const baseWhere = {
    members: { some: { userId } },
  } as const;

  const archiveCondition =
    filter === "ARCHIVED"
      ? { archivedBy: { has: userId } }
      : { NOT: { archivedBy: { has: userId } } };

  const typeCondition =
    filter === "GROUPS" ? { type: ConversationType.GROUP } : {};

  return prisma.conversation.findMany({
    where: { ...baseWhere, ...archiveCondition, ...typeCondition },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: conversationListSelect,
  });
}

export async function countUnreadForMember(args: {
  conversationId: string;
  userId: string;
  lastReadAt: Date | null;
}): Promise<number> {
  const { conversationId, userId, lastReadAt } = args;
  return prisma.message.count({
    where: {
      conversationId,
      senderId: { not: userId },
      deletedAt: null,
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  });
}

export async function findDmBetween(
  userIdA: string,
  userIdB: string,
): Promise<{ id: string } | null> {
  if (userIdA === userIdB) return null;

  // Find DMs where both users are members. Postgres-level join via two `some` clauses.
  const conv = await prisma.conversation.findFirst({
    where: {
      type: ConversationType.DM,
      AND: [
        { members: { some: { userId: userIdA } } },
        { members: { some: { userId: userIdB } } },
      ],
    },
    select: { id: true, members: { select: { userId: true } } },
  });

  if (!conv) return null;
  // Defensive: ensure exactly two members are involved (DMs).
  if (conv.members.length !== 2) return null;
  return { id: conv.id };
}

export async function createDmConversation(args: {
  userIdA: string;
  userIdB: string;
}): Promise<{ id: string }> {
  const { userIdA, userIdB } = args;
  return prisma.conversation.create({
    data: {
      type: ConversationType.DM,
      members: {
        create: [
          { userId: userIdA, role: ConversationMemberRole.MEMBER },
          { userId: userIdB, role: ConversationMemberRole.MEMBER },
        ],
      },
    },
    select: { id: true },
  });
}

export async function findById(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    select: conversationListSelect,
  });
}

export async function isMember(args: {
  conversationId: string;
  userId: string;
}): Promise<boolean> {
  const found = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: args.conversationId,
        userId: args.userId,
      },
    },
    select: { id: true },
  });
  return !!found;
}

export async function listMemberUserIds(
  conversationId: string,
): Promise<string[]> {
  const rows = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function setArchived(args: {
  conversationId: string;
  userId: string;
  archived: boolean;
}): Promise<void> {
  const { conversationId, userId, archived } = args;
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { archivedBy: true },
  });
  if (!conv) return;
  const set = new Set(conv.archivedBy);
  if (archived) set.add(userId);
  else set.delete(userId);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { archivedBy: Array.from(set) },
  });
}

export async function updateLastReadAt(args: {
  conversationId: string;
  userId: string;
  at: Date;
}): Promise<void> {
  await prisma.conversationMember.update({
    where: {
      conversationId_userId: {
        conversationId: args.conversationId,
        userId: args.userId,
      },
    },
    data: { lastReadAt: args.at },
  });
}

export async function touchConversation(
  conversationId: string,
): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
    select: { id: true },
  });
}
