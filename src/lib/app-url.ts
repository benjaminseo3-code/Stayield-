/** Public base URL: APP_URL, else Vercel's production hostname, else localhost. No trailing slash. */
export function appUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const isDemoMode = () => process.env.DEMO_MODE === "true";
