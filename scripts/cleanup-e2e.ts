/** One-off: removes accounts created by the e2e suite (@e2e.test) together with their listings and files. */
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { properties, storageObjects, users } from "../src/db/schema";

async function main() {
  const db = await getDb();
  const props = await db.execute(sql`select p.id from ${properties} p join ${users} u on u.id = p.owner_id where u.email like '%@e2e.test'`);
  const ids = (props as unknown as { rows?: { id: string }[] }).rows?.map((r) => r.id) ?? (props as unknown as { id: string }[]).map((r) => r.id);
  for (const id of ids) await db.execute(sql`delete from ${storageObjects} where key like ${`photos/${id}/%`}`);
  await db.execute(sql`delete from ${users} where email like '%@e2e.test'`); // listings, requests, sessions cascade
  const left = await db.execute(sql`select (select count(*) from ${users}) as users, (select count(*) from ${properties}) as properties`);
  console.log("Cleanup done:", JSON.stringify((left as unknown as { rows?: unknown[] }).rows ?? left));
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
