import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../client/prisma";
import type { ProfileResponseDTO, SessionResponseDTO } from "./user.types";

const profileSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  statusMessage: true,
  bio: true,
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
