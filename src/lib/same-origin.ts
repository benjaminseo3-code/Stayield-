/**
 * CSRF guard for cookie-authenticated API routes (server actions already have Next's own check).
 * Fail closed: a mutating request must carry an Origin that matches the Host.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
