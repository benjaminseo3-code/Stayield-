import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

export default function robots(): MetadataRoute.Robots {
  const base = appUrl();
  return {
    rules: [{ userAgent: "*", allow: ["/", "/properties"], disallow: ["/api/", "/admin", "/account", "/sell", "/requests", "/sign-in", "/sign-up"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
