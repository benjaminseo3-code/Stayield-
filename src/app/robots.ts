import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    rules: [{ userAgent: "*", allow: ["/", "/properties"], disallow: ["/api/", "/admin", "/account", "/sell", "/checkout", "/sign-in", "/dev"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
