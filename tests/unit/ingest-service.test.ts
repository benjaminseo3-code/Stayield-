import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, makeUser } from "../helpers/db";
import * as s from "@/db/schema";
import type { Db } from "@/db/client";
import { LocalStorage } from "@/adapters/local/storage";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { evaluatePropertyStatus, ingestCleanedRows, ingestInboundEmail } from "@/lib/ingest/service";
import { parseReportCsv } from "@/lib/ingest/parse-report";
import { buildSignedOriginal, makeDkimKey, wrapForwarded } from "../helpers/eml";
import { synthRows, toCsv } from "../helpers/synthetic";

let db: Db;
let close: () => Promise<void>;
const NOW = new Date();
const goodRows = () => {
  const r = parseReportCsv(toCsv(synthRows("2025-01-01", 70)));
  if (!r.ok) throw new Error("fixture");
  return r.rows;
};

async function newProperty(owner = "seller", opts: { consent?: boolean } = {}) {
  const [p] = await db
    .insert(s.properties)
    .values({ ownerId: owner, publicSlug: `p-${Math.random().toString(36).slice(2, 9)}`, city: "Lisbon", currency: "EUR" })
    .returning();
  if (opts.consent) await db.insert(s.consents).values({ userId: owner, propertyId: p.id, textVersion: "v1", accepted: ["owns", "shares_aggregates", "complete_data"] });
  return p;
}
const reload = async (id: string) => (await db.select().from(s.properties).where(eq(s.properties.id, id)))[0];

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await makeUser(db, "seller", "seller");
  await makeUser(db, "other", "seller");
  await db.insert(s.verifiedEmails).values({ userId: "seller", email: "seller@example.test", verifiedAt: new Date() });
});
afterAll(async () => close());

