import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, makeUser } from "../helpers/db";
import * as s from "@/db/schema";
import type { Db } from "@/db/client";
import { createPendingPayment, settlePayment } from "@/lib/payments";
import { getReport } from "@/lib/data/report";

let db: Db;
let close: () => Promise<void>;
let liveId: string;
let draftId: string;
const buyer = { id: "buyer", role: "buyer" as const };
const seller = { id: "seller", role: "seller" as const };

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await makeUser(db, "seller", "seller");
  await makeUser(db, "buyer", "buyer");
  const mk = async (slug: string, status: "live" | "draft") => {
    const [p] = await db.insert(s.properties).values({ ownerId: "seller", publicSlug: slug, status, trustTier: "self_reported" }).returning();
    const [sub] = await db.insert(s.dataSubmissions).values({ propertyId: p.id, source: "csv_upload", trustTier: "self_reported", status: "verified" }).returning();
    await db.insert(s.monthlyAggregates).values({ propertyId: p.id, submissionId: sub.id, month: "2025-01-01", grossMinor: 1, netMinor: 1, bookedNights: 1, daysInMonth: 31, reservationsCount: 1, currency: "USD" });
    return p.id;
  };
  liveId = await mk("live", "live");
  draftId = await mk("draft", "draft");
});
afterAll(async () => close());

const opts = { provider: "mock", amountMinor: 4900, currency: "USD" };

describe("unlock payments", () => {
  it("only signed-in non-owners can start a payment on a live listing", async () => {
    expect(await createPendingPayment(db, null, liveId, opts)).toEqual({ ok: false, error: "forbidden" });
    expect(await createPendingPayment(db, seller, liveId, opts)).toEqual({ ok: false, error: "forbidden" });
    expect(await createPendingPayment(db, buyer, draftId, opts)).toEqual({ ok: false, error: "forbidden" });
    expect(await createPendingPayment(db, buyer, "00000000-0000-0000-0000-000000000000", opts)).toEqual({ ok: false, error: "not_found" });
  });

  it("a pending or failed payment grants nothing; success unlocks permanently and is idempotent", async () => {
    const start = await createPendingPayment(db, buyer, liveId, opts);
    if (!start.ok) throw new Error("start failed");
    await expect(getReport(db, buyer, liveId)).rejects.toThrow();

    expect(await settlePayment(db, start.paymentId, "failed")).toEqual({ settled: true, unlocked: false });
    await expect(getReport(db, buyer, liveId)).rejects.toThrow();

    // A fresh attempt after a failure.
    const retry = await createPendingPayment(db, buyer, liveId, opts);
    if (!retry.ok) throw new Error("retry failed");
    expect(await settlePayment(db, retry.paymentId, "succeeded", "ref_1")).toEqual({ settled: true, unlocked: true });
    expect((await getReport(db, buyer, liveId)).rows).toHaveLength(1);

    // Webhook replays do not duplicate the unlock or downgrade the payment.
    expect(await settlePayment(db, retry.paymentId, "succeeded")).toEqual({ settled: true, unlocked: true });
    expect(await settlePayment(db, retry.paymentId, "failed")).toEqual({ settled: true, unlocked: true });
    expect(await db.select().from(s.unlocks).where(eq(s.unlocks.buyerId, "buyer"))).toHaveLength(1);
    expect((await db.select().from(s.payments).where(eq(s.payments.id, retry.paymentId)))[0].status).toBe("succeeded");
  });

  it("starting again after unlocking reports alreadyUnlocked without a new charge", async () => {
    const again = await createPendingPayment(db, buyer, liveId, opts);
    expect(again).toMatchObject({ ok: true, alreadyUnlocked: true });
    expect(await db.select().from(s.payments).where(eq(s.payments.buyerId, "buyer"))).toHaveLength(2);
  });

  it("settling an unknown payment is a no-op", async () => {
    expect(await settlePayment(db, "00000000-0000-0000-0000-000000000000", "succeeded")).toEqual({ settled: false, unlocked: false });
  });
});
