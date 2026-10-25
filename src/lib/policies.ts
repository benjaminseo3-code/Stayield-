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
 * Monthly aggregates (the paid report). Owner and admin always; a buyer only after unlocking.
 * An unlock is permanent: it keeps working if the seller later unpublishes the listing, and ends
 * only when the seller deletes the data (the rows cascade away).
 */
export function canViewReport(actor: Actor, p: PropertyRef, hasUnlock: boolean): boolean {
  if (!actor) return false;
  if (isOwner(actor, p) || isAdmin(actor)) return true;
  return hasUnlock;
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

/** A buyer may unlock a live listing they do not own. */
export function canUnlock(actor: Actor, p: PropertyRef): boolean {
  if (!actor || p.status !== "live") return false;
  return !isOwner(actor, p);
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
