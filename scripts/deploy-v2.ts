import "../src/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, encodeAbiParameters, encodeFunctionData, formatEther, getAddress, getContractAddress, http, isAddress, keccak256, parseEther, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DAILY_GOALS } from "../src/daily-goals";
import { giftEscrowAbi } from "../src/gift-escrow-abi";
import { milestoneGiftAbi } from "../src/milestone-gift-abi";
import { MILESTONE_GOALS } from "../src/milestone-goals";
import { MILESTONE_FIRST_ID } from "../src/milestone-protocol";
import { addMonadGasBuffer } from "../src/monad-gas";
import { AUSD_ADDRESS, MONAD_CHAIN_ID, monadChain, monadRpcUrl, monadTransport, waitForFinality } from "../src/monad/chain";
import { EARLIER_GIFT_ESCROW, GIFT_ESCROW, MILESTONE_GIFT } from "../src/viky-contracts";

/**
 * Deploys the second version of the gift contracts to Monad mainnet (the audit of 1 Oct 2026): `GiftEscrowV2`,
 * `MilestoneGiftV2` and `ConsentAnchor`, in one run. It registers every goal that has a condition behind it, opens
 * creation and readings, and hands the three to the owner, who then accepts them (ownership moves in two steps).
 *
 * Nothing of this can be undone once sent, and on these contracts a goal is added and never changed. So everything
 * that can be checked is checked first, and the whole plan is printed with DRY_RUN before anybody approves it.
 *
 * Refuses to run when: the chain is not Monad mainnet; OWNER_ADDRESS is missing or is the deploying key; the evidence
 * signer named is not the key the app signs with; AUSD has no code or not six decimals; a compiled artifact was not
 * built from the contract in this repository; a goal of the register is not what the contract in service holds for
 * the same number; **creation is still open on a contract being replaced**, because a gift made there after the
 * numbering was read would take a number the new contract gives out too; or the deployer cannot pay for the whole
 * sequence and keep the 10 MON reserve.
 *
 * Inputs (.env.local): DEPLOYER_PRIVATE_KEY, OWNER_ADDRESS (the Safe), EVIDENCE_SIGNER_ADDRESS,
 * EVIDENCE_SIGNER_PRIVATE_KEY, RELAYER_ADDRESS (the anchorer of ConsentAnchor), optional MONAD_RPC_URL.
 * DRY_RUN=1 stops before the first transaction; with DEPLOYER_ADDRESS and no key it reads only, so the plan can be
 * printed from a machine that holds no key at all. REHEARSAL=1 is accepted only against a local node (anvil forking
 * mainnet) and runs the whole sequence there.
 *
 * Usage: forge build && DRY_RUN=1 pnpm deploy:v2
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

/** The reserve Monad holds on every account, plus a working margin, left after the whole sequence has been paid. */
const RESERVE = parseEther("11");
const ZERO_PROVIDER = `0x${"0".repeat(64)}`;

type Artifact = {
  abi: Abi;
  bytecode: { object: Hex };
  deployedBytecode: { object: Hex; immutableReferences?: Record<string, Array<{ start: number; length: number }>> };
  metadata?: { sources?: Record<string, { keccak256?: string }> };
};
type Step = { name: string; functionName: string; args: readonly unknown[]; ceiling: number };

/** The artifact of a contract, refused unless `out/` was built from the source as it is now. */
function artifactOf(name: string): Artifact {
  const artifact = JSON.parse(readFileSync(resolve(`out/${name}.sol/${name}.json`), "utf8")) as Artifact;
  const source = `contracts/${name}.sol`;
  const sourceHash = keccak256(`0x${Buffer.from(readFileSync(resolve(source))).toString("hex")}` as Hex);
  if (artifact.metadata?.sources?.[source]?.keccak256 !== sourceHash) throw new Error(`Refusing to deploy: out/ was not built from ${source} as it is now. Run forge build`);
  return artifact;
}

/** The runtime code with its immutables blanked: the code on chain differs from the artifact exactly there. */
function withoutImmutables(code: Hex, references: Record<string, Array<{ start: number; length: number }>> = {}): Hex {
  const bytes = Buffer.from(code.slice(2), "hex");
  for (const ranges of Object.values(references)) for (const { start, length } of ranges) bytes.fill(0, start, start + length);
  return `0x${bytes.toString("hex")}`;
}

