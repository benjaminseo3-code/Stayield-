/**
 * Investor profiles and access requests: the core workflow of the marketplace.
 *
 *   investor: sign up -> submit profile ("advanced verification") -> request access to a listing
 *   owner:    sees the investor's profile -> approves / declines / asks for more information
 *   investor: answers questions -> once approved sees the listing in full
 *
 * Every function takes the acting user and checks `lib/policies` before touching data.
 */
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  accessRequests,
  auditLog,
  investorProfiles,
  properties,
  requestMessages,
  users,
  type AccessRequest,
  type AccessStatus,
  type InvestorProfile,
  type RequestMessage,
} from "@/db/schema";
import {
  canDecideRequest,
  canRequestAccess,
  COOLDOWN_AFTER_DECLINE_MS,
  canViewInvestorContact,
  canViewInvestorProfile,
  ForbiddenError,
  type Actor,
  type InvestorStatus,
} from "@/lib/policies";

// ---------------------------------------------------------------------------
// Investor profile
// ---------------------------------------------------------------------------
import { EXPERIENCE, FINANCING, INVESTOR_TYPES, PROFILE_CURRENCIES, TIMELINES } from "@/lib/access-constants";

const money = z.number().int().min(0).max(10_000_000_000);

export const profileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(5).max(40),
    investorType: z.enum(INVESTOR_TYPES),
    entityName: z.string().trim().max(160),
    country: z.string().trim().min(2).max(80),
    budgetMin: money,
    budgetMax: money,
    currency: z.enum(PROFILE_CURRENCIES),
    targetCountries: z.string().trim().max(200),
    experience: z.enum(EXPERIENCE),
    financing: z.enum(FINANCING),
    timeline: z.enum(TIMELINES),
    about: z.string().trim().min(40).max(1500),
    website: z
      .string()
      .trim()
      .max(300)
      .refine((v) => v === "" || /^https?:\/\//i.test(v), "url"),
  })
  .refine((p) => p.budgetMin <= p.budgetMax, { path: ["budgetMax"], message: "range" })
  .refine((p) => p.investorType === "individual" || p.entityName.length >= 2, { path: ["entityName"], message: "entity" });
export type ProfileInput = z.infer<typeof profileSchema>;

export async function getInvestorProfile(db: Db, userId: string): Promise<InvestorProfile | null> {
  const [p] = await db.select().from(investorProfiles).where(eq(investorProfiles.userId, userId)).limit(1);
  return p ?? null;
}

/** Saves and submits the profile. A suspended investor cannot change it. */
export async function saveInvestorProfile(
  db: Db,
  actor: Actor,
  input: ProfileInput,
): Promise<{ ok: true } | { ok: false; error: "forbidden" | "suspended" }> {
  if (!actor || actor.role !== "buyer") return { ok: false, error: "forbidden" };
  const existing = await getInvestorProfile(db, actor.id);
  if (existing?.status === "suspended") return { ok: false, error: "suspended" };
  const values = { ...input, status: "submitted" as const, submittedAt: new Date(), reviewedAt: null, reviewedBy: null };
  await db
    .insert(investorProfiles)
    .values({ userId: actor.id, ...values })
    .onConflictDoUpdate({ target: investorProfiles.userId, set: values });
  await db.insert(auditLog).values({ actorId: actor.id, action: "investor.profile_submitted", entityType: "user", entityId: actor.id });
  return { ok: true };
}

