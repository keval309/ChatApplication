import { parse as parseCookies } from "cookie";
import { ExtendedError } from "socket.io/dist/namespace";
import { ACCESS_COOKIE_NAME } from "../modules/auth/auth.cookies";
import { verifyAccessToken } from "../modules/auth/auth.tokens";
import { logger } from "../utils/logger";
import type { AppSocket } from "./types";

/**
 * Socket.io middleware that authenticates the handshake by reading the
 * cf_access JWT from the cookie header and verifying it. Rejects unauthenticated
 * sockets — they are disconnected before any handler is registered.
 */
export function socketAuthMiddleware(
  socket: AppSocket,
  next: (err?: ExtendedError) => void,
): void {
  try {
    const cookieHeader = socket.handshake.headers.cookie ?? "";
    const cookies = cookieHeader ? parseCookies(cookieHeader) : {};
    const token = cookies[ACCESS_COOKIE_NAME];

    if (!token) {
      return next(new UnauthorizedSocketError("Missing authentication cookie"));
    }

    const payload = verifyAccessToken(token);

    socket.data.auth = {
      userId: payload.sub,
      email: payload.email,
      sessionId: payload.sid,
    };

    return next();
  } catch (err) {
    logger.warn("[socket.auth] handshake rejected", err as Error);
    return next(new UnauthorizedSocketError("Invalid or expired session"));
  }
}

class UnauthorizedSocketError extends Error {
  data: { code: number };
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedSocketError";
    this.data = { code: 401 };
  }
}
