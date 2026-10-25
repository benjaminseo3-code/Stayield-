import "server-only";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

type Handle = { db: Db; ready: Promise<void>; close: () => Promise<void> };

function open(): Handle {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url });
    const db = drizzlePg(pool, { schema });
    return {
      db,
      ready: migratePg(db, { migrationsFolder: MIGRATIONS }),
      close: () => pool.end(),
    };
  }
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "db");
  // `memory://` is used by tests; otherwise a persisted data directory.
  const client = new PGlite(dir === "memory" ? undefined : dir);
  const db = drizzlePglite(client, { schema });
  return {
    db,
    ready: migratePglite(db, { migrationsFolder: MIGRATIONS }),
    close: () => client.close(),
  };
}

// One handle per process, kept across Next.js dev hot reloads.
const g = globalThis as unknown as { __stayieldDb?: Handle };

/** Returns the database, applying pending migrations on first use. */
export async function getDb(): Promise<Db> {
  g.__stayieldDb ??= open();
  await g.__stayieldDb.ready;
  return g.__stayieldDb.db;
}

export async function closeDb(): Promise<void> {
  if (g.__stayieldDb) {
    await g.__stayieldDb.close();
    g.__stayieldDb = undefined;
  }
}

export { schema };
