import "../src/load-env";
import { backfillEscrow, ensureGiftSchema } from "../src/gift-store";
import { ensureExitSchema } from "../src/exit-store";
import { ensureProofSessionSchema } from "../src/proof-session-store";
import { ensureMilestoneSchema } from "../src/milestone-store";
import { ensurePassSchema } from "../src/pass-log";
import { ensurePortalSchema } from "../src/portal-store";
import { ensureConnectionSchema } from "../src/connection-store";
import { ensurePreferencesSchema } from "../src/preferences-store";
import { ensureRelayCeilingSchema } from "../src/relay-ceiling-store";
import { ensurePushSchema } from "../src/push-store";
import { ensureReachedSeenSchema } from "../src/reached-seen-store";
import { ensurePassGuardSchema } from "../src/frequent-pass";
import { ensureSendsSchema } from "../src/send-store";
import { ensurePhoneOrderSchema } from "../src/phone-order-store";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "../src/database-guard";

// Creates the tables the routes need on the Neon database named by DATABASE_URL. Idempotent.

/** The sealed envelopes of "Private to you", which Viky no longer offers and nobody can open without it. */
async function dropPrivateSpaces(): Promise<void> {
  await neon(databaseUrl())`DROP TABLE IF EXISTS viky_private_spaces`;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is not configured");
  await ensureProofSessionSchema();
  await ensureGiftSchema();
  await ensureMilestoneSchema();
  await ensureExitSchema();
  await ensureSendsSchema();
  await ensurePreferencesSchema();
  // "Private to you" is gone (the founder, 29 Sep 2026): its sealed envelopes go with it.
  await dropPrivateSpaces();
  await ensureRelayCeilingSchema();
  await ensurePortalSchema();
  // The connected sources' sealed keys (D188): no route creates this table, so the migration does.
  await ensureConnectionSchema();
  await ensurePushSchema();
  await ensureReachedSeenSchema();
  await ensurePassGuardSchema();
  await ensurePassSchema();
  // The phone way out's ledger (D238).
  await ensurePhoneOrderSchema();
  // Gifts saved before the escrow column existed live on the contract configured when this migration
  // first ran (D30). Pass BACKFILL_ESCROW explicitly: the current contract may already be a newer one.
  const backfill = process.env.BACKFILL_ESCROW?.trim();
  if (backfill) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(backfill)) throw new Error("BACKFILL_ESCROW is not a contract identifier");
    console.log(`escrow recorded for ${await backfillEscrow(backfill as `0x${string}`)} earlier gift(s)`);
  }
  // The tables as the database holds them now, read back rather than recited: the line used to name a table this
  // very script drops (the audit of 1 Oct 2026).
  const tables = (await neon(databaseUrl())`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'viky%' ORDER BY table_name`) as Array<{ table_name: string }>;
  console.log(`schema ready: ${tables.map((table) => table.table_name).join(", ")}`);
}

main().catch((error) => {
  console.error("MIGRATE_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
