import type {
  AuthProvider,
  Prisma,
  PresenceStatus,
  VerificationTokenType,
} from "../../generated/prisma/client";
import { prisma } from "../../client/prisma";

export interface UserAuthRecord {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  passwordHash: string | null;
  avatarUrl: string | null;
  statusMessage: string | null;
  bio: string | null;
  emailVerifiedAt: Date | null;
  deletedAt: Date | null;
  presenceStatus: PresenceStatus;
}

const userAuthSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  passwordHash: true,
  avatarUrl: true,
  statusMessage: true,
  bio: true,
  emailVerifiedAt: true,
  deletedAt: true,
  presenceStatus: true,
} satisfies Prisma.UserSelect;

export async function findUserByEmail(
  email: string,
): Promise<UserAuthRecord | null> {
  return prisma.user.findFirst({
    where: { email: email.toLowerCase() },
    select: userAuthSelect,
  });
}

export async function findUserById(
  userId: string,
): Promise<UserAuthRecord | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: userAuthSelect,
  });
}

export async function createUserWithPassword(args: {
  email: string;
  passwordHash: string;
}): Promise<UserAuthRecord> {
  return prisma.user.create({
    data: {
      email: args.email.toLowerCase(),
      passwordHash: args.passwordHash,
    },
    select: userAuthSelect,
  });
}

export async function createUserFromOAuth(args: {
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  emailVerifiedAt: Date;
}): Promise<UserAuthRecord> {
  return prisma.user.create({
    data: {
      email: args.email.toLowerCase(),
      displayName: args.displayName ?? null,
      avatarUrl: args.avatarUrl ?? null,
      emailVerifiedAt: args.emailVerifiedAt,
    },
    select: userAuthSelect,
  });
}

export async function markEmailVerified(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
    select: { id: true },
  });
}

export async function updatePassword(
  userId: string,
  passwordHash: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
    select: { id: true },
  });
}

export async function listUserProviders(userId: string): Promise<AuthProvider[]> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { provider: true },
  });
  return accounts.map((a) => a.provider);
}

export async function findAccountByProvider(args: {
  provider: AuthProvider;
  providerAccountId: string;
}): Promise<{ id: string; userId: string } | null> {
  return prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: args.provider,
        providerAccountId: args.providerAccountId,
      },
    },
    select: { id: true, userId: true },
  });
}

export async function createAccount(args: {
  userId: string;
  provider: AuthProvider;
  providerAccountId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date | null;
}): Promise<void> {
  await prisma.account.create({
    data: {
      userId: args.userId,
      provider: args.provider,
      providerAccountId: args.providerAccountId,
      accessToken: args.accessToken ?? null,
      refreshToken: args.refreshToken ?? null,
      expiresAt: args.expiresAt ?? null,
    },
    select: { id: true },
  });
}

export async function createSession(args: {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  rememberMe: boolean;
  userAgent: string | null;
  ipAddress: string | null;
}): Promise<{ id: string }> {
  return prisma.session.create({
    data: {
      userId: args.userId,
      refreshTokenHash: args.refreshTokenHash,
      expiresAt: args.expiresAt,
      rememberMe: args.rememberMe,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    },
    select: { id: true },
  });
}

export interface SessionAuthRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  rememberMe: boolean;
}

export async function findSessionById(
  sessionId: string,
): Promise<SessionAuthRecord | null> {
  return prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      refreshTokenHash: true,
      expiresAt: true,
      revokedAt: true,
      rememberMe: true,
    },
  });
}

export async function rotateSessionRefresh(args: {
  sessionId: string;
  newRefreshTokenHash: string;
  newExpiresAt: Date;
}): Promise<void> {
  await prisma.session.update({
    where: { id: args.sessionId },
    data: {
      refreshTokenHash: args.newRefreshTokenHash,
      expiresAt: args.newExpiresAt,
      lastUsedAt: new Date(),
    },
    select: { id: true },
  });
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
    select: { id: true },
  });
}

export async function createVerificationToken(args: {
  userId: string;
  tokenHash: string;
  type: VerificationTokenType;
  expiresAt: Date;
}): Promise<void> {
  await prisma.verificationToken.create({
    data: {
      userId: args.userId,
      tokenHash: args.tokenHash,
      type: args.type,
      expiresAt: args.expiresAt,
    },
    select: { id: true },
  });
}

export interface VerificationRecord {
  id: string;
  userId: string;
  type: VerificationTokenType;
  expiresAt: Date;
  consumedAt: Date | null;
}

export async function findVerificationByHash(
  tokenHash: string,
): Promise<VerificationRecord | null> {
  return prisma.verificationToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      type: true,
      expiresAt: true,
      consumedAt: true,
    },
  });
}

export async function consumeVerification(id: string): Promise<void> {
  await prisma.verificationToken.update({
    where: { id },
    data: { consumedAt: new Date() },
    select: { id: true },
  });
}

export async function recordLoginAttempt(args: {
  email: string;
  ipAddress: string | null;
  success: boolean;
}): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      email: args.email.toLowerCase(),
      ipAddress: args.ipAddress,
      success: args.success,
    },
    select: { id: true },
  });
}

export async function countRecentFailedLogins(args: {
  email: string;
  sinceMs: number;
}): Promise<number> {
  return prisma.loginAttempt.count({
    where: {
      email: args.email.toLowerCase(),
      success: false,
      createdAt: { gte: new Date(Date.now() - args.sinceMs) },
    },
  });
}

