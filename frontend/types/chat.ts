import type { PresenceStatus } from "./auth";

export type ConversationType = "DM" | "GROUP";
export type ConversationMemberRole = "OWNER" | "ADMIN" | "MEMBER";
export type MemberJoinSource = "UNKNOWN" | "FOUNDING" | "INVITE" | "DIRECT_ADD";
export type MessageType = "TEXT" | "IMAGE" | "GIF" | "FILE";

export interface MemberUser {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  statusMessage?: string | null;
  bio?: string | null;
  presenceStatus?: PresenceStatus;
  lastSeenAt?: string | null;
  lastSeenVisible?: boolean;
}

export interface GroupInfo {
  name: string;
  description: string | null;
  avatarUrl: string | null;
  ownerId: string;
  slowModeSeconds: number;
  inviteCode: string | null;
  inviteCodeExpiresAt: string | null;
  inviteCodeMaxUses: number | null;
  inviteCodeUseCount: number;
  messageHistoryForNewMembers: string;
  whoCanAddMembers: string;
  whoCanSendMessages: string;
}

export interface ConversationMember {
  userId: string;
  role: ConversationMemberRole;
  joinedAt: string;
  lastReadAt: string | null;
  mutedUntil?: string | null;
  /** Group: how they became a member (from API / realtime). */
  joinSource?: MemberJoinSource;
  user: MemberUser;
}

export interface LastMessagePreview {
  id: string;
  senderId: string;
  content: string;
  type: MessageType;
  createdAt: string;
  deletedAt: string | null;
}

export interface ConversationListItem {
  id: string;
  type: ConversationType;
  isArchived: boolean;
  /** Your inbox only: you pinned this chat; not shared with the other participant. */
  pinnedByMe?: boolean;
  isMuted: boolean;
  muteUntil: string | null;
  members: ConversationMember[];
  lastMessage: LastMessagePreview | null;
  unreadCount: number;
  otherUser: MemberUser | null;
  groupName: string | null;
  groupAvatarUrl: string | null;
  groupInfo: GroupInfo | null;
  pinnedMessageId: string | null;
  updatedAt: string;
  createdAt: string;
  /** DM detail: you blocked the other user */
  iBlockedOther?: boolean;
  /** DM detail: the other user blocked you */
  otherBlockedMe?: boolean;
}

export interface ConversationsPage {
  conversations: ConversationListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface MessageReaction {
  emoji: string;
  userId: string;
}

export interface ReadReceiptEntry {
  userId: string;
  seenAt: string;
}

export interface Message {
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
  sender: MemberUser;
  reactions: MessageReaction[];
  replyCount: number;
  readBy: ReadReceiptEntry[];
  /** Server-computed: all required readers have read (DM / group). */
  allRead?: boolean;
  /** Local-only fields used during optimistic sends. */
  status?: "sending" | "sent" | "failed";
  tempId?: string;
  idempotencyKey?: string;
}

export interface MessagesPage {
  messages: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PresenceState {
  status: PresenceStatus;
  lastSeen: string | null;
}

export type TypingMap = Record<string, { userIds: string[]; updatedAt: number }>;

export interface ChatPresenceMap {
  [userId: string]: PresenceState;
}
