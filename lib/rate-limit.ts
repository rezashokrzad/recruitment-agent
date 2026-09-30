/**
 * Simple in-memory rate limiter (sliding window, per key — here, per IP).
 *
 * `check` and `record` are separate so the upload route only counts
 * SUCCESSFUL submissions — a typo in the form shouldn't use up an attempt.
 *
 * Good enough for one Node process. It resets on restart and is not shared
 * between servers; a multi-server deployment would need Redis or similar.
 */
import { singleton } from "./singleton";

export function createRateLimiter(name: string, limit: number, windowMs: number) {
  const hits = singleton(`rateLimit_${name}`, () => new Map<string, number[]>());

  const recent = (key: string) => {
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    hits.set(key, list);
    return list;
  };

  return {
    /** Would one more hit be allowed? */
    check(key: string): { ok: boolean; retryAfterSec: number } {
      const list = recent(key);
      if (list.length < limit) return { ok: true, retryAfterSec: 0 };
      return { ok: false, retryAfterSec: Math.ceil((windowMs - (Date.now() - list[0])) / 1000) };
    },
    /** Count one hit. */
    record(key: string): void {
      recent(key).push(Date.now());
    },
  };
}

/** Best-effort client IP (first entry of X-Forwarded-For when behind a proxy). */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
