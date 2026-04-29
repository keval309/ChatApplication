import type { ConversationMemberRole } from "../../generated/prisma/client";

export type MessageHistoryPolicy = "FULL" | "LAST_7_DAYS" | "NONE";

export type WhoCanSetting = "EVERYONE" | "ADMINS_ONLY";

/** REST + internal gates — every group endpoint starts here. */
export type GroupPermissionAction =
  | "send_message"
  | "add_members"
  | "remove_member"
  | "edit_group_info"
  | "promote_member"
  | "demote_member"
  | "transfer_ownership"
  | "pin_message"
  | "change_slow_mode"
  | "change_message_history"
  | "change_who_can_send"
  | "change_who_can_add_members"
  | "generate_invite"
  | "revoke_invite"
  | "dissolve_group"
  | "leave_group";

export interface GroupPermissionMeta {
  /** For remove_member / role changes */
  targetRole?: ConversationMemberRole;
  targetUserId?: string;
}

export interface AddMembersResponseDTO {
  messageHistoryForNewMembers: string;
  addedUserIds: string[];
}

export interface InviteCreatedResponseDTO {
  inviteUrl: string;
}

export interface JoinByInviteResponseDTO {
  conversationId: string;
}

export interface CreateGroupBodyDTO {
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  memberIds: string[];
}

export interface UpdateGroupBodyDTO {
  name?: string;
  description?: string | null;
  avatarUrl?: string | null;
  slowModeSeconds?: number;
  whoCanAddMembers?: WhoCanSetting;
  whoCanSendMessages?: WhoCanSetting;
  messageHistoryForNewMembers?: MessageHistoryPolicy;
}

export interface CreateInviteBodyDTO {
  inviteCodeExpiresAt?: string | null;
  inviteCodeMaxUses?: number | null;
}

export interface GroupSettingsUpdatedEventDTO {
  conversationId: string;
  changes: Record<string, string | number | null>;
}
