import { getDb } from "../client";
import { seedBuiltins } from "./index";

const db = await getDb();
await seedBuiltins(db);
console.log("seed complete");
process.exit(0);
