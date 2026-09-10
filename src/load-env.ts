import { config } from "dotenv";

// Scripts read the same files Next.js reads: `.env.local` first (never committed), then `.env`.
// Values already present in the process environment always win.
config({ path: [".env.local", ".env"], quiet: true });
