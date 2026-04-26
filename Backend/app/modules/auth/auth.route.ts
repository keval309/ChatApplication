import { Router } from "express";
import { env } from "../../config/env";
import asyncHandler from "../../utils/async-handler";
import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import { isAuthenticated } from "../../middleware/authMiddleware";
import {
  clientIp,
  createIpRateLimiter,
} from "../../middleware/rateLimiter";
import type { RequestExtended } from "../../interfaces/global";
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  clearAuthCookies,
  clearOAuthStateCookie,
  setAccessCookie,
  setOAuthStateCookie,
  setRefreshCookie,
} from "./auth.cookies";
import * as authService from "./auth.service";
import { getSocketServer } from "../../socket";
import { userRoom } from "../../socket/rooms";
import {
  buildGoogleAuthorizeUrl,
  generateOAuthState,
} from "./auth.oauth";
import {
  forgotPasswordValidator,
  googleCallbackValidator,
  loginValidator,
  registerValidator,
  resendVerificationValidator,
  resetPasswordValidator,
  verifyEmailValidator,
} from "./auth.validator";
import { verifyAccessToken } from "./auth.tokens";
import type { IssuedSession } from "./auth.types";

const router = Router();

const registerLimiter = createIpRateLimiter({
  limit: env.RATE_LIMIT_REGISTER_MAX,
  windowMs: env.RATE_LIMIT_REGISTER_WINDOW_HR * 60 * 60 * 1000,
  errorMessage: "Too many registration attempts from this IP. Try again later.",
});

const authBurstLimiter = createIpRateLimiter({
  limit: 60,
  windowMs: 15 * 60 * 1000,
  errorMessage: "Too many requests. Slow down and try again shortly.",
});

function ctx(req: RequestExtended) {
  return {
    ipAddress: clientIp(req),
    userAgent: req.header("user-agent") ?? null,
  };
}

function applyAuthCookies(
  res: Parameters<typeof setAccessCookie>[0],
  issued: IssuedSession,
): void {
  setAccessCookie(res, issued.tokens.accessToken, issued.tokens.accessTokenExpiresAt);
  setRefreshCookie(
    res,
    issued.tokens.refreshToken,
    issued.tokens.refreshTokenExpiresAt,
  );
}

router.post(
  "/register",
  registerLimiter,
  registerValidator,
  asyncHandler(async (req) => {
    const result = await authService.register({
      email: req.body.email,
      password: req.body.password,
    });
    return result;
  }),
);

router.post(
  "/login",
  authBurstLimiter,
  loginValidator,
  asyncHandler(async (req, res) => {
    const issued = await authService.login(
      {
        email: req.body.email,
        password: req.body.password,
        rememberMe: req.body.rememberMe,
      },
      ctx(req as RequestExtended),
    );
    applyAuthCookies(res, issued);
    return { user: issued.user };
  }),
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    let userIdForSocketDisconnect: string | null = null;
    const token = req.cookies?.[ACCESS_COOKIE_NAME] as string | undefined;
    if (token) {
      try {
        const payload = verifyAccessToken(token);
        userIdForSocketDisconnect = payload.sub;
        await authService.logout(payload.sid);
      } catch {
        /* token invalid — still clear cookies */
      }
    }
    if (userIdForSocketDisconnect) {
      try {
        const io = getSocketServer();
        io.in(userRoom(userIdForSocketDisconnect)).disconnectSockets(true);
      } catch {
        /* socket server may not be initialized */
      }
    }
    clearAuthCookies(res);
    return { success: true };
  }),
);

router.post(
  "/refresh",
  authBurstLimiter,
  asyncHandler(async (req, res) => {
    const refreshToken =
      (req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined) ?? null;
    const issued = await authService.refresh({
      refreshToken,
      context: ctx(req as RequestExtended),
    });
    applyAuthCookies(res, issued);
    return { user: issued.user };
  }),
);

router.get(
  "/me",
  isAuthenticated,
  asyncHandler(async (req) => {
    const user = (req as RequestExtended).user;
    if (!user) {
      throw new ApiException({ ...ErrorCodes.UNAUTHORIZED });
    }
    const me = await authService.getMe(user.id);
    return { user: me };
  }),
);

router.post(
  "/verify-email",
  authBurstLimiter,
  verifyEmailValidator,
  asyncHandler(async (req) => {
    const result = await authService.verifyEmail({ token: req.body.token });
    return result;
  }),
);

router.post(
  "/resend-verification",
  authBurstLimiter,
  resendVerificationValidator,
  asyncHandler(async (req) => {
    await authService.resendVerification(req.body.email);
    return { success: true };
  }),
);

router.post(
  "/forgot-password",
  authBurstLimiter,
  forgotPasswordValidator,
  asyncHandler(async (req) => {
    await authService.requestPasswordReset(req.body.email);
    return { success: true };
  }),
);

router.post(
  "/reset-password",
  authBurstLimiter,
  resetPasswordValidator,
  asyncHandler(async (req) => {
    await authService.resetPassword({
      token: req.body.token,
      newPassword: req.body.newPassword,
    });
    return { success: true };
  }),
);

router.get("/google", (_req, res) => {
  const state = generateOAuthState();
  setOAuthStateCookie(res, state);
  const url = buildGoogleAuthorizeUrl(state);
  res.redirect(url);
});

router.get(
  "/google/callback",
  googleCallbackValidator,
  asyncHandler(async (req, res) => {
    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE_NAME] as string | undefined;
    const queryState = String(req.query.state ?? "");
    clearOAuthStateCookie(res);

    if (!cookieState || cookieState !== queryState) {
      throw new ApiException({
        ...ErrorCodes.UNAUTHORIZED,
        errorDescription: "Invalid OAuth state",
      });
    }

    const code = String(req.query.code ?? "");
    const issued = await authService.loginWithGoogle({
      code,
      context: ctx(req as RequestExtended),
    });
    applyAuthCookies(res, issued);

    const target = issued.user.username
      ? `${env.FRONTEND_URL}/chat`
      : `${env.FRONTEND_URL}/onboarding`;
    res.redirect(target);
  }),
);

export default router;
