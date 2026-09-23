import "../src/load-env";
import { createPublicClient, createWalletClient, encodeFunctionData, getAddress, keccak256, recoverAddress, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { giftEscrowAbi } from "../src/gift-escrow-abi";
import { FITBIT_CONNECTED_PROVIDER_ID, GOAL_TYPE_FITBIT_ACTIVITY, GOAL_TYPE_STRAVA_DISTANCE, STRAVA_CONNECTED_PROVIDER_ID } from "../src/gift-terms";
import { milestoneGiftAbi } from "../src/milestone-gift-abi";
import { MILESTONE_GOALS, planFor } from "../src/milestone-goals";
import { addMonadGasBuffer } from "../src/monad-gas";
import { MONAD_CHAIN_ID, monadChain, monadTransport, waitForFinality } from "../src/monad/chain";
import { execTransactionData, MULTI_SEND_CALL_ONLY, MULTI_SEND_CALL_ONLY_CODE_HASH, packSafeSignatures, safeAbi, safeMultiSendCallOnly, safeTxHash, SAFE_VERSION, type BatchCall } from "../src/safe";

/**
 * Every goal not yet on the chain, registered in one Safe transaction (D194): the calls of `registerGoal` on
 * `MilestoneGift` and `GiftEscrow`, batched by Safe's canonical MultiSendCallOnly 1.4.1, one hash to sign, one
 * signature per key. The same three passes as `pnpm safe:action`, each possible on another machine:
 *   1. build:   pnpm safe:session                                prints the batch and the one hash to sign
 *   2. sign:    cast wallet sign --no-hash <hash> …              once per key, where the key lives
 *   3. execute: SIGNATURES="0x…,0x…" SEND=1 … pnpm safe:session   recovers both, rehearses, sends
 *
 * What it refuses, before anything is signed: a Safe that is not the one read (version, owners, threshold), a
 * MultiSendCallOnly whose code is not the canonical code, a guard on the Safe, and a goal already registered to
 * something else. A goal already registered as the list says is left out, so the session can be built again after a
 * partial run elsewhere. The batch is atomic: one call that reverts reverts the eleven.
 */

const milestoneAbi = milestoneGiftAbi as unknown as Abi;
const escrowAbi = giftEscrowAbi as unknown as Abi;
const NO_PROVIDER = `0x${"0".repeat(64)}`;
/** Safe 1.3+ keeps its guard here: `keccak256("guard_manager.guard.address")`. */
const GUARD_SLOT = "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";

/** The daily contract's goals of the session: two arguments, no shape. */
export const DAILY_SESSION_GOALS: ReadonlyArray<{ goalType: number; providerId: Hex; source: string }> = [
  { goalType: GOAL_TYPE_FITBIT_ACTIVITY, providerId: FITBIT_CONNECTED_PROVIDER_ID, source: "Fitbit, connected by the person" },
  { goalType: GOAL_TYPE_STRAVA_DISTANCE, providerId: STRAVA_CONNECTED_PROVIDER_ID, source: "Strava, connected by the person" },
];

async function main() {
  const publicClient = createPublicClient({ chain: monadChain, transport: monadTransport() });
  const chainId = await publicClient.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`Refusing to run: chain id ${chainId} is not Monad mainnet (${MONAD_CHAIN_ID})`);

  const safe = getAddress(String(process.env.SAFE_ADDRESS?.trim()));
  const milestone = getAddress(String(process.env.MILESTONE_GIFT_ADDRESS?.trim()));
  const escrow = getAddress(String(process.env.GIFT_ESCROW_ADDRESS?.trim()));
  const read = (functionName: "VERSION" | "getOwners" | "getThreshold" | "nonce") => publicClient.readContract({ address: safe, abi: safeAbi, functionName });
  const [version, ownersRead, thresholdRead, nonceRead] = await Promise.all([read("VERSION"), read("getOwners"), read("getThreshold"), read("nonce")]);
  if (String(version) !== SAFE_VERSION) throw new Error(`Refusing to run: ${safe} says version ${version}, not ${SAFE_VERSION}`);
  const owners = (ownersRead as readonly Address[]).map((owner) => getAddress(owner));
  const threshold = Number(thresholdRead);
  const nonce = process.env.NONCE?.trim() ? BigInt(process.env.NONCE.trim()) : (nonceRead as bigint);

  // The library the Safe will run as itself: read again, compared with the code Safe publishes.
  const code = await publicClient.getCode({ address: MULTI_SEND_CALL_ONLY });
  if (!code || keccak256(code) !== MULTI_SEND_CALL_ONLY_CODE_HASH) throw new Error(`Refusing to run: the code at ${MULTI_SEND_CALL_ONLY} is not Safe's canonical MultiSendCallOnly 1.4.1`);
  const guard = await publicClient.getStorageAt({ address: safe, slot: GUARD_SLOT });
  if (guard && BigInt(guard) !== 0n) throw new Error(`Refusing to run: the Safe has a guard (${guard}) this script does not know`);

  // What is missing, contract by contract; anything registered to something else stops the session.
  const calls: Array<BatchCall & { what: string }> = [];
  for (const goal of MILESTONE_GOALS) {
    const [provider, shape] = await Promise.all([
      publicClient.readContract({ address: milestone, abi: milestoneAbi, functionName: "goalProviders", args: [goal.goalType] }),
      publicClient.readContract({ address: milestone, abi: milestoneAbi, functionName: "goalShapes", args: [goal.goalType] }),
    ]);
    const state = planFor(goal, { provider: String(provider), shape: Number(shape) });
    if (state === "taken") throw new Error(`Refusing to run: milestone goal ${goal.goalType} is registered to something else`);
    if (state === "missing") calls.push({ to: milestone, data: encodeFunctionData({ abi: milestoneAbi, functionName: "registerGoal", args: [goal.goalType, goal.providerId, goal.shape] }), what: `MilestoneGift goal ${goal.goalType}: ${goal.source}, ${goal.detail}` });
  }
  for (const goal of DAILY_SESSION_GOALS) {
    const provider = String(await publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: "goalProviders", args: [goal.goalType] }));
    if (provider.toLowerCase() === goal.providerId.toLowerCase()) continue;
    if (provider.toLowerCase() !== NO_PROVIDER) throw new Error(`Refusing to run: daily goal ${goal.goalType} is registered to something else`);
    calls.push({ to: escrow, data: encodeFunctionData({ abi: escrowAbi, functionName: "registerGoal", args: [goal.goalType, goal.providerId] }), what: `GiftEscrow goal ${goal.goalType}: ${goal.source}` });
  }
  if (calls.length === 0) {
    console.log("every goal of the session is already registered; nothing to sign");
    return;
  }

  const tx = safeMultiSendCallOnly(calls, nonce);
  const hash = safeTxHash(safe, MONAD_CHAIN_ID, tx);
  console.log(
    JSON.stringify(
      { chainId: MONAD_CHAIN_ID, safe, owners, threshold, calls: calls.map((call) => ({ what: call.what, to: call.to, data: call.data })), transaction: { to: tx.to, value: "0", operation: 1, nonce: nonce.toString(), data: tx.data }, signThis: hash },
      null,
      2,
    ),
  );

  const given = String(process.env.SIGNATURES?.trim() ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0) as Hex[];
  if (given.length === 0) {
    console.log(`Sign this one hash with ${threshold} of the owners, each where their key lives:`);
    console.log(`  cast wallet sign --no-hash ${hash} --keystore <the keystore file>`);
    console.log(`  cast wallet sign --no-hash ${hash} --mnemonic "<the twelve words>"`);
    console.log(`Then: SIGNATURES="0xfirst,0xsecond" SEND=1 EXECUTOR_PRIVATE_KEY=… pnpm safe:session (and NONCE=${nonce} if the Safe moves meanwhile).`);
    return;
  }
  const parts = await Promise.all(given.map(async (signature) => ({ owner: getAddress(await recoverAddress({ hash, signature })), signature })));
  const strangers = parts.filter((part) => !owners.includes(part.owner));
  if (strangers.length > 0) throw new Error(`Refusing to run: ${strangers.map((part) => part.owner).join(", ")} signed this but is not an owner of ${safe}`);
  if (parts.length < threshold) throw new Error(`This Safe needs ${threshold} signatures and ${parts.length} were given`);
  const data = execTransactionData(tx, packSafeSignatures(parts));
  const executor = process.env.EXECUTOR?.trim() ? getAddress(process.env.EXECUTOR.trim()) : parts[0].owner;
  // Rehearsed against the chain's own state: a wrong nonce, a signature over another batch, or one call that would
  // revert fails here, where it costs nothing.
  const gas = addMonadGasBuffer(await publicClient.estimateGas({ account: executor, to: safe, data }));
  console.log(JSON.stringify({ call: { from: executor, to: safe, gas: gas.toString() } }, null, 2));
  if (process.env.SEND !== "1") return;
  const key = process.env.EXECUTOR_PRIVATE_KEY?.trim();
  if (!key) throw new Error("SEND=1 needs EXECUTOR_PRIVATE_KEY in your own shell");
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const walletClient = createWalletClient({ account, chain: monadChain, transport: monadTransport() });
  const sent = await walletClient.sendTransaction({ to: safe, data, gas });
  const receipt = await waitForFinality(publicClient, sent);
  if (receipt.status !== "success") throw new Error(`The Safe transaction reverted in ${sent}`);
  console.log(JSON.stringify({ step: "session", txHash: sent, block: receipt.blockNumber.toString(), safeNonce: String(await read("nonce")) }, null, 2));
  console.log("Read back with: CHECK_ONLY=1 pnpm register:milestone-goals, and goalProviders(6) and goalProviders(4) on GiftEscrow.");
}

if (process.argv[1]?.endsWith("safe-session.ts")) {
  main().catch((error) => {
    console.error("SAFE_SESSION_FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
