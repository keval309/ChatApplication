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
import type {
  AuthUser,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
  Session,
  UpdateProfilePayload,
} from "@/types/auth";

export const ME_QUERY_KEY = ["auth", "me"] as const;
export const SESSIONS_QUERY_KEY = ["auth", "sessions"] as const;

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

export { extractErrorMessage };
