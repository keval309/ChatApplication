import type { MessageType } from "../../generated/prisma/client";

export const MESSAGE_MAX_LENGTH = 4000;
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const MESSAGE_RATE_LIMIT_MAX = 30;
export const MESSAGE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const MESSAGE_PAGE_SIZE = 50;

export interface MessageSenderDTO {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface MessageReactionDTO {
  emoji: string;
  userId: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  parentId: string | null;
  editedAt: string | null;
  deliveredAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender: MessageSenderDTO;
  reactions: MessageReactionDTO[];
  replyCount: number;
  /** Receipts collected by everyone except the sender. */
  readBy: Array<{ userId: string; seenAt: string }>;
  /** True when every required reader (excl. sendReadReceipts:false) has read. */
  allRead: boolean;
}

export interface MessagesPageDTO {
  /** Sorted ascending by createdAt for direct rendering — even though server fetches DESC. */
  messages: MessageDTO[];
  /** Cursor for the NEXT older page (oldest message id of the current page), or null. */
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  parentId?: string | null;
}

export interface EditMessageInput {
  messageId: string;
  senderId: string;
  newContent: string;
}

export interface DeleteMessageInput {
  messageId: string;
  senderId: string;
}
