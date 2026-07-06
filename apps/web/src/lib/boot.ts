import { getDb, type Db } from "@augmentic/db";
import { seedBuiltins } from "@augmentic/db/seed";
import { startEngine } from "@augmentic/engine";

// Lazy boot on first server-side DB touch: applies migrations (inside
// getDb), seeds built-in templates/tools, and starts the embedded run-engine
// worker. Global-cached so it runs once per server process.
const globalForBoot = globalThis as unknown as {
  __augmenticBoot?: Promise<Db>;
};

export function getBootedDb(): Promise<Db> {
  if (!globalForBoot.__augmenticBoot) {
    globalForBoot.__augmenticBoot = (async () => {
      const db = await getDb();
      await seedBuiltins(db);
      startEngine(db);
      return db;
    })();
  }
  return globalForBoot.__augmenticBoot;
}
