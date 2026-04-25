import crypto from "crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../../config/env";

interface AccessPayload {
  sub: string;
  email: string;
  sid: string;
}

interface RefreshPayload {
  sub: string;
  sid: string;
  jti: string;
}

export interface SignedToken<T> {
  token: string;
  payload: T;
  expiresAt: Date;
}

export function signAccessToken(args: { userId: string; email: string; sessionId: string }): SignedToken<AccessPayload> {
  const payload: AccessPayload = { sub: args.userId, email: args.email, sid: args.sessionId };
  const token = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as SignOptions);
  const decoded = jwt.decode(token) as { exp?: number } | null;
  const expiresAt = new Date((decoded?.exp ?? 0) * 1000);
  return { token, payload, expiresAt };
}

export function signRefreshToken(args: {
  userId: string;
  sessionId: string;
  rememberMe?: boolean;
}): SignedToken<RefreshPayload> {
  const expiresIn = args.rememberMe
    ? env.JWT_REFRESH_REMEMBER_EXPIRES_IN
    : env.JWT_REFRESH_EXPIRES_IN;

  const payload: RefreshPayload = {
    sub: args.userId,
    sid: args.sessionId,
    jti: crypto.randomBytes(16).toString("hex"),
  };
  const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn,
  } as SignOptions);
  const decoded = jwt.decode(token) as { exp?: number } | null;
  const expiresAt = new Date((decoded?.exp ?? 0) * 1000);
  return { token, payload, expiresAt };
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateRandomToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}
