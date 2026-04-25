import bcrypt from "bcrypt";
import { AuthProvider, VerificationTokenType } from "../../generated/prisma/client";
import { env } from "../../config/env";
import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import { logger } from "../../utils/logger";
import * as authRepository from "./auth.repository";
import {
  generateRandomToken,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "./auth.tokens";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "./auth.email";
import { exchangeGoogleCode } from "./auth.oauth";
import type {
  AuthUserResponseDTO,
  IssuedSession,
  LoginDTO,
  RegisterDTO,
  RequestContext,
  ResetPasswordDTO,
  VerifyEmailDTO,
} from "./auth.types";

const BCRYPT_ROUNDS = 12;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function nowPlus(ms: number): Date {
  return new Date(Date.now() + ms);
}

async function hydrateAuthUser(userId: string): Promise<AuthUserResponseDTO> {
  const user = await authRepository.findUserById(userId);
  if (!user) {
    throw new ApiException({ ...ErrorCodes.NOT_FOUND, errorDescription: "User not found" });
  }
  const providers = await authRepository.listUserProviders(userId);
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    statusMessage: user.statusMessage,
    bio: user.bio,
    presenceStatus: user.presenceStatus,
    emailVerifiedAt: user.emailVerifiedAt,
    hasPassword: Boolean(user.passwordHash),
    providers,
  };
}

async function issueSession(args: {
  userId: string;
  email: string;
  rememberMe: boolean;
  context: RequestContext;
}): Promise<IssuedSession> {
  const refreshExpiresAt = nowPlus(
    args.rememberMe
      ? parseDuration(env.JWT_REFRESH_REMEMBER_EXPIRES_IN)
      : parseDuration(env.JWT_REFRESH_EXPIRES_IN),
  );

  const placeholderHash = hashToken(generateRandomToken(8));
  const session = await authRepository.createSession({
    userId: args.userId,
    refreshTokenHash: placeholderHash,
    expiresAt: refreshExpiresAt,
    rememberMe: args.rememberMe,
    userAgent: args.context.userAgent,
    ipAddress: args.context.ipAddress,
  });

  const access = signAccessToken({
    userId: args.userId,
    email: args.email,
    sessionId: session.id,
  });
  const refresh = signRefreshToken({
    userId: args.userId,
    sessionId: session.id,
    rememberMe: args.rememberMe,
  });

  await authRepository.rotateSessionRefresh({
    sessionId: session.id,
    newRefreshTokenHash: hashToken(refresh.token),
    newExpiresAt: refresh.expiresAt,
  });

  const user = await hydrateAuthUser(args.userId);

  return {
    user,
    sessionId: session.id,
    tokens: {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt,
    },
  };
}

export async function register(
  data: RegisterDTO,
): Promise<{ user: AuthUserResponseDTO }> {
  const existing = await authRepository.findUserByEmail(data.email);
  if (existing && !existing.deletedAt) {
    throw new ApiException({
      ...ErrorCodes.CONFLICT,
      errorDescription: "An account with this email already exists",
    });
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const user = await authRepository.createUserWithPassword({
    email: data.email,
    passwordHash,
  });

  const rawToken = generateRandomToken(32);
  await authRepository.createVerificationToken({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    type: VerificationTokenType.EMAIL_VERIFY,
    expiresAt: nowPlus(VERIFY_TOKEN_TTL_MS),
  });

  try {
    await sendVerificationEmail({ to: user.email, token: rawToken });
  } catch (err) {
    logger.error("[auth.service] failed to send verification email", err as Error);
  }

  return { user: await hydrateAuthUser(user.id) };
}

export async function login(
  data: LoginDTO,
  context: RequestContext,
): Promise<IssuedSession> {
  const lockoutWindowMs = env.RATE_LIMIT_LOGIN_WINDOW_MIN * 60 * 1000;
  const recentFails = await authRepository.countRecentFailedLogins({
    email: data.email,
    sinceMs: lockoutWindowMs,
  });
  if (recentFails >= env.RATE_LIMIT_LOGIN_MAX) {
    throw new ApiException({
      ...ErrorCodes.LOCKED,
      errorDescription: `Too many failed attempts. Try again in ${env.RATE_LIMIT_LOGIN_WINDOW_MIN} minutes.`,
    });
  }

  const user = await authRepository.findUserByEmail(data.email);
  if (!user || user.deletedAt || !user.passwordHash) {
    await authRepository.recordLoginAttempt({
      email: data.email,
      ipAddress: context.ipAddress,
      success: false,
    });
    throw new ApiException({
      ...ErrorCodes.UNAUTHORIZED,
      errorDescription: "Invalid email or password",
    });
  }

  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) {
    await authRepository.recordLoginAttempt({
      email: data.email,
      ipAddress: context.ipAddress,
      success: false,
    });
    throw new ApiException({
      ...ErrorCodes.UNAUTHORIZED,
      errorDescription: "Invalid email or password",
    });
  }

  if (!user.emailVerifiedAt) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "Please verify your email before signing in",
    });
  }

  await authRepository.recordLoginAttempt({
    email: data.email,
    ipAddress: context.ipAddress,
    success: true,
  });

  return issueSession({
    userId: user.id,
    email: user.email,
    rememberMe: Boolean(data.rememberMe),
    context,
  });
}