/** Admin: mark a profile verified or suspended. */
export async function reviewInvestor(db: Db, actor: Actor, userId: string, status: "verified" | "suspended" | "submitted"): Promise<boolean> {
  if (!actor || actor.role !== "admin") return false;
  const res = await db
    .update(investorProfiles)
    .set({ status, reviewedAt: new Date(), reviewedBy: actor.id })
    .where(eq(investorProfiles.userId, userId))
    .returning({ id: investorProfiles.userId });
  if (res.length) await db.insert(auditLog).values({ actorId: actor.id, action: `investor.${status}`, entityType: "user", entityId: userId });
  return res.length > 0;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
/** When a declined investor may ask again, or null when no cool-down applies. */
export function cooldownEnd(req: Pick<AccessRequest, "status" | "decidedAt"> | null): Date | null {
  if (!req || req.status !== "declined" || !req.decidedAt) return null;
  return new Date(req.decidedAt.getTime() + COOLDOWN_AFTER_DECLINE_MS);
}

export function isCoolingDown(req: Pick<AccessRequest, "status" | "decidedAt"> | null, now = Date.now()): boolean {
  const end = cooldownEnd(req);
  return !!end && end.getTime() > now;
}

const ACTIVE: AccessStatus[] = ["pending", "info_requested", "approved"];
const messageBody = z.string().trim().max(1500);

export type RequestError = "forbidden" | "not_found" | "profile" | "exists" | "cooldown" | "invalid" | "state";

async function loadRequest(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({
      req: accessRequests,
      ownerId: properties.ownerId,
      propertyStatus: properties.status,
      slug: properties.publicSlug,
    })
    .from(accessRequests)
    .innerJoin(properties, eq(properties.id, accessRequests.propertyId))
    .where(eq(accessRequests.id, id))
    .limit(1);
  return row ?? null;
}

export async function createAccessRequest(
  db: Db,
  actor: Actor,
  propertyId: string,
  message: string,
  now = new Date(),
): Promise<{ ok: true; id: string } | { ok: false; error: RequestError }> {
  if (!actor) return { ok: false, error: "forbidden" };
  const [p] = await db
    .select({ id: properties.id, ownerId: properties.ownerId, status: properties.status })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!p) return { ok: false, error: "not_found" };
  const body = messageBody.safeParse(message);
  if (!body.success) return { ok: false, error: "invalid" };

  const profile = await getInvestorProfile(db, actor.id);
  const history = await db
    .select({ status: accessRequests.status, decidedAt: accessRequests.decidedAt })
    .from(accessRequests)
    .where(and(eq(accessRequests.propertyId, propertyId), eq(accessRequests.investorId, actor.id)))
    .orderBy(desc(accessRequests.createdAt));
  const hasActive = history.some((h) => ACTIVE.includes(h.status));
  const lastDeclinedAt = history.find((h) => h.status === "declined")?.decidedAt ?? null;
  const ctx = { profileStatus: (profile?.status ?? null) as InvestorStatus | null, hasActiveRequest: hasActive, lastDeclinedAt };

  if (!canRequestAccess(actor, p, ctx, now.getTime())) {
    if (actor.role !== "buyer" || p.status !== "live" || p.ownerId === actor.id) return { ok: false, error: "forbidden" };
    if (ctx.profileStatus !== "submitted" && ctx.profileStatus !== "verified") return { ok: false, error: "profile" };
    if (hasActive) return { ok: false, error: "exists" };
    return { ok: false, error: "cooldown" };
  }

  const id = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(accessRequests)
      .values({ propertyId, investorId: actor.id, status: "pending", sellerUnseen: true, investorUnseen: false })
      .returning({ id: accessRequests.id });
    await tx.insert(requestMessages).values({ requestId: r.id, authorId: actor.id, authorRole: "investor", kind: "request", body: body.data });
    await tx.insert(auditLog).values({ actorId: actor.id, action: "access.requested", entityType: "property", entityId: propertyId, meta: { requestId: r.id } });
    return r.id;
  });
  return { ok: true, id };
}

export type Decision = "approve" | "decline" | "ask_info";

