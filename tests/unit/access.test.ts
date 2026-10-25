import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, makeUser } from "../helpers/db";
import * as s from "@/db/schema";
import type { Db } from "@/db/client";
import {
  createAccessRequest,
  getRequestDetail,
  hasApprovedAccess,
  investorReply,
  investorUnseenCount,
  investorWithdraw,
  listOwnerRequests,
  ownerDecide,
  ownerPendingCount,
  ownerRevoke,
  profileSchema,
  reviewInvestor,
  saveInvestorProfile,
  type ProfileInput,
} from "@/lib/access";
import { ForbiddenError, type Actor } from "@/lib/policies";

const owner: Actor = { id: "owner", role: "seller" };
const otherOwner: Actor = { id: "owner2", role: "seller" };
const ana: Actor = { id: "ana", role: "buyer" };
const ben: Actor = { id: "ben", role: "buyer" };
const admin: Actor = { id: "admin", role: "admin" };

const profile: ProfileInput = {
  fullName: "Ana Investor", phone: "+351 900 000 000", investorType: "individual", entityName: "", country: "CY",
  budgetMin: 200000, budgetMax: 400000, currency: "EUR", targetCountries: "CY", experience: "one_to_three", financing: "mixed", timeline: "three_months",
  about: "I own two rental apartments in Porto and want a third with verified numbers before I buy.", website: "",
};

let db: Db;
let close: () => Promise<void>;
let lisbon: string;
let draft: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  for (const [id, role] of [["owner", "seller"], ["owner2", "seller"], ["ana", "buyer"], ["ben", "buyer"], ["admin", "admin"]] as const) await makeUser(db, id, role);
  const mk = async (slug: string, status: "live" | "draft", ownerId = "owner") =>
    (await db.insert(s.properties).values({ ownerId, publicSlug: slug, status, city: "Limassol", country: "CY" }).returning({ id: s.properties.id }))[0].id;
  lisbon = await mk("lisbon", "live");
  draft = await mk("draft", "draft");
});
afterAll(async () => close());

const status = async (id: string) => (await db.select().from(s.accessRequests).where(eq(s.accessRequests.id, id)))[0];

describe("investor profile", () => {
  it("validates the form: budget range, entity name for non-individuals, minimum 'about', URL", () => {
    expect(profileSchema.safeParse(profile).success).toBe(true);
    expect(profileSchema.safeParse({ ...profile, budgetMin: 500000 }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, investorType: "fund", entityName: "" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, investorType: "fund", entityName: "Rossi Fund" }).success).toBe(true);
    expect(profileSchema.safeParse({ ...profile, about: "too short" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, website: "javascript:alert(1)" }).success).toBe(false);
  });

  it("only investors can submit one, and a suspended investor cannot change it", async () => {
    expect(await saveInvestorProfile(db, owner, profile)).toEqual({ ok: false, error: "forbidden" });
    expect(await saveInvestorProfile(db, null, profile)).toEqual({ ok: false, error: "forbidden" });
    expect(await saveInvestorProfile(db, ana, profile)).toEqual({ ok: true });
    expect(await reviewInvestor(db, ana, "ana", "verified")).toBe(false); // not an admin
    expect(await reviewInvestor(db, admin, "ana", "suspended")).toBe(true);
    expect(await saveInvestorProfile(db, ana, profile)).toEqual({ ok: false, error: "suspended" });
    expect(await reviewInvestor(db, admin, "ana", "submitted")).toBe(true);
    expect(await saveInvestorProfile(db, ana, profile)).toEqual({ ok: true });
  });
});

describe("requesting access", () => {
  it("is refused without a submitted profile", async () => {
    expect(await createAccessRequest(db, ben, lisbon, "hi")).toEqual({ ok: false, error: "profile" });
  });

  it("is refused for anonymous users, owners, admins and unlisted listings", async () => {
    expect(await createAccessRequest(db, null, lisbon, "hi")).toMatchObject({ ok: false });
    expect(await createAccessRequest(db, owner, lisbon, "hi")).toMatchObject({ ok: false, error: "forbidden" });
    expect(await createAccessRequest(db, admin, lisbon, "hi")).toMatchObject({ ok: false, error: "forbidden" });
    expect(await createAccessRequest(db, ana, draft, "hi")).toMatchObject({ ok: false, error: "forbidden" });
    expect(await createAccessRequest(db, ana, "00000000-0000-0000-0000-000000000000", "hi")).toEqual({ ok: false, error: "not_found" });
  });

  it("creates a pending request with the message, flagged for the owner, and blocks duplicates", async () => {
    const res = await createAccessRequest(db, ana, lisbon, "Interested, please share the numbers.");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await status(res.id)).toMatchObject({ status: "pending", sellerUnseen: true, investorUnseen: false });
    expect(await ownerPendingCount(db, "owner")).toBe(1);
    expect(await ownerPendingCount(db, "owner2")).toBe(0);
    expect(await createAccessRequest(db, ana, lisbon, "again")).toEqual({ ok: false, error: "exists" });
    expect(await hasApprovedAccess(db, "ana", lisbon)).toBe(false); // pending is not access
  });
});

