import type { NextFunction, Response } from "express";
import type { RequestExtended } from "../interfaces/global";
import ApiException from "../utils/errorHandler";
import { ErrorCodes } from "../utils/response";

interface SlidingWindowEntry {
  hits: number[];
}

class SlidingWindowLimiter {
  private store = new Map<string, SlidingWindowEntry>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  hit(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const entry = this.store.get(key) ?? { hits: [] };
    entry.hits = entry.hits.filter((t) => t > cutoff);

    if (entry.hits.length >= this.limit) {
      this.store.set(key, entry);
      const oldest = entry.hits[0] ?? now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, oldest + this.windowMs - now),
      };
    }

    entry.hits.push(now);
    this.store.set(key, entry);
    return {
      allowed: true,
      remaining: this.limit - entry.hits.length,
      retryAfterMs: 0,
    };
  }

  reset(key: string): void {
    this.store.delete(key);
  }
}

export function createIpRateLimiter(opts: {
  limit: number;
  windowMs: number;
  errorMessage?: string;
}) {
  const limiter = new SlidingWindowLimiter(opts.limit, opts.windowMs);

  return (req: RequestExtended, res: Response, next: NextFunction): void => {
    const ip = clientIp(req);
    const result = limiter.hit(ip);
    if (!result.allowed) {
      res.setHeader("Retry-After", Math.ceil(result.retryAfterMs / 1000));
      return next(
        new ApiException({
          ...ErrorCodes.TOO_MANY_REQUESTS,
          errorDescription:
            opts.errorMessage ?? "Too many requests. Please try again later.",
        })
      );
    }
    return next();
  };
}

export function clientIp(req: RequestExtended): string {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

export { SlidingWindowLimiter };
