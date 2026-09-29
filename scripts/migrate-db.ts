import "../src/load-env";
import { backfillEscrow, ensureGiftSchema } from "../src/gift-store";
import { ensureExitSchema } from "../src/exit-store";
import { ensureProofSessionSchema } from "../src/proof-session-store";
import { ensureMilestoneSchema } from "../src/milestone-store";
import { ensurePassSchema } from "../src/pass-log";
import { ensurePortalSchema } from "../src/portal-store";
import { ensureConnectionSchema } from "../src/connection-store";
import { ensurePreferencesSchema } from "../src/preferences-store";
import { ensurePrivateSpaceSchema } from "../src/private-space-store";
import { ensureRelayCeilingSchema } from "../src/relay-ceiling-store";
import { ensurePushSchema } from "../src/push-store";
import { ensureReachedSeenSchema } from "../src/reached-seen-store";
import { ensureSendsSchema } from "../src/send-store";
import { ensurePhoneOrderSchema } from "../src/phone-order-store";

// Creates the tables the routes need on the Neon database named by DATABASE_URL. Idempotent.

async function main() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is not configured");
  await ensureProofSessionSchema();
  await ensureGiftSchema();
  await ensureMilestoneSchema();
  await ensureExitSchema();
  await ensureSendsSchema();
  await ensurePreferencesSchema();
  await ensurePrivateSpaceSchema();
  await ensureRelayCeilingSchema();
  await ensurePortalSchema();
  // The connected sources' sealed keys (D188): no route creates this table, so the migration does.
  await ensureConnectionSchema();
  await ensurePushSchema();
  await ensureReachedSeenSchema();
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
  console.log("schema ready: viky_proof_sessions, viky_gifts, viky_relayed, viky_days, viky_milestone_gifts, viky_milestone_readings, viky_connections, viky_exits, viky_sends, viky_accounts, viky_private_spaces, viky_relay_counts, viky_push, viky_told, viky_passes, viky_portals, viky_phone_orders");
}

main().catch((error) => {
  console.error("MIGRATE_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
