import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, makeUser } from "../helpers/db";
import * as schema from "@/db/schema";
import type { Db } from "@/db/client";
import { getReport } from "@/lib/data/report";
import { getListingBySlug, listLiveListings } from "@/lib/data/listings";
import {
  ForbiddenError,
  canDecideRequest,
  canRequestAccess,
  canViewFull,
  canViewInvestorContact,
  canViewInvestorProfile,
  canViewRawSubmission,
  canViewReservationRows,
  canViewTeaser,
  type Actor,
} from "@/lib/policies";

const seller: Actor = { id: "seller", role: "seller" };
const investor: Actor = { id: "investor", role: "buyer" };
const stranger: Actor = { id: "stranger", role: "buyer" };
const admin: Actor = { id: "admin", role: "admin" };

describe("pure policies", () => {
  const live = { id: "p", ownerId: "seller", status: "live" as const };
  const draft = { id: "p", ownerId: "seller", status: "draft" as const };

  it("the locked card is public when live; otherwise owner/admin only", () => {
    expect(canViewTeaser(null, live)).toBe(true);
    expect(canViewTeaser(null, draft)).toBe(false);
    expect(canViewTeaser(investor, draft)).toBe(false);
    expect(canViewTeaser(seller, draft)).toBe(true);
    expect(canViewTeaser(admin, draft)).toBe(true);
  });

  it("full view: anonymous never, investor only when approved and live, owner/admin always", () => {
    expect(canViewFull(null, live, true)).toBe(false);
    expect(canViewFull(investor, live, false)).toBe(false);
    expect(canViewFull(investor, live, true)).toBe(true);
    expect(canViewFull(investor, { ...live, status: "unpublished" }, true)).toBe(false);
    expect(canViewFull(seller, draft, false)).toBe(true);
    expect(canViewFull(admin, draft, false)).toBe(true);
  });

  it("requesting access needs a submitted profile, a live listing, no active request, and the cool-down", () => {
    const ok = { profileStatus: "submitted" as const, hasActiveRequest: false };
    expect(canRequestAccess(investor, live, ok)).toBe(true);
    expect(canRequestAccess(null, live, ok)).toBe(false);
    expect(canRequestAccess(seller, live, ok)).toBe(false);
    expect(canRequestAccess(admin, live, ok)).toBe(false);
    expect(canRequestAccess(investor, draft, ok)).toBe(false);
    expect(canRequestAccess(investor, live, { ...ok, profileStatus: null })).toBe(false);
    expect(canRequestAccess(investor, live, { ...ok, profileStatus: "draft" })).toBe(false);
    expect(canRequestAccess(investor, live, { ...ok, profileStatus: "suspended" })).toBe(false);
    expect(canRequestAccess(investor, live, { ...ok, profileStatus: "verified" })).toBe(true);
    expect(canRequestAccess(investor, live, { ...ok, hasActiveRequest: true })).toBe(false);
    const now = Date.now();
    expect(canRequestAccess(investor, live, { ...ok, lastDeclinedAt: new Date(now - 2 * 86_400_000) }, now)).toBe(false);
    expect(canRequestAccess(investor, live, { ...ok, lastDeclinedAt: new Date(now - 8 * 86_400_000) }, now)).toBe(true);
    expect(canRequestAccess({ id: "seller", role: "buyer" }, live, ok)).toBe(false); // owner cannot request their own
  });

  it("only the owner decides; profiles and contact details are gated", () => {
    expect(canDecideRequest(seller, live)).toBe(true);
    expect(canDecideRequest(investor, live)).toBe(false);
    expect(canDecideRequest(admin, live)).toBe(false);
    expect(canViewInvestorProfile(investor, "investor", false)).toBe(true);
    expect(canViewInvestorProfile(seller, "investor", true)).toBe(true);
    expect(canViewInvestorProfile(seller, "investor", false)).toBe(false);
    expect(canViewInvestorProfile(stranger, "investor", false)).toBe(false);
    expect(canViewInvestorContact(seller, "investor", false)).toBe(false); // not approved yet
    expect(canViewInvestorContact(seller, "investor", true)).toBe(true);
    expect(canViewInvestorContact(investor, "investor", false)).toBe(true);
  });

  it("reservation rows and raw files are never available to investors", () => {
    expect(canViewReservationRows(investor, live)).toBe(false);
    expect(canViewReservationRows(null, live)).toBe(false);
    expect(canViewReservationRows(seller, live)).toBe(true);
    expect(canViewRawSubmission(seller)).toBe(false);
    expect(canViewRawSubmission(admin)).toBe(true);
  });
});

