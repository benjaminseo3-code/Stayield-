import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { monthlyAggregates, properties } from "@/db/schema";
import { hasApprovedAccess } from "@/lib/access";
import { canViewReport, ForbiddenError, type Actor } from "@/lib/policies";

export type ReportRow = {
  month: string;
  grossMinor: number;
  netMinor: number;
  bookedNights: number;
  daysInMonth: number;
  reservationsCount: number;
  currency: string;
};

export type ReportData = {
  propertyId: string;
  coverageStart: string | null;
  coverageEnd: string | null;
  trustTier: (typeof properties.$inferSelect)["trustTier"];
  rows: ReportRow[];
};

/**
 * The only function that reads `monthly_aggregates` for display. Throws ForbiddenError unless the
 * policy allows it, so a forgotten check elsewhere cannot leak the report.
 */
export async function getReport(db: Db, actor: Actor, propertyId: string): Promise<ReportData> {
  const [p] = await db
    .select({
      id: properties.id,
      ownerId: properties.ownerId,
      status: properties.status,
      coverageStart: properties.coverageStart,
      coverageEnd: properties.coverageEnd,
      trustTier: properties.trustTier,
    })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!p) throw new ForbiddenError("not found");
  if (!canViewReport(actor, p, await hasApprovedAccess(db, actor?.id, propertyId))) throw new ForbiddenError();

  const rows = await db
    .select({
      month: monthlyAggregates.month,
      grossMinor: monthlyAggregates.grossMinor,
      netMinor: monthlyAggregates.netMinor,
      bookedNights: monthlyAggregates.bookedNights,
      daysInMonth: monthlyAggregates.daysInMonth,
      reservationsCount: monthlyAggregates.reservationsCount,
      currency: monthlyAggregates.currency,
    })
    .from(monthlyAggregates)
    .where(eq(monthlyAggregates.propertyId, propertyId))
    .orderBy(asc(monthlyAggregates.month));

  return {
    propertyId: p.id,
    coverageStart: p.coverageStart,
    coverageEnd: p.coverageEnd,
    trustTier: p.trustTier,
    rows,
  };
}
