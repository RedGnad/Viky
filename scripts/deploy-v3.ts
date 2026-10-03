import "../src/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, encodeAbiParameters, encodeFunctionData, formatEther, getAddress, getContractAddress, isAddress, keccak256, parseEther, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DAILY_GOALS } from "../src/daily-goals";
import { giftEscrowAbi } from "../src/gift-escrow-abi";
import { giftEscrowV2Abi } from "../src/gift-escrow-v2-abi";
import { addMonadGasBuffer } from "../src/monad-gas";
import { AUSD_ADDRESS, MONAD_CHAIN_ID, monadChain, monadRpcUrl, scriptTransport, waitForFinality } from "../src/monad/chain";
import { giftEscrowV2Address, SECOND_VERSION_SETTINGS } from "../src/v2";
import { numberingProblems, type EarlierDaily } from "../src/v3-handover";
import { EARLIER_GIFT_ESCROW, GIFT_ESCROW } from "../src/viky-contracts";

/**
 * Deploys the third daily contract to Monad mainnet (3 Oct 2026): `GiftEscrowV3`, the second version's daily contract
 * with one rule changed, a day is paid by a reading taken that same day. It registers every daily goal that has a
 * condition behind it, opens creation, and hands the contract to the owner, who then accepts it (ownership moves in
 * two steps). The milestone contract and the anchor of agreements are not touched: they have no third version.
 *
 * Nothing of this can be undone once sent, and on this contract a goal is added and never changed. So everything that
 * can be checked is checked first, and the whole plan is printed with DRY_RUN before anybody approves it.
 *
 * The numbering. A gift's record is keyed by its number alone, so no two daily contracts may give out the same one.
 * Two ways, and the plan says which was taken:
 *   - by default the numbering continues where the second version stopped, which asks that creation be closed there
 *     first, for good: a gift made on the second version afterwards would take a number the third gives out too;
 *   - with FIRST_GIFT_ID the third starts further on, and the second version may stay open behind it: it can still
 *     make gifts, as many as there are numbers before FIRST_GIFT_ID. That keeps a way back: unsetting the third's
 *     address in the app sends new gifts to the second version again, with no number in common.
 *
 * Refuses to run when: the chain is not Monad mainnet; the node is a local one and this is not a rehearsal; the three
 * settings of the second version are not set here; OWNER_ADDRESS is missing, is the deploying key, or is not the owner
 * of the second version's daily contract; the evidence signer named is not the one that contract holds, or another one
 * waits there; AUSD has no code or not six decimals; the compiled artifact was not built from the contract in this
 * repository; a goal of the register is not what the second version holds for the same number; the numbering would
 * meet an earlier contract's; or the deployer cannot pay for the whole sequence and keep the 10 MON reserve.
 *
 * Inputs (.env.local): DEPLOYER_PRIVATE_KEY, OWNER_ADDRESS (the Safe), EVIDENCE_SIGNER_ADDRESS, the three settings of
 * the second version, optional FIRST_GIFT_ID and MONAD_RPC_URL. The evidence signer's private key is never asked for:
 * its address is checked against the chain. DRY_RUN=1 stops before the first transaction; with DEPLOYER_ADDRESS and no
 * key it reads only, so the plan can be printed from a machine that holds no key at all. REHEARSAL=1 is accepted only
 * against a local node (anvil forking mainnet); a local node without it is refused. Never rehearse with the real
 * deploying key: a rehearsal moves its count of transactions, and the address is worked out from that count.
 *
 * **If it stops in the middle**, do not run it again as it is: it would deploy at another address. The address is
 * printed the moment it exists. Close creation on it (`setCreationPaused(true)`, which the deploying key can still
 * send, being its owner), never set that address in the app, and start over with a new deploying key.
 *
 * **After it ends**, in this order, and nothing in the app before the last step:
 *   1. the Safe accepts it, with `pnpm safe:action` (ACTION=accept-ownership TARGET=escrow-v3, with TARGET_ADDRESS as
 *      printed here);
 *   2. `pnpm check:v3-handover` reads that the Safe owns it, that no signer waits and no pause was sent, that the
 *      numbering meets no earlier contract's and that every goal is the register's, and only then prints the setting;
 *   3. the setting is set in the app, beside the three of the second version, which do not change, and the app is
 *      built again. From the first gift made on the third contract it is never changed.
 *
 * Usage: forge build && DRY_RUN=1 pnpm deploy:v3
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

/** The reserve Monad holds on every account, plus a working margin, left after the whole sequence has been paid. */
const RESERVE = parseEther("11");
const ZERO_PROVIDER = `0x${"0".repeat(64)}`;
const NOBODY = /^0x0{40}$/;

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
  // A rehearsal speaks to the local node and to nothing else: the ordinary transport falls back to the public endpoint
  // when its first provider fails, which for a rehearsal would be mainnet. And a local node is nothing but a rehearsal.
  const transport = scriptTransport(rpc, rehearsal);

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!deployerKey && !(dryRun && process.env.DEPLOYER_ADDRESS)) throw new Error("Missing DEPLOYER_PRIVATE_KEY in .env.local (a dry run takes DEPLOYER_ADDRESS instead)");
  const account = deployerKey ? privateKeyToAccount((deployerKey.startsWith("0x") ? deployerKey : `0x${deployerKey}`) as Hex) : undefined;
  const deployer = account?.address ?? getAddress(required("DEPLOYER_ADDRESS"));
  const ownerRaw = required("OWNER_ADDRESS");
  if (!isAddress(ownerRaw)) throw new Error("OWNER_ADDRESS is invalid");
  const owner = getAddress(ownerRaw);
  if (owner === deployer) throw new Error(`Refusing to deploy: OWNER_ADDRESS is the deployer ${deployer}, so ownership would stay on the deployment key`);
  const evidenceSigner = getAddress(required("EVIDENCE_SIGNER_ADDRESS"));
  // The third daily contract stands on the second version: its gifts are opened by their link's key, and their
  // agreements are written at the anchor. So the second version is set here, or nothing is deployed.
  for (const name of SECOND_VERSION_SETTINGS) required(name);
  const second = giftEscrowV2Address();
  if (!second) throw new Error("Refusing to deploy: NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS is not an address");

  const artifact = artifactOf("GiftEscrowV3");

  const publicClient = createPublicClient({ chain: monadChain, transport });
  const chainId = await publicClient.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`Refusing to deploy: chain id ${chainId} is not Monad mainnet (${MONAD_CHAIN_ID})`);
  const tokenCode = await publicClient.getCode({ address: AUSD_ADDRESS });
  if (!tokenCode || tokenCode === "0x") throw new Error("Refusing to deploy: AUSD has no code at the pinned address");
  const decimals = (await publicClient.readContract({ address: AUSD_ADDRESS, abi: [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }], functionName: "decimals" })) as number;
  if (decimals !== 6) throw new Error(`Refusing to deploy: AUSD answers ${decimals} decimals`);

  const firstAbi = giftEscrowAbi as unknown as Abi;
  const secondAbi = giftEscrowV2Abi as unknown as Abi;
  const readSecond = (functionName: string, args: readonly unknown[] = []) => publicClient.readContract({ address: second, abi: secondAbi, functionName, args });

  // The owner named is the one the second version's daily contract answers to, and the evidence signer named is the one
  // it takes readings from, with no other waiting to take its place: all read on the chain, none taken on anybody's word.
  const ownedBy = getAddress(String(await readSecond("owner")));
  if (ownedBy !== owner) throw new Error(`Refusing to deploy: OWNER_ADDRESS is ${owner}, and the second version's daily contract ${second} is owned by ${ownedBy}`);
  const signedBy = getAddress(String(await readSecond("evidenceSigner")));
  if (signedBy !== evidenceSigner) throw new Error(`Refusing to deploy: EVIDENCE_SIGNER_ADDRESS is ${evidenceSigner}, and the second version's daily contract takes its readings from ${signedBy}, so no reading the app signs would be accepted`);
  const waiting = String(await readSecond("pendingEvidenceSigner"));
  if (!NOBODY.test(waiting)) throw new Error(`Refusing to deploy: an evidence signer is announced on the second version's daily contract, ${waiting}. The third would be deployed with a signer about to be replaced: settle that first`);

  // Every daily contract that ever made gifts, and where its numbering stands: read, never guessed.
  const earlier: EarlierDaily[] = [];
  for (const [name, address, abi] of [["the second version's daily contract", second, secondAbi], ["the first version's daily contract", GIFT_ESCROW, firstAbi], ["the earlier daily contract", EARLIER_GIFT_ESCROW, firstAbi]] as const) {
    earlier.push({
      name,
      address,
      nextGiftId: (await publicClient.readContract({ address, abi, functionName: "nextGiftId" })) as bigint,
      creationPaused: (await publicClient.readContract({ address, abi, functionName: "creationPaused" })) as boolean,
    });
  }
  const continues = earlier.reduce((highest, contract) => (contract.nextGiftId > highest ? contract.nextGiftId : highest), 0n);
  const asked = process.env.FIRST_GIFT_ID?.trim();
  if (asked !== undefined && asked !== "" && !/^[1-9]\d{0,8}$/.test(asked)) throw new Error("FIRST_GIFT_ID is a whole number, the number of the first gift the third contract makes");
  const firstGiftId = asked ? BigInt(asked) : continues;
  const numbering = numberingProblems("GiftEscrowV3", firstGiftId, earlier);
  if (numbering.problems.length > 0 && !dryRun) throw new Error(`Refusing to deploy: ${numbering.problems.join(". ")}`);

  // Every goal registered is what the second version holds for the same number: a goal is added and never changed, so
  // a wrong provider here could not be put right.
  for (const goal of DAILY_GOALS) {
    const held = String(await readSecond("goalProviders", [goal.goalType]));
    if (held === ZERO_PROVIDER) continue; // A goal the register added since, not on the second version.
    if (held.toLowerCase() !== goal.providerId.toLowerCase()) throw new Error(`Refusing to deploy: daily goal ${goal.goalType} is ${held} on the second version's daily contract, not ${goal.providerId}`);
  }

  const steps: Step[] = [
    ...DAILY_GOALS.map((goal) => ({ name: `register goal ${goal.goalType} (${goal.source}, ${goal.detail})`, functionName: "registerGoal", args: [goal.goalType, goal.providerId] as const, ceiling: 80_000 })),
    { name: "open creation", functionName: "setCreationPaused", args: [false], ceiling: 60_000 },
    { name: "hand ownership to the owner, who accepts it", functionName: "transferOwnership", args: [owner], ceiling: 70_000 },
  ];

  const nonce = await publicClient.getTransactionCount({ address: deployer });
  const expectedAddress = getContractAddress({ from: deployer, nonce: BigInt(nonce) });
  const constructorArgs = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [AUSD_ADDRESS, evidenceSigner, firstGiftId]);
  const deployGas = addMonadGasBuffer(await publicClient.estimateGas({ account: deployer, data: `${artifact.bytecode.object}${constructorArgs.slice(2)}` as Hex }));
  const totalGas = deployGas + steps.reduce((sum, step) => sum + addMonadGasBuffer(BigInt(step.ceiling)), 0n);
  const fees = await publicClient.estimateFeesPerGas();
  const perGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
  const cost = totalGas * perGas;
  const balance = await publicClient.getBalance({ address: deployer });
  const codeHash = keccak256(withoutImmutables(artifact.deployedBytecode.object, artifact.deployedBytecode.immutableReferences));

  const plan = {
    network: { chainId, rpc },
    deployer,
    deployerNonce: nonce,
    owner,
    evidenceSigner,
    GiftEscrowV3: {
      expectedAddress,
      firstGiftId: firstGiftId.toString(),
      numbering: asked ? `starts at ${firstGiftId}, past every earlier contract` : `continues where the second version stopped, at ${continues}`,
      earlier: earlier.map((contract) => `${contract.name} ${contract.address}: next gift ${contract.nextGiftId}, creation ${contract.creationPaused ? "closed" : "open"}`),
      codeHash,
      goals: DAILY_GOALS.map((goal) => `${goal.goalType}: ${goal.source}, ${goal.detail}`),
    },
    transactions: 1 + steps.length,
    gas: { totalDeclared: totalGas.toString(), atMostMon: formatEther(cost) },
    deployerBalanceMon: formatEther(balance),
  };
  console.log(JSON.stringify(plan, null, 2));
  for (const note of numbering.notes) console.log(`NOTE: ${note}`);
  if (balance < cost + RESERVE) {
    const message = `the deployer holds ${formatEther(balance)} MON, and the sequence can cost ${formatEther(cost)} MON on top of the ${formatEther(RESERVE)} MON kept`;
    if (!dryRun) throw new Error(`Refusing to deploy: ${message}`);
    console.log(`\nNOT ENOUGH TO DEPLOY: ${message}`);
  }
  if (dryRun) {
    for (const problem of numbering.problems) console.log(`\nNOT READY: ${problem}`);
    console.log("\nDRY_RUN: nothing was sent. Unset DRY_RUN to deploy for real.");
    return;
  }
  if (!account) throw new Error("Missing DEPLOYER_PRIVATE_KEY");
  const walletClient = createWalletClient({ account, chain: monadChain, transport });

  const hash = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [AUSD_ADDRESS, evidenceSigner, firstGiftId], gas: deployGas });
  const receipt = await waitForFinality(publicClient, hash);
  const deployed = receipt.contractAddress;
  if (!deployed) throw new Error("GiftEscrowV3: the deployment produced no contract address");
  // Said the moment it exists, before any check can stop the run: if anything below fails, this is the address to
  // close creation on, and never to set in the app.
  console.log(`WRITE DOWN: GiftEscrowV3 is at ${getAddress(deployed)} (transaction ${hash})`);
  if (getAddress(deployed) !== expectedAddress) throw new Error(`GiftEscrowV3 deployed at ${deployed}, not at the expected ${expectedAddress}. Stop and read the chain before anything else`);
  const code = await publicClient.getCode({ address: deployed });
  if (!code || keccak256(withoutImmutables(code, artifact.deployedBytecode.immutableReferences)) !== codeHash) throw new Error(`The code at ${deployed} is not GiftEscrowV3's artifact`);
  console.log(JSON.stringify({ step: "GiftEscrowV3 deployed", address: deployed, txHash: hash, gasUsed: receipt.gasUsed.toString() }));
  for (const step of steps) {
    const data = encodeFunctionData({ abi: artifact.abi, functionName: step.functionName, args: step.args });
    // Now the contract exists, the chain's own estimate is what is declared, never below the recorded figure.
    const estimated = addMonadGasBuffer(await publicClient.estimateGas({ account: account.address, to: deployed, data }));
    const floor = addMonadGasBuffer(BigInt(step.ceiling));
    const stepHash = await walletClient.writeContract({ address: deployed, abi: artifact.abi, functionName: step.functionName, args: step.args, gas: estimated > floor ? estimated : floor });
    const stepReceipt = await waitForFinality(publicClient, stepHash);
    if (stepReceipt.status !== "success") throw new Error(`${step.name} reverted in ${stepHash}`);
    console.log(JSON.stringify({ step: step.name, txHash: stepHash }));
  }
  const at = getAddress(deployed);

  // Read back what was set, rather than trusting the receipts.
  const read = (functionName: string, args: readonly unknown[] = []) => publicClient.readContract({ address: at, abi: artifact.abi, functionName, args });
  const [current, pending] = [getAddress(String(await read("owner"))), getAddress(String(await read("pendingOwner")))];
  if (current !== deployer || pending !== owner) throw new Error(`GiftEscrowV3: ownership was not handed to ${owner}`);
  if ((await read("creationPaused")) || (await read("checkInPaused"))) throw new Error("GiftEscrowV3: a switch is still closed");
  if (getAddress(String(await read("evidenceSigner"))) !== evidenceSigner) throw new Error("The evidence signer is not the one named");
  if ((await read("nextGiftId")) !== firstGiftId) throw new Error("The numbering does not start where it was to");
  if (Number(await read("CONTRACT_SCHEMA_ID")) !== 3) throw new Error("GiftEscrowV3: it does not answer schema 3");
  for (const goal of DAILY_GOALS) {
    if (String(await read("goalProviders", [goal.goalType])).toLowerCase() !== goal.providerId.toLowerCase()) throw new Error(`GiftEscrowV3: goal ${goal.goalType} did not register as it should`);
  }
  console.log(JSON.stringify({ step: "read back", dailyGoals: DAILY_GOALS.length, pendingOwner: owner }));

  // Read by the rehearsal and by `pnpm check:v3-handover`. Not to be set in the app yet: the deploying key still owns it.
  console.log(`\nDEPLOYED (not yet the Safe's, and not to be set in the app yet):`);
  console.log(`NEXT_PUBLIC_GIFT_ESCROW_V3_ADDRESS=${at}`);
  console.log("\nNext, in this order:");
  console.log("  1. The Safe accepts it:");
  console.log(`       ACTION=accept-ownership TARGET=escrow-v3 TARGET_ADDRESS=${at} pnpm safe:action`);
  console.log(`  2. DAILY_V3=${at} OWNER_ADDRESS=${owner} EVIDENCE_SIGNER_ADDRESS=${evidenceSigner} pnpm check:v3-handover`);
  console.log("     It reads that the Safe owns it, that no signer is waiting and no pause was sent, that its numbering meets no earlier contract's, and that every goal is the register's, and only then prints the setting to set.");
  console.log("  3. Set it in the app, beside the three of the second version, and build it again. Empty the deploying key.");
}

main().catch((error) => {
  console.error("DEPLOY_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
