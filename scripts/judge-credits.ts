import "../src/load-env";
import { judgeCreditConfig, loadJudgeCredits } from "../src/judge-credit";

/**
 * The judge credits' journal (D291), one line per account: when, the account, the amount, where it stands, the
 * transfer's hash, and how many wrong codes it typed. Read by an operator; writes nothing.
 *
 * Against production, the operator command of "The test database" applies (`VIKY_ALLOW_PRODUCTION_DATABASE=1`).
 */
async function main() {
  const rows = await loadJudgeCredits();
  const config = judgeCreditConfig();
  let given = 0n;
  for (const row of rows) {
    if (row.state === "sent" || row.state === "sending") given += BigInt(row.units);
    console.log([row.createdAt, row.account, `${Number(row.units) / 1_000_000} AUSD`, row.state, row.txHash ?? "-", `wrong codes ${row.wrongCodes}`].join("  "));
  }
  console.log(`${rows.length} line(s); ${Number(given) / 1_000_000} AUSD given or on its way${config ? ` of a ${Number(config.capUnits) / 1_000_000} AUSD ceiling` : "; credits are not configured here"}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
