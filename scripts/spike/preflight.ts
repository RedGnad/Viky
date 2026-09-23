import "../../src/load-env";
import { createPublicClient, formatEther, getAddress, isAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AUSD_DOMAIN } from "../../src/ausd-authorization";
import { DUOLINGO_GOAL_PROVIDER_ID, GOAL_TYPE_DUOLINGO_XP } from "../../src/gift-terms";
import { giftEscrowAbi } from "../../src/gift-escrow-abi";
import { AUSD_ADDRESS, MONAD_CHAIN_ID, monadChain, monadTransport } from "../../src/monad/chain";
import { proofSessionStorageReachable } from "../../src/proof-session-store";
import { RELAYER_MIN_BALANCE } from "../../src/relayer";

/**
 * Everything the first mainnet chain (KT1) needs, checked before a single unit of money moves. Each line
 * is a fact read at its source; a FAIL stops the spike with the reason.
 */

type Check = [label: string, ok: boolean, detail: string];

async function main() {
  const checks: Check[] = [];
  const client = createPublicClient({ chain: monadChain, transport: monadTransport() });

  const chainId = await client.getChainId();
  checks.push(["chain id is Monad mainnet", chainId === MONAD_CHAIN_ID, String(chainId)]);

  const domain = (await client.readContract({
    address: AUSD_ADDRESS,
    abi: [{ type: "function", name: "eip712Domain", stateMutability: "view", inputs: [], outputs: [{ type: "bytes1" }, { type: "string" }, { type: "string" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "uint256[]" }] }],
    functionName: "eip712Domain",
  })) as readonly [Hex, string, string, bigint, Hex, Hex, readonly bigint[]];
  checks.push(["AUSD domain name", domain[1] === AUSD_DOMAIN.name, domain[1]]);
  checks.push(["AUSD domain version", domain[2] === AUSD_DOMAIN.version, domain[2]]);
  checks.push(["AUSD domain contract", getAddress(domain[4]) === AUSD_ADDRESS, domain[4]]);

  const relayerKey = process.env.RELAYER_PRIVATE_KEY?.trim();
  if (relayerKey) {
    const relayer = privateKeyToAccount((relayerKey.startsWith("0x") ? relayerKey : `0x${relayerKey}`) as Hex);
    const balance = await client.getBalance({ address: relayer.address });
    checks.push(["relayer above reserve plus margin", balance >= RELAYER_MIN_BALANCE, `${relayer.address} holds ${formatEther(balance)} MON`]);
  } else {
    checks.push(["relayer configured", false, "RELAYER_PRIVATE_KEY missing"]);
  }

  const signerKey = process.env.EVIDENCE_SIGNER_PRIVATE_KEY?.trim();
  const signer = signerKey ? privateKeyToAccount((signerKey.startsWith("0x") ? signerKey : `0x${signerKey}`) as Hex).address : undefined;
  checks.push(["evidence signer configured", Boolean(signer), signer ?? "EVIDENCE_SIGNER_PRIVATE_KEY missing"]);

  const escrow = process.env.GIFT_ESCROW_ADDRESS?.trim();
  if (escrow && isAddress(escrow)) {
    const [onChainSigner, provider, creationPaused, checkInPaused, token] = await Promise.all([
      client.readContract({ address: escrow, abi: giftEscrowAbi, functionName: "evidenceSigner" }) as Promise<Hex>,
      client.readContract({ address: escrow, abi: giftEscrowAbi, functionName: "goalProviders", args: [GOAL_TYPE_DUOLINGO_XP] }) as Promise<Hex>,
      client.readContract({ address: escrow, abi: giftEscrowAbi, functionName: "creationPaused" }) as Promise<boolean>,
      client.readContract({ address: escrow, abi: giftEscrowAbi, functionName: "checkInPaused" }) as Promise<boolean>,
      client.readContract({ address: escrow, abi: giftEscrowAbi, functionName: "token" }) as Promise<Hex>,
    ]);
    checks.push(["escrow evidence signer matches", Boolean(signer) && getAddress(onChainSigner) === signer, onChainSigner]);
    checks.push(["escrow Duolingo goal registered", provider.toLowerCase() === DUOLINGO_GOAL_PROVIDER_ID.toLowerCase(), provider]);
    checks.push(["escrow creation open", !creationPaused, String(creationPaused)]);
    checks.push(["escrow check-in open", !checkInPaused, String(checkInPaused)]);
    checks.push(["escrow token is AUSD", getAddress(token) === AUSD_ADDRESS, token]);
  } else {
    checks.push(["escrow configured", false, "GIFT_ESCROW_ADDRESS missing"]);
  }

  checks.push(["Reclaim app configured", Boolean(process.env.RECLAIM_APP_ID?.trim() && process.env.RECLAIM_APP_SECRET?.trim()), "RECLAIM_APP_ID and RECLAIM_APP_SECRET"]);
  checks.push(["identity key configured", Boolean(process.env.IDENTITY_HMAC_KEY?.trim()), "IDENTITY_HMAC_KEY"]);
  checks.push(["session secret configured", (process.env.SESSION_SIGNING_SECRET?.trim().length ?? 0) >= 32, "SESSION_SIGNING_SECRET (32+ chars)"]);
  checks.push(["database reachable", Boolean(process.env.DATABASE_URL?.trim()) && (await proofSessionStorageReachable()), "DATABASE_URL"]);

  try {
    const kuru = await fetch("https://ws.kuru.io/api/generate-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_address: "0x000000000000000000000000000000000000dEaD" }),
      signal: AbortSignal.timeout(10_000),
    });
    checks.push(["Kuru Flow answers", kuru.ok, String(kuru.status)]);
  } catch (error) {
    checks.push(["Kuru Flow answers", false, error instanceof Error ? error.message : "unreachable"]);
  }

  let ok = true;
  for (const [label, passed, detail] of checks) {
    if (!passed) ok = false;
    console.log(`${passed ? "ok  " : "FAIL"} ${label}: ${detail}`);
  }
  if (!ok) throw new Error("preflight failed");
}

main().catch((error) => {
  console.error("PREFLIGHT_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
