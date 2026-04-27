import { prisma } from "../../client/prisma";
import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import { loadConvTickContext } from "../message/message.service";
import { computeAllRead } from "../message/message-ticks";
import * as receiptRepository from "./receipt.repository";

export interface ReceiptUpdateForMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  readBy: Array<{ userId: string; seenAt: string }>;
  allRead: boolean;
}

export async function canSendReadReceipts(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sendReadReceipts: true },
  });
  return user?.sendReadReceipts ?? true;
}

/**
 * Mark messages as read for a user, in batch. Returns one update per message
 * grouped by sender, so handlers can emit `receipt:update` to each sender's room.
 *
 * Skips messages the user authored (you don't read your own).
 */
export async function markRead(args: {
  userId: string;
  messageIds: string[];
}): Promise<ReceiptUpdateForMessage[]> {
  const { userId } = args;
  const sendReadReceiptsEnabled = await canSendReadReceipts(userId);
  if (!sendReadReceiptsEnabled) return [];

  const messageIds = Array.from(new Set(args.messageIds)).filter(Boolean);
  if (messageIds.length === 0) return [];
  if (messageIds.length > 200) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Too many receipts in one batch",
    });
  }

  const messages = await prisma.message.findMany({
    where: {
      id: { in: messageIds },
      deletedAt: null,
      NOT: { suppressedForUserIds: { has: userId } },
    },
    select: { id: true, conversationId: true, senderId: true },
  });
  const ownedByOthers = messages.filter((m) => m.senderId !== userId);
  if (ownedByOthers.length === 0) return [];

  // Defensive: ensure user is a member of every conversation they're acking.
  const convIds = Array.from(new Set(ownedByOthers.map((m) => m.conversationId)));
  const memberships = await prisma.conversationMember.findMany({
    where: { userId, conversationId: { in: convIds } },
    select: { conversationId: true },
  });
  const memberConvIds = new Set(memberships.map((m) => m.conversationId));
  const allowed = ownedByOthers.filter((m) =>
    memberConvIds.has(m.conversationId),
  );
  if (allowed.length === 0) return [];
  const allowedConversationIds = Array.from(
    new Set(allowed.map((m) => m.conversationId)),
  );

  await receiptRepository.batchCreate({
    userId,
    messageIds: allowed.map((m) => m.id),
  });
  await prisma.conversationMember.updateMany({
    where: {
      userId,
      conversationId: { in: allowedConversationIds },
    },
    data: { unreadCount: 0, lastReadAt: new Date() },
  });

  const allReceipts = await receiptRepository.fetchReceiptsForMessages(
    allowed.map((m) => m.id),
  );

  const byMessage = new Map<string, Array<{ userId: string; seenAt: string }>>();
  for (const r of allReceipts) {
    const key = r.messageId;
    const arr = byMessage.get(key) ?? [];
    arr.push({ userId: r.userId, seenAt: r.seenAt.toISOString() });
    byMessage.set(key, arr);
  }

  const ctxCache = new Map<string, Awaited<ReturnType<typeof loadConvTickContext>>>();
  for (const cid of allowedConversationIds) {
    ctxCache.set(cid, await loadConvTickContext(cid));
  }

  return allowed.map((m) => {
    const readList = (byMessage.get(m.id) ?? []).filter(
      (r) => r.userId !== m.senderId,
    );
    const ctx = ctxCache.get(m.conversationId)!;
    const allRead = computeAllRead(
      {
        senderId: m.senderId,
        readReceipts: readList.map((r) => ({
          userId: r.userId,
          seenAt: new Date(r.seenAt),
        })),
      },
      ctx,
    );
    return {
      messageId: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      readBy: readList,
      allRead,
    };
  });
}
