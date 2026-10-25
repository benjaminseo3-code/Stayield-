import { createHmac } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStorage } from "@/adapters/local/storage";
import { verifyStripeSignature } from "@/adapters/payments";
import { incomeBand } from "@/lib/metrics/band";
import { detectLang, makeT } from "@/i18n";
import { en } from "@/i18n/en";
import { he } from "@/i18n/he";

describe("i18n", () => {
  it("has a Hebrew string for every English key", () => {
    expect(Object.keys(he).sort()).toEqual(Object.keys(en).sort());
  });
  it("detects Hebrew from Accept-Language, defaults to English", () => {
    expect(detectLang("he-IL,he;q=0.9,en;q=0.8")).toBe("he");
    expect(detectLang("en-US,en;q=0.9")).toBe("en");
    expect(detectLang(null)).toBe("en");
  });
  it("interpolates params", () => {
    expect(makeT("en")("common.bedrooms", { n: 3 })).toBe("3 bd");
  });
});

describe("incomeBand", () => {
  it("rounds to a band instead of an exact figure", () => {
    expect(incomeBand(4_350_000)).toEqual({ low: 4_000_000, high: 4_500_000 });
    expect(incomeBand(12_340_000)).toEqual({ low: 12_000_000, high: 13_000_000 });
  });
});

describe("LocalStorage", () => {
  it("round-trips and refuses path traversal", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stayield-"));
    const s = new LocalStorage(dir);
    await s.put("a/b.txt", Buffer.from("hi"));
    expect((await s.get("a/b.txt"))?.toString()).toBe("hi");
    expect(await s.get("missing")).toBeNull();
    await expect(s.put("../evil", Buffer.from("x"))).rejects.toThrow();
    await expect(s.get("a/../../evil")).rejects.toThrow();
    await s.deletePrefix("a");
    expect(await s.exists("a/b.txt")).toBe(false);
  });
});

describe("verifyStripeSignature", () => {
  const secret = "whsec_test";
  const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
  const sign = (t: number, body = payload) =>
    `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

  it("accepts a valid signature", () => {
    const now = Date.now();
    expect(verifyStripeSignature(payload, sign(Math.floor(now / 1000)), secret, now).type).toBe(
      "checkout.session.completed",
    );
  });
  it("rejects tampering, stale timestamps and missing headers (fail closed)", () => {
    const now = Date.now();
    const t = Math.floor(now / 1000);
    expect(() => verifyStripeSignature(payload + " ", sign(t), secret, now)).toThrow();
    expect(() => verifyStripeSignature(payload, sign(t - 3600), secret, now)).toThrow();
    expect(() => verifyStripeSignature(payload, null, secret, now)).toThrow();
  });
});

import { safeNext } from "@/lib/safe-next";
describe("safeNext", () => {
  it("allows only same-site relative paths", () => {
    expect(safeNext("/sell/abc?x=1")).toBe("/sell/abc?x=1");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil", "javascript:alert(1)", "", null, undefined]) {
      expect(safeNext(bad as string)).toBe("/");
    }
  });
});
