import "../src/load-env";
import { createPublicClient, createWalletClient, encodeFunctionData, getAddress, http, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { milestoneGiftAbi } from "../src/milestone-gift-abi";
import { MILESTONE_GOALS, planFor } from "../src/milestone-goals";
import { SHAPE_CLIMB, SHAPE_HAVE_OR_NOT } from "../src/milestone-protocol";
import { addMonadGasBuffer } from "../src/monad-gas";
import { MONAD_CHAIN_ID, monadChain, monadRpcUrl, waitForFinality } from "../src/monad/chain";

/**
 * The session that registers every goal on `MilestoneGift`, run by its owner (U3, 18 Sep 2026).
 *
 * A goal is a number, the provider id every proof for it must carry, and the shape it is judged by. They are signed
 * in one session rather than one at a time, because each one is a small owner call and a session is a thing the
 * founder has to sit down for.
 *
 * Three rules it never breaks:
 * 1. **It only adds.** A number already registered to another provider or another shape stops the whole run, because
 *    a live gift keys on that number and moving it under one would change what settles it.
 * 2. **It is idempotent.** A goal already registered exactly as this list says is skipped, so the session can be run
 *    again after a failure without asking what happened.
 * 3. **It reads back.** What the chain says afterwards is what is checked, never the receipts.
 *
 * Run it empty first: `DRY_RUN=1 pnpm register:milestone-goals` prints the plan and sends nothing.
 * Check it any time, from any machine, with no key at all: `pnpm check:milestone-goals`.
 *
 * `pnpm prepare:milestone-goals` writes the calls out instead of sending them: one `to`, `data` and gas per goal, to
 * be signed from the owner's own wallet. That is the way the session is meant to run, because the owner is a wallet
 * the founder holds and not a key in a file: nothing here ever needs that key.
 */

const abi = milestoneGiftAbi as unknown as Abi;
/** Above the Foundry gas report for `registerGoal` (88,478), before the Monad margin. */
const REGISTER_CEILING = 95_000n;

type OnChainGoal = { goalType: number; provider: string; shape: number };

function shapeInWords(shape: number): string {
  if (shape === SHAPE_CLIMB) return "climb";
  if (shape === SHAPE_HAVE_OR_NOT) return "having it or not";
  return `unknown (${shape})`;
}

async function readGoals(publicClient: ReturnType<typeof createPublicClient>, address: Hex): Promise<OnChainGoal[]> {
  const read = (functionName: string, args: readonly unknown[]) => publicClient.readContract({ address, abi, functionName, args });
  return await Promise.all(
    MILESTONE_GOALS.map(async (goal) => ({
      goalType: goal.goalType,
      provider: String(await read("goalProviders", [goal.goalType])),
      shape: Number(await read("goalShapes", [goal.goalType])),
    })),
  );
}

async function main() {
  const address = getAddress(String(process.env.MILESTONE_GIFT_ADDRESS?.trim()));
  const publicClient = createPublicClient({ chain: monadChain, transport: http(monadRpcUrl()) });
  const chainId = await publicClient.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`Refusing to run: chain id ${chainId} is not Monad mainnet (${MONAD_CHAIN_ID})`);

  const onChain = await readGoals(publicClient, address);
  const plan = MILESTONE_GOALS.map((goal, index) => ({ goal, state: planFor(goal, onChain[index]) }));
  console.log(
    JSON.stringify(
      {
        contract: address,
        owner: await publicClient.readContract({ address, abi, functionName: "owner" }),
        goals: plan.map(({ goal, state }) => ({ goalType: goal.goalType, source: goal.source, detail: goal.detail, shape: shapeInWords(goal.shape), providerId: goal.providerId, state })),
      },
      null,
      2,
    ),
  );

  const taken = plan.filter(({ state }) => state === "taken");
  if (taken.length > 0) {
    throw new Error(`Refusing to run: goal ${taken.map(({ goal }) => goal.goalType).join(", ")} is registered to something else already`);
  }
  const missing = plan.filter(({ state }) => state === "missing").map(({ goal }) => goal);
  if (missing.length === 0) {
    console.log("every goal is already registered as this list says; nothing to send");
    return;
  }
  if (process.env.CHECK_ONLY === "1") {
    throw new Error(`${missing.length} goal(s) are not registered: ${missing.map((goal) => `${goal.source} ${goal.detail}`).join(", ")}`);
  }

  const gas = addMonadGasBuffer(REGISTER_CEILING);
  const fees = await publicClient.estimateFeesPerGas();
  const perGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
  console.log(JSON.stringify({ toSend: missing.length, gasEach: gas.toString(), costAtMost: (gas * perGas * BigInt(missing.length)).toString() }));

  // The calls, written out for the owner to sign from their own wallet. Nothing is sent and no key is read.
  if (process.env.WALLET === "1") {
    const calls = missing.map((goal) => ({
      step: `register ${goal.source} ${goal.detail} as ${shapeInWords(goal.shape)}`,
      to: address,
      value: "0",
      gas: gas.toString(),
      data: encodeFunctionData({ abi, functionName: "registerGoal", args: [goal.goalType, goal.providerId, goal.shape] }),
    }));
    console.log(JSON.stringify({ chainId: MONAD_CHAIN_ID, from: await publicClient.readContract({ address, abi, functionName: "owner" }), calls }, null, 2));
    console.log("Sign these from the owner's wallet, in this order, then run `pnpm check:milestone-goals`.");
    return;
  }
  if (process.env.DRY_RUN === "1") {
    console.log("DRY_RUN: nothing was sent");
    return;
  }

  const key = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY is required to register a goal; it must be the contract's owner");
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const owner = getAddress(String(await publicClient.readContract({ address, abi, functionName: "owner" })));
  if (getAddress(account.address) !== owner) throw new Error(`Refusing to run: this key is ${account.address}, and the owner is ${owner}`);
  const walletClient = createWalletClient({ account, chain: monadChain, transport: http(monadRpcUrl()) });

  for (const goal of missing) {
    const args = [goal.goalType, goal.providerId, goal.shape] as const;
    // Estimated against the live contract, with the ceiling as the guard: an estimate far above it means the call is
    // not what this script thinks it is.
    const estimate = await publicClient.estimateGas({ account: account.address, to: address, data: encodeFunctionData({ abi, functionName: "registerGoal", args }) });
    if (estimate > REGISTER_CEILING) throw new Error(`Refusing to send: registering goal ${goal.goalType} estimates ${estimate}, above the ceiling ${REGISTER_CEILING}`);
    const hash = await walletClient.writeContract({ address, abi, functionName: "registerGoal", args, gas });
    const receipt = await waitForFinality(publicClient, hash);
    if (receipt.status !== "success") throw new Error(`registering goal ${goal.goalType} reverted in ${hash}`);
    console.log(JSON.stringify({ step: `register ${goal.source} ${goal.detail}`, goalType: goal.goalType, txHash: hash, gasUsed: receipt.gasUsed.toString() }));
  }

  // Read back, and check every goal of the list rather than only the ones this run sent.
  const after = await readGoals(publicClient, address);
  for (const [index, goal] of MILESTONE_GOALS.entries()) {
    if (planFor(goal, after[index]) !== "registered") {
      throw new Error(`Goal ${goal.goalType} (${goal.source} ${goal.detail}) did not register as it should: ${JSON.stringify(after[index])}`);
    }
  }
  console.log(JSON.stringify({ step: "read back", goals: after.map((goal) => ({ ...goal, shape: shapeInWords(goal.shape) })) }, null, 2));
}

main().catch((error) => {
  console.error("REGISTER_GOALS_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
