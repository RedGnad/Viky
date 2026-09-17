import "../src/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  formatEther,
  getAddress,
  getContractAddress,
  http,
  isAddress,
  keccak256,
  parseEther,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHESS_MODES, chessGoalType, chessProviderId } from "../src/chess-com";
import { giftEscrowAbi } from "../src/gift-escrow-abi";
import { MILESTONE_GAS_CEILING } from "../src/milestone-gas";
import { MILESTONE_FIRST_ID, SHAPE_CLIMB } from "../src/milestone-protocol";
import { addMonadGasBuffer } from "../src/monad-gas";
import { AUSD_ADDRESS, MONAD_CHAIN_ID, monadChain, monadRpcUrl, waitForFinality } from "../src/monad/chain";

/**
 * Deploys MilestoneGift to Monad mainnet for C2: the four Chess.com cadences registered as climbs, creation and
 * readings opened, and ownership handed to the founder. Nothing about this can be undone once sent, so everything
 * that can be checked is checked first, and the plan is printed in full with DRY_RUN before anybody approves it.
 *
 * Refuses to run when: the chain is not Monad mainnet; OWNER_ADDRESS is missing or is the deploying key, so ownership
 * would stay on the key that deployed (the founder's rule, as in deploy-exit-router.ts); the evidence signer named in
 * the environment is not the key the app signs with; AUSD has no code or not six decimals; the daily contract has
 * reached the milestone numbering; the compiled artifact is not the contract in this repository; or the deployer
 * cannot pay for the whole sequence and keep the 10 MON reserve.
 *
 * Inputs (.env.local): DEPLOYER_PRIVATE_KEY, OWNER_ADDRESS, EVIDENCE_SIGNER_ADDRESS, EVIDENCE_SIGNER_PRIVATE_KEY,
 * GIFT_ESCROW_ADDRESS, optional MONAD_RPC_URL. DRY_RUN=1 stops before the first transaction. REHEARSAL=1 is accepted
 * only against a local node (anvil forking mainnet) and runs the whole sequence there.
 *
 * Usage: forge build && DRY_RUN=1 pnpm deploy:milestone-gift
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

/** The reserve Monad holds on every account, plus a working margin, left after the whole sequence has been paid. */
const RESERVE = parseEther("11");

type Step = { name: string; functionName: string; args: readonly unknown[]; ceiling: number };

/**
 * The runtime code with its immutables blanked. The contract writes the token, the chain and its own address into
 * its code at construction, so the code on chain differs from the artifact exactly there and nowhere else.
 */
function withoutImmutables(code: Hex, references: Record<string, Array<{ start: number; length: number }>> = {}): Hex {
  const bytes = Buffer.from(code.slice(2), "hex");
  for (const ranges of Object.values(references)) for (const { start, length } of ranges) bytes.fill(0, start, start + length);
  return `0x${bytes.toString("hex")}`;
}