export async function logout(sessionId: string): Promise<void> {
  await authRepository.revokeSession(sessionId).catch(() => {
    /* idempotent */
  });
}

export async function refresh(args: {
  refreshToken: string | null;
  context: RequestContext;
}): Promise<IssuedSession> {
  if (!args.refreshToken) {
    throw new ApiException({
      ...ErrorCodes.UNAUTHORIZED,
      errorDescription: "Missing refresh token",
    });
  }

  let payload;
  try {
    payload = verifyRefreshToken(args.refreshToken);
  } catch (err) {
    throw new ApiException({
      ...ErrorCodes.UNAUTHORIZED,
      errorDescription: "Invalid or expired refresh token",
      error: err,
    });
  }

  const session = await authRepository.findSessionById(payload.sid);
  if (!session || session.userId !== payload.sub) {
    throw new ApiException({
      ...ErrorCodes.UNAUTHORIZED,
      errorDescription: "Session not found",
    });
  }
  if (session.revokedAt) {
    throw new ApiException({
      ...ErrorCodes.UNAUTHORIZED,
      errorDescription: "Session has been revoked",
    });
  }
  if (session.expiresAt.getTime() < Date.now()) {
    throw new ApiException({
      ...ErrorCodes.UNAUTHORIZED,
      errorDescription: "Session has expired",
    });
  }
  if (hashToken(args.refreshToken) !== session.refreshTokenHash) {
    await authRepository.revokeSession(session.id);
    throw new ApiException({
      ...ErrorCodes.UNAUTHORIZED,
      errorDescription: "Refresh token mismatch — session revoked",
    });
  }

  const user = await authRepository.findUserById(session.userId);
  if (!user || user.deletedAt) {
    throw new ApiException({ ...ErrorCodes.UNAUTHORIZED, errorDescription: "User not available" });
  }

  const access = signAccessToken({
    userId: user.id,
    email: user.email,
    sessionId: session.id,
  });
  const refreshToken = signRefreshToken({
    userId: user.id,
    sessionId: session.id,
    rememberMe: session.rememberMe,
  });

  await authRepository.rotateSessionRefresh({
    sessionId: session.id,
    newRefreshTokenHash: hashToken(refreshToken.token),
    newExpiresAt: refreshToken.expiresAt,
  });

  const hydrated = await hydrateAuthUser(user.id);

  return {
    user: hydrated,
    sessionId: session.id,
    tokens: {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt,
    },
  };
}

export async function getMe(userId: string): Promise<AuthUserResponseDTO> {
  return hydrateAuthUser(userId);
}

export async function verifyEmail(
  data: VerifyEmailDTO,
): Promise<{ user: AuthUserResponseDTO }> {
  const record = await authRepository.findVerificationByHash(hashToken(data.token));
  if (!record || record.type !== VerificationTokenType.EMAIL_VERIFY) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Invalid verification link",
    });
  }
  if (record.consumedAt) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Verification link has already been used",
    });
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Verification link has expired",
    });
  }

  await authRepository.markEmailVerified(record.userId);
  await authRepository.consumeVerification(record.id);

  return { user: await hydrateAuthUser(record.userId) };
}

