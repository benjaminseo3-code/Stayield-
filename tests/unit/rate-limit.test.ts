import { describe, expect, it } from "vitest";
import { rateLimit, tooLarge } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit, then blocks until the window resets", () => {
    const opts = { limit: 3, windowMs: 1000 };
    const t0 = 1_000_000;
    expect(rateLimit("a", opts, t0)).toEqual({ ok: true });
    expect(rateLimit("a", opts, t0 + 1)).toEqual({ ok: true });
    expect(rateLimit("a", opts, t0 + 2)).toEqual({ ok: true });
    expect(rateLimit("a", opts, t0 + 3)).toMatchObject({ ok: false, retryAfterSeconds: 1 });
    expect(rateLimit("a", opts, t0 + 1001)).toEqual({ ok: true });
  });
  it("keeps keys independent", () => {
    const opts = { limit: 1, windowMs: 1000 };
    expect(rateLimit("x", opts, 5)).toEqual({ ok: true });
    expect(rateLimit("y", opts, 5)).toEqual({ ok: true });
    expect(rateLimit("x", opts, 6)).toMatchObject({ ok: false });
  });
  it("tooLarge checks the declared content-length", () => {
    expect(tooLarge(new Request("http://x", { method: "POST", headers: { "content-length": "100" }, body: "x" }), 50)).toBe(true);
    expect(tooLarge(new Request("http://x", { method: "POST", headers: { "content-length": "10" }, body: "x" }), 50)).toBe(false);
  });
});
