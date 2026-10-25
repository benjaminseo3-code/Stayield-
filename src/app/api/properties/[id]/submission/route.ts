import { guardProperty, isResponse } from "@/lib/api-guard";
import { latestSubmissionStatus } from "@/lib/ingest/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardProperty(req, (await params).id, { mutating: false });
  if (isResponse(g)) return g;
  const sub = await latestSubmissionStatus(g.db, g.property.id);
  return Response.json({
    propertyStatus: g.property.status,
    submission: sub
      ? { id: sub.id, source: sub.source, status: sub.status, outcome: sub.result?.outcome ?? null, checks: sub.result?.checks ?? [], at: sub.at }
      : null,
  });
}
