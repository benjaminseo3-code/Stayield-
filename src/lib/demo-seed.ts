/**
 * Seeds three clearly-marked DEMO properties with SYNTHETIC income data.
 * Nothing here comes from a real booking platform.
 */
import { createHash } from "node:crypto";
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
import { and, count } from "drizzle-orm";
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

/**
 * Stable ids for demo rows. A serverless demo runs several instances, each seeding its own copy; with
 * deterministic ids a page rendered by one instance can load its photos from another.
 */
const demoUuid = (seed: string) => {
  const h = createHash("sha1").update(`stayield-demo:${seed}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** A user; with `password` they can sign in with Better Auth's credential account, otherwise the account cannot log in. */
async function upsertUser(db: Db, u: { id: string; name: string; email: string; role: "seller" | "buyer" | "admin"; password?: string }) {
  await db.insert(schema.users).values({ id: u.id, name: u.name, email: u.email, emailVerified: true, role: u.role }).onConflictDoNothing();
  if (u.password) {
    await db
      .insert(schema.accounts)
      .values({ id: `${u.id}-credential`, accountId: u.id, providerId: "credential", userId: u.id, password: await hashPassword(u.password) })
      .onConflictDoNothing();
  }
  await db.insert(schema.verifiedEmails).values({ userId: u.id, email: u.email, verifiedAt: new Date() }).onConflictDoNothing();
}

const PROFILE_BASE = {
  status: "verified" as const,
  submittedAt: new Date(),
  reviewedAt: new Date(),
  reviewedBy: "seed",
};

/**
 * Seeds demo users, three clearly-marked DEMO properties with SYNTHETIC data, and a few access
 * requests so every screen has something to show. By default it does nothing when the demo already
 * exists; `force` rebuilds the demo rows.
 */
export async function seedDemo(db: Db, storageAdapter: StorageAdapter, opts: { force?: boolean } = {}): Promise<void> {
  const [existing] = await db.select({ n: count() }).from(schema.properties).where(and(eq(schema.properties.isDemo, true)));
  if (!opts.force && Number(existing?.n ?? 0) >= DEMOS.length) return;

  await upsertUser(db, { id: DEMO_SELLER_ID, name: "Demo Owner", email: DEMO_SELLER_EMAIL, role: "seller", password: DEMO_PASSWORD });
  await upsertUser(db, { id: DEMO_BUYER_ID, name: "Demo Investor", email: DEMO_BUYER_EMAIL, role: "buyer", password: DEMO_PASSWORD });
  // Extra investors who only exist to fill the owner's inbox; they have no password and cannot log in.
  await upsertUser(db, { id: "demo-investor-rossi", name: "Daniele Rossi", email: "rossi@stayield.demo", role: "buyer" });
  await upsertUser(db, { id: "demo-investor-levy", name: "Noa Levy", email: "levy@stayield.demo", role: "buyer" });

  // Optional admin from the environment (never hard-coded or documented).
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    await upsertUser(db, { id: "admin-user", name: "Admin", email: process.env.ADMIN_EMAIL.toLowerCase(), role: "admin", password: process.env.ADMIN_PASSWORD });
  }

  // Rebuild: remove previous demo properties (cascades to photos, submissions, aggregates, requests) and files.
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
        id: demoUuid(d.slug),
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
      const res = await addPhoto(db, storage, prop.id, await demoImage(idx, v), { id: demoUuid(`${d.slug}:photo:${v}`) });
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


  // ---- Investor profiles and requests -------------------------------------------------------
  const profiles = [
    {
      userId: DEMO_BUYER_ID, fullName: "Demo Investor", phone: "+972 50 000 0000", investorType: "individual" as const, entityName: "", country: "Israel",
      budgetMin: 300000, budgetMax: 600000, currency: "EUR", targetCountries: "Portugal, Greece", experience: "one_to_three" as const, financing: "mixed" as const, timeline: "three_months" as const,
      about: "Looking for a second short-term-rental apartment in Southern Europe. I have run one Airbnb unit for three years and want verified numbers before I decide.", website: "",
    },
    {
      userId: "demo-investor-rossi", fullName: "Daniele Rossi", phone: "+39 02 000 0000", investorType: "family_office" as const, entityName: "Rossi Family Office", country: "Italy",
      budgetMin: 1000000, budgetMax: 2500000, currency: "USD", targetCountries: "Israel, Portugal", experience: "ten_plus" as const, financing: "cash" as const, timeline: "now" as const,
      about: "We hold a portfolio of 14 income-producing apartments and are adding two more this year. Cash buyer, can move quickly once the numbers check out.", website: "https://example.com/rossi",
    },
    {
      userId: "demo-investor-levy", fullName: "Noa Levy", phone: "+972 52 000 0000", investorType: "company" as const, entityName: "Levy Stays Ltd", country: "Israel",
      budgetMin: 200000, budgetMax: 450000, currency: "EUR", targetCountries: "Greece", experience: "four_to_ten" as const, financing: "mortgage" as const, timeline: "six_to_twelve_months" as const,
      about: "Small operator running seven short-term rentals in Tel Aviv. Interested in Athens for the strong summer season and a lower entry price.", website: "",
    },
  ];
  for (const pr of profiles) await db.insert(schema.investorProfiles).values({ ...PROFILE_BASE, ...pr }).onConflictDoUpdate({ target: schema.investorProfiles.userId, set: { ...PROFILE_BASE, ...pr } });

  const propBySlug = new Map((await db.select({ id: schema.properties.id, slug: schema.properties.publicSlug }).from(schema.properties).where(eq(schema.properties.isDemo, true))).map((r) => [r.slug, r.id]));
  const mk = async (slug: string, investorId: string, status: "pending" | "approved" | "info_requested", thread: { by: "investor" | "owner"; kind: "request" | "question" | "answer" | "note"; body: string }[]) => {
    const propertyId = propBySlug.get(slug)!;
    const [r] = await db
      .insert(schema.accessRequests)
      .values({ propertyId, investorId, status, decidedAt: status === "approved" ? new Date() : null, sellerUnseen: status === "pending", investorUnseen: status !== "pending" })
      .returning({ id: schema.accessRequests.id });
    for (const [i, m] of thread.entries()) {
      await db.insert(schema.requestMessages).values({
        requestId: r.id, authorId: m.by === "investor" ? investorId : DEMO_SELLER_ID, authorRole: m.by, kind: m.kind, body: m.body,
        createdAt: new Date(Date.now() - (thread.length - i) * 3600_000),
      });
    }
  };
  // The demo investor: already approved for Lisbon (sees it in full), waiting on Tel Aviv, nothing yet for Athens.
  await mk("demo-lisbon-alfama", DEMO_BUYER_ID, "approved", [
    { by: "investor", kind: "request", body: "Hello, I would like to see the full numbers for this apartment. I run a similar unit and can visit in November." },
    { by: "owner", kind: "note", body: "Welcome. Happy to share the full report and details." },
  ]);
  await mk("demo-tel-aviv-florentin", DEMO_BUYER_ID, "pending", [{ by: "investor", kind: "request", body: "Interested in the Florentin apartment. Could you share the full report?" }]);
  // The owner's inbox: a family office asking about Tel Aviv, and an operator who was asked a question about Lisbon.
  await mk("demo-tel-aviv-florentin", "demo-investor-rossi", "pending", [{ by: "investor", kind: "request", body: "We are a cash buyer and would like the full report and the building details before we fly in." }]);
  await mk("demo-lisbon-alfama", "demo-investor-levy", "info_requested", [
    { by: "investor", kind: "request", body: "Please share the full report for Alfama." },
    { by: "owner", kind: "question", body: "Thanks. Could you tell me whether you plan to run it yourself or through a manager, and your expected closing date?" },
  ]);
}
