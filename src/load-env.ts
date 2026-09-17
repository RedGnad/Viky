import { config } from "dotenv";
import { assertDatabaseAllowed } from "./database-guard";

// Scripts read the same files Next.js reads: `.env.local` first (never committed), then `.env`.
// Values already present in the process environment always win.
config({ path: [".env.local", ".env"], quiet: true });

// A script run on this machine refuses the production database unless its command says it means to (src/database-guard.ts).
assertDatabaseAllowed();
