import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import * as userRepository from "./user.repository";
import type {
  ProfileResponseDTO,
  SessionResponseDTO,
  UpdateProfileDTO,
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
    username: data.username,
    displayName: data.displayName,
    avatarUrl: data.avatarUrl,
    statusMessage: data.statusMessage,
    bio: data.bio,
  });
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
