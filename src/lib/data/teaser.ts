import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { properties, propertyPhotos } from "@/db/schema";
import { canViewTeaser, type Actor } from "@/lib/policies";

/** Exactly the fields that are public. Add a field here only if it is safe for anonymous visitors. */
export type Teaser = {
  id: string;
  slug: string;
  status: (typeof properties.$inferSelect)["status"];
  city: string;
  neighborhood: string;
  country: string;
  askingPriceMinor: number | null;
  currency: string;
  sqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  description: string;
  originalListingUrl: string | null;
  trustTier: (typeof properties.$inferSelect)["trustTier"];
  incomeBandLowMinor: number | null;
  incomeBandHighMinor: number | null;
  coverageStart: string | null;
  coverageEnd: string | null;
  isDemo: boolean;
  photos: { id: string; alt: string; width: number; height: number; isCover: boolean }[];
};

const teaserColumns = {
  id: properties.id,
  ownerId: properties.ownerId,
  slug: properties.publicSlug,
  status: properties.status,
  city: properties.city,
  neighborhood: properties.neighborhood,
  country: properties.country,
  askingPriceMinor: properties.askingPriceMinor,
  currency: properties.currency,
  sqm: properties.sqm,
  bedrooms: properties.bedrooms,
  bathrooms: properties.bathrooms,
  description: properties.description,
  originalListingUrl: properties.originalListingUrl,
  trustTier: properties.trustTier,
  incomeBandLowMinor: properties.incomeBandLowMinor,
  incomeBandHighMinor: properties.incomeBandHighMinor,
  coverageStart: properties.coverageStart,
  coverageEnd: properties.coverageEnd,
  isDemo: properties.isDemo,
};

async function photosFor(db: Db, propertyId: string): Promise<Teaser["photos"]> {
  return db
    .select({
      id: propertyPhotos.id,
      alt: propertyPhotos.alt,
      width: propertyPhotos.width,
      height: propertyPhotos.height,
      isCover: propertyPhotos.isCover,
    })
    .from(propertyPhotos)
    .where(eq(propertyPhotos.propertyId, propertyId))
    .orderBy(asc(propertyPhotos.position));
}

/** Returns the teaser, or null when the actor may not see it (indistinguishable from "not found"). */
export async function getTeaserBySlug(db: Db, actor: Actor, slug: string): Promise<Teaser | null> {
  const [row] = await db
    .select(teaserColumns)
    .from(properties)
    .where(eq(properties.publicSlug, slug))
    .limit(1);
  if (!row || !canViewTeaser(actor, row)) return null;
  const { ownerId: _ownerId, ...rest } = row;
  void _ownerId;
  return { ...rest, photos: await photosFor(db, row.id) };
}

export type ListFilters = {
  city?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  minBedrooms?: number;
  trustTier?: Teaser["trustTier"];
};

/** Live listings only. Photos are limited to the cover to keep list queries cheap. */
export async function listLiveTeasers(db: Db, filters: ListFilters = {}): Promise<Teaser[]> {
  const rows = await db
    .select(teaserColumns)
    .from(properties)
    .where(and(eq(properties.status, "live")))
    .orderBy(asc(properties.createdAt));
  const out: Teaser[] = [];
  for (const row of rows) {
    if (filters.city && !row.city.toLowerCase().includes(filters.city.toLowerCase())) continue;
    if (filters.minPriceMinor != null && (row.askingPriceMinor ?? 0) < filters.minPriceMinor) continue;
    if (filters.maxPriceMinor != null && (row.askingPriceMinor ?? Infinity) > filters.maxPriceMinor) continue;
    if (filters.minBedrooms != null && (row.bedrooms ?? 0) < filters.minBedrooms) continue;
    if (filters.trustTier && row.trustTier !== filters.trustTier) continue;
    const { ownerId: _ownerId, ...rest } = row;
    void _ownerId;
    out.push({ ...rest, photos: (await photosFor(db, row.id)).slice(0, 6) });
  }
  return out;
}
