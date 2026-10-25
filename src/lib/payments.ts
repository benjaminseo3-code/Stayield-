import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { auditLog, payments, properties, unlocks } from "@/db/schema";
import { canUnlock, type Actor } from "@/lib/policies";

export type StartResult =
  | { ok: true; paymentId: string; alreadyUnlocked: boolean }
  | { ok: false; error: "forbidden" | "not_found" };

/** Creates a pending payment for a buyer unlocking a live listing (idempotent for existing unlocks). */
export async function createPendingPayment(
  db: Db,
  actor: Actor,
  propertyId: string,
  opts: { provider: string; amountMinor: number; currency: string },
): Promise<StartResult> {
  const [p] = await db
    .select({ id: properties.id, ownerId: properties.ownerId, status: properties.status })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!p) return { ok: false, error: "not_found" };
  if (!actor || !canUnlock(actor, p)) return { ok: false, error: "forbidden" };

  const [existing] = await db
    .select({ id: unlocks.id, paymentId: unlocks.paymentId })
    .from(unlocks)
    .where(and(eq(unlocks.buyerId, actor.id), eq(unlocks.propertyId, propertyId)))
    .limit(1);
  if (existing) return { ok: true, paymentId: existing.paymentId, alreadyUnlocked: true };

  const [pay] = await db
    .insert(payments)
    .values({ buyerId: actor.id, propertyId, provider: opts.provider, amountMinor: opts.amountMinor, currency: opts.currency, status: "pending" })
    .returning({ id: payments.id });
  return { ok: true, paymentId: pay.id, alreadyUnlocked: false };
}

/**
 * Settles a payment from a provider result and, on success, grants the permanent unlock.
 * Safe to call repeatedly (webhook retries): a succeeded payment is never downgraded, and the
 * unlock row is unique per buyer+property.
 */
export async function settlePayment(
  db: Db,
  paymentId: string,
  status: "succeeded" | "failed",
  providerRef?: string,
): Promise<{ settled: boolean; unlocked: boolean }> {
  const [pay] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!pay) return { settled: false, unlocked: false };
  if (pay.status === "succeeded") return { settled: true, unlocked: true };

  await db
    .update(payments)
    .set({ status, providerRef: providerRef ?? pay.providerRef, completedAt: new Date() })
    .where(eq(payments.id, paymentId));

  if (status !== "succeeded") return { settled: true, unlocked: false };
  await db.insert(unlocks).values({ buyerId: pay.buyerId, propertyId: pay.propertyId, paymentId: pay.id }).onConflictDoNothing();
  await db.insert(auditLog).values({ actorId: pay.buyerId, action: "report.unlocked", entityType: "property", entityId: pay.propertyId, meta: { paymentId: pay.id, provider: pay.provider } });
  return { settled: true, unlocked: true };
}
