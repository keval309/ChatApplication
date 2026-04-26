import { prisma } from "../../client/prisma";

export async function batchCreate(args: {
  userId: string;
  messageIds: string[];
}): Promise<void> {
  const seenAt = new Date();
  await prisma.readReceipt.createMany({
    data: args.messageIds.map((messageId) => ({
      messageId,
      userId: args.userId,
      seenAt,
    })),
    skipDuplicates: true,
  });
}

export async function fetchReceiptsForMessages(messageIds: string[]) {
  if (messageIds.length === 0) return [];
  return prisma.readReceipt.findMany({
    where: { messageId: { in: messageIds } },
    select: {
      messageId: true,
      userId: true,
      seenAt: true,
    },
  });
}
