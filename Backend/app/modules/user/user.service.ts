import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import * as userRepository from "./user.repository";
import type {
  BlockedUserResponseDTO,
  ConversationNotificationPreferenceDTO,
  ProfileResponseDTO,
  SessionResponseDTO,
  UpdateUserSettingsDTO,
  UpdateProfileDTO,
  UpsertConversationNotificationPreferenceDTO,
  UserSettingsResponseDTO,
  UsernameAvailabilityResponseDTO,
} from "./user.types";

export async function getProfile(userId: string): Promise<ProfileResponseDTO> {
  const profile = await userRepository.getProfile(userId);
  if (!profile) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "User not found",
    });
  }
  return profile;
}

export async function updateProfile(
  userId: string,
  data: UpdateProfileDTO,
): Promise<ProfileResponseDTO> {
  if (data.username) {
    const taken = await userRepository.isUsernameTaken({
      username: data.username,
      excludeUserId: userId,
    });
    if (taken) {
      throw new ApiException({
        ...ErrorCodes.CONFLICT,
        errorDescription: "Username is already taken",
      });
    }
  }

  return userRepository.updateProfile(userId, {
    presenceStatus: data.presenceStatus,
    username: data.username,
    displayName: data.displayName,
    avatarUrl: data.avatarUrl,
    statusMessage: data.statusMessage,
    bio: data.bio,
  });
}

export async function getUsernameAvailability(
  username: string,
  userId: string,
): Promise<UsernameAvailabilityResponseDTO> {
  const taken = await userRepository.isUsernameTaken({
    username,
    excludeUserId: userId,
  });
  return { username, available: !taken };
}

export async function getSettings(userId: string): Promise<UserSettingsResponseDTO> {
  const settings = await userRepository.getUserSettings(userId);
  if (!settings) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "User settings not found",
    });
  }
  return settings;
}

export async function updateSettings(
  userId: string,
  data: UpdateUserSettingsDTO,
): Promise<UserSettingsResponseDTO> {
  return userRepository.updateUserSettings(userId, data);
}

export async function upsertConversationPreference(
  userId: string,
  data: UpsertConversationNotificationPreferenceDTO,
): Promise<ConversationNotificationPreferenceDTO> {
  if (data.isMuted === false && data.muteUntil && data.muteUntil > new Date()) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "muteUntil is only valid when isMuted is true",
    });
  }
  return userRepository.upsertConversationPreference({
    userId,
    conversationId: data.conversationId,
    notificationLevel: data.notificationLevel,
    isMuted: data.isMuted,
    muteUntil: data.muteUntil,
    autoUnmuteReminder: data.autoUnmuteReminder,
  });
}

export async function listConversationPreferences(
  userId: string,
): Promise<ConversationNotificationPreferenceDTO[]> {
  return userRepository.listConversationPreferences(userId);
}

export async function listBlockedUsers(
  userId: string,
): Promise<BlockedUserResponseDTO[]> {
  return userRepository.listBlockedUsers(userId);
}

export async function blockUser(
  blockerId: string,
  blockedId: string,
): Promise<void> {
  if (blockerId === blockedId) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "You cannot block yourself",
    });
  }
  const targetUser = await userRepository.findUserSummaryById(blockedId);
  if (!targetUser) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "Target user not found",
    });
  }
  const existing = await userRepository.findBlock({ blockerId, blockedId });
  if (existing) return;
  await userRepository.createBlock({ blockerId, blockedId });
}

export async function unblockUser(
  blockerId: string,
  blockedId: string,
): Promise<void> {
  const existing = await userRepository.findBlock({ blockerId, blockedId });
  if (!existing) return;
  await userRepository.deleteBlock({ blockerId, blockedId });
}

export async function listSessions(args: {
  userId: string;
  currentSessionId: string;
}): Promise<SessionResponseDTO[]> {
  const sessions = await userRepository.listActiveSessions(args.userId);
  return sessions.map((s) => ({ ...s, isCurrent: s.id === args.currentSessionId }));
}

export async function revokeSession(args: {
  userId: string;
  sessionId: string;
  currentSessionId: string;
}): Promise<void> {
  if (args.sessionId === args.currentSessionId) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Use logout to end the current session",
    });
  }
  const session = await userRepository.findSessionForUser({
    sessionId: args.sessionId,
    userId: args.userId,
  });
  if (!session) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "Session not found",
    });
  }
  if (session.revokedAt) return; // idempotent
  await userRepository.revokeSession(session.id);
}
