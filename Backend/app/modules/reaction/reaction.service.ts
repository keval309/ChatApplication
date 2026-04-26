import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import { prisma } from "../../client/prisma";
import * as conversationRepository from "../conversation/conversation.repository";
import * as reactionRepository from "./reaction.repository";

export interface ReactionToggleResult {
  messageId: string;
  conversationId: string;
  reactions: Array<{ emoji: string; userId: string }>;
}

/**
 * Toggle a user's reaction on a message.
 * Per the spec: ONE reaction per user per message — selecting a different emoji
 * REPLACES the previous one; selecting the same emoji removes it.
 */
export async function toggle(args: {
  userId: string;
  messageId: string;
  emoji: string;
}): Promise<ReactionToggleResult> {
  const { userId, messageId, emoji } = args;

  if (!emoji || typeof emoji !== "string" || emoji.length > 64) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Invalid emoji",
    });
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, deletedAt: true },
  });
  if (!message) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "Message not found",
    });
  }
  if (message.deletedAt) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Cannot react to a deleted message",
    });
  }

  const isMember = await conversationRepository.isMember({
    conversationId: message.conversationId,
    userId,
  });
  if (!isMember) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are not a member of this conversation",
    });
  }

  const existing = await reactionRepository.findByMessageAndUser({
    messageId,
    userId,
  });

  if (existing && existing.emoji === emoji) {
    await reactionRepository.deleteByMessageAndUser({ messageId, userId });
  } else {
    await reactionRepository.upsert({ messageId, userId, emoji });
  }

  const reactions = await reactionRepository.listForMessage(messageId);
  return {
    messageId,
    conversationId: message.conversationId,
    reactions,
  };
}
