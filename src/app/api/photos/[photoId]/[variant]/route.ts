import { eq } from "drizzle-orm";
import { getStorage } from "@/adapters";
import { getDb } from "@/db/client";
import { properties, propertyPhotos } from "@/db/schema";
import { hasApprovedAccess } from "@/lib/access";
import { canViewFull, canViewTeaser } from "@/lib/policies";
import { CONTENT_TYPES, PUBLIC_VARIANTS, VARIANTS, type Variant } from "@/lib/photos";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Photos follow the same rule as the listing: the blurred variant is public for live listings,
 * every sharp variant needs full access (owner, admin, or an investor whose request was approved).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ photoId: string; variant: string }> }) {
  const { photoId, variant } = await params;
  if (!VARIANTS.includes(variant as Variant) || !/^[0-9a-f-]{36}$/i.test(photoId)) return new Response("Not found", { status: 404 });

  const db = await getDb();
  const [row] = await db
    .select({ key: propertyPhotos.storageKey, ownerId: properties.ownerId, status: properties.status, id: properties.id })
    .from(propertyPhotos)
    .innerJoin(properties, eq(properties.id, propertyPhotos.propertyId))
    .where(eq(propertyPhotos.id, photoId))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });

  const actor = await currentUser();
  const isPublicVariant = PUBLIC_VARIANTS.includes(variant as Variant);
  let cache = "private, no-store";
  if (isPublicVariant) {
    if (row.status !== "live" && !canViewTeaser(actor, row)) return new Response("Not found", { status: 404 });
    if (row.status === "live") cache = "public, max-age=3600";
  } else if (!canViewFull(actor, row, await hasApprovedAccess(db, actor?.id, row.id))) {
    // Indistinguishable from "no such photo" so the id space cannot be probed.
    return new Response("Not found", { status: 404 });
  }

  const bytes = await getStorage().get(`${row.key}/${variant}`);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": CONTENT_TYPES[variant as Variant], "cache-control": cache, "x-content-type-options": "nosniff" },
  });
}
