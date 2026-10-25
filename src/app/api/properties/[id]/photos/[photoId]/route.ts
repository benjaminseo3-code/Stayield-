import { getStorage } from "@/adapters";
import { guardProperty, isResponse } from "@/lib/api-guard";
import { deletePhoto, setAlt, setCover } from "@/lib/photo-service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; photoId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id, photoId } = await params;
  const g = await guardProperty(req, id, { mutating: true });
  if (isResponse(g)) return g;
  const body = (await req.json().catch(() => null)) as { alt?: unknown; isCover?: unknown } | null;
  if (!body) return Response.json({ error: "bad_request" }, { status: 400 });
  if (typeof body.alt === "string" && !(await setAlt(g.db, g.property.id, photoId, body.alt))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (body.isCover === true && !(await setCover(g.db, g.property.id, photoId))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id, photoId } = await params;
  const g = await guardProperty(req, id, { mutating: true });
  if (isResponse(g)) return g;
  const ok = await deletePhoto(g.db, getStorage(), g.property.id, photoId);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "not_found" }, { status: 404 });
}
