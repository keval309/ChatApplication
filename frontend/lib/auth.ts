import { api, unwrap, API_URL } from "./api";
import type {
  AuthUser,
  BlockedUser,
  ConversationNotificationPreference,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
  Session,
  UpdateUserSettingsPayload,
  UpdateProfilePayload,
  UpsertConversationNotificationPreferencePayload,
  UserSettings,
} from "@/types/auth";

export async function getMe(): Promise<AuthUser> {
  const res = await unwrap<{ user: AuthUser }>(api.get("/api/auth/me"));
  return res.user;
}

export async function login(payload: LoginPayload): Promise<AuthUser> {
  const res = await unwrap<{ user: AuthUser }>(api.post("/api/auth/login", payload));
  return res.user;
}

export async function register(payload: RegisterPayload): Promise<AuthUser> {
  const res = await unwrap<{ user: AuthUser }>(
    api.post("/api/auth/register", payload),
  );
  return res.user;
}

export async function logout(): Promise<void> {
  await api.post("/api/auth/logout");
}

export async function verifyEmail(token: string): Promise<AuthUser> {
  const res = await unwrap<{ user: AuthUser }>(
    api.post("/api/auth/verify-email", { token }),
  );
  return res.user;
}

export async function resendVerification(email: string): Promise<void> {
  await api.post("/api/auth/resend-verification", { email });
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post("/api/auth/forgot-password", { email });
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<void> {
  await api.post("/api/auth/reset-password", payload);
}

export async function updateProfile(
  payload: UpdateProfilePayload,
): Promise<AuthUser> {
  const res = await unwrap<{ user: AuthUser }>(api.patch("/api/user/me", payload));
  return res.user;
}

export async function listSessions(): Promise<Session[]> {
  const res = await unwrap<{ sessions: Session[] }>(
    api.get("/api/user/me/sessions"),
  );
  return res.sessions;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await api.delete(`/api/user/me/sessions/${encodeURIComponent(sessionId)}`);
}

export async function getUserSettings(): Promise<UserSettings> {
  const res = await unwrap<{ settings: UserSettings }>(api.get("/api/user/me/settings"));
  return res.settings;
}

export async function updateUserSettings(
  payload: UpdateUserSettingsPayload,
): Promise<UserSettings> {
  const res = await unwrap<{ settings: UserSettings }>(
    api.patch("/api/user/me/settings", payload),
  );
  return res.settings;
}

export async function checkUsernameAvailability(username: string): Promise<{
  username: string;
  available: boolean;
}> {
  return unwrap<{ username: string; available: boolean }>(
    api.get(`/api/user/username-availability/${encodeURIComponent(username)}`),
  );
}

export async function listConversationPreferences(): Promise<
  ConversationNotificationPreference[]
> {
  const res = await unwrap<{
    preferences: ConversationNotificationPreference[];
  }>(api.get("/api/user/me/conversation-preferences"));
  return res.preferences;
}

export async function upsertConversationPreference(
  payload: UpsertConversationNotificationPreferencePayload,
): Promise<ConversationNotificationPreference> {
  const res = await unwrap<{ preference: ConversationNotificationPreference }>(
    api.post("/api/user/me/conversation-preferences", payload),
  );
  return res.preference;
}

export async function listBlockedUsers(): Promise<BlockedUser[]> {
  const res = await unwrap<{ blockedUsers: BlockedUser[] }>(
    api.get("/api/user/me/blocked-users"),
  );
  return res.blockedUsers;
}

export async function blockUser(userId: string): Promise<void> {
  await api.post(`/api/user/me/blocked-users/${encodeURIComponent(userId)}`);
}

export async function unblockUser(userId: string): Promise<void> {
  await api.delete(`/api/user/me/blocked-users/${encodeURIComponent(userId)}`);
}

export async function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  const formData = new FormData();
  formData.append("avatar", file);
  const res = await unwrap<{ avatarUrl: string }>(
    api.post("/api/user/me/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  );
  return { avatarUrl: res.avatarUrl };
}

export function googleSignInUrl(): string {
  return `${API_URL}/api/auth/google`;
}
