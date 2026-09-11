import "../src/load-env";
import { createPublicClient, getAddress, http, isAddress, type Hex } from "viem";
import { DUOLINGO_GOAL_PROVIDER_ID, GIFT_DOMAIN, GOAL_TYPE_DUOLINGO_XP } from "../src/gift-attestation";
import { giftEscrowAbi } from "../src/gift-escrow-abi";
import { AUSD_ADDRESS, MONAD_CHAIN_ID, monadChain, monadRpcUrl } from "../src/monad/chain";

/**
 * Reads the deployed GiftEscrow and checks it is the contract the app expects: the AUSD token, the evidence
 * signer, the Duolingo goal in the registry, the pause flags and the EIP-712 domain. Exits non-zero on any
 * mismatch. This is the "verify in 30 seconds" the judges page points to, and the relayer's preflight.
 *
 * Inputs (.env): GIFT_ESCROW_ADDRESS, EVIDENCE_SIGNER_ADDRESS, optional MONAD_RPC_URL.
 */

async function main() {
  const escrowRaw = process.env.GIFT_ESCROW_ADDRESS?.trim();
  const signerRaw = process.env.EVIDENCE_SIGNER_ADDRESS?.trim();
  if (!escrowRaw || !isAddress(escrowRaw)) throw new Error("GIFT_ESCROW_ADDRESS is missing or invalid");
  if (!signerRaw || !isAddress(signerRaw)) throw new Error("EVIDENCE_SIGNER_ADDRESS is missing or invalid");
  const escrow = getAddress(escrowRaw);
  const expectedSigner = getAddress(signerRaw);

  const client = createPublicClient({ chain: monadChain, transport: http(monadRpcUrl()) });
  const chainId = await client.getChainId();
  const read = <T>(functionName: string, args: readonly unknown[] = []) =>
    client.readContract({ address: escrow, abi: giftEscrowAbi, functionName: functionName as never, args: args as never }) as Promise<T>;

  const [token, evidenceSigner, owner, creationPaused, checkInPaused, duolingoProvider, nextGiftId, domain] = await Promise.all([
    read<Hex>("token"),
    read<Hex>("evidenceSigner"),
    read<Hex>("owner"),
    read<boolean>("creationPaused"),
    read<boolean>("checkInPaused"),
    read<Hex>("goalProviders", [GOAL_TYPE_DUOLINGO_XP]),
    read<bigint>("nextGiftId"),
    read<readonly [Hex, string, string, bigint, Hex, Hex, readonly bigint[]]>("eip712Domain"),
  ]);

  const checks: Array<[string, boolean, string]> = [
    ["chain id", chainId === MONAD_CHAIN_ID, `${chainId}`],
    ["token is AUSD", getAddress(token) === AUSD_ADDRESS, token],
    ["evidence signer", getAddress(evidenceSigner) === expectedSigner, evidenceSigner],
    ["Duolingo goal registered", duolingoProvider.toLowerCase() === DUOLINGO_GOAL_PROVIDER_ID.toLowerCase(), duolingoProvider],
    ["creation open", creationPaused === false, String(creationPaused)],
    ["check-in open", checkInPaused === false, String(checkInPaused)],
    ["domain name", domain[1] === GIFT_DOMAIN.name, domain[1]],
    ["domain version", domain[2] === GIFT_DOMAIN.version, domain[2]],
    ["domain chain", Number(domain[3]) === GIFT_DOMAIN.chainId, String(domain[3])],
    ["domain contract", getAddress(domain[4]) === escrow, domain[4]],
  ];

  let ok = true;
  for (const [label, passed, value] of checks) {
    if (!passed) ok = false;
    console.log(`${passed ? "ok  " : "FAIL"} ${label}: ${value}`);
  }
  console.log(`info owner: ${owner}`);
  // Gift ids continue across deployments (D30), so the count is not the id minus one.
  console.log(`info next gift id: ${nextGiftId}`);
  if (!ok) throw new Error("GiftEscrow does not match the expected configuration");
}

main().catch((error) => {
  console.error("CHECK_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
