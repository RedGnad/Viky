import "dotenv/config";
import { ensureGiftSchema } from "../src/gift-store";
import { ensureProofSessionSchema } from "../src/proof-session-store";

// Creates the tables the routes need on the Neon database named by DATABASE_URL. Idempotent.

async function main() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is not configured");
  await ensureProofSessionSchema();
  await ensureGiftSchema();
  console.log("schema ready: viky_proof_sessions, viky_gifts, viky_relayed");
}

main().catch((error) => {
  console.error("MIGRATE_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
