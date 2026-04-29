import type {
  AuthProvider,
  NotificationLevel,
  VerificationTokenType,
} from "../../generated/prisma/client";
import type { PresenceStatus } from "../../generated/prisma/client";

export interface RegisterDTO {
  email: string;
  password: string;
}

export interface LoginDTO {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface VerifyEmailDTO {
  token: string;
}

export interface ResendVerificationDTO {
  email: string;
}

export interface ForgotPasswordDTO {
  email: string;
}

export interface ResetPasswordDTO {
  token: string;
  newPassword: string;
}

export interface AuthUserResponseDTO {
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
  emailVerifiedAt: Date | null;
  hasPassword: boolean;
  providers: AuthProvider[];
}

export interface AuthTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface IssuedSession {
  user: AuthUserResponseDTO;
  tokens: AuthTokens;
  sessionId: string;
}

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface GoogleProfileDTO {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export type { AuthProvider, PresenceStatus, VerificationTokenType };
