// Applies pending migrations (both drivers apply automatically on first
// connection; this script exists for explicit CI/deploy usage).
import { getDb } from "./client";

const db = await getDb();
void db;
console.log("migrations applied");
process.exit(0);
