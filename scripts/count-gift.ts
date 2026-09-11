import "../src/load-env";
import { runPublicCheckIn, type PublicCheckInPurpose } from "../src/duolingo-public-checkin";

/**
 * Operator entry point of the public mode: bind or count one gift from a terminal, with the same code
 * path as the routes and the daily pass. Usage: pnpm count:gift <giftId> [bind|count] [--force]
 */
async function main() {
  const [giftId, purposeArg] = process.argv.slice(2);
  if (!giftId) throw new Error("Usage: pnpm count:gift <giftId> [bind|count] [--force]");
  const purpose: PublicCheckInPurpose = purposeArg === "bind" ? "bind" : "count";
  const outcome = await runPublicCheckIn({ giftId, purpose, force: process.argv.includes("--force") });
  console.log(JSON.stringify(outcome));
}

main().catch((error) => {
  console.error("COUNT_GIFT_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
