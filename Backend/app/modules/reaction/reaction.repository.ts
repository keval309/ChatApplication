import { prisma } from "../../client/prisma";

export async function findByMessageAndUser(args: {
  messageId: string;
  userId: string;
}) {
  return prisma.reaction.findUnique({
    where: {
      messageId_userId: { messageId: args.messageId, userId: args.userId },
    },
    select: { id: true, emoji: true },
  });
}

export async function deleteByMessageAndUser(args: {
  messageId: string;
  userId: string;
}): Promise<void> {
  await prisma.reaction.delete({
    where: {
      messageId_userId: { messageId: args.messageId, userId: args.userId },
    },
  });
}

export async function upsert(args: {
  messageId: string;
  userId: string;
  emoji: string;
}): Promise<void> {
  await prisma.reaction.upsert({
    where: {
      messageId_userId: { messageId: args.messageId, userId: args.userId },
    },
    create: {
      messageId: args.messageId,
      userId: args.userId,
      emoji: args.emoji,
    },
    update: { emoji: args.emoji },
  });
}

export async function listForMessage(messageId: string) {
  return prisma.reaction.findMany({
    where: { messageId },
    select: { emoji: true, userId: true },
    orderBy: { createdAt: "asc" },
  });
}
