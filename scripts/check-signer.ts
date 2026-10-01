import { config } from "dotenv";
import { contractsNamingAnotherKey, readEvidenceKeys } from "../src/health";

/**
 * Checks that the evidence key of this environment is the signer every contract that takes evidence names on chain
 * (the audit of 1 Oct 2026). A key that is not makes every proof the server attests a refusal of the contract, and
 * nothing said so before a person's proof met it. Run before each deployment, with the environment the deployment
 * will have; the passes and `/api/health` make the same comparison for the environment that is deployed.
 *
 * It reads the chain and nothing else: no database, so it loads the environment files itself rather than through
 * src/load-env.ts, whose database guard has nothing to guard here. The key never leaves the process and is never
 * printed: only the account it signs as.
 *
 * Input: EVIDENCE_SIGNER_PRIVATE_KEY, optional MONAD_RPC_URL. Usage: pnpm check:signer
 */

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const keys = await readEvidenceKeys();
  const others = contractsNamingAnotherKey(keys);
  console.log(`info this environment signs as: ${keys.ours}`);
  for (const entry of keys.named) console.log(`${others.includes(entry.contract) ? "FAIL" : "ok  "} ${entry.contract} names ${entry.signer}`);
  if (others.length > 0) throw new Error("The evidence key of this environment is not the one the contracts name");
}

main().catch((error) => {
  console.error("CHECK_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
