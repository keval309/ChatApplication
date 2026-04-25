import { api, unwrap, API_URL } from "./api";
import type {
  AuthUser,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
  Session,
  UpdateProfilePayload,
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

export function googleSignInUrl(): string {
  return `${API_URL}/api/auth/google`;
}
