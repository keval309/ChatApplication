import { prisma } from "../../client/prisma";
import {
  ConversationType,
  ConversationMemberRole,
  type MessageType,
} from "../../generated/prisma/client";

export type ConversationLastMessagePreviewRow = {
  id: string;
  senderId: string;
  content: string;
  type: MessageType;
  createdAt: Date;
  deletedAt: Date | null;
};

const lastMessagePreviewSelect = {
  id: true,
  senderId: true,
  content: true,
  type: true,
  createdAt: true,
  deletedAt: true,
} as const;

export function buildConversationListSelect(viewerUserId: string) {
  return {
    id: true,
    type: true,
    archivedBy: true,
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
        historyClearedAt: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            statusMessage: true,
            bio: true,
            presenceStatus: true,
            lastSeenAt: true,
            lastSeenVisible: true,
          },
        },
      },
    },
  } as const;
}

/** Lower bound for “visible & unread” counting: after both clear-for-me and last read. */
function unreadCreatedAfter(
  lastReadAt: Date | null,
  historyClearedAt: Date | null,
): Date | undefined {
  if (!lastReadAt && !historyClearedAt) return undefined;
  if (!lastReadAt) return historyClearedAt ?? undefined;
  if (!historyClearedAt) return lastReadAt;
  return lastReadAt.getTime() >= historyClearedAt.getTime()
    ? lastReadAt
    : historyClearedAt;
}

export async function attachLastMessagesForViewer<
  R extends {
    id: string;
    members: Array<{ userId: string; historyClearedAt: Date | null }>;
  },
>(rows: R[], viewerUserId: string): Promise<Array<R & { messages: ConversationLastMessagePreviewRow[] }>> {
  return Promise.all(
    rows.map(async (row) => {
      const me = row.members.find((m) => m.userId === viewerUserId);
      const msg = await prisma.message.findFirst({
        where: {
          conversationId: row.id,
          deletedAt: null,
          NOT: { suppressedForUserIds: { has: viewerUserId } },
          ...(me?.historyClearedAt
            ? { createdAt: { gt: me.historyClearedAt } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        select: lastMessagePreviewSelect,
      });
      return { ...row, messages: msg ? [msg] : [] };
    }),
  );
}

export type ConversationListRow = Awaited<
  ReturnType<typeof findConversationsForUser>
>[number];

/**
 * Cursor-paginated list of conversations the user is an **active** member of.
 */
export async function findConversationsForUser(args: {
  userId: string;
  cursor?: string | null;
  limit: number;
  filter: "ALL" | "ARCHIVED" | "GROUPS";
}) {
  const { userId, cursor, limit, filter } = args;

  const baseWhere = {
    members: { some: { userId, leftAt: null } },
  } as const;

  const archiveCondition =
    filter === "ARCHIVED"
      ? { archivedBy: { has: userId } }
      : { NOT: { archivedBy: { has: userId } } };

  const typeCondition =
    filter === "GROUPS" ? { type: ConversationType.GROUP } : {};

  const raw = await prisma.conversation.findMany({
    where: { ...baseWhere, ...archiveCondition, ...typeCondition },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: buildConversationListSelect(userId),
  });

  return attachLastMessagesForViewer(raw, userId);
}

export async function countUnreadForMember(args: {
  conversationId: string;
  userId: string;
  lastReadAt: Date | null;
  historyClearedAt: Date | null;
}): Promise<number> {
  const lower = unreadCreatedAfter(args.lastReadAt, args.historyClearedAt);
  return prisma.message.count({
    where: {
      conversationId: args.conversationId,
      senderId: { not: args.userId },
      deletedAt: null,
      NOT: { suppressedForUserIds: { has: args.userId } },
      ...(lower ? { createdAt: { gt: lower } } : {}),
    },
  });
}

export async function findDmBetween(
  userIdA: string,
  userIdB: string,
): Promise<{ id: string } | null> {
  if (userIdA === userIdB) return null;

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

export async function findById(conversationId: string, viewerUserId: string) {
  const raw = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: buildConversationListSelect(viewerUserId),
  });
  if (!raw) return null;
  const [row] = await attachLastMessagesForViewer([raw], viewerUserId);
  return row;
}

export async function isMember(args: {
  conversationId: string;
  userId: string;
}): Promise<boolean> {
  const m = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: args.conversationId,
        userId: args.userId,
      },
    },
    select: { leftAt: true },
  });
  return !!m && m.leftAt === null;
}

/** Members still in the conversation (not “delete for me” / left). */
export async function listMemberUserIds(
  conversationId: string,
): Promise<string[]> {
  const rows = await prisma.conversationMember.findMany({
    where: { conversationId, leftAt: null },
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
