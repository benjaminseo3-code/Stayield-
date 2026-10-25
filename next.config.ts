import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy. Next.js needs inline scripts for hydration, so `script-src` allows
 * 'unsafe-inline' (a nonce-based policy is a possible later hardening). Everything else is locked
 * down: no framing, no plugins, same-origin connections, and forms may only post to us or Stripe.
 * Applied in production only; the dev server needs eval for hot reloading.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd
    ? [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "Content-Security-Policy", value: csp },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Native/embedded packages must not be bundled by the server compiler.
  serverExternalPackages: ["@electric-sql/pglite", "sharp", "mailparser", "mailauth", "pg"],
  poweredByHeader: false,
  // The migrator reads ./drizzle at runtime via process.cwd(); make sure it ships with every function.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