async function main() {
  const rpc = monadRpcUrl();
  const rehearsal = Boolean(process.env.REHEARSAL);
  const dryRun = Boolean(process.env.DRY_RUN);
  if (rehearsal && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(rpc)) throw new Error("Refusing: REHEARSAL runs only against a local node");

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!deployerKey && !(dryRun && process.env.DEPLOYER_ADDRESS)) throw new Error("Missing DEPLOYER_PRIVATE_KEY in .env.local (a dry run takes DEPLOYER_ADDRESS instead)");
  const account = deployerKey ? privateKeyToAccount((deployerKey.startsWith("0x") ? deployerKey : `0x${deployerKey}`) as Hex) : undefined;
  const deployer = account?.address ?? getAddress(required("DEPLOYER_ADDRESS"));
  const ownerRaw = required("OWNER_ADDRESS");
  if (!isAddress(ownerRaw)) throw new Error("OWNER_ADDRESS is invalid");
  const owner = getAddress(ownerRaw);
  if (owner === deployer) throw new Error(`Refusing to deploy: OWNER_ADDRESS is the deployer ${deployer}, so ownership would stay on the deployment key`);
  const evidenceSigner = getAddress(required("EVIDENCE_SIGNER_ADDRESS"));
  const signingKey = process.env.EVIDENCE_SIGNER_PRIVATE_KEY?.trim();
  if (signingKey) {
    const signingAddress = privateKeyToAccount((signingKey.startsWith("0x") ? signingKey : `0x${signingKey}`) as Hex).address;
    if (signingAddress !== evidenceSigner) throw new Error(`Refusing to deploy: EVIDENCE_SIGNER_ADDRESS is ${evidenceSigner}, but the app signs with ${signingAddress}, so no proof would ever be accepted`);
  } else if (!dryRun) {
    throw new Error("Missing EVIDENCE_SIGNER_PRIVATE_KEY in .env.local: the signer named must be the key the app signs with");
  }
  const anchorer = getAddress(required("RELAYER_ADDRESS"));

  const daily = artifactOf("GiftEscrowV2");
  const milestone = artifactOf("MilestoneGiftV2");
  const anchor = artifactOf("ConsentAnchor");

  // A rehearsal speaks to the local node and to nothing else: the ordinary transport falls back to the public endpoint
  // when its first provider fails, which for a rehearsal would be mainnet.
  const transport = rehearsal ? http(rpc) : monadTransport(rpc);
  const publicClient = createPublicClient({ chain: monadChain, transport });
  const chainId = await publicClient.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`Refusing to deploy: chain id ${chainId} is not Monad mainnet (${MONAD_CHAIN_ID})`);
  const tokenCode = await publicClient.getCode({ address: AUSD_ADDRESS });
  if (!tokenCode || tokenCode === "0x") throw new Error("Refusing to deploy: AUSD has no code at the pinned address");
  const decimals = (await publicClient.readContract({ address: AUSD_ADDRESS, abi: [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }], functionName: "decimals" })) as number;
  if (decimals !== 6) throw new Error(`Refusing to deploy: AUSD answers ${decimals} decimals`);

  const firstDailyAbi = giftEscrowAbi as unknown as Abi;
  const firstMilestoneAbi = milestoneGiftAbi as unknown as Abi;
  const readDaily = (address: Hex, functionName: string, args: readonly unknown[] = []) => publicClient.readContract({ address, abi: firstDailyAbi, functionName, args });
  const readMilestone = (functionName: string, args: readonly unknown[] = []) => publicClient.readContract({ address: MILESTONE_GIFT, abi: firstMilestoneAbi, functionName, args });

  // Creation must be closed on every contract being replaced before its numbering is read: a gift made there afterwards
  // would take a number the new contract gives out too, and a gift's record is keyed by its number alone (D35).
  const stillOpen: string[] = [];
  for (const [name, address] of [["the daily contract", GIFT_ESCROW], ["the earlier daily contract", EARLIER_GIFT_ESCROW]] as const) {
    if (!(await readDaily(address, "creationPaused"))) stillOpen.push(`${name} ${address}`);
  }
  if (!(await readMilestone("creationPaused"))) stillOpen.push(`the milestone contract ${MILESTONE_GIFT}`);
  if (stillOpen.length > 0 && !dryRun) {
    throw new Error(`Refusing to deploy: creation is still open on ${stillOpen.join(", ")}. The owner closes it first (setCreationPaused(true)), then this is run`);
  }

  // The numbering continues where the contracts in service stopped (D30): read, never guessed.
  const firstDailyId = (await readDaily(GIFT_ESCROW, "nextGiftId")) as bigint;
  const earlierNext = (await readDaily(EARLIER_GIFT_ESCROW, "nextGiftId")) as bigint;
  if (earlierNext > firstDailyId) throw new Error(`Refusing to deploy: the earlier daily contract is at gift ${earlierNext}, past the contract in service at ${firstDailyId}`);
  if (firstDailyId >= MILESTONE_FIRST_ID) throw new Error(`Refusing to deploy: the daily contract is at gift ${firstDailyId}, inside the milestone numbering`);
  const firstMilestoneId = (await readMilestone("nextGiftId")) as bigint;

  // Every goal registered is what the contract in service holds for the same number: on the second version a goal is
  // added and never changed, so a wrong provider here could not be put right.
  for (const goal of DAILY_GOALS) {
    const held = String(await readDaily(GIFT_ESCROW, "goalProviders", [goal.goalType]));
    if (held.toLowerCase() !== goal.providerId.toLowerCase()) throw new Error(`Refusing to deploy: daily goal ${goal.goalType} is ${held} on the contract in service, not ${goal.providerId}`);
  }
  for (const goal of MILESTONE_GOALS) {
    const [held, shape] = [String(await readMilestone("goalProviders", [goal.goalType])), Number(await readMilestone("goalShapes", [goal.goalType]))];
    if (held === ZERO_PROVIDER) continue; // A goal the register added since, not yet on the contract in service.
    if (held.toLowerCase() !== goal.providerId.toLowerCase() || shape !== goal.shape) throw new Error(`Refusing to deploy: milestone goal ${goal.goalType} differs on the contract in service`);
  }

  const dailySteps: Step[] = [
    ...DAILY_GOALS.map((goal) => ({ name: `daily: register goal ${goal.goalType} (${goal.source}, ${goal.detail})`, functionName: "registerGoal", args: [goal.goalType, goal.providerId] as const, ceiling: 80_000 })),
    { name: "daily: open creation", functionName: "setCreationPaused", args: [false], ceiling: 60_000 },
    { name: "daily: open check-ins and openings", functionName: "setCheckInPaused", args: [false], ceiling: 60_000 },
    { name: "daily: hand ownership to the owner, who accepts it", functionName: "transferOwnership", args: [owner], ceiling: 70_000 },
  ];
  const milestoneSteps: Step[] = [
    ...MILESTONE_GOALS.map((goal) => ({ name: `milestone: register goal ${goal.goalType} (${goal.source}, ${goal.detail})`, functionName: "registerGoal", args: [goal.goalType, goal.providerId, goal.shape] as const, ceiling: 95_000 })),
    { name: "milestone: open creation", functionName: "setCreationPaused", args: [false], ceiling: 60_000 },
    { name: "milestone: open proofs and openings", functionName: "setProofPaused", args: [false], ceiling: 60_000 },
    { name: "milestone: hand ownership to the owner, who accepts it", functionName: "transferOwnership", args: [owner], ceiling: 70_000 },
  ];
  const anchorSteps: Step[] = [{ name: "anchor: hand ownership to the owner, who accepts it", functionName: "transferOwnership", args: [owner], ceiling: 70_000 }];

  const nonce = await publicClient.getTransactionCount({ address: deployer });
  // The three deployments and their steps follow each other, so each address is known before anything is sent.
  const dailyAddress = getContractAddress({ from: deployer, nonce: BigInt(nonce) });
  const milestoneAddress = getContractAddress({ from: deployer, nonce: BigInt(nonce + 1 + dailySteps.length) });
  const anchorAddress = getContractAddress({ from: deployer, nonce: BigInt(nonce + 2 + dailySteps.length + milestoneSteps.length) });

  const constructors = {
    daily: encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [AUSD_ADDRESS, evidenceSigner, firstDailyId]),
    milestone: encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [AUSD_ADDRESS, evidenceSigner, firstMilestoneId]),
    anchor: encodeAbiParameters([{ type: "address" }], [anchorer]),
  };
  const estimate = async (data: Hex) => addMonadGasBuffer(await publicClient.estimateGas({ account: deployer, data }));
  const deployGas = {
    daily: await estimate(`${daily.bytecode.object}${constructors.daily.slice(2)}` as Hex),
    milestone: await estimate(`${milestone.bytecode.object}${constructors.milestone.slice(2)}` as Hex),
    anchor: await estimate(`${anchor.bytecode.object}${constructors.anchor.slice(2)}` as Hex),
  };
  const allSteps = [...dailySteps, ...milestoneSteps, ...anchorSteps];
  const totalGas = deployGas.daily + deployGas.milestone + deployGas.anchor + allSteps.reduce((sum, step) => sum + addMonadGasBuffer(BigInt(step.ceiling)), 0n);
  const fees = await publicClient.estimateFeesPerGas();
  const perGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
  const cost = totalGas * perGas;
  const balance = await publicClient.getBalance({ address: deployer });
  const codeHashOf = (artifact: Artifact) => keccak256(withoutImmutables(artifact.deployedBytecode.object, artifact.deployedBytecode.immutableReferences));

  const plan = {
    network: { chainId, rpc },
    deployer,
    deployerNonce: nonce,
    owner,
    evidenceSigner,
    anchorer,
    creationStillOpenOn: stillOpen,
    contracts: {
      GiftEscrowV2: { expectedAddress: dailyAddress, firstGiftId: firstDailyId.toString(), replaces: GIFT_ESCROW, codeHash: codeHashOf(daily), goals: DAILY_GOALS.map((goal) => `${goal.goalType}: ${goal.source}, ${goal.detail}`) },
      MilestoneGiftV2: { expectedAddress: milestoneAddress, firstGiftId: firstMilestoneId.toString(), replaces: MILESTONE_GIFT, codeHash: codeHashOf(milestone), goals: MILESTONE_GOALS.length },
      ConsentAnchor: { expectedAddress: anchorAddress, codeHash: codeHashOf(anchor) },
    },
    transactions: 3 + allSteps.length,
    gas: { totalDeclared: totalGas.toString(), atMostMon: formatEther(cost) },
    deployerBalanceMon: formatEther(balance),
  };
  console.log(JSON.stringify(plan, null, 2));
  if (balance < cost + RESERVE) {
    const message = `the deployer holds ${formatEther(balance)} MON, and the sequence can cost ${formatEther(cost)} MON on top of the ${formatEther(RESERVE)} MON kept`;
    if (!dryRun) throw new Error(`Refusing to deploy: ${message}`);
    console.log(`\nNOT ENOUGH TO DEPLOY: ${message}`);
  }
  if (dryRun) {
    if (stillOpen.length > 0) console.log(`\nNOT READY: creation is still open on ${stillOpen.join(", ")}. The owner closes it first.`);
    console.log("\nDRY_RUN: nothing was sent. Unset DRY_RUN to deploy for real.");
    return;
  }
  if (!account) throw new Error("Missing DEPLOYER_PRIVATE_KEY");
  const walletClient = createWalletClient({ account, chain: monadChain, transport });

  const deploy = async (name: string, artifact: Artifact, args: readonly unknown[], gas: bigint, expected: Hex, steps: readonly Step[]): Promise<Hex> => {
    const hash = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args, gas });
    const receipt = await waitForFinality(publicClient, hash);
    const address = receipt.contractAddress;
    if (!address) throw new Error(`${name}: the deployment produced no contract address`);
    if (getAddress(address) !== expected) throw new Error(`${name} deployed at ${address}, not at the expected ${expected}. Stop and read the chain before anything else`);
    const code = await publicClient.getCode({ address });
    if (!code || keccak256(withoutImmutables(code, artifact.deployedBytecode.immutableReferences)) !== codeHashOf(artifact)) throw new Error(`The code at ${address} is not ${name}'s artifact`);
    console.log(JSON.stringify({ step: `${name} deployed`, address, txHash: hash, gasUsed: receipt.gasUsed.toString() }));
    for (const step of steps) {
      const data = encodeFunctionData({ abi: artifact.abi, functionName: step.functionName, args: step.args });
      // Now the contract exists, the chain's own estimate is what is declared, never below the recorded figure.
      const estimated = addMonadGasBuffer(await publicClient.estimateGas({ account: account.address, to: address, data }));
      const floor = addMonadGasBuffer(BigInt(step.ceiling));
      const stepHash = await walletClient.writeContract({ address, abi: artifact.abi, functionName: step.functionName, args: step.args, gas: estimated > floor ? estimated : floor });
      const stepReceipt = await waitForFinality(publicClient, stepHash);
      if (stepReceipt.status !== "success") throw new Error(`${step.name} reverted in ${stepHash}`);
      console.log(JSON.stringify({ step: step.name, txHash: stepHash }));
    }
    return getAddress(address);
  };

  const dailyAt = await deploy("GiftEscrowV2", daily, [AUSD_ADDRESS, evidenceSigner, firstDailyId], deployGas.daily, dailyAddress, dailySteps);
  const milestoneAt = await deploy("MilestoneGiftV2", milestone, [AUSD_ADDRESS, evidenceSigner, firstMilestoneId], deployGas.milestone, milestoneAddress, milestoneSteps);
  const anchorAt = await deploy("ConsentAnchor", anchor, [anchorer], deployGas.anchor, anchorAddress, anchorSteps);

  // Read back what was set, rather than trusting the receipts.
  const read = (address: Hex, abi: Abi, functionName: string, args: readonly unknown[] = []) => publicClient.readContract({ address, abi, functionName, args });
  for (const [name, address, abi] of [["GiftEscrowV2", dailyAt, daily.abi], ["MilestoneGiftV2", milestoneAt, milestone.abi], ["ConsentAnchor", anchorAt, anchor.abi]] as const) {
    const [current, pending] = [getAddress(String(await read(address, abi, "owner"))), getAddress(String(await read(address, abi, "pendingOwner")))];
    if (current !== deployer || pending !== owner) throw new Error(`${name}: ownership was not handed to ${owner}`);
  }
  if ((await read(dailyAt, daily.abi, "creationPaused")) || (await read(dailyAt, daily.abi, "checkInPaused"))) throw new Error("GiftEscrowV2: a switch is still closed");
  if ((await read(milestoneAt, milestone.abi, "creationPaused")) || (await read(milestoneAt, milestone.abi, "proofPaused"))) throw new Error("MilestoneGiftV2: a switch is still closed");
  if (getAddress(String(await read(dailyAt, daily.abi, "evidenceSigner"))) !== evidenceSigner || getAddress(String(await read(milestoneAt, milestone.abi, "evidenceSigner"))) !== evidenceSigner) throw new Error("The evidence signer is not the one named");
  if ((await read(dailyAt, daily.abi, "nextGiftId")) !== firstDailyId || (await read(milestoneAt, milestone.abi, "nextGiftId")) !== firstMilestoneId) throw new Error("The numbering does not continue where it stopped");
  for (const goal of DAILY_GOALS) {
    if (String(await read(dailyAt, daily.abi, "goalProviders", [goal.goalType])).toLowerCase() !== goal.providerId.toLowerCase()) throw new Error(`GiftEscrowV2: goal ${goal.goalType} did not register as it should`);
  }
  for (const goal of MILESTONE_GOALS) {
    const [held, shape] = [String(await read(milestoneAt, milestone.abi, "goalProviders", [goal.goalType])), Number(await read(milestoneAt, milestone.abi, "goalShapes", [goal.goalType]))];
    if (held.toLowerCase() !== goal.providerId.toLowerCase() || shape !== goal.shape) throw new Error(`MilestoneGiftV2: goal ${goal.goalType} did not register as it should`);
  }
  if (getAddress(String(await read(anchorAt, anchor.abi, "anchorer"))) !== anchorer) throw new Error("ConsentAnchor: the anchorer is not the relayer named");
  console.log(JSON.stringify({ step: "read back", dailyGoals: DAILY_GOALS.length, milestoneGoals: MILESTONE_GOALS.length, pendingOwner: owner }));

  console.log("\nThe owner now accepts the three (acceptOwnership on each). Then, in the Vercel environment and in .env.local:");
  console.log(`NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS=${dailyAt}`);
  console.log(`NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS=${milestoneAt}`);
  console.log(`NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS=${anchorAt}`);
}

main().catch((error) => {
  console.error("DEPLOY_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
