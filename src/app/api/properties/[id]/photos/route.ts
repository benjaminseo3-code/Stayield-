import { getStorage } from "@/adapters";
import { guardProperty, isResponse } from "@/lib/api-guard";
import { rateLimit, tooLarge, tooManyRequests } from "@/lib/rate-limit";
import { addPhoto, reorderPhotos } from "@/lib/photo-service";
import { MAX_PHOTO_BYTES } from "@/lib/photos";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  // Cheap checks first: declared size, then who is asking.
  if (tooLarge(req, 40 * 1024 * 1024)) return Response.json({ error: "too_large" }, { status: 413 });
  const g = await guardProperty(req, (await params).id, { mutating: true });
  if (isResponse(g)) return g;
  const rl = rateLimit(`photos:${g.user.id}`, { limit: 90, windowMs: 10 * 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSeconds);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0 || files.length > 30) return Response.json({ error: "bad_request" }, { status: 400 });

  const storage = getStorage();
  const results: { name: string; ok: boolean; id?: string; error?: string }[] = [];
  // Sequential on purpose: image processing is memory-hungry.
  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) {
      results.push({ name: file.name, ok: false, error: "too_large" });
      continue;
    }
    const r = await addPhoto(g.db, storage, g.property.id, Buffer.from(await file.arrayBuffer()));
    results.push(r.ok ? { name: file.name, ok: true, id: r.id } : { name: file.name, ok: false, error: r.error });
  }
  return Response.json({ results });
}

export async function PUT(req: Request, { params }: Ctx) {
  const g = await guardProperty(req, (await params).id, { mutating: true });
  if (isResponse(g)) return g;
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  if (!body || !Array.isArray(body.ids) || !body.ids.every((i) => typeof i === "string")) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const ok = await reorderPhotos(g.db, g.property.id, body.ids as string[]);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "bad_request" }, { status: 400 });
}
