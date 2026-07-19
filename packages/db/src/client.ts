import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

export type Db = import("drizzle-orm/pglite").PgliteDatabase<typeof schema> &
  // Structural union so services can accept either driver.
  Record<never, never>;

const globalForDb = globalThis as unknown as {
  __augmenticDb?: Promise<Db>;
};

const pkgRoot = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
);

function resolveMigrationsFolder(): string {
  const candidates = [
    process.env.AUGMENTIC_MIGRATIONS_DIR,
    // Packaged monorepo deployments preserve traced files from the repo root.
    path.join(process.cwd(), "packages", "db", "migrations"),
    // Local commands for this package and the Next.js app run from nested dirs.
    path.join(process.cwd(), "..", "..", "packages", "db", "migrations"),
    path.join(pkgRoot, "migrations"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const migrationsFolder = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "meta", "_journal.json")),
  );
  if (!migrationsFolder) {
    throw new Error(
      `Database migrations are missing from the server bundle (checked: ${candidates.join(", ")})`,
    );
  }
  return migrationsFolder;
}

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url && process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is required in production; filesystem-backed PGlite is development-only",
    );
  }
  const migrationsFolder = resolveMigrationsFolder();
  if (url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString: url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder });
    return db as unknown as Db;
  }
  // Zero-setup dev: embedded PGlite persisted under .pglite/ at repo root.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir =
    process.env.PGLITE_DATA_DIR === ":memory:"
      ? undefined
      : (process.env.PGLITE_DATA_DIR ??
        path.join(pkgRoot, "..", "..", ".pglite", "data"));
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const pglite = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzle(pglite, { schema });
  await migrate(db, { migrationsFolder });
  return db as Db;
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__augmenticDb) {
    globalForDb.__augmenticDb = createDb();
  }
  return globalForDb.__augmenticDb;
}

export { schema };
