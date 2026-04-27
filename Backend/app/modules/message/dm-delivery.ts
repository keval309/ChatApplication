import { prisma } from "../../client/prisma";

/**
 * Blockers do not receive `message:new` from users they blocked (WhatsApp-style).
 */
export async function getMessageNewRecipientIds(args: {
  conversationId: string;
  senderId: string;
  memberUserIds: readonly string[];
}): Promise<string[]> {
  const conv = await prisma.conversation.findUnique({
    where: { id: args.conversationId },
    select: { type: true },
  });
  if (!conv) return [];
  if (conv.type === "GROUP") return [...args.memberUserIds];

  const others = args.memberUserIds.filter((id) => id !== args.senderId);
  if (others.length === 0) return [...args.memberUserIds];

  const blocks = await prisma.block.findMany({
    where: {
      blockedId: args.senderId,
      blockerId: { in: others },
    },
    select: { blockerId: true },
  });
  const blockerIds = new Set(blocks.map((b) => b.blockerId));
  return args.memberUserIds.filter(
    (id) => id === args.senderId || !blockerIds.has(id),
  );
}

export async function getUnreadIncrementUserIds(args: {
  conversationId: string;
  senderId: string;
  memberUserIds: readonly string[];
}): Promise<string[]> {
  const recipients = await getMessageNewRecipientIds(args);
  return recipients.filter((id) => id !== args.senderId);
}

export async function shouldMarkMessageDelivered(args: {
  conversationId: string;
  senderId: string;
  memberUserIds: readonly string[];
  hasActiveSocket: (userId: string) => boolean;
}): Promise<boolean> {
  const recipients = await getMessageNewRecipientIds(args);
  const targets = recipients.filter((id) => id !== args.senderId);
  if (targets.length === 0) return false;
  return targets.every((id) => args.hasActiveSocket(id));
}
