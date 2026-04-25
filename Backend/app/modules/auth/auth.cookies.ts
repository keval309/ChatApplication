import type { CookieOptions, Response } from "express";
import { env } from "../../config/env";

export const ACCESS_COOKIE_NAME = "cf_access";
export const REFRESH_COOKIE_NAME = "cf_refresh";
export const OAUTH_STATE_COOKIE_NAME = "cf_oauth_state";

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: "lax",
  domain: env.COOKIE_DOMAIN === "localhost" ? undefined : env.COOKIE_DOMAIN,
  path: "/",
};

export function setAccessCookie(
  res: Response,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(ACCESS_COOKIE_NAME, token, {
    ...baseCookieOptions,
    expires: expiresAt,
  });
}

export function setRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseCookieOptions,
    expires: expiresAt,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE_NAME, baseCookieOptions);
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions);
}

export function setOAuthStateCookie(
  res: Response,
  state: string,
  ttlMs: number = 5 * 60 * 1000,
): void {
  res.cookie(OAUTH_STATE_COOKIE_NAME, state, {
    ...baseCookieOptions,
    sameSite: "lax",
    maxAge: ttlMs,
  });
}

export function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE_NAME, baseCookieOptions);
}
