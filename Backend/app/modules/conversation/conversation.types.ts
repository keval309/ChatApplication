import type { ConversationType, ConversationMemberRole } from "../../generated/prisma/client";

export interface ConversationMemberDTO {
  userId: string;
  role: ConversationMemberRole;
  joinedAt: string;
  lastReadAt: string | null;
  user: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    statusMessage?: string | null;
    bio?: string | null;
    presenceStatus?: "ONLINE" | "AWAY" | "DND" | "INVISIBLE" | "OFFLINE";
    lastSeenAt?: string | Date | null;
    lastSeenVisible?: boolean;
  };
}

export interface LastMessagePreviewDTO {
  id: string;
  senderId: string;
  content: string;
  type: "TEXT" | "IMAGE" | "GIF" | "FILE";
  createdAt: string;
  deletedAt: string | null;
}

export interface ConversationListItemDTO {
  id: string;
  type: ConversationType;
  isArchived: boolean;
  /**
   * True when **you** pinned this chat in your list (`ConversationMember.pinned`).
   * Not stored on the conversation; the other person does not see your pin.
   */
  pinnedByMe: boolean;
  isMuted: boolean;
  muteUntil: string | null;
  members: ConversationMemberDTO[];
  lastMessage: LastMessagePreviewDTO | null;
  unreadCount: number;
  /** For DMs: the user on the other side. Null for groups. */
  otherUser: ConversationMemberDTO["user"] | null;
  groupName: string | null;
  groupAvatarUrl: string | null;
  updatedAt: string;
  createdAt: string;
  /** DM only: set when loaded via getById / getOrCreateDm. */
  iBlockedOther?: boolean;
  /** DM only: set when loaded via getById / getOrCreateDm. */
  otherBlockedMe?: boolean;
}

export interface ConversationsPageDTO {
  conversations: ConversationListItemDTO[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CreateOrGetDmDTO {
  userId: string;
}

export interface ArchiveConversationDTO {
  conversationId: string;
  archived: boolean;
}

export interface MarkReadDTO {
  conversationId: string;
  /** Optional: marks read up to this message id (defaults to "now"). */
  upToMessageId?: string;
}