describe("CSV (self-reported) path", () => {
  it("stores hashed reservations + monthly aggregates and goes live automatically once consent exists", async () => {
    const p = await newProperty("seller", { consent: true });
    const res = await ingestCleanedRows(db, { propertyId: p.id, userId: "seller", rows: goodRows(), now: NOW });
    expect(res).toMatchObject({ ok: true, outcome: "live" });

    const after = await reload(p.id);
    expect(after.status).toBe("live");
    expect(after.trustTier).toBe("self_reported");
    expect(after.incomeBandLowMinor).toBeGreaterThan(0);
    expect(after.coverageStart).toMatch(/^\d{4}-\d{2}-01$/);
    expect(after.publishedAt).not.toBeNull();

    const aggs = await db.select().from(s.monthlyAggregates).where(eq(s.monthlyAggregates.propertyId, p.id));
    expect(aggs.length).toBeGreaterThanOrEqual(12);

    // Confirmation codes are stored only as one-way hashes.
    const resv = await db.select().from(s.reservations).where(eq(s.reservations.propertyId, p.id));
    expect(resv).toHaveLength(70);
    expect(JSON.stringify(resv)).not.toContain("SYN1000");
    expect(resv[0].confirmationHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("without consent the data is stored but the listing stays pending; consent then publishes", async () => {
    const p = await newProperty("seller");
    await ingestCleanedRows(db, { propertyId: p.id, userId: "seller", rows: goodRows(), now: NOW });
    expect((await reload(p.id)).status).toBe("data_pending");
    await db.insert(s.consents).values({ userId: "seller", propertyId: p.id, textVersion: "v1", accepted: ["owns"] });
    expect(await evaluatePropertyStatus(db, p.id, NOW)).toBe("live");
  });

  it("a failed check sends the listing to review with plain reasons", async () => {
    const p = await newProperty("seller", { consent: true });
    const rows = goodRows();
    const res = await ingestCleanedRows(db, { propertyId: p.id, userId: "seller", rows: [...rows, rows[2]], now: NOW });
    expect(res).toMatchObject({ ok: true, outcome: "review" });
    const after = await reload(p.id);
    expect(after.status).toBe("review");
    expect(after.reviewReasons.some((r) => r.code === "duplicate_confirmations" && r.level === "fail")).toBe(true);
  });

  it("refuses rows with extra fields (no guest data can be smuggled in) and other people's properties", async () => {
    const p = await newProperty("seller");
    const bad = goodRows().map((r) => ({ ...r, guest: "Alice Example" }));
    expect(await ingestCleanedRows(db, { propertyId: p.id, userId: "seller", rows: bad, now: NOW })).toEqual({ ok: false, error: "invalid_rows" });
    expect(await ingestCleanedRows(db, { propertyId: p.id, userId: "other", rows: goodRows(), now: NOW })).toEqual({ ok: false, error: "forbidden" });
  });

  it("re-uploading replaces the old data instead of piling up", async () => {
    const p = await newProperty("seller", { consent: true });
    await ingestCleanedRows(db, { propertyId: p.id, userId: "seller", rows: goodRows(), now: NOW });
    await ingestCleanedRows(db, { propertyId: p.id, userId: "seller", rows: goodRows(), now: NOW });
    expect(await db.select().from(s.reservations).where(eq(s.reservations.propertyId, p.id))).toHaveLength(70);
  });
});

describe("inbound email path (DKIM)", () => {
  const key = makeDkimKey("test-sender.example", "s1");
  const storageDir = path.join(os.tmpdir(), `stayield-evidence-${Date.now()}`);
  const storage = new LocalStorage(storageDir);
  const opts = { inboundDomain: "inbound.example.test", trustedDomains: ["test-sender.example"], resolver: key.resolver };

  async function propertyWithAddress(consent = true) {
    const p = await newProperty("seller", { consent });
    const token = Math.random().toString(36).slice(2, 12).replace(/[^a-z0-9]/g, "a");
    await db.insert(s.inboundAddresses).values({ propertyId: p.id, token });
    return { p, address: `p-${token}@inbound.example.test` };
  }

  it("verified original -> signed_email tier, live, evidence = headers only", async () => {
    const { p, address } = await propertyWithAddress();
    const original = await buildSignedOriginal(key, { csv: toCsv(synthRows("2025-01-01", 70)) });
    const res = await ingestInboundEmail(db, { raw: wrapForwarded(original, { to: address }), storage, now: NOW, ...opts });
    expect(res).toMatchObject({ status: "processed", outcome: "live" });

    const after = await reload(p.id);
    expect(after.status).toBe("live");
    expect(after.trustTier).toBe("signed_email");

    const [sub] = await db.select().from(s.dataSubmissions).where(eq(s.dataSubmissions.propertyId, p.id));
    expect(sub.status).toBe("verified");
    expect(sub.rawSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sub.verificationResult?.dkim).toMatchObject({ domain: "test-sender.example", result: "pass" });
    const evidence = (await storage.get(sub.rawFileKey!))!.toString();
    expect(evidence).toContain("DKIM-Signature");
    expect(evidence).not.toContain("Fake Guest");
    // The raw message (with its CSV body) is NOT kept.
    await expect(fs.readdir(path.join(storageDir, "private", "submissions", sub.id))).resolves.toEqual(["evidence.json"]);
  });

  it("the same original can only be used once", async () => {
    const { address } = await propertyWithAddress();
    const original = await buildSignedOriginal(key, { csv: toCsv(synthRows("2025-01-01", 70)) });
    const raw = wrapForwarded(original, { to: address });
    expect(await ingestInboundEmail(db, { raw, now: NOW, ...opts })).toMatchObject({ outcome: "live" });
    const second = await ingestInboundEmail(db, { raw, now: NOW, ...opts });
    expect(second).toMatchObject({ status: "processed", outcome: "failed" });
    // ...and it cannot be replayed against a different property either.
    const other = await propertyWithAddress();
    expect(await ingestInboundEmail(db, { raw: wrapForwarded(original, { to: other.address }), now: NOW, ...opts })).toMatchObject({ outcome: "failed" });
  });

  it("a later bad email does not take down a live listing", async () => {
    const { p, address } = await propertyWithAddress();
    const good = await buildSignedOriginal(key, { csv: toCsv(synthRows("2025-01-01", 70)) });
    await ingestInboundEmail(db, { raw: wrapForwarded(good, { to: address }), now: NOW, ...opts });
    const bad = await buildSignedOriginal(key, { csv: toCsv(synthRows("2025-01-01", 70)), to: "stranger@example.test" });
    expect(await ingestInboundEmail(db, { raw: wrapForwarded(bad, { to: address }), now: NOW, ...opts })).toMatchObject({ outcome: "failed" });
    expect((await reload(p.id)).status).toBe("live");
    expect((await reload(p.id)).trustTier).toBe("signed_email");
  });

  it("link-only email: genuine but no data, so the listing stays pending", async () => {
    const { p, address } = await propertyWithAddress();
    const original = await buildSignedOriginal(key, { csv: null, linkOnly: true });
    expect(await ingestInboundEmail(db, { raw: wrapForwarded(original, { to: address }), now: NOW, ...opts })).toMatchObject({ outcome: "needs_csv" });
    const after = await reload(p.id);
    expect(after.status).toBe("data_pending");
    expect(after.activeSubmissionId).toBeNull();
  });

  it("unknown or inactive addresses are rejected without touching any property", async () => {
    const original = await buildSignedOriginal(key, { csv: toCsv(synthRows("2025-01-01", 70)) });
    expect(await ingestInboundEmail(db, { raw: wrapForwarded(original, { to: "p-nope@inbound.example.test" }), now: NOW, ...opts })).toEqual({ status: "rejected", reason: "unknown_address" });
    expect(await ingestInboundEmail(db, { raw: wrapForwarded(original, { to: "p-abc@evil.example" }), now: NOW, ...opts })).toEqual({ status: "rejected", reason: "unknown_address" });
  });
});
