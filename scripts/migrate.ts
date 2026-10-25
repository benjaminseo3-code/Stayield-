import { closeDb, getDb } from "../src/db/client";

async function main() {
  await getDb(); // applies pending migrations
  console.log("Migrations applied.");
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
