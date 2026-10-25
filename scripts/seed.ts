/** Seeds demo users and three DEMO properties (synthetic data) into the configured database. */
import { LocalStorage } from "../src/adapters/local/storage";
import { closeDb, getDb } from "../src/db/client";
import { seedDemo } from "../src/lib/demo-seed";

async function main() {
  const db = await getDb();
  await seedDemo(db, new LocalStorage(process.env.STORAGE_DIR));
  console.log("Seeded demo users and 3 demo properties (synthetic data).");
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
