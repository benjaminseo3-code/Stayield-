import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { properties } from "@/db/schema";

/** Increments a listing's view counter (best effort). Plain function, deliberately not a server action. */
export async function countView(db: Db, propertyId: string): Promise<void> {
  await db.update(properties).set({ viewsCount: sql`${properties.viewsCount} + 1` }).where(eq(properties.id, propertyId));
}
