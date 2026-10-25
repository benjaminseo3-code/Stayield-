import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { Db } from "@/db/client";

/** A fresh in-memory Postgres (PGlite) with all migrations applied. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return { db: db as unknown as Db, close: () => client.close() };
}

export async function makeUser(db: Db, id: string, role: "seller" | "buyer" | "admin" = "buyer") {
  await db.insert(schema.users).values({ id, email: `${id}@test.local`, name: id, role, emailVerified: true });
}
