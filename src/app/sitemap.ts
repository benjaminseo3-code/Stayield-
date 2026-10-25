import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

// Listings are for signed-in members, so only the public pages are listed.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/sign-up`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
