import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, makeUser } from "../helpers/db";
import * as schema from "@/db/schema";
import type { Db } from "@/db/client";
import { getReport } from "@/lib/data/report";
import { getTeaserBySlug, listLiveTeasers } from "@/lib/data/teaser";
import {
  ForbiddenError,
  canUnlock,
  canViewRawSubmission,
  canViewReport,
  canViewReservationRows,
  canViewTeaser,
  type Actor,
} from "@/lib/policies";

const seller: Actor = { id: "seller", role: "seller" };
const buyer: Actor = { id: "buyer", role: "buyer" };
const stranger: Actor = { id: "stranger", role: "buyer" };
const admin: Actor = { id: "admin", role: "admin" };

describe("pure policies", () => {
  const live = { id: "p", ownerId: "seller", status: "live" as const };
  const draft = { id: "p", ownerId: "seller", status: "draft" as const };

  it("teaser: public when live, otherwise owner/admin only", () => {
    expect(canViewTeaser(null, live)).toBe(true);
    expect(canViewTeaser(null, draft)).toBe(false);
    expect(canViewTeaser(buyer, draft)).toBe(false);
    expect(canViewTeaser(seller, draft)).toBe(true);
    expect(canViewTeaser(admin, draft)).toBe(true);
  });

  it("report: anonymous never, buyer only with unlock, owner/admin always", () => {
    expect(canViewReport(null, live, true)).toBe(false);
    expect(canViewReport(buyer, live, false)).toBe(false);
    expect(canViewReport(buyer, live, true)).toBe(true);
    expect(canViewReport(seller, live, false)).toBe(true);
    expect(canViewReport(admin, draft, false)).toBe(true);
  });

  it("an unlock survives the seller unpublishing", () => {
    expect(canViewReport(buyer, { ...live, status: "unpublished" }, true)).toBe(true);
  });

  it("reservation rows and raw files are never available to buyers", () => {
    expect(canViewReservationRows(buyer, live)).toBe(false);
    expect(canViewReservationRows(null, live)).toBe(false);
    expect(canViewReservationRows(seller, live)).toBe(true);
    expect(canViewRawSubmission(seller)).toBe(false);
    expect(canViewRawSubmission(admin)).toBe(true);
  });

  it("unlock: needs a signed-in non-owner and a live listing", () => {
    expect(canUnlock(null, live)).toBe(false);
    expect(canUnlock(seller, live)).toBe(false);
    expect(canUnlock(buyer, live)).toBe(true);
    expect(canUnlock(buyer, draft)).toBe(false);
  });
});

describe("data layer (PGlite)", () => {
  let db: Db;
  let close: () => Promise<void>;
  let liveId: string;
  let draftId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    for (const [id, role] of [
      ["seller", "seller"],
      ["buyer", "buyer"],
      ["stranger", "buyer"],
      ["admin", "admin"],
    ] as const) {
      await makeUser(db, id, role);
    }
    const mk = async (slug: string, status: "live" | "draft") => {
      const [p] = await db
        .insert(schema.properties)
        .values({ ownerId: "seller", publicSlug: slug, status, city: "Lisbon", currency: "EUR", trustTier: "self_reported" })
        .returning();
      const [s] = await db
        .insert(schema.dataSubmissions)
        .values({ propertyId: p.id, source: "csv_upload", trustTier: "self_reported", status: "verified" })
        .returning();
      await db.insert(schema.monthlyAggregates).values({
        propertyId: p.id,
        submissionId: s.id,
        month: "2025-01-01",
        grossMinor: 300000,
        netMinor: 291000,
        bookedNights: 20,
        daysInMonth: 31,
        reservationsCount: 6,
        currency: "EUR",
      });
      return p.id;
    };
    liveId = await mk("live-one", "live");
    draftId = await mk("draft-one", "draft");
    const [pay] = await db
      .insert(schema.payments)
      .values({ buyerId: "buyer", propertyId: liveId, provider: "mock", amountMinor: 4900, currency: "USD", status: "succeeded" })
      .returning();
    await db.insert(schema.unlocks).values({ buyerId: "buyer", propertyId: liveId, paymentId: pay.id });
  });
  afterAll(async () => close());

  it("anonymous visitors see live teasers but not drafts, and no owner id leaks", async () => {
    expect((await getTeaserBySlug(db, null, "live-one"))?.city).toBe("Lisbon");
    expect(await getTeaserBySlug(db, null, "draft-one")).toBeNull();
    expect(await getTeaserBySlug(db, seller, "draft-one")).not.toBeNull();
    const t = await getTeaserBySlug(db, null, "live-one");
    expect(Object.keys(t ?? {})).not.toContain("ownerId");
    expect((await listLiveTeasers(db)).map((x) => x.slug)).toEqual(["live-one"]);
  });

  it("report: denied without unlock, granted with unlock, owner and admin", async () => {
    await expect(getReport(db, null, liveId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getReport(db, stranger, liveId)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await getReport(db, buyer, liveId)).rows).toHaveLength(1);
    expect((await getReport(db, seller, liveId)).rows).toHaveLength(1);
    expect((await getReport(db, admin, draftId)).rows).toHaveLength(1);
  });

  it("an unlock for one property grants nothing on another", async () => {
    await expect(getReport(db, buyer, draftId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("report rows expose aggregates only (no reservation or guest fields)", async () => {
    const r = await getReport(db, buyer, liveId);
    expect(Object.keys(r.rows[0]).sort()).toEqual(
      ["bookedNights", "currency", "daysInMonth", "grossMinor", "month", "netMinor", "reservationsCount"].sort(),
    );
  });

  it("the reservations table has no guest columns", () => {
    const cols = Object.keys(schema.reservations).join(",").toLowerCase();
    expect(cols).not.toMatch(/guest|name|email|phone/);
  });
});
