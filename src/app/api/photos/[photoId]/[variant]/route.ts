import { eq } from "drizzle-orm";
import { getStorage } from "@/adapters";
import { getDb } from "@/db/client";
import { properties, propertyPhotos } from "@/db/schema";
import { canViewTeaser } from "@/lib/policies";
import { CONTENT_TYPES, VARIANTS, type Variant } from "@/lib/photos";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

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

  // Photos follow the listing: public when live, otherwise owner/admin only.
  const isPublic = row.status === "live";
  if (!isPublic && !canViewTeaser(await currentUser(), row)) return new Response("Not found", { status: 404 });

  const bytes = await getStorage().get(`${row.key}/${variant}`);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": CONTENT_TYPES[variant as Variant],
      "cache-control": isPublic ? "public, max-age=3600" : "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
