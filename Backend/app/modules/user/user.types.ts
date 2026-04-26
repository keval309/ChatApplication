export interface UpdateProfileDTO {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  statusMessage?: string;
  bio?: string;
  presenceStatus?: PresenceStatus;
}

export type NotificationLevel =
  | "ALL_MESSAGES"
  | "MENTIONS_AND_REPLIES"
  | "NOTHING";

export type PresenceStatus =
  | "ONLINE"
  | "AWAY"
  | "DND"
  | "INVISIBLE"
  | "OFFLINE";

export interface ConversationNotificationPreferenceDTO {
  conversationId: string;
  notificationLevel: NotificationLevel;
  isMuted: boolean;
  muteUntil: Date | null;
  autoUnmuteReminder: boolean;
}

export interface UpsertConversationNotificationPreferenceDTO {
  conversationId: string;
  notificationLevel?: NotificationLevel;
  isMuted?: boolean;
  muteUntil?: Date | null;
  autoUnmuteReminder?: boolean;
}

export interface UserSettingsResponseDTO {
  userId: string;
  lastSeenVisible: boolean;
  sendReadReceipts: boolean;
  globalNotificationLevel: NotificationLevel;
  autoUnmuteReminder: boolean;
  preferences: ConversationNotificationPreferenceDTO[];
}

export interface UpdateUserSettingsDTO {
  lastSeenVisible?: boolean;
  sendReadReceipts?: boolean;
  globalNotificationLevel?: NotificationLevel;
  autoUnmuteReminder?: boolean;
}

export interface BlockedUserResponseDTO {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: Date;
  blockedUser: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface ProfileResponseDTO {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  statusMessage: string | null;
  bio: string | null;
  presenceStatus: PresenceStatus;
  lastSeenVisible: boolean;
  sendReadReceipts: boolean;
  globalNotificationLevel: NotificationLevel;
  autoUnmuteReminder: boolean;
  lastPresenceHeartbeatAt: Date | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export interface SessionResponseDTO {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  rememberMe: boolean;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

export interface UsernameAvailabilityResponseDTO {
  username: string;
  available: boolean;
}

export interface DiscoverUserDTO {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  presenceStatus: PresenceStatus;
}
