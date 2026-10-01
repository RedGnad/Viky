import "../src/load-env";
import { COUNTING_PASS, dailyPass, SETTLING_PASS } from "../src/daily-pass";

/**
 * The self-run keeper (the organisers' own recommendation while Chainlink Automation is not confirmed on
 * Monad): the daily pass, once a day. Counts every bound gift from its public profile (D27), drains the
 * days whose catch-up window has elapsed, finalises ended gifts, and with --refund sends back what is
 * refundable. Every step is a relayed transaction with an explicit gas limit, waited to finality.
 *
 * Usage: pnpm keeper [--refund]
 */

async function main() {
  const report = await dailyPass(process.argv.includes("--settle") ? SETTLING_PASS : COUNTING_PASS);
  console.log(JSON.stringify({ relayer: report.relayer, balanceWei: report.balanceWei }));
  for (const line of report.lines) console.log(JSON.stringify(line));
  for (const line of report.watch) console.log(JSON.stringify(line));
  for (const line of report.unsent) console.log(JSON.stringify({ unsent: line }));
}

main().catch((error) => {
  console.error("KEEPER_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
