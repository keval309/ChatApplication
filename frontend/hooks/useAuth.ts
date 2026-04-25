"use client";

import { useMemo } from "react";
import { clearToken, getToken, setToken } from "@/lib/auth";

export function useAuth() {
  const token = useMemo(() => getToken(), []);

  return {
    token,
    isAuthenticated: Boolean(token),
    login: (nextToken: string) => setToken(nextToken),
    logout: () => clearToken(),
  };
}
