import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/client";
import { getInboundProvider, getStorage } from "@/adapters";
import { ingestInboundEmail } from "@/lib/ingest/service";
import { clientIp, rateLimit, tooLarge, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function secretMatches(given: string | null, expected: string | undefined): boolean {
  // Fail closed: with no secret configured, nothing is accepted.
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  // Throttle before any secret comparison so the endpoint cannot be hammered or probed.
  const rl = rateLimit(`inbound:${clientIp(req.headers)}`, { limit: 120, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSeconds);
  if (!secretMatches(req.headers.get("x-webhook-secret"), process.env.INBOUND_WEBHOOK_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (tooLarge(req, 26 * 1024 * 1024)) return Response.json({ error: "too_large" }, { status: 413 });
  let raw: Buffer;
  try {
    ({ raw } = await getInboundProvider().parseWebhook(req));
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const result = await ingestInboundEmail(await getDb(), { raw, storage: getStorage() });
    // Always 200 for well-formed deliveries so providers do not retry rejected mail forever.
    return Response.json(
      result.status === "rejected"
        ? { status: "rejected", reason: result.reason }
        : { status: "processed", outcome: result.outcome },
    );
  } catch {
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
