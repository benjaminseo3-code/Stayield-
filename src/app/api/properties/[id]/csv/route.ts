import { guardProperty, isResponse } from "@/lib/api-guard";
import { ingestCleanedRows } from "@/lib/ingest/service";

export const dynamic = "force-dynamic";

/** Receives rows already cleaned in the browser. Re-validated and re-checked server-side. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardProperty(req, (await params).id, { mutating: true });
  if (isResponse(g)) return g;
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
