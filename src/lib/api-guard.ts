import "server-only";
import { getDb, type Db } from "@/db/client";
import type { Property } from "@/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";
import { currentUser, loadEditableProperty } from "@/lib/session";
import type { SessionUser } from "@/ports/auth";

export type Guarded = { user: SessionUser; db: Db; property: Property };

/**
 * Common checks for property-scoped API routes: same-origin for mutations, signed-in, and the user
 * may edit this property. Returns a Response to send back when any check fails.
 */
export async function guardProperty(req: Request, id: string, opts: { mutating: boolean }): Promise<Guarded | Response> {
  if (opts.mutating && !isSameOrigin(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (opts.mutating && !rateLimit(`api:${user.id}`, { limit: 600, windowMs: 60_000 }).ok) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  const db = await getDb();
  const property = await loadEditableProperty(db, user, id);
  if (!property) return Response.json({ error: "not_found" }, { status: 404 });
  return { user, db, property };
}

export const isResponse = (v: unknown): v is Response => v instanceof Response;
