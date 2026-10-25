import { guardProperty, isResponse } from "@/lib/api-guard";
import { ingestCleanedRows } from "@/lib/ingest/service";
import { rateLimit, tooLarge, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Receives rows already cleaned in the browser. Re-validated and re-checked server-side. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (tooLarge(req, 6 * 1024 * 1024)) return Response.json({ error: "too_large" }, { status: 413 });
  const g = await guardProperty(req, (await params).id, { mutating: true });
  if (isResponse(g)) return g;
  const rl = rateLimit(`csv:${g.user.id}`, { limit: 20, windowMs: 10 * 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSeconds);
  const body = (await req.json().catch(() => null)) as { rows?: unknown; skippedCount?: unknown } | null;
  if (!body) return Response.json({ error: "bad_request" }, { status: 400 });
  const result = await ingestCleanedRows(g.db, {
    propertyId: g.property.id,
    userId: g.user.id,
    rows: body.rows,
    skippedCount: typeof body.skippedCount === "number" ? body.skippedCount : 0,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "forbidden" ? 403 : 400 });
  return Response.json({ outcome: result.outcome, checks: result.checks });
}
