import "../src/load-env";
import type { Hex } from "viem";
import { settledDaysFromLogs } from "../src/day-record";
import { giftPublicClient } from "../src/gift-reader";
import { loadAllGifts, loadRelayed, loadSettledDays, recordSettledDays } from "../src/gift-store";

/**
 * Writes the per-day record for days settled before it existed, or whose write failed, from the transactions Viky
 * relayed and recorded in `viky_relayed` (D86). Each receipt is read back from the chain and decoded exactly as the
 * keeper decodes it at relay time, so the rows are the contract's own settlement, never an inference. Idempotent: a day
 * already recorded keeps its row. A day settled by a transaction Viky did not relay stays unrecorded, and the screen
 * falls back to the counts for it.
 *
 *   pnpm backfill:days            reads and writes
 *   pnpm backfill:days --dry-run  reads and prints what it would write
 */

const SETTLING: ReadonlySet<string> = new Set(["check-in", "drain", "finalise"]);

async function main() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is not configured");
  const dryRun = process.argv.includes("--dry-run");
  const client = giftPublicClient();
  for (const gift of await loadAllGifts()) {
    // A dry run may come before the migration that makes the table.
    const before = dryRun ? 0 : ((await loadSettledDays([gift.giftId])).get(gift.giftId)?.length ?? 0);
    let found = 0;
    let written = 0;
    for (const relayed of await loadRelayed(gift.giftId)) {
      if (!SETTLING.has(relayed.kind)) continue;
      const receipt = await client.getTransactionReceipt({ hash: relayed.txHash as Hex });
      const days = settledDaysFromLogs(gift.giftId, receipt.logs);
      found += days.length;
      if (!dryRun && days.length > 0) written += await recordSettledDays(gift.giftId, days, relayed.txHash as Hex);
      for (const day of days) console.log(`  gift ${gift.giftId} day ${day.day} ${day.outcome} (${relayed.kind} ${relayed.txHash.slice(0, 10)})`);
    }
    console.log(`gift ${gift.giftId}: ${before} day(s) already recorded, ${found} found in relayed receipts, ${dryRun ? "nothing written (dry run)" : `${written} written`}`);
  }
}

main().catch((error) => {
  console.error("BACKFILL_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
