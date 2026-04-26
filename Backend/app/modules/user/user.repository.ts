import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../client/prisma";
import type {
  BlockedUserResponseDTO,
  ConversationNotificationPreferenceDTO,
  DiscoverUserDTO,
  ProfileResponseDTO,
  SessionResponseDTO,
  UpdateUserSettingsDTO,
  UserSettingsResponseDTO,
} from "./user.types";

const profileSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  statusMessage: true,
  bio: true,
  presenceStatus: true,
  lastSeenVisible: true,
  sendReadReceipts: true,
  globalNotificationLevel: true,
  autoUnmuteReminder: true,
  lastPresenceHeartbeatAt: true,
  emailVerifiedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export async function getProfile(userId: string): Promise<ProfileResponseDTO | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: profileSelect,
  });
}

export async function updateProfile(
  userId: string,
  data: Prisma.UserUpdateInput,
): Promise<ProfileResponseDTO> {
  return prisma.user.update({
    where: { id: userId },
    data,
    select: profileSelect,
  });
}

export async function isUsernameTaken(args: {
  username: string;
  excludeUserId: string;
}): Promise<boolean> {
  const existing = await prisma.user.findUnique({
    where: { username: args.username },
    select: { id: true },
  });
  return !!existing && existing.id !== args.excludeUserId;
}

export async function getUserSettings(
  userId: string,
): Promise<UserSettingsResponseDTO | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      lastSeenVisible: true,
      sendReadReceipts: true,
      globalNotificationLevel: true,
      autoUnmuteReminder: true,
      notificationPreferences: {
        select: {
          conversationId: true,
          notificationLevel: true,
          isMuted: true,
          muteUntil: true,
          autoUnmuteReminder: true,
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!user) return null;
  return {
    userId: user.id,
    lastSeenVisible: user.lastSeenVisible,
    sendReadReceipts: user.sendReadReceipts,
    globalNotificationLevel: user.globalNotificationLevel,
    autoUnmuteReminder: user.autoUnmuteReminder,
    preferences: user.notificationPreferences,
  };
}

export async function updateUserSettings(
  userId: string,
  data: UpdateUserSettingsDTO,
): Promise<UserSettingsResponseDTO> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      lastSeenVisible: true,
      sendReadReceipts: true,
      globalNotificationLevel: true,
      autoUnmuteReminder: true,
      notificationPreferences: {
        select: {
          conversationId: true,
          notificationLevel: true,
          isMuted: true,
          muteUntil: true,
          autoUnmuteReminder: true,
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  return {
    userId: updated.id,
    lastSeenVisible: updated.lastSeenVisible,
    sendReadReceipts: updated.sendReadReceipts,
    globalNotificationLevel: updated.globalNotificationLevel,
    autoUnmuteReminder: updated.autoUnmuteReminder,
    preferences: updated.notificationPreferences,
  };
}

export async function upsertConversationPreference(args: {
  userId: string;
  conversationId: string;
  notificationLevel?: "ALL_MESSAGES" | "MENTIONS_AND_REPLIES" | "NOTHING";
  isMuted?: boolean;
  muteUntil?: Date | null;
  autoUnmuteReminder?: boolean;
}): Promise<ConversationNotificationPreferenceDTO> {
  const createdValues = {
    notificationLevel: args.notificationLevel ?? "ALL_MESSAGES",
    isMuted: args.isMuted ?? false,
    muteUntil: args.muteUntil ?? null,
    autoUnmuteReminder: args.autoUnmuteReminder ?? false,
  };
  const preference = await prisma.conversationNotificationPreference.upsert({
    where: {
      userId_conversationId: {
        userId: args.userId,
        conversationId: args.conversationId,
      },
    },
    create: {
      userId: args.userId,
      conversationId: args.conversationId,
      ...createdValues,
    },
    update: {
      ...(args.notificationLevel ? { notificationLevel: args.notificationLevel } : {}),
      ...(typeof args.isMuted === "boolean" ? { isMuted: args.isMuted } : {}),
      ...(typeof args.autoUnmuteReminder === "boolean"
        ? { autoUnmuteReminder: args.autoUnmuteReminder }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args, "muteUntil")
        ? { muteUntil: args.muteUntil ?? null }
        : {}),
    },
    select: {
      conversationId: true,
      notificationLevel: true,
      isMuted: true,
      muteUntil: true,
      autoUnmuteReminder: true,
    },
  });

  return preference;
}

export async function listConversationPreferences(
  userId: string,
): Promise<ConversationNotificationPreferenceDTO[]> {
  return prisma.conversationNotificationPreference.findMany({
    where: { userId },
    select: {
      conversationId: true,
      notificationLevel: true,
      isMuted: true,
      muteUntil: true,
      autoUnmuteReminder: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function listBlockedUsers(
  userId: string,
): Promise<BlockedUserResponseDTO[]> {
  const blocks = await prisma.block.findMany({
    where: { blockerId: userId },
    select: {
      id: true,
      blockerId: true,
      blockedId: true,
      createdAt: true,
      blocked: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return blocks.map((block) => ({
    id: block.id,
    blockerId: block.blockerId,
    blockedId: block.blockedId,
    createdAt: block.createdAt,
    blockedUser: block.blocked,
  }));
}

export async function findUserSummaryById(userId: string): Promise<{
  id: string;
} | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
}

export async function discoverUsers(args: {
  userId: string;
  query: string;
  limit: number;
}): Promise<DiscoverUserDTO[]> {
  const q = args.query.trim();
  if (!q) return [];

  return prisma.user.findMany({
    where: {
      id: { not: args.userId },
      OR: [
        { username: { contains: q, mode: "insensitive" } },
        { displayName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
      blockedByUsers: {
        none: {
          blockerId: args.userId,
        },
      },
      blockedUsers: {
        none: {
          blockedId: args.userId,
        },
      },
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      presenceStatus: true,
    },
    orderBy: [{ displayName: "asc" }, { username: "asc" }, { createdAt: "desc" }],
    take: args.limit,
  });
}

export async function findBlock(args: {
  blockerId: string;
  blockedId: string;
}): Promise<{ id: string } | null> {
  return prisma.block.findUnique({
    where: {
      blockerId_blockedId: {
        blockerId: args.blockerId,
        blockedId: args.blockedId,
      },
    },
    select: { id: true },
  });
}

export async function createBlock(args: {
  blockerId: string;
  blockedId: string;
}): Promise<void> {
  await prisma.block.create({
    data: {
      blockerId: args.blockerId,
      blockedId: args.blockedId,
    },
    select: { id: true },
  });
}

export async function deleteBlock(args: {
  blockerId: string;
  blockedId: string;
}): Promise<void> {
  await prisma.block.delete({
    where: {
      blockerId_blockedId: {
        blockerId: args.blockerId,
        blockedId: args.blockedId,
      },
    },
    select: { id: true },
  });
}

export async function listActiveSessions(userId: string): Promise<
  Array<Omit<SessionResponseDTO, "isCurrent">>
> {
  return prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      rememberMe: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: { lastUsedAt: "desc" },
  });
}

export async function findSessionForUser(args: {
  sessionId: string;
  userId: string;
}): Promise<{ id: string; revokedAt: Date | null } | null> {
  return prisma.session.findFirst({
    where: { id: args.sessionId, userId: args.userId },
    select: { id: true, revokedAt: true },
  });
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
    select: { id: true },
  });
}
