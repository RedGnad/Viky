import "../src/load-env";
import { createPublicClient, createWalletClient, encodeFunctionData, getAddress, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DUOLINGO_GOAL_PROVIDER_ID, GOAL_TYPE_DUOLINGO_XP } from "../src/gift-attestation";
import { giftEscrowAbi } from "../src/gift-escrow-abi";
import { addMonadGasBuffer } from "../src/monad-gas";
import { monadChain, monadTransport, waitForFinality } from "../src/monad/chain";

/**
 * Registers (or re-registers) the Duolingo goal's provider id on the escrow (owner only). Idempotent:
 * nothing is sent when the registry already holds the id. Used when the verification path of a goal
 * changes (D27: the public mode replaced the session proof for Duolingo).
 */
async function main() {
  const key = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  const escrow = process.env.GIFT_ESCROW_ADDRESS?.trim();
  if (!key || !escrow) throw new Error("DEPLOYER_PRIVATE_KEY and GIFT_ESCROW_ADDRESS are required");
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const publicClient = createPublicClient({ chain: monadChain, transport: monadTransport() });
  const walletClient = createWalletClient({ account, chain: monadChain, transport: monadTransport() });
  const abi = giftEscrowAbi as unknown as Abi;
  const address = getAddress(escrow);
  const current = (await publicClient.readContract({ address, abi, functionName: "goalProviders", args: [GOAL_TYPE_DUOLINGO_XP] })) as Hex;
  console.log(JSON.stringify({ escrow: address, goalType: GOAL_TYPE_DUOLINGO_XP, current, wanted: DUOLINGO_GOAL_PROVIDER_ID }));
  if (current.toLowerCase() === DUOLINGO_GOAL_PROVIDER_ID.toLowerCase()) {
    console.log("already registered, nothing sent");
    return;
  }
  const args = [GOAL_TYPE_DUOLINGO_XP, DUOLINGO_GOAL_PROVIDER_ID] as const;
  const estimate = await publicClient.estimateGas({ account: account.address, to: address, data: encodeFunctionData({ abi, functionName: "registerGoal", args }) });
  const hash = await walletClient.writeContract({ address, abi, functionName: "registerGoal", args, gas: addMonadGasBuffer(estimate) });
  const receipt = await waitForFinality(publicClient, hash);
  if (receipt.status !== "success") throw new Error(`registerGoal reverted: ${hash}`);
  console.log(JSON.stringify({ step: "registerGoal", txHash: hash, block: receipt.blockNumber.toString() }));
}

main().catch((error) => {
  console.error("REGISTER_GOAL_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