async function main() {
  const rpc = monadRpcUrl();
  const rehearsal = Boolean(process.env.REHEARSAL);
  if (rehearsal && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(rpc)) throw new Error("Refusing: REHEARSAL runs only against a local node");

  const deployerKey = required("DEPLOYER_PRIVATE_KEY");
  const account = privateKeyToAccount((deployerKey.startsWith("0x") ? deployerKey : `0x${deployerKey}`) as Hex);
  const ownerRaw = required("OWNER_ADDRESS");
  if (!isAddress(ownerRaw)) throw new Error("OWNER_ADDRESS is invalid");
  const owner = getAddress(ownerRaw);
  if (owner === account.address) {
    throw new Error(`Refusing to deploy: OWNER_ADDRESS is the deployer ${account.address}, so ownership would stay on the deployment key`);
  }
  const evidenceSigner = getAddress(required("EVIDENCE_SIGNER_ADDRESS"));
  const signingKey = required("EVIDENCE_SIGNER_PRIVATE_KEY");
  const signingAddress = privateKeyToAccount((signingKey.startsWith("0x") ? signingKey : `0x${signingKey}`) as Hex).address;
  if (signingAddress !== evidenceSigner) {
    throw new Error(`Refusing to deploy: EVIDENCE_SIGNER_ADDRESS is ${evidenceSigner}, but the app signs with ${signingAddress}, so no proof would ever be accepted`);
  }
  const dailyContract = getAddress(required("GIFT_ESCROW_ADDRESS"));

  const artifact = JSON.parse(readFileSync(resolve("out/MilestoneGift.sol/MilestoneGift.json"), "utf8")) as {
    abi: Abi;
    bytecode: { object: Hex };
    deployedBytecode: { object: Hex; immutableReferences?: Record<string, Array<{ start: number; length: number }>> };
    metadata?: { sources?: Record<string, { keccak256?: string }> };
  };
  // The bytecode deployed is the contract in this repository, not an artifact left behind by an older build.
  const sourceHash = keccak256(`0x${Buffer.from(readFileSync(resolve("contracts/MilestoneGift.sol"))).toString("hex")}` as Hex);
  const builtHash = artifact.metadata?.sources?.["contracts/MilestoneGift.sol"]?.keccak256;
  if (builtHash !== sourceHash) throw new Error("Refusing to deploy: out/ was not built from contracts/MilestoneGift.sol as it is now. Run forge build");
  const abi = artifact.abi;

  const transport = http(rpc);
  const publicClient = createPublicClient({ chain: monadChain, transport });
  const walletClient = createWalletClient({ account, chain: monadChain, transport });
  const chainId = await publicClient.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`Refusing to deploy: chain id ${chainId} is not Monad mainnet (${MONAD_CHAIN_ID})`);

  const tokenCode = await publicClient.getCode({ address: AUSD_ADDRESS });
  if (!tokenCode || tokenCode === "0x") throw new Error("Refusing to deploy: AUSD has no code at the pinned address");
  const decimals = (await publicClient.readContract({
    address: AUSD_ADDRESS,
    abi: [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }],
    functionName: "decimals",
  })) as number;
  if (decimals !== 6) throw new Error(`Refusing to deploy: AUSD answers ${decimals} decimals`);
  // Records key on the gift id alone, so the two contracts' numbers must never meet (D44).
  const dailyNext = (await publicClient.readContract({ address: dailyContract, abi: giftEscrowAbi as unknown as Abi, functionName: "nextGiftId" })) as bigint;
  if (dailyNext >= MILESTONE_FIRST_ID) throw new Error(`Refusing to deploy: the daily contract is at gift ${dailyNext}, inside the milestone numbering`);

  // Only the four cadences of Chess.com, every one a climb. No "having it or not" goal is registered on this instance
  // until the two questions D49 left open are settled: whether one certificate may pay two gifts, and what a nullifier
  // is scoped to.
  const steps: Step[] = [
    ...CHESS_MODES.map((mode) => ({
      name: `register Chess.com ${mode} as a climb`,
      functionName: "registerGoal",
      args: [chessGoalType(mode), chessProviderId(mode), SHAPE_CLIMB] as const,
      ceiling: 95_000,
    })),
    { name: "open creation", functionName: "setCreationPaused", args: [false], ceiling: 60_000 },
    { name: "open readings", functionName: "setProofPaused", args: [false], ceiling: 60_000 },
    { name: "hand ownership to the founder", functionName: "transferOwnership", args: [owner], ceiling: 60_000 },
  ];

  const nonce = await publicClient.getTransactionCount({ address: account.address });
  const expected = getContractAddress({ from: account.address, nonce: BigInt(nonce) });
  const constructorArguments = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [AUSD_ADDRESS, evidenceSigner, MILESTONE_FIRST_ID]);
  const deployData = `${artifact.bytecode.object}${constructorArguments.slice(2)}` as Hex;
  const deployGas = addMonadGasBuffer(await publicClient.estimateGas({ account: account.address, data: deployData }));
  // The owner's calls cannot be estimated against a contract that does not exist yet. Their declared limits are
  // ceilings above the Foundry gas report (registerGoal 88,478, the switches 51,471), and the rehearsal on a fork
  // replaces them with the chain's own estimates before anything reaches mainnet.
  const stepGas = steps.map((step) => addMonadGasBuffer(BigInt(step.ceiling)));
  const totalGas = deployGas + stepGas.reduce((sum, gas) => sum + gas, 0n);
  const fees = await publicClient.estimateFeesPerGas();
  const perGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
  const cost = totalGas * perGas;
  const balance = await publicClient.getBalance({ address: account.address });

  const plan = {
    network: { chainId, rpc },
    deployer: account.address,
    deployerNonce: nonce,
    expectedAddress: expected,
    constructor: { token: AUSD_ADDRESS, evidenceSigner, firstGiftId: MILESTONE_FIRST_ID.toString() },
    codeHash: keccak256(withoutImmutables(artifact.deployedBytecode.object, artifact.deployedBytecode.immutableReferences)),
    runtimeBytes: (artifact.deployedBytecode.object.length - 2) / 2,
    dailyContract: { address: dailyContract, nextGiftId: dailyNext.toString() },
    goals: CHESS_MODES.map((mode) => ({ goalType: chessGoalType(mode), cadence: mode, providerId: chessProviderId(mode), shape: "climb" })),
    owner,
    gas: {
      deploy: deployGas.toString(),
      steps: steps.map((step, index) => ({ step: step.name, declared: stepGas[index].toString() })),
      totalDeclared: totalGas.toString(),
      maxFeePerGasGwei: formatEther(perGas * 1_000_000_000n),
      atMostMon: formatEther(cost),
    },
    deployerBalanceMon: formatEther(balance),
    relayerCeilings: MILESTONE_GAS_CEILING,
  };
  console.log(JSON.stringify(plan, null, 2));
  if (balance < cost + RESERVE) {
    throw new Error(`Refusing to deploy: the deployer holds ${formatEther(balance)} MON, and the sequence can cost ${formatEther(cost)} MON on top of the ${formatEther(RESERVE)} MON kept`);
  }

  if (process.env.DRY_RUN) {
    console.log("\nDRY_RUN: every check passed and nothing was sent. Unset DRY_RUN to deploy for real.");
    return;
  }

  const deployHash = await walletClient.deployContract({ abi, bytecode: artifact.bytecode.object, args: [AUSD_ADDRESS, evidenceSigner, MILESTONE_FIRST_ID], gas: deployGas });
  const deployReceipt = await waitForFinality(publicClient, deployHash);
  const address = deployReceipt.contractAddress;
  if (!address) throw new Error("Deployment produced no contract address");
  if (getAddress(address) !== expected) throw new Error(`Deployed at ${address}, not at the expected ${expected}. Stop and read the chain before anything else`);
  const code = await publicClient.getCode({ address });
  if (!code || keccak256(withoutImmutables(code, artifact.deployedBytecode.immutableReferences)) !== plan.codeHash) {
    throw new Error(`The code at ${address} is not the artifact's`);
  }
  console.log(JSON.stringify({ step: "deployed", address, txHash: deployHash, gasUsed: deployReceipt.gasUsed.toString() }));

  for (const [index, step] of steps.entries()) {
    const data = encodeFunctionData({ abi, functionName: step.functionName, args: step.args });
    // Now the contract exists, the chain's own estimate is what is declared, never below it.
    const estimated = addMonadGasBuffer(await publicClient.estimateGas({ account: account.address, to: address, data }));
    const gas = estimated > stepGas[index] ? estimated : stepGas[index];
    const hash = await walletClient.writeContract({ address, abi, functionName: step.functionName, args: step.args, gas });
    const receipt = await waitForFinality(publicClient, hash);
    if (receipt.status !== "success") throw new Error(`${step.name} reverted in ${hash}`);
    console.log(JSON.stringify({ step: step.name, txHash: hash, gasUsed: receipt.gasUsed.toString(), declared: gas.toString() }));
  }

  // Read back what was set, rather than trusting the receipts.
  const read = (functionName: string, args: readonly unknown[] = []) => publicClient.readContract({ address, abi, functionName, args });
  const readBack = {
    owner: await read("owner"),
    creationPaused: await read("creationPaused"),
    proofPaused: await read("proofPaused"),
    nextGiftId: String(await read("nextGiftId")),
    evidenceSigner: await read("evidenceSigner"),
    goals: await Promise.all(CHESS_MODES.map(async (mode) => ({ cadence: mode, provider: await read("goalProviders", [chessGoalType(mode)]), shape: Number(await read("goalShapes", [chessGoalType(mode)])) }))),
  };
  console.log(JSON.stringify({ step: "read back", ...readBack }, null, 2));
  if (getAddress(String(readBack.owner)) !== owner) throw new Error("Ownership did not reach the founder");
  if (readBack.creationPaused || readBack.proofPaused) throw new Error("A switch is still closed");
  for (const goal of readBack.goals) {
    if (goal.provider !== chessProviderId(goal.cadence) || goal.shape !== SHAPE_CLIMB) throw new Error(`The ${goal.cadence} goal did not register as it should`);
  }
  const fifth = await read("goalProviders", [CHESS_MODES.length + 1]);
  if (fifth !== `0x${"0".repeat(64)}`) throw new Error("A goal beyond the four cadences is registered, and none should be");

  console.log("\nAdd to .env.local and to the Vercel environment:");
  console.log(`MILESTONE_GIFT_ADDRESS=${address}`);
  console.log(`NEXT_PUBLIC_MILESTONE_GIFT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error("DEPLOY_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