export async function resendVerification(email: string): Promise<void> {
  const user = await authRepository.findUserByEmail(email);
  // Do not reveal whether the email exists; behave the same in either branch.
  if (!user || user.deletedAt || user.emailVerifiedAt) return;

  const rawToken = generateRandomToken(32);
  await authRepository.createVerificationToken({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    type: VerificationTokenType.EMAIL_VERIFY,
    expiresAt: nowPlus(VERIFY_TOKEN_TTL_MS),
  });

  try {
    await sendVerificationEmail({ to: user.email, token: rawToken });
  } catch (err) {
    logger.error("[auth.service] failed to resend verification email", err as Error);
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await authRepository.findUserByEmail(email);
  if (!user || user.deletedAt) return; // do not leak existence

  const rawToken = generateRandomToken(32);
  await authRepository.createVerificationToken({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    type: VerificationTokenType.PASSWORD_RESET,
    expiresAt: nowPlus(RESET_TOKEN_TTL_MS),
  });

  try {
    await sendPasswordResetEmail({ to: user.email, token: rawToken });
  } catch (err) {
    logger.error("[auth.service] failed to send reset email", err as Error);
  }
}

export async function resetPassword(data: ResetPasswordDTO): Promise<void> {
  const record = await authRepository.findVerificationByHash(hashToken(data.token));
  if (!record || record.type !== VerificationTokenType.PASSWORD_RESET) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Invalid reset link",
    });
  }
  if (record.consumedAt) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Reset link has already been used",
    });
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Reset link has expired",
    });
  }

  const passwordHash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
  await authRepository.updatePassword(record.userId, passwordHash);
  await authRepository.consumeVerification(record.id);
}

export async function loginWithGoogle(args: {
  code: string;
  context: RequestContext;
}): Promise<IssuedSession> {
  const profile = await exchangeGoogleCode(args.code);

  const linkedAccount = await authRepository.findAccountByProvider({
    provider: AuthProvider.GOOGLE,
    providerAccountId: profile.sub,
  });

  let userId: string;
  let userEmail: string;

  if (linkedAccount) {
    userId = linkedAccount.userId;
    const u = await authRepository.findUserById(userId);
    if (!u || u.deletedAt) {
      throw new ApiException({
        ...ErrorCodes.UNAUTHORIZED,
        errorDescription: "Linked account is unavailable",
      });
    }
    userEmail = u.email;
  } else {
    const existing = await authRepository.findUserByEmail(profile.email);
    if (existing && !existing.deletedAt) {
      // Account linking — attach Google to the existing email/password user
      await authRepository.createAccount({
        userId: existing.id,
        provider: AuthProvider.GOOGLE,
        providerAccountId: profile.sub,
      });
      if (!existing.emailVerifiedAt && profile.emailVerified) {
        await authRepository.markEmailVerified(existing.id);
      }
      userId = existing.id;
      userEmail = existing.email;
    } else {
      // First-time Google sign-in — create user + account
      const created = await authRepository.createUserFromOAuth({
        email: profile.email,
        displayName: profile.name ?? null,
        avatarUrl: profile.picture ?? null,
        emailVerifiedAt: new Date(),
      });
      await authRepository.createAccount({
        userId: created.id,
        provider: AuthProvider.GOOGLE,
        providerAccountId: profile.sub,
      });
      userId = created.id;
      userEmail = created.email;
    }
  }

  return issueSession({
    userId,
    email: userEmail,
    rememberMe: false,
    context: args.context,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) {
    const asNumber = Number(value);
    if (!Number.isFinite(asNumber)) {
      throw new Error(`Invalid duration: ${value}`);
    }
    return asNumber * 1000;
  }
  const n = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case "s":
      return n * 1000;
    case "m":
      return n * 60 * 1000;
    case "h":
      return n * 60 * 60 * 1000;
    case "d":
      return n * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Invalid duration unit: ${unit}`);
  }
}
