/**
 * Access policies: the ONE place that decides who may see or do what.
 *
 * Every data-layer function in `src/lib/data` must call these before returning anything. The rules
 * are deliberately expressed over plain values (actor, property, unlock) so they can later be
 * re-expressed as Postgres RLS policies (see docs/RLS_POLICIES.md for the SQL equivalents).
 *
 * Principle: fail closed. Unknown actor, unknown status or a missing input means "deny".
 */
import type { Property } from "@/db/schema";

export type Role = "seller" | "buyer" | "admin";
export type Actor = { id: string; role: Role } | null;

type PropertyRef = Pick<Property, "id" | "ownerId" | "status">;

export class ForbiddenError extends Error {
  constructor(message = "forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

const isAdmin = (a: Actor) => a?.role === "admin";
const isOwner = (a: Actor, p: PropertyRef) => !!a && a.id === p.ownerId;

/** Public teaser fields (photos, price, location, income band, trust tier). */
export function canViewTeaser(actor: Actor, p: PropertyRef): boolean {
  if (p.status === "live") return true;
  return isOwner(actor, p) || isAdmin(actor);
}

/**
 * Full listing detail (real photos, price, location, description, income, the monthly report).
 * Owner and admin always. An investor only while the listing is live AND the owner has approved
 * their access request. Everyone else gets the blurred, redacted public view.
 */
export function canViewFull(actor: Actor, p: PropertyRef, hasApprovedAccess: boolean): boolean {
  if (!actor) return false;
  if (isOwner(actor, p) || isAdmin(actor)) return true;
  return hasApprovedAccess && p.status === "live";
}

/** The monthly report follows the same rule as full detail. */
export const canViewReport = canViewFull;

export type InvestorStatus = "draft" | "submitted" | "verified" | "suspended";
export const COOLDOWN_AFTER_DECLINE_MS = 7 * 24 * 3600_000;

/**
 * An investor may ask for access when: signed in as a non-owner buyer, the listing is live, their
 * profile is submitted (or verified, and not suspended), no request is already active, and a
 * declined request is older than the cool-down.
 */
export function canRequestAccess(
  actor: Actor,
  p: PropertyRef,
  ctx: { profileStatus: InvestorStatus | null; hasActiveRequest: boolean; lastDeclinedAt?: Date | null },
  now = Date.now(),
): boolean {
  if (!actor || actor.role !== "buyer") return false;
  if (p.status !== "live" || isOwner(actor, p)) return false;
  if (ctx.profileStatus !== "submitted" && ctx.profileStatus !== "verified") return false;
  if (ctx.hasActiveRequest) return false;
  if (ctx.lastDeclinedAt && now - ctx.lastDeclinedAt.getTime() < COOLDOWN_AFTER_DECLINE_MS) return false;
  return true;
}

/** Only the owner of the listing decides on requests for it. */
export function canDecideRequest(actor: Actor, p: PropertyRef): boolean {
  return isOwner(actor, p);
}

/**
 * The investor's profile: themselves and admins always; the owner of a listing the investor asked
 * about. Phone and email are shared with the owner only once the request is approved.
 */
export function canViewInvestorProfile(actor: Actor, investorId: string, ownsRequestedListing: boolean): boolean {
  if (!actor) return false;
  return actor.id === investorId || isAdmin(actor) || ownsRequestedListing;
}

export function canViewInvestorContact(actor: Actor, investorId: string, ownsApprovedListing: boolean): boolean {
  if (!actor) return false;
  return actor.id === investorId || isAdmin(actor) || ownsApprovedListing;
}

/**
 * Reservation rows. Buyers never see them, under any circumstances. Nothing in the UI renders
 * them today; this exists so any future seller/admin tooling has to go through a policy.
 */
export function canViewReservationRows(actor: Actor, p: PropertyRef): boolean {
  return isOwner(actor, p) || isAdmin(actor);
}

/** Raw submitted files and verification internals: admin only (they can contain guest data). */
export function canViewRawSubmission(actor: Actor): boolean {
  return isAdmin(actor);
}

export function canEditProperty(actor: Actor, p: PropertyRef): boolean {
  return isOwner(actor, p) || isAdmin(actor);
}

export function canModerate(actor: Actor): boolean {
  return isAdmin(actor);
}

export function canSell(actor: Actor): boolean {
  return actor?.role === "seller" || actor?.role === "admin";
}

export function assert(allowed: boolean, message?: string): asserts allowed {
  if (!allowed) throw new ForbiddenError(message);
}