export async function ownerDecide(
  db: Db,
  actor: Actor,
  requestId: string,
  decision: Decision,
  note = "",
): Promise<{ ok: true; status: AccessStatus } | { ok: false; error: RequestError }> {
  const row = await loadRequest(db, requestId);
  if (!row) return { ok: false, error: "not_found" };
  if (!actor || !canDecideRequest(actor, { id: row.req.propertyId, ownerId: row.ownerId, status: row.propertyStatus })) return { ok: false, error: "forbidden" };
  const text = messageBody.safeParse(note);
  if (!text.success) return { ok: false, error: "invalid" };
  const { status } = row.req;

  let next: AccessStatus;
  if (decision === "ask_info") {
    if (status !== "pending" || text.data.length < 3) return { ok: false, error: status !== "pending" ? "state" : "invalid" };
    next = "info_requested";
  } else {
    if (status !== "pending" && status !== "info_requested") return { ok: false, error: "state" };
    next = decision === "approve" ? "approved" : "declined";
  }

  await db.transaction(async (tx) => {
    await tx
      .update(accessRequests)
      .set({ status: next, decidedAt: next === "info_requested" ? null : new Date(), sellerUnseen: false, investorUnseen: true })
      .where(eq(accessRequests.id, requestId));
    if (text.data) {
      await tx.insert(requestMessages).values({
        requestId,
        authorId: actor.id,
        authorRole: "owner",
        kind: decision === "ask_info" ? "question" : "note",
        body: text.data,
      });
    }
    await tx.insert(auditLog).values({ actorId: actor.id, action: `access.${decision}`, entityType: "property", entityId: row.req.propertyId, meta: { requestId } });
  });
  return { ok: true, status: next };
}

/** The investor answers the owner's question; the request goes back to the owner's queue. */
export async function investorReply(db: Db, actor: Actor, requestId: string, body: string): Promise<{ ok: true } | { ok: false; error: RequestError }> {
  const row = await loadRequest(db, requestId);
  if (!row || !actor || row.req.investorId !== actor.id) return { ok: false, error: row ? "forbidden" : "not_found" };
  if (row.req.status !== "info_requested") return { ok: false, error: "state" };
  const text = messageBody.safeParse(body);
  if (!text.success || text.data.length < 1) return { ok: false, error: "invalid" };
  await db.transaction(async (tx) => {
    await tx.insert(requestMessages).values({ requestId, authorId: actor.id, authorRole: "investor", kind: "answer", body: text.data });
    await tx.update(accessRequests).set({ status: "pending", sellerUnseen: true, investorUnseen: false }).where(eq(accessRequests.id, requestId));
  });
  return { ok: true };
}

export async function investorWithdraw(db: Db, actor: Actor, requestId: string): Promise<{ ok: true } | { ok: false; error: RequestError }> {
  const row = await loadRequest(db, requestId);
  if (!row || !actor || row.req.investorId !== actor.id) return { ok: false, error: row ? "forbidden" : "not_found" };
  if (!ACTIVE.includes(row.req.status)) return { ok: false, error: "state" };
  await db.update(accessRequests).set({ status: "withdrawn", decidedAt: new Date(), sellerUnseen: true, investorUnseen: false }).where(eq(accessRequests.id, requestId));
  return { ok: true };
}

/** The owner takes back an approval; the investor loses the full view immediately. */
export async function ownerRevoke(db: Db, actor: Actor, requestId: string): Promise<{ ok: true } | { ok: false; error: RequestError }> {
  const row = await loadRequest(db, requestId);
  if (!row) return { ok: false, error: "not_found" };
  if (!actor || !canDecideRequest(actor, { id: row.req.propertyId, ownerId: row.ownerId, status: row.propertyStatus })) return { ok: false, error: "forbidden" };
  if (row.req.status !== "approved") return { ok: false, error: "state" };
  await db.update(accessRequests).set({ status: "revoked", decidedAt: new Date(), sellerUnseen: false, investorUnseen: true }).where(eq(accessRequests.id, requestId));
  await db.insert(auditLog).values({ actorId: actor.id, action: "access.revoked", entityType: "property", entityId: row.req.propertyId, meta: { requestId } });
  return { ok: true };
}

