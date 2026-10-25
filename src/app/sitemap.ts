import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appUrl } from "@/lib/app-url";
import { properties } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const live = await (await getDb()).select({ slug: properties.publicSlug, updatedAt: properties.updatedAt }).from(properties).where(eq(properties.status, "live"));
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/properties`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/sell`, changeFrequency: "monthly", priority: 0.5 },
    ...live.map((p) => ({ url: `${base}/properties/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
