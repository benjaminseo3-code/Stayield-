/**
 * Seeds three clearly-marked DEMO properties with SYNTHETIC income data.
 * Nothing here comes from a real booking platform.
 */
import { eq } from "drizzle-orm";
import { closeDb, getDb, schema } from "../src/db/client";
import { incomeBand } from "../src/lib/metrics/band";
import { randomToken } from "../src/lib/ids";

const SELLER_ID = "demo-seller";

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

async function main() {
  const db = await getDb();

  await db
    .insert(schema.users)
    .values({
      id: SELLER_ID,
      name: "Demo Seller",
      email: "demo-seller@stayield.test",
      emailVerified: true,
      role: "seller",
    })
    .onConflictDoNothing();

  // Reseed: remove previous demo properties (cascades to photos, submissions, aggregates).
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

  console.log(`Seeded ${DEMOS.length} demo properties (synthetic data).`);
}

main()
  .then(() => closeDb())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