/** Clears the "new activity" flag for whoever opened the request. */
export async function markSeen(db: Db, actor: Actor, requestId: string): Promise<void> {
  const row = await loadRequest(db, requestId);
  if (!row || !actor) return;
  if (actor.id === row.ownerId) await db.update(accessRequests).set({ sellerUnseen: false }).where(eq(accessRequests.id, requestId));
  else if (actor.id === row.req.investorId) await db.update(accessRequests).set({ investorUnseen: false }).where(eq(accessRequests.id, requestId));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
/** The investor's current (latest) request per listing, for badges and the request panel. */
export async function myRequestFor(db: Db, investorId: string, propertyId: string): Promise<AccessRequest | null> {
  const [r] = await db
    .select()
    .from(accessRequests)
    .where(and(eq(accessRequests.investorId, investorId), eq(accessRequests.propertyId, propertyId)))
    .orderBy(desc(accessRequests.createdAt))
    .limit(1);
  return r ?? null;
}

export async function approvedPropertyIds(db: Db, investorId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: accessRequests.propertyId })
    .from(accessRequests)
    .where(and(eq(accessRequests.investorId, investorId), eq(accessRequests.status, "approved")));
  return new Set(rows.map((r) => r.id));
}

export async function hasApprovedAccess(db: Db, investorId: string | undefined, propertyId: string): Promise<boolean> {
  if (!investorId) return false;
  const [r] = await db
    .select({ id: accessRequests.id })
    .from(accessRequests)
    .where(and(eq(accessRequests.investorId, investorId), eq(accessRequests.propertyId, propertyId), eq(accessRequests.status, "approved")))
    .limit(1);
  return !!r;
}

/** Requests waiting for the owner's decision (nav badge). */
export async function ownerPendingCount(db: Db, ownerId: string): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(accessRequests)
    .innerJoin(properties, eq(properties.id, accessRequests.propertyId))
    .where(and(eq(properties.ownerId, ownerId), eq(accessRequests.status, "pending"), eq(accessRequests.sellerUnseen, true)));
  return Number(r?.n ?? 0);
}

/** Requests with news for the investor (nav badge). */
export async function investorUnseenCount(db: Db, investorId: string): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(accessRequests)
    .where(and(eq(accessRequests.investorId, investorId), eq(accessRequests.investorUnseen, true)));
  return Number(r?.n ?? 0);
}

export type OwnerRequestRow = {
  id: string;
  status: AccessStatus;
  sellerUnseen: boolean;
  createdAt: Date;
  updatedAt: Date;
  propertyId: string;
  propertySlug: string;
  city: string;
  neighborhood: string;
  investorId: string;
  investorName: string;
  investorType: InvestorProfile["investorType"];
  investorCountry: string;
  profileStatus: InvestorStatus;
};

export async function listOwnerRequests(db: Db, actor: Actor): Promise<OwnerRequestRow[]> {
  if (!actor) return [];
  return db
    .select({
      id: accessRequests.id,
      status: accessRequests.status,
      sellerUnseen: accessRequests.sellerUnseen,
      createdAt: accessRequests.createdAt,
      updatedAt: accessRequests.updatedAt,
      propertyId: properties.id,
      propertySlug: properties.publicSlug,
      city: properties.city,
      neighborhood: properties.neighborhood,
      investorId: accessRequests.investorId,
      investorName: investorProfiles.fullName,
      investorType: investorProfiles.investorType,
      investorCountry: investorProfiles.country,
      profileStatus: investorProfiles.status,
    })
    .from(accessRequests)
    .innerJoin(properties, eq(properties.id, accessRequests.propertyId))
    .innerJoin(investorProfiles, eq(investorProfiles.userId, accessRequests.investorId))
    .where(eq(properties.ownerId, actor.id))
    .orderBy(desc(accessRequests.updatedAt));
}

