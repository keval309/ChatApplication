export interface UpdateProfileDTO {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  statusMessage?: string;
  bio?: string;
}

export interface ProfileResponseDTO {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  statusMessage: string | null;
  bio: string | null;
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