describe("the owner's side", () => {
  let reqId: string;
  beforeAll(async () => {
    const r = await listOwnerRequests(db, owner);
    reqId = r[0].id;
  });

  it("only the listing's owner sees and decides on the request", async () => {
    expect(await listOwnerRequests(db, otherOwner)).toEqual([]);
    expect(await ownerDecide(db, otherOwner, reqId, "approve")).toEqual({ ok: false, error: "forbidden" });
    expect(await ownerDecide(db, ana, reqId, "approve")).toEqual({ ok: false, error: "forbidden" });
    expect(await ownerDecide(db, admin, reqId, "approve")).toEqual({ ok: false, error: "forbidden" });
    expect(await ownerDecide(db, null, reqId, "approve")).toEqual({ ok: false, error: "forbidden" });
    await expect(getRequestDetail(db, otherOwner, reqId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getRequestDetail(db, ben, reqId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("the owner sees the investor's profile, but not phone or email before approving", async () => {
    const d = await getRequestDetail(db, owner, reqId);
    expect(d?.viewerIs).toBe("owner");
    expect(d?.profile).toMatchObject({ fullName: "Ana Investor", country: "CY", phone: null, email: null });
    // opening it clears the owner's "new" flag
    expect(await ownerPendingCount(db, "owner")).toBe(0);
  });

  it("asking for more information needs a question and moves the request to the investor", async () => {
    expect(await ownerDecide(db, owner, reqId, "ask_info", "")).toEqual({ ok: false, error: "invalid" });
    expect(await ownerDecide(db, owner, reqId, "ask_info", "Do you plan to manage it yourself?")).toEqual({ ok: true, status: "info_requested" });
    expect(await status(reqId)).toMatchObject({ status: "info_requested", investorUnseen: true, sellerUnseen: false });
    expect(await investorUnseenCount(db, "ana")).toBe(1);
    // cannot ask twice in a row, and only the investor can answer
    expect(await ownerDecide(db, owner, reqId, "ask_info", "again?")).toEqual({ ok: false, error: "state" });
    expect(await investorReply(db, ben, reqId, "hi")).toMatchObject({ ok: false });
    expect(await investorReply(db, owner, reqId, "hi")).toMatchObject({ ok: false });
  });

  it("the investor's answer puts it back in the owner's queue", async () => {
    expect(await investorReply(db, ana, reqId, "")).toEqual({ ok: false, error: "invalid" });
    expect(await investorReply(db, ana, reqId, "Through a manager, closing in January.")).toEqual({ ok: true });
    expect(await status(reqId)).toMatchObject({ status: "pending", sellerUnseen: true });
    const d = await getRequestDetail(db, ana, reqId);
    expect(d?.messages.map((m) => m.kind)).toEqual(["request", "question", "answer"]);
    expect(d?.viewerIs).toBe("investor");
  });

  it("approving shares contact details and grants access; the investor loses it when revoked", async () => {
    expect(await ownerDecide(db, owner, reqId, "approve", "Welcome.")).toEqual({ ok: true, status: "approved" });
    expect(await hasApprovedAccess(db, "ana", lisbon)).toBe(true);
    expect(await hasApprovedAccess(db, "ben", lisbon)).toBe(false);
    const d = await getRequestDetail(db, owner, reqId);
    expect(d?.profile).toMatchObject({ phone: "+351 900 000 000", email: "ana@test.local" });
    // cannot decide twice
    expect(await ownerDecide(db, owner, reqId, "decline")).toEqual({ ok: false, error: "state" });
    expect(await ownerRevoke(db, ana, reqId)).toMatchObject({ ok: false });
    expect(await ownerRevoke(db, owner, reqId)).toEqual({ ok: true });
    expect(await hasApprovedAccess(db, "ana", lisbon)).toBe(false);
    expect(await status(reqId)).toMatchObject({ status: "revoked", investorUnseen: true });
  });

  it("after a revoke the investor can ask again; a decline starts a cool-down", async () => {
    const again = await createAccessRequest(db, ana, lisbon, "Could I get access again?");
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(await ownerDecide(db, owner, again.id, "decline", "Not a fit right now.")).toEqual({ ok: true, status: "declined" });
    expect(await createAccessRequest(db, ana, lisbon, "please?")).toEqual({ ok: false, error: "cooldown" });
    // eight days later it is allowed again
    const later = new Date(Date.now() + 8 * 86_400_000);
    expect((await createAccessRequest(db, ana, lisbon, "a week later", later)).ok).toBe(true);
  });
});

describe("withdrawing and isolation", () => {
  it("an investor can withdraw an active request but not someone else's", async () => {
    const res = await createAccessRequest(db, (await saveBen()), lisbon, "hello");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await investorWithdraw(db, ana, res.id)).toMatchObject({ ok: false });
    expect(await investorWithdraw(db, ben, res.id)).toEqual({ ok: true });
    expect(await investorWithdraw(db, ben, res.id)).toEqual({ ok: false, error: "state" });
    expect(await status(res.id)).toMatchObject({ status: "withdrawn" });
  });

  it("rejects malformed ids without touching the database", async () => {
    expect(await ownerDecide(db, owner, "not-a-uuid", "approve")).toEqual({ ok: false, error: "not_found" });
    expect(await getRequestDetail(db, owner, "../etc/passwd")).toBeNull();
  });
});

async function saveBen(): Promise<Actor> {
  await saveInvestorProfile(db, ben, { ...profile, fullName: "Ben Buyer" });
  return ben;
}
