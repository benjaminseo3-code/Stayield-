/**
 * Seeds three clearly-marked DEMO properties with SYNTHETIC income data.
 * Nothing here comes from a real booking platform.
 */
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { addPhoto } from "@/lib/photo-service";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { hashPassword } from "better-auth/crypto";
import type { StorageAdapter } from "@/ports/storage";
import { incomeBand } from "@/lib/metrics/band";
import { randomToken } from "@/lib/ids";

import { DEMO_BUYER_EMAIL, DEMO_BUYER_ID, DEMO_PASSWORD, DEMO_SELLER_EMAIL, DEMO_SELLER_ID } from "@/lib/demo-seed-constants";
const SELLER_ID = DEMO_SELLER_ID;

const PALETTES = [
  ["#f4d9b5", "#e8a87c", "#0b1c30"],
  ["#bfe3f2", "#7fb6d6", "#12304f"],
  ["#f2c6c0", "#d98880", "#14213a"],
];

/** A clearly fake illustration (skyline + "Demo photo"), so seeded listings never look like real photos. */
async function demoImage(paletteIdx: number, variant: number): Promise<Buffer> {
  const [sky, sun, ink] = PALETTES[paletteIdx % PALETTES.length];
  const rects = Array.from({ length: 9 }, (_, i) => {
    const w = 120 + ((i * 53 + variant * 31) % 90);
    const h = 380 + ((i * 97 + variant * 61) % 420);
    const x = i * 175 - 20;
    const windows = Array.from({ length: 8 }, (_, k) => `<rect x="${x + 22 + (k % 2) * 48}" y="${1200 - h + 30 + Math.floor(k / 2) * 80}" width="26" height="34" rx="4" fill="#fff6d6" opacity="0.85"/>`).join("");
    return `<rect x="${x}" y="${1200 - h}" width="${w}" height="${h}" fill="${ink}" opacity="${0.78 + (i % 3) * 0.08}"/>${windows}`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${sun}"/></linearGradient></defs><rect width="1600" height="1200" fill="url(#g)"/><circle cx="${300 + variant * 260}" cy="260" r="110" fill="#fff" opacity="0.55"/>${rects}<text x="800" y="1130" font-family="sans-serif" font-size="54" fill="#fff" text-anchor="middle" opacity="0.9">Demo photo ${variant + 1}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

type Demo = {
  slug: string;
  city: string;
  neighborhood: string;
  country: string;
  price: number; // major units
  currency: string;
  sqm: number;
  bedrooms: number;
  bathrooms: number;
  description: string;
  trust: "signed_email" | "self_reported";
  /** Average nightly rate, major units */
  adr: number;
  /** Seasonality multipliers by month (Jan..Dec) for booked nights ratio */
  season: number[];
  base: number;
};

const DEMOS: Demo[] = [
  {
    slug: "demo-lisbon-alfama",
    city: "Lisbon",
    neighborhood: "Alfama",
    country: "PT",
    price: 420000,
    currency: "EUR",
    sqm: 62,
    bedrooms: 2,
    bathrooms: 1,
    description:
      "Demo listing. Bright two-bedroom a few minutes from the river, operated as a short-term rental since 2022. All figures are synthetic.",
    trust: "signed_email",
    adr: 138,
    season: [0.55, 0.6, 0.7, 0.8, 0.88, 0.95, 1.05, 1.1, 0.95, 0.82, 0.62, 0.58],
    base: 0.68,
  },
  {
    slug: "demo-tel-aviv-florentin",
    city: "Tel Aviv",
    neighborhood: "Florentin",
    country: "IL",
    price: 1950000,
    currency: "USD",
    sqm: 48,
    bedrooms: 1,
    bathrooms: 1,
    description:
      "Demo listing. Renovated one-bedroom in a walkable neighbourhood with steady year-round demand. All figures are synthetic.",
    trust: "self_reported",
    adr: 175,
    season: [0.8, 0.82, 0.9, 1.0, 1.05, 1.0, 1.05, 1.08, 1.0, 0.95, 0.85, 0.8],
    base: 0.74,
  },
  {
    slug: "demo-athens-koukaki",
    city: "Athens",
    neighborhood: "Koukaki",
    country: "GR",
    price: 285000,
    currency: "EUR",
    sqm: 55,
    bedrooms: 1,
    bathrooms: 1,
    description:
      "Demo listing. Top-floor one-bedroom with an Acropolis view, strong summer season. All figures are synthetic.",
    trust: "signed_email",
    adr: 112,
    season: [0.45, 0.5, 0.65, 0.85, 1.0, 1.15, 1.25, 1.25, 1.1, 0.9, 0.55, 0.5],
    base: 0.62,
  },
];

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Credentials login for a demo user (Better Auth "credential" account). Only usable when DEMO_MODE=true. */
async function upsertDemoUser(db: Db, u: { id: string; name: string; email: string; role: "seller" | "buyer" }) {
  await db.insert(schema.users).values({ id: u.id, name: u.name, email: u.email, emailVerified: true, role: u.role }).onConflictDoNothing();
  await db
    .insert(schema.accounts)
    .values({ id: `${u.id}-credential`, accountId: u.id, providerId: "credential", userId: u.id, password: await hashPassword(DEMO_PASSWORD) })
    .onConflictDoNothing();
  await db.insert(schema.verifiedEmails).values({ userId: u.id, email: u.email, verifiedAt: new Date() }).onConflictDoNothing();
}

/** Seeds demo users and three clearly-marked DEMO properties with SYNTHETIC data. Idempotent (reseeds the demo listings). */
export async function seedDemo(db: Db, storageAdapter: StorageAdapter): Promise<void> {

  await upsertDemoUser(db, { id: DEMO_SELLER_ID, name: "Demo Seller", email: DEMO_SELLER_EMAIL, role: "seller" });
  await upsertDemoUser(db, { id: DEMO_BUYER_ID, name: "Demo Buyer", email: DEMO_BUYER_EMAIL, role: "buyer" });

  // Reseed: remove previous demo properties (cascades to photos, submissions, aggregates) and their files.
  const old = await db.select({ id: schema.properties.id }).from(schema.properties).where(eq(schema.properties.isDemo, true));
    for (const o of old) await storageAdapter.deletePrefix(`photos/${o.id}`);
  await db.delete(schema.properties).where(eq(schema.properties.isDemo, true));

  const now = new Date();
  // 24 complete months ending last month.
  const months: { y: number; m: number }[] = [];
  for (let i = 24; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  }
  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];
  const iso = (y: number, m: number, d = 1) =>
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  for (const [idx, d] of DEMOS.entries()) {
    const [prop] = await db
      .insert(schema.properties)
      .values({
        ownerId: SELLER_ID,
        status: "live",
        publicSlug: d.slug,
        city: d.city,
        neighborhood: d.neighborhood,
        country: d.country,
        askingPriceMinor: d.price * 100,
        currency: d.currency,
        sqm: d.sqm,
        bedrooms: d.bedrooms,
        bathrooms: d.bathrooms,
        description: d.description,
        isDemo: true,
        trustTier: d.trust,
        coverageStart: iso(firstMonth.y, firstMonth.m),
        coverageEnd: iso(lastMonth.y, lastMonth.m, daysIn(lastMonth.y, lastMonth.m)),
        publishedAt: new Date(),
      })
      .returning();

    const [sub] = await db
      .insert(schema.dataSubmissions)
      .values({
        propertyId: prop.id,
        source: d.trust === "signed_email" ? "signed_email" : "csv_upload",
        trustTier: d.trust,
        status: "verified",
        verificationResult: {
          checks: [{ code: "demo_data", level: "pass" }],
          outcome: "live",
          verifiedAt: new Date().toISOString(),
        },
      })
      .returning();

    await db.insert(schema.inboundAddresses).values({ propertyId: prop.id, token: randomToken(10) });

    const storage = storageAdapter;
    await storage.deletePrefix(`photos/${prop.id}`);
    for (let v = 0; v < 5; v++) {
      const res = await addPhoto(db, storage, prop.id, await demoImage(idx, v));
      if (!res.ok) throw new Error(`demo photo failed: ${res.error}`);
    }
    await db
      .update(schema.propertyPhotos)
      .set({ alt: `Illustration of a skyline, demo photo for ${d.city}` })
      .where(eq(schema.propertyPhotos.propertyId, prop.id));

    const aggregates = months.map(({ y, m }, i) => {
      const dim = daysIn(y, m);
      // Deterministic pseudo-noise so reseeding is stable.
      const noise = 1 + Math.sin((i + 1) * (idx + 2) * 1.7) * 0.06;
      const growth = 1 + (i / months.length) * 0.08;
      const ratio = Math.min(0.97, d.base * d.season[m] * noise * growth);
      const bookedNights = Math.round(dim * ratio);
      const rate = d.adr * (0.9 + 0.2 * d.season[m]);
      const gross = Math.round(bookedNights * rate * 100);
      const net = Math.round(gross * 0.97); // host service fee ~3%
      return {
        propertyId: prop.id,
        submissionId: sub.id,
        month: iso(y, m),
        grossMinor: gross,
        netMinor: net,
        bookedNights,
        daysInMonth: dim,
        reservationsCount: Math.max(1, Math.round(bookedNights / 3.4)),
        currency: d.currency,
      };
    });
    await db.insert(schema.monthlyAggregates).values(aggregates);

    const t12 = aggregates.slice(-12).reduce((s, a) => s + a.grossMinor, 0);
    const band = incomeBand(t12);
    await db
      .update(schema.properties)
      .set({
        activeSubmissionId: sub.id,
        incomeBandLowMinor: band.low,
        incomeBandHighMinor: band.high,
      })
      .where(eq(schema.properties.id, prop.id));
  }

}
