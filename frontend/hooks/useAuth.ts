"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import * as authApi from "@/lib/auth";
import { extractErrorMessage } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";
import { usePresenceStore } from "@/stores/presence-store";
import type {
  AuthUser,
  BlockedUser,
  ConversationNotificationPreference,
  DiscoverUser,
  LoginPayload,
  NotificationLevel,
  RegisterPayload,
  ResetPasswordPayload,
  Session,
  UpdateUserSettingsPayload,
  UpdateProfilePayload,
  UpsertConversationNotificationPreferencePayload,
  UserSettings,
} from "@/types/auth";

export const ME_QUERY_KEY = ["auth", "me"] as const;
export const SESSIONS_QUERY_KEY = ["auth", "sessions"] as const;
export const SETTINGS_QUERY_KEY = ["user", "settings"] as const;
export const BLOCKED_USERS_QUERY_KEY = ["user", "blocked-users"] as const;
export const CONVERSATION_PREFERENCES_QUERY_KEY = [
  "user",
  "conversation-preferences",
] as const;
export const DISCOVER_USERS_QUERY_KEY = ["user", "discover"] as const;

export function useMe(options?: { enabled?: boolean }): UseQueryResult<AuthUser> {
  return useQuery<AuthUser>({
    queryKey: ME_QUERY_KEY,
    queryFn: () => authApi.getMe(),
    enabled: options?.enabled ?? true,
    retry: false,
  });
}

export function useLogin(): UseMutationResult<AuthUser, Error, LoginPayload> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: (user) => {
      qc.setQueryData(ME_QUERY_KEY, user);
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export function useRegister(): UseMutationResult<AuthUser, Error, RegisterPayload> {
  return useMutation({
    mutationFn: (payload: RegisterPayload) => authApi.register(payload),
  });
}

export function useLogout(): UseMutationResult<void, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      disconnectSocket();
      usePresenceStore.getState().clear();
      qc.setQueryData(ME_QUERY_KEY, null);
      qc.removeQueries({ queryKey: ME_QUERY_KEY });
      qc.removeQueries({ queryKey: SESSIONS_QUERY_KEY });
    },
  });
}

export function useVerifyEmail(): UseMutationResult<AuthUser, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => authApi.verifyEmail(token),
    onSuccess: (user) => qc.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useResendVerification(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (email: string) => authApi.resendVerification(email),
  });
}

export function useForgotPassword(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email),
  });
}

export function useResetPassword(): UseMutationResult<
  void,
  Error,
  ResetPasswordPayload
> {
  return useMutation({
    mutationFn: (payload) => authApi.resetPassword(payload),
  });
}

export function useUpdateProfile(): UseMutationResult<
  AuthUser,
  Error,
  UpdateProfilePayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => authApi.updateProfile(payload),
    onSuccess: (user) => qc.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useSessions(options?: {
  enabled?: boolean;
}): UseQueryResult<Session[]> {
  return useQuery<Session[]>({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: () => authApi.listSessions(),
    enabled: options?.enabled ?? true,
  });
}

export function useRevokeSession(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => authApi.revokeSession(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY }),
  });
}

export function useUserSettings(options?: {
  enabled?: boolean;
}): UseQueryResult<UserSettings> {
  return useQuery<UserSettings>({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => authApi.getUserSettings(),
    enabled: options?.enabled ?? true,
  });
}

export function useUpdateUserSettings(): UseMutationResult<
  UserSettings,
  Error,
  UpdateUserSettingsPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateUserSettingsPayload) =>
      authApi.updateUserSettings(payload),
    onSuccess: (settings) => {
      qc.setQueryData(SETTINGS_QUERY_KEY, settings);
      qc.setQueryData<AuthUser>(ME_QUERY_KEY, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lastSeenVisible: settings.lastSeenVisible,
          sendReadReceipts: settings.sendReadReceipts,
          globalNotificationLevel: settings.globalNotificationLevel,
          autoUnmuteReminder: settings.autoUnmuteReminder,
        };
      });
    },
  });
}

export function useUsernameAvailability(): UseMutationResult<
  { username: string; available: boolean },
  Error,
  string
> {
  return useMutation({
    mutationFn: (username: string) => authApi.checkUsernameAvailability(username),
  });
}

export function useDiscoverUsers(
  query: string,
  options?: { enabled?: boolean; limit?: number },
): UseQueryResult<DiscoverUser[]> {
  const q = query.trim();
  return useQuery<DiscoverUser[]>({
    queryKey: [...DISCOVER_USERS_QUERY_KEY, q, options?.limit ?? 20],
    queryFn: () => authApi.discoverUsers({ query: q, limit: options?.limit ?? 20 }),
    enabled: (options?.enabled ?? true) && q.length >= 2,
    staleTime: 15_000,
  });
}

export function useBlockedUsers(options?: {
  enabled?: boolean;
}): UseQueryResult<BlockedUser[]> {
  return useQuery<BlockedUser[]>({
    queryKey: BLOCKED_USERS_QUERY_KEY,
    queryFn: () => authApi.listBlockedUsers(),
    enabled: options?.enabled ?? true,
  });
}

export function useBlockUser(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => authApi.blockUser(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: BLOCKED_USERS_QUERY_KEY }),
  });
}

export function useUnblockUser(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => authApi.unblockUser(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: BLOCKED_USERS_QUERY_KEY }),
  });
}

export function useConversationPreferences(options?: {
  enabled?: boolean;
}): UseQueryResult<ConversationNotificationPreference[]> {
  return useQuery<ConversationNotificationPreference[]>({
    queryKey: CONVERSATION_PREFERENCES_QUERY_KEY,
    queryFn: () => authApi.listConversationPreferences(),
    enabled: options?.enabled ?? true,
  });
}

export function useUpsertConversationPreference(): UseMutationResult<
  ConversationNotificationPreference,
  Error,
  UpsertConversationNotificationPreferencePayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertConversationNotificationPreferencePayload) =>
      authApi.upsertConversationPreference(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONVERSATION_PREFERENCES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    },
  });
}

export function useUploadAvatar(): UseMutationResult<{ avatarUrl: string }, Error, File> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => authApi.uploadAvatar(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  });
}

export const NOTIFICATION_LEVEL_OPTIONS: Array<{
  value: NotificationLevel;
  label: string;
}> = [
  { value: "ALL_MESSAGES", label: "All messages" },
  { value: "MENTIONS_AND_REPLIES", label: "Mentions and replies only" },
  { value: "NOTHING", label: "Nothing" },
];

export { extractErrorMessage };