describe("data layer (PGlite): what each viewer actually receives", () => {
  let db: Db;
  let close: () => Promise<void>;
  let liveId: string;
  let draftId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    for (const [id, role] of [["seller", "seller"], ["investor", "buyer"], ["stranger", "buyer"], ["admin", "admin"]] as const) await makeUser(db, id, role);
    const mk = async (slug: string, status: "live" | "draft") => {
      const [p] = await db
        .insert(schema.properties)
        .values({
          ownerId: "seller", publicSlug: slug, status, city: "Lisbon", country: "PT", neighborhood: "Alfama-SECRET", currency: "EUR", trustTier: "self_reported",
          askingPriceMinor: 123456700, sqm: 61, bedrooms: 2, bathrooms: 1, description: "SECRET-DESCRIPTION", originalListingUrl: "https://example.com/secret",
          incomeBandLowMinor: 3000000, incomeBandHighMinor: 3500000, coverageStart: "2025-01-01", coverageEnd: "2025-12-31",
        })
        .returning();
      await db.insert(schema.propertyPhotos).values({ propertyId: p.id, storageKey: `photos/${p.id}/x`, position: 0, isCover: true, width: 10, height: 10, alt: "SECRET-ALT" });
      const [s] = await db.insert(schema.dataSubmissions).values({ propertyId: p.id, source: "csv_upload", trustTier: "self_reported", status: "verified" }).returning();
      await db.insert(schema.monthlyAggregates).values({ propertyId: p.id, submissionId: s.id, month: "2025-01-01", grossMinor: 300000, netMinor: 291000, bookedNights: 20, daysInMonth: 31, reservationsCount: 6, currency: "EUR" });
      return p.id;
    };
    liveId = await mk("live-one", "live");
    draftId = await mk("draft-one", "draft");
    await db.insert(schema.accessRequests).values({ propertyId: liveId, investorId: "investor", status: "approved" });
  });
  afterAll(async () => close());

  it("a locked listing does not contain the secrets at all, not even as JSON", async () => {
    for (const viewer of [null, stranger, { id: "seller2", role: "seller" as const }]) {
      const l = await getListingBySlug(db, viewer, "live-one");
      expect(l?.level).toBe("locked");
      const json = JSON.stringify(l);
      for (const secret of ["SECRET", "123456700", "secret", "3000000", "3500000", "2025-01-01"]) expect(json).not.toContain(secret);
      expect(l).toMatchObject({ city: "Lisbon", country: "PT", bedrooms: 2, askingPriceMinor: null, neighborhood: null, description: null, incomeBandLowMinor: null });
      expect(l?.photos).toHaveLength(1);
      expect(l?.photos[0].alt).toBe("");
    }
  });

  it("an approved investor, the owner and an admin get the full listing", async () => {
    for (const viewer of [investor, seller, admin]) {
      const l = await getListingBySlug(db, viewer, "live-one");
      expect(l?.level).toBe("full");
      expect(l).toMatchObject({ askingPriceMinor: 123456700, neighborhood: "Alfama-SECRET", description: "SECRET-DESCRIPTION" });
    }
  });

  it("unlisted listings are invisible, even to an approved investor", async () => {
    expect(await getListingBySlug(db, null, "draft-one")).toBeNull();
    expect(await getListingBySlug(db, investor, "draft-one")).toBeNull();
    expect(await getListingBySlug(db, seller, "draft-one")).not.toBeNull();
    expect((await listLiveListings(db, null)).map((x) => x.slug)).toEqual(["live-one"]);
  });

  it("the list shapes each card for its viewer", async () => {
    expect((await listLiveListings(db, stranger))[0].level).toBe("locked");
    expect((await listLiveListings(db, investor))[0].level).toBe("full");
  });

  it("the report: only the approved investor, the owner and admin; everyone else is refused", async () => {
    await expect(getReport(db, null, liveId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getReport(db, stranger, liveId)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await getReport(db, investor, liveId)).rows).toHaveLength(1);
    expect((await getReport(db, seller, liveId)).rows).toHaveLength(1);
    expect((await getReport(db, admin, draftId)).rows).toHaveLength(1);
    await expect(getReport(db, investor, draftId)).rejects.toBeInstanceOf(ForbiddenError); // approval is per listing
  });

  it("report rows expose aggregates only (no reservation or guest fields)", async () => {
    const r = await getReport(db, investor, liveId);
    expect(Object.keys(r.rows[0]).sort()).toEqual(["bookedNights", "currency", "daysInMonth", "grossMinor", "month", "netMinor", "reservationsCount"].sort());
    expect(Object.keys(schema.reservations).join(",").toLowerCase()).not.toMatch(/guest|name|email|phone/);
  });
});
