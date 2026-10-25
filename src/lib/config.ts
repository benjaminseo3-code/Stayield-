import { createHmac } from "node:crypto";
import { appUrl } from "@/lib/app-url";
import { parseTrustedDomains } from "@/lib/ingest/email";

/** Environment-derived settings. Read lazily so tests can set env vars first. */
export const config = {
  appUrl: () => appUrl(),
  inboundDomain: () => (process.env.INBOUND_DOMAIN ?? "inbound.localhost").toLowerCase(),
  trustedSenderDomains: () => parseTrustedDomains(process.env.TRUSTED_SENDER_DOMAINS),
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