export type InvestorRequestRow = {
  id: string;
  status: AccessStatus;
  investorUnseen: boolean;
  createdAt: Date;
  updatedAt: Date;
  propertySlug: string;
  city: string;
  country: string;
  propertyStatus: string;
};

export async function listInvestorRequests(db: Db, actor: Actor): Promise<InvestorRequestRow[]> {
  if (!actor) return [];
  return db
    .select({
      id: accessRequests.id,
      status: accessRequests.status,
      investorUnseen: accessRequests.investorUnseen,
      createdAt: accessRequests.createdAt,
      updatedAt: accessRequests.updatedAt,
      propertySlug: properties.publicSlug,
      city: properties.city,
      country: properties.country,
      propertyStatus: properties.status,
    })
    .from(accessRequests)
    .innerJoin(properties, eq(properties.id, accessRequests.propertyId))
    .where(eq(accessRequests.investorId, actor.id))
    .orderBy(desc(accessRequests.updatedAt));
}

export type ProfileView = Omit<InvestorProfile, "phone"> & { phone: string | null; email: string | null };

/** The profile as the viewer may see it: contact details only after approval (or for the investor/admin). */
function shapeProfile(actor: NonNullable<Actor>, profile: InvestorProfile, email: string, approved: boolean, ownsListing: boolean): ProfileView | null {
  if (!canViewInvestorProfile(actor, profile.userId, ownsListing)) return null;
  const contact = canViewInvestorContact(actor, profile.userId, ownsListing && approved);
  return { ...profile, phone: contact ? profile.phone : null, email: contact ? email : null };
}

export type RequestDetail = {
  request: AccessRequest;
  property: { id: string; slug: string; city: string; neighborhood: string; country: string; ownerId: string; status: string };
  profile: ProfileView | null;
  messages: RequestMessage[];
  viewerIs: "owner" | "investor" | "admin";
};

/** One request with its thread, for the owner, the investor or an admin. Marks it seen for the viewer. */
export async function getRequestDetail(db: Db, actor: Actor, requestId: string): Promise<RequestDetail | null> {
  if (!actor) return null;
  const row = await loadRequest(db, requestId);
  if (!row) return null;
  const isOwner = row.ownerId === actor.id;
  const isInvestor = row.req.investorId === actor.id;
  if (!isOwner && !isInvestor && actor.role !== "admin") throw new ForbiddenError();

  const [prop] = await db
    .select({ id: properties.id, slug: properties.publicSlug, city: properties.city, neighborhood: properties.neighborhood, country: properties.country, ownerId: properties.ownerId, status: properties.status })
    .from(properties)
    .where(eq(properties.id, row.req.propertyId))
    .limit(1);
  const profile = await getInvestorProfile(db, row.req.investorId);
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, row.req.investorId)).limit(1);
  const messages = await db.select().from(requestMessages).where(eq(requestMessages.requestId, requestId)).orderBy(asc(requestMessages.createdAt));
  await markSeen(db, actor, requestId);

  return {
    request: row.req,
    property: prop,
    profile: profile ? shapeProfile(actor, profile, u?.email ?? "", row.req.status === "approved", isOwner) : null,
    messages,
    viewerIs: isOwner ? "owner" : isInvestor ? "investor" : "admin",
  };
}

/** Admin list of submitted profiles. */
export async function listInvestorsForAdmin(db: Db, actor: Actor) {
  if (!actor || actor.role !== "admin") return [];
  return db
    .select({ userId: investorProfiles.userId, fullName: investorProfiles.fullName, status: investorProfiles.status, investorType: investorProfiles.investorType, country: investorProfiles.country, submittedAt: investorProfiles.submittedAt, email: users.email })
    .from(investorProfiles)
    .innerJoin(users, eq(users.id, investorProfiles.userId))
    .where(inArray(investorProfiles.status, ["submitted", "verified", "suspended"]))
    .orderBy(desc(investorProfiles.submittedAt));
}
