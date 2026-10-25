import { createHmac } from "node:crypto";
import { parseTrustedDomains } from "@/lib/ingest/email";

/** Environment-derived settings. Read lazily so tests can set env vars first. */
export const config = {
  appUrl: () => process.env.APP_URL ?? "http://localhost:3000",
  inboundDomain: () => (process.env.INBOUND_DOMAIN ?? "inbound.localhost").toLowerCase(),
  trustedSenderDomains: () => parseTrustedDomains(process.env.TRUSTED_SENDER_DOMAINS),
  unlockPriceMinor: () => Number(process.env.UNLOCK_PRICE_MINOR ?? 4900),
  unlockCurrency: () => (process.env.UNLOCK_CURRENCY ?? "USD").toUpperCase(),
  /** Key for one-way hashing of confirmation codes. Derived from the auth secret; never stored. */
  hashKey: () => {
    const secret = process.env.CONFIRMATION_HASH_KEY ?? process.env.BETTER_AUTH_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === "production") throw new Error("BETTER_AUTH_SECRET must be set in production");
      return "dev-only-confirmation-hash-key";
    }
    return createHmac("sha256", secret).update("stayield/confirmation-hash").digest("hex");
  },
};
