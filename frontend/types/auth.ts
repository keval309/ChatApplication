export type AuthProvider = "GOOGLE";
export type PresenceStatus = "ONLINE" | "AWAY" | "DND" | "INVISIBLE" | "OFFLINE";
export type NotificationLevel =
  | "ALL_MESSAGES"
  | "MENTIONS_AND_REPLIES"
  | "NOTHING";

export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  statusMessage?: string | null;
  bio?: string | null;
  presenceStatus?: PresenceStatus;
  lastSeenVisible?: boolean;
  sendReadReceipts?: boolean;
  globalNotificationLevel?: NotificationLevel;
  autoUnmuteReminder?: boolean;
  emailVerifiedAt: string | null;
  hasPassword: boolean;
  providers: AuthProvider[];
}

export interface LoginPayload {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterPayload {
  email: string;
  password: string;
}

export interface ResetPasswordPayload {
  token: string;
  newPassword: string;
}

export interface UpdateProfilePayload {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  statusMessage?: string;
  bio?: string;
  presenceStatus?: PresenceStatus;
}

export interface UserSettings {
  userId: string;
  lastSeenVisible: boolean;
  sendReadReceipts: boolean;
  globalNotificationLevel: NotificationLevel;
  autoUnmuteReminder: boolean;
  preferences: ConversationNotificationPreference[];
}

export interface UpdateUserSettingsPayload {
  lastSeenVisible?: boolean;
  sendReadReceipts?: boolean;
  globalNotificationLevel?: NotificationLevel;
  autoUnmuteReminder?: boolean;
}

export interface ConversationNotificationPreference {
  conversationId: string;
  notificationLevel: NotificationLevel;
  isMuted: boolean;
  muteUntil: string | null;
  autoUnmuteReminder: boolean;
}

export interface UpsertConversationNotificationPreferencePayload {
  conversationId: string;
  notificationLevel?: NotificationLevel;
  isMuted?: boolean;
  muteUntil?: string | null;
  autoUnmuteReminder?: boolean;
}

export interface BlockedUser {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
  blockedUser: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  rememberMe: boolean;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent: boolean;
}
