import "server-only";
import { rateLimit } from "@/lib/rate-limit";

/** For server actions: throws when the caller exceeded the limit (shown by the error page). */
export function enforce(key: string, opts: { limit: number; windowMs: number }): void {
  const r = rateLimit(key, opts);
  if (!r.ok) throw new Error(`rate_limited:${r.retryAfterSeconds}`);
}
