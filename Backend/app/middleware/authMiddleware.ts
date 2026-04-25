import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { RequestExtended } from "../interfaces/global";
import ApiException from "../utils/errorHandler";
import { ErrorCodes } from "../utils/response";
import { ACCESS_COOKIE_NAME } from "../modules/auth/auth.cookies";

interface AccessTokenPayload {
  sub: string;
  email: string;
  sid: string;
}

export function isAuthenticated(
  req: RequestExtended,
  _res: Response,
  next: NextFunction
): void {
  const cookieToken = (req.cookies?.[ACCESS_COOKIE_NAME] as string | undefined) ?? null;
  const headerToken = parseBearer(req.header("authorization"));
  const token = cookieToken ?? headerToken;

  if (!token) {
    return next(
      new ApiException({
        ...ErrorCodes.UNAUTHORIZED,
        errorDescription: "Missing authentication token",
      })
    );
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    req.user = { id: payload.sub, email: payload.email, sessionId: payload.sid };
    return next();
  } catch (err) {
    return next(err);
  }
}

function parseBearer(value: string | undefined): string | null {
  if (!value) return null;
  const [scheme, token] = value.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}
