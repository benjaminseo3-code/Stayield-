/**
 * Fixed-window, in-memory rate limiter. Good enough for one instance and for the first deploy.
 * Behind several instances/serverless, replace the store with Redis/Upstash (same function shape).
 * Authentication has its own limiter inside Better Auth (see adapters/auth.ts).
 */
type Bucket = { count: number; resetAt: number };
const g = globalThis as unknown as { __stayieldRl?: Map<string, Bucket> };
const buckets = (g.__stayieldRl ??= new Map<string, Bucket>());

export type RateResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function rateLimit(key: string, opts: { limit: number; windowMs: number }, now = Date.now()): RateResult {
  if (process.env.RATE_LIMIT_DISABLED === "true" && process.env.NODE_ENV !== "development") return { ok: true };
  // Opportunistic cleanup keeps the map from growing without bound.
  if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);

  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }
  if (b.count >= opts.limit) return { ok: false, retryAfterSeconds: Math.ceil((b.resetAt - now) / 1000) };
  b.count++;
  return { ok: true };
}

/** Best-effort client IP. Only trust x-forwarded-for when running behind your own proxy/CDN. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

export const tooManyRequests = (retryAfterSeconds: number) =>
  Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(retryAfterSeconds) } });

/** Rejects requests whose declared body is larger than `maxBytes` before reading them. */
export function tooLarge(req: Request, maxBytes: number): boolean {
  const len = Number(req.headers.get("content-length"));
  return Number.isFinite(len) && len > maxBytes;
}
