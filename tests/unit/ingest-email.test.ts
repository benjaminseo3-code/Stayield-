import { beforeAll, describe, expect, it } from "vitest";
import { verifyForwardedReport, type EmailVerifyResult } from "@/lib/ingest/email";
import { buildSignedOriginal, makeDkimKey, wrapForwarded } from "../helpers/eml";
import { synthRows, toCsv } from "../helpers/synthetic";

const NOW = new Date();
const goodCsv = () => toCsv(synthRows("2025-01-01", 70));

let key: ReturnType<typeof makeDkimKey>;
beforeAll(() => {
  key = makeDkimKey("test-sender.example", "s1");
});

const run = (outer: Buffer, over: Partial<Parameters<typeof verifyForwardedReport>[0]> = {}) =>
  verifyForwardedReport({
    outerRaw: outer,
    now: NOW,
    trustedDomains: ["test-sender.example"],
    resolver: key.resolver,
    sellerEmails: ["seller@example.test"],
    isSeen: async () => false,
    ...over,
  });

const lvl = (r: EmailVerifyResult, code: string) => r.checks.find((c) => c.code === code)?.level;

describe("verifyForwardedReport", () => {
  it("accepts a genuine signed report forwarded as an attachment", async () => {
    const original = await buildSignedOriginal(key, { csv: goodCsv() });
    const r = await run(wrapForwarded(original, { to: "p-abc@inbound.example.test" }));
    expect(r.checks.filter((c) => c.level === "fail")).toEqual([]);
    expect(r.outcome).toBe("live");
    expect(r.dkim).toMatchObject({ domain: "test-sender.example", selector: "s1", result: "pass" });
    expect(r.rows).toHaveLength(70);
    expect(r.innerSha256).toMatch(/^[0-9a-f]{64}$/);
    // Evidence is headers only: no body, so no guest data.
    expect(r.evidenceHeaders).toContain("DKIM-Signature");
    expect(r.evidenceHeaders).not.toContain("Fake Guest");
    expect(r.evidenceHeaders).not.toContain("SYN1000");
  });

  it("rejects a plain forward (not an attachment)", async () => {
    const original = await buildSignedOriginal(key, { csv: goodCsv() });
    const r = await run(wrapForwarded(original, { to: "p-abc@inbound.example.test", asInline: true }));
    expect(r.outcome).toBe("failed");
    expect(lvl(r, "forwarded_as_attachment")).toBe("fail");
  });

  it("rejects a tampered attachment (body hash no longer matches)", async () => {
    const original = await buildSignedOriginal(key, { csv: goodCsv() });
    // Change the CSV payload after signing by flipping base64 content.
    const tampered = original.replace(/(base64\r\n\r\n)(.)/, (_m, a, c) => a + (c === "A" ? "B" : "A"));
    expect(tampered).not.toBe(original);
    const r = await run(wrapForwarded(tampered, { to: "p-abc@inbound.example.test" }));
    expect(r.outcome).toBe("failed");
    expect(lvl(r, "dkim_valid")).toBe("fail");
  });

  it("rejects a sender outside the trusted domains, and fails closed with no list", async () => {
    const original = await buildSignedOriginal(key, { csv: goodCsv() });
    const outer = wrapForwarded(original, { to: "p-abc@inbound.example.test" });
    expect(lvl(await run(outer, { trustedDomains: ["airbnb.example"] }), "sender_trusted")).toBe("fail");
    expect(lvl(await run(outer, { trustedDomains: [] }), "sender_trusted")).toBe("fail");
  });

  it("rejects a From that is not aligned with the signing domain", async () => {
    const other = makeDkimKey("attacker.example", "s1");
    // Signed by attacker.example but claiming to be from the trusted domain.
    const original = await buildSignedOriginal(other, { csv: goodCsv(), from: "noreply@test-sender.example" });
    const r = await run(wrapForwarded(original, { to: "p-abc@inbound.example.test" }), {
      resolver: async (n, rr) => (n.includes("attacker.example") ? other.resolver(n, rr) : key.resolver(n, rr)),
    });
    expect(r.outcome).toBe("failed");
    expect(lvl(r, "sender_trusted")).toBe("fail");
  });

  it("rejects old reports (signed Date older than 7 days)", async () => {
    const original = await buildSignedOriginal(key, { csv: goodCsv(), date: new Date(Date.now() - 10 * 86_400_000) });
    const r = await run(wrapForwarded(original, { to: "p-abc@inbound.example.test" }));
    expect(r.outcome).toBe("failed");
    expect(lvl(r, "date_fresh")).toBe("fail");
  });

  it("binds the report to the seller: signed To must be one of their verified emails", async () => {
    const original = await buildSignedOriginal(key, { csv: goodCsv(), to: "someone-else@example.test" });
    const r = await run(wrapForwarded(original, { to: "p-abc@inbound.example.test" }));
    expect(r.outcome).toBe("failed");
    expect(lvl(r, "recipient_matches_seller")).toBe("fail");
  });

  it("requires From, Date and To to be covered by the signature", async () => {
    const original = await buildSignedOriginal(key, { csv: goodCsv(), headerList: "from:subject:message-id:mime-version:content-type" });
    const r = await run(wrapForwarded(original, { to: "p-abc@inbound.example.test" }));
    expect(r.outcome).toBe("failed");
    expect(lvl(r, "headers_signed")).toBe("fail");
  });

  it("rejects signatures that only cover part of the body (l= tag)", async () => {
    const original = await buildSignedOriginal(key, { csv: goodCsv(), maxBodyLength: 200 });
    const r = await run(wrapForwarded(original, { to: "p-abc@inbound.example.test" }));
    expect(r.outcome).toBe("failed");
    expect(lvl(r, "body_fully_signed")).toBe("fail");
  });

  it("never ingests the same original twice", async () => {
    const original = await buildSignedOriginal(key, { csv: goodCsv() });
    const r = await run(wrapForwarded(original, { to: "p-abc@inbound.example.test" }), { isSeen: async () => true });
    expect(r.outcome).toBe("failed");
    expect(lvl(r, "not_seen_before")).toBe("fail");
  });

  it("degrades to needs_csv when the email has a download link instead of a file", async () => {
    const original = await buildSignedOriginal(key, { csv: null, linkOnly: true });
    const r = await run(wrapForwarded(original, { to: "p-abc@inbound.example.test" }));
    expect(r.outcome).toBe("needs_csv");
    expect(r.checks.find((c) => c.code === "attachment_present")).toMatchObject({ level: "warn", params: { kind: "link" } });
    expect(r.rows).toBeUndefined();
  });

  it("sends reliability failures in a genuine email to review rather than rejecting it", async () => {
    const dupes = synthRows("2025-01-01", 70);
    dupes.push(dupes[4]);
    const original = await buildSignedOriginal(key, { csv: toCsv(dupes) });
    const r = await run(wrapForwarded(original, { to: "p-abc@inbound.example.test" }));
    expect(r.outcome).toBe("review");
    expect(lvl(r, "duplicate_confirmations")).toBe("fail");
  });
});
