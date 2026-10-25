import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { properties, propertyPhotos } from "@/db/schema";
import { approvedPropertyIds } from "@/lib/access";
import { canViewFull, canViewTeaser, type Actor } from "@/lib/policies";

export type ListingPhoto = { id: string; alt: string; width: number; height: number; isCover: boolean };

/**
 * A listing as one specific viewer may see it.
 *  - `locked` (everyone by default): only coarse facts. Price, neighborhood, size, description,
 *    income and the real photos are NOT in this object at all, so they cannot leak through the page.
 *  - `full` (owner, admin, or an investor with approved access): everything.
 */
export type Listing = {
  id: string;
  slug: string;
  level: "locked" | "full";
  status: (typeof properties.$inferSelect)["status"];
  city: string;
  country: string;
  bedrooms: number | null;
  bathrooms: number | null;
  trustTier: (typeof properties.$inferSelect)["trustTier"];
  isDemo: boolean;
  /** Locked viewers get ids only; the photo route serves them a blurred variant. */
  photos: ListingPhoto[];
  // ---- full only (null while locked) ----
  neighborhood: string | null;
  askingPriceMinor: number | null;
  currency: string;
  sqm: number | null;
  description: string | null;
  originalListingUrl: string | null;
  incomeBandLowMinor: number | null;
  incomeBandHighMinor: number | null;
  coverageStart: string | null;
  coverageEnd: string | null;
};

const columns = {
  id: properties.id,
  ownerId: properties.ownerId,
  slug: properties.publicSlug,
  status: properties.status,
  city: properties.city,
  country: properties.country,
  bedrooms: properties.bedrooms,
  bathrooms: properties.bathrooms,
  trustTier: properties.trustTier,
  isDemo: properties.isDemo,
  neighborhood: properties.neighborhood,
  askingPriceMinor: properties.askingPriceMinor,
  currency: properties.currency,
  sqm: properties.sqm,
  description: properties.description,
  originalListingUrl: properties.originalListingUrl,
  incomeBandLowMinor: properties.incomeBandLowMinor,
  incomeBandHighMinor: properties.incomeBandHighMinor,
  coverageStart: properties.coverageStart,
  coverageEnd: properties.coverageEnd,
};
type Row = {
  [K in keyof typeof columns]: (typeof columns)[K] extends { _: { data: infer D } } ? D : never;
};

function shape(row: Row, photos: ListingPhoto[], full: boolean): Listing {
  const base = {
    id: row.id,
    slug: row.slug,
    status: row.status,
    city: row.city,
    country: row.country,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    trustTier: row.trustTier,
    isDemo: row.isDemo,
    currency: row.currency,
  };
  if (!full) {
    return {
      ...base,
      level: "locked",
      // No alt text while locked: it could describe the apartment.
      photos: photos.map((p) => ({ ...p, alt: "" })),
      neighborhood: null,
      askingPriceMinor: null,
      sqm: null,
      description: null,
      originalListingUrl: null,
      incomeBandLowMinor: null,
      incomeBandHighMinor: null,
      coverageStart: null,
      coverageEnd: null,
    };
  }
  return {
    ...base,
    level: "full",
    photos,
    neighborhood: row.neighborhood,
    askingPriceMinor: row.askingPriceMinor,
    sqm: row.sqm,
    description: row.description,
    originalListingUrl: row.originalListingUrl,
    incomeBandLowMinor: row.incomeBandLowMinor,
    incomeBandHighMinor: row.incomeBandHighMinor,
    coverageStart: row.coverageStart,
    coverageEnd: row.coverageEnd,
  };
}

async function photosByProperty(db: Db, ids: string[]): Promise<Map<string, ListingPhoto[]>> {
  const map = new Map<string, ListingPhoto[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ propertyId: propertyPhotos.propertyId, id: propertyPhotos.id, alt: propertyPhotos.alt, width: propertyPhotos.width, height: propertyPhotos.height, isCover: propertyPhotos.isCover })
    .from(propertyPhotos)
    .where(inArray(propertyPhotos.propertyId, ids))
    .orderBy(asc(propertyPhotos.position));
  for (const r of rows) {
    const list = map.get(r.propertyId) ?? [];
    list.push({ id: r.id, alt: r.alt, width: r.width, height: r.height, isCover: r.isCover });
    map.set(r.propertyId, list);
  }
  return map;
}

/** The listing for this viewer, or null when they may not even see its locked card. */
export async function getListingBySlug(db: Db, actor: Actor, slug: string): Promise<Listing | null> {
  const [row] = await db.select(columns).from(properties).where(eq(properties.publicSlug, slug)).limit(1);
  if (!row || !canViewTeaser(actor, row)) return null;
  const approved = actor ? await approvedPropertyIds(db, actor.id) : new Set<string>();
  const full = canViewFull(actor, row, approved.has(row.id));
  const photos = (await photosByProperty(db, [row.id])).get(row.id) ?? [];
  return shape(row as Row, photos, full);
}

export type ListFilters = { city?: string; country?: string; minBedrooms?: number; trustTier?: Listing["trustTier"] };

/** Live listings, each shaped for this viewer (approved ones come back in full). */
export async function listLiveListings(db: Db, actor: Actor, filters: ListFilters = {}): Promise<Listing[]> {
  const rows = await db.select(columns).from(properties).where(and(eq(properties.status, "live"))).orderBy(asc(properties.createdAt));
  const approved = actor ? await approvedPropertyIds(db, actor.id) : new Set<string>();
  const matching = rows.filter((r) => {
    if (filters.city && !r.city.toLowerCase().includes(filters.city.toLowerCase())) return false;
    if (filters.country && r.country.toLowerCase() !== filters.country.toLowerCase()) return false;
    if (filters.minBedrooms != null && (r.bedrooms ?? 0) < filters.minBedrooms) return false;
    if (filters.trustTier && r.trustTier !== filters.trustTier) return false;
    return true;
  });
  const photos = await photosByProperty(db, matching.map((r) => r.id));
  return matching.map((r) => shape(r as Row, (photos.get(r.id) ?? []).slice(0, 6), canViewFull(actor, r, approved.has(r.id))));
}
