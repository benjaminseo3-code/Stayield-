import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/embedded packages must not be bundled by the server compiler.
  serverExternalPackages: ["@electric-sql/pglite", "sharp", "mailparser", "mailauth", "pg"],
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default nextConfig;
