import { api, unwrap } from "./api";
import type {
  ConversationListItem,
  ConversationMemberRole,
  ConversationsPage,
  MessagesPage,
} from "@/types/chat";

export type ConversationFilter = "ALL" | "ARCHIVED" | "GROUPS";

export async function listConversations(args: {
  cursor?: string | null;
  filter?: ConversationFilter;
}): Promise<ConversationsPage> {
  const params: Record<string, string> = {};
  if (args.cursor) params.cursor = args.cursor;
  if (args.filter) params.filter = args.filter;
  return unwrap<ConversationsPage>(
    api.get("/api/conversations", { params }),
  );
}

export async function getOrCreateDm(
  userId: string,
): Promise<ConversationListItem> {
  const res = await unwrap<{ conversation: ConversationListItem }>(
    api.post("/api/conversations/dm", { userId }),
  );
  return res.conversation;
}

export async function getConversation(
  id: string,
): Promise<ConversationListItem> {
  const res = await unwrap<{ conversation: ConversationListItem }>(
    api.get(`/api/conversations/${encodeURIComponent(id)}`),
  );
  return res.conversation;
}

export async function archiveConversation(args: {
  id: string;
  archived: boolean;
}): Promise<void> {
  await api.post(
    `/api/conversations/${encodeURIComponent(args.id)}/archive`,
    { archived: args.archived },
  );
}

export async function markConversationRead(id: string): Promise<void> {
  await api.post(`/api/conversations/${encodeURIComponent(id)}/read`);
}

export type MuteDuration = "1h" | "8h" | "1d" | "7d" | "forever";

export async function clearConversationHistory(id: string): Promise<void> {
  await api.post(`/api/conversations/${encodeURIComponent(id)}/clear`);
}

export async function deleteConversation(id: string): Promise<void> {
  await api.delete(`/api/conversations/${encodeURIComponent(id)}`);
}

export async function muteConversation(args: {
  id: string;
  duration: MuteDuration;
  autoUnmuteReminder?: boolean;
}): Promise<void> {
  await api.patch(`/api/conversations/${encodeURIComponent(args.id)}/mute`, {
    duration: args.duration,
    autoUnmuteReminder: args.autoUnmuteReminder ?? false,
  });
}

export async function unmuteConversation(id: string): Promise<void> {
  await api.patch(`/api/conversations/${encodeURIComponent(id)}/unmute`);
}

/** Inbox-only: pin this chat for you (sorts to top); not shared with others. */
export async function setConversationPinned(args: {
  id: string;
  pinned: boolean;
}): Promise<void> {
  await api.patch(`/api/conversations/${encodeURIComponent(args.id)}/inbox-pin`, {
    pinned: args.pinned,
  });
}

export async function listMessages(args: {
  conversationId: string;
  cursor?: string | null;
  limit?: number;
}): Promise<MessagesPage> {
  const params: Record<string, string | number> = {};
  if (args.cursor) params.cursor = args.cursor;
  if (args.limit) params.limit = args.limit;
  return unwrap<MessagesPage>(
    api.get(
      `/api/conversations/${encodeURIComponent(args.conversationId)}/messages`,
      { params },
    ),
  );
}

export async function createGroup(args: {
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  memberIds: string[];
}): Promise<{ conversationId: string }> {
  return unwrap(
    api.post("/api/conversations/group", args),
  );
}

export async function addConversationMembers(
  conversationId: string,
  userIds: string[],
): Promise<{
  messageHistoryForNewMembers: string;
  addedUsers: Array<{
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    role: ConversationMemberRole;
  }>;
}> {
  return unwrap(
    api.post(`/api/conversations/${encodeURIComponent(conversationId)}/members`, {
      userIds,
    }),
  );
}

export async function removeConversationMember(
  conversationId: string,
  userId: string,
): Promise<void> {
  await api.delete(
    `/api/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}`,
  );
}

export async function patchMemberRole(
  conversationId: string,
  userId: string,
  role: "ADMIN" | "MEMBER",
): Promise<void> {
  await api.patch(
    `/api/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}/role`,
    { role },
  );
}

export async function transferGroupOwnership(
  conversationId: string,
  newOwnerId: string,
): Promise<void> {
  await api.post(
    `/api/conversations/${encodeURIComponent(conversationId)}/transfer-ownership`,
    { newOwnerId },
  );
}

export type WhoCanSetting = "EVERYONE" | "ADMINS_ONLY";
export type MessageHistoryPolicy = "FULL" | "LAST_7_DAYS" | "NONE";

export async function patchGroupSettings(
  conversationId: string,
  body: {
    name?: string;
    description?: string | null;
    avatarUrl?: string | null;
    slowModeSeconds?: number;
    whoCanAddMembers?: WhoCanSetting;
    whoCanSendMessages?: WhoCanSetting;
    messageHistoryForNewMembers?: MessageHistoryPolicy;
  },
): Promise<void> {
  await api.patch(
    `/api/conversations/${encodeURIComponent(conversationId)}/group`,
    body,
  );
}

export async function createGroupInvite(
  conversationId: string,
  body?: { inviteCodeExpiresAt?: string | null; inviteCodeMaxUses?: number | null },
): Promise<{ inviteUrl: string }> {
  return unwrap(
    api.post(
      `/api/conversations/${encodeURIComponent(conversationId)}/invite`,
      body ?? {},
    ),
  );
}

export async function revokeGroupInvite(conversationId: string): Promise<void> {
  await api.delete(
    `/api/conversations/${encodeURIComponent(conversationId)}/invite`,
  );
}

export async function joinGroupByInvite(
  inviteCode: string,
): Promise<{ conversationId: string }> {
  return unwrap(
    api.post(`/api/join/${encodeURIComponent(inviteCode)}`),
  );
}

export async function pinConversationMessage(
  conversationId: string,
  messageId: string,
): Promise<void> {
  await api.patch(
    `/api/conversations/${encodeURIComponent(conversationId)}/pin`,
    { messageId },
  );
}

export async function unpinConversationMessage(
  conversationId: string,
): Promise<void> {
  await api.delete(
    `/api/conversations/${encodeURIComponent(conversationId)}/pin`,
  );
}

export async function leaveGroup(conversationId: string): Promise<void> {
  await api.post(`/api/conversations/${encodeURIComponent(conversationId)}/leave`);
}
