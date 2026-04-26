import { prisma } from "../../client/prisma";
import type { MessageType } from "../../generated/prisma/client";

export const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  content: true,
  type: true,
  parentId: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  sender: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  },
  reactions: {
    select: { emoji: true, userId: true },
  },
  readReceipts: {
    select: { userId: true, seenAt: true },
  },
  _count: {
    select: { replies: true },
  },
} as const;

export type MessageRow = NonNullable<
  Awaited<ReturnType<typeof findById>>
>;

/**
 * Returns messages newest-first, with one extra row to detect hasMore.
 * Cursor = id of the oldest message from the previous page (we paginate older
 * pages going further into the past).
 */
export async function findPage(args: {
  conversationId: string;
  cursor: string | null;
  limit: number;
}) {
  const { conversationId, cursor, limit } = args;
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: messageSelect,
  });
}

export async function findById(messageId: string) {
  return prisma.message.findUnique({
    where: { id: messageId },
    select: messageSelect,
  });
}

export async function createMessage(args: {
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  parentId: string | null;
}) {
  return prisma.message.create({
    data: {
      conversationId: args.conversationId,
      senderId: args.senderId,
      content: args.content,
      type: args.type,
      parentId: args.parentId,
    },
    select: messageSelect,
  });
}

export async function updateContent(args: {
  messageId: string;
  newContent: string;
}) {
  return prisma.message.update({
    where: { id: args.messageId },
    data: {
      content: args.newContent,
      editedAt: new Date(),
    },
    select: messageSelect,
  });
}

export async function softDelete(messageId: string) {
  return prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date(), content: "" },
    select: messageSelect,
  });
}
