import "../src/load-env";
import { createPublicClient, createWalletClient, getAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addMonadGasBuffer } from "../src/monad-gas";
import { MONAD_CHAIN_ID, monadChain, monadRpcUrl, monadTransport, waitForFinality } from "../src/monad/chain";
import { ownableAbi, safeAbi, transferOwnershipData, SAFE_VERSION } from "../src/safe";

/**
 * Hands the four contracts to the Safe (mitigation a). One call each, no second step, no way back: what this script
 * spends its time on is refusing, not sending.
 *
 * Before a single call is written out, the Safe must answer for itself on this chain: code at the address, its own
 * version, a threshold of two, and exactly the owners the run was told to expect. `CONFIRM_OWNERS` is not decoration:
 * it is the one thing that catches a Safe that exists and works and belongs to somebody else.
 *
 * `SAFE_ADDRESS=0x… CONFIRM_OWNERS="0xA,0xB" pnpm safe:handover` prints the four calls for the current owner's
 * wallet. `VERIFY=1` reads the four owners back afterwards and fails unless every one of them is the Safe.
 */

/** How many signatures the Safe must ask for. Two, unless the run says otherwise; the shape today is two of three. */
function thresholdWanted(): number {
  const raw = process.env.SAFE_THRESHOLD?.trim();
  const threshold = raw ? Number(raw) : 2;
  if (!Number.isSafeInteger(threshold) || threshold < 2) throw new Error("SAFE_THRESHOLD is two or more");
  return threshold;
}
/** Above the Foundry gas report for `transferOwnership` (28,983), before the Monad margin. */
const TRANSFER_CEILING = 40_000n;

type Contract = Readonly<{ name: string; address: Address }>;

function contracts(): readonly Contract[] {
  const named = [
    ["gift escrow", process.env.GIFT_ESCROW_ADDRESS],
    ["earlier gift escrow", process.env.NEXT_PUBLIC_EARLIER_GIFT_ESCROW_ADDRESS],
    ["milestone gift", process.env.MILESTONE_GIFT_ADDRESS],
    ["exit router", process.env.EXIT_ROUTER_ADDRESS],
  ] as const;
  const missing = named.filter(([, address]) => !address?.trim()).map(([name]) => name);
  if (missing.length > 0) throw new Error(`Refusing to run: no address for ${missing.join(", ")}`);
  return named.map(([name, address]) => ({ name, address: getAddress(String(address).trim()) }));
}

async function main() {
  const publicClient = createPublicClient({ chain: monadChain, transport: monadTransport() });
  const chainId = await publicClient.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`Refusing to run: chain id ${chainId} is not Monad mainnet (${MONAD_CHAIN_ID})`);

  const safe = getAddress(String(process.env.SAFE_ADDRESS?.trim()));
  const code = await publicClient.getCode({ address: safe });
  if (!code || code === "0x") throw new Error(`Refusing to run: no code at ${safe} on this chain, so ownership sent there would be gone`);
  const read = (functionName: "VERSION" | "getOwners" | "getThreshold" | "nonce") => publicClient.readContract({ address: safe, abi: safeAbi, functionName });
  const [version, safeOwners, threshold] = await Promise.all([read("VERSION"), read("getOwners"), read("getThreshold")]).catch((error) => {
    throw new Error(`Refusing to run: ${safe} holds code but does not answer as a Safe (${error instanceof Error ? error.message : error})`);
  });
  if (String(version) !== SAFE_VERSION) throw new Error(`Refusing to run: ${safe} says version ${version}, not ${SAFE_VERSION}`);
  const wanted = thresholdWanted();
  if (Number(threshold) !== wanted) throw new Error(`Refusing to run: ${safe} asks for ${threshold} signatures, not ${wanted}`);

  const expected = String(process.env.CONFIRM_OWNERS?.trim() ?? "")
    .split(",")
    .filter((value) => value.trim().length > 0)
    .map((value) => getAddress(value.trim()))
    .sort();
  // Every owner, not as many as the threshold: a Safe of two signatures can be held by three keys, and naming two of
  // them would pass a Safe that has a third owner nobody meant to give this to.
  if (expected.length < wanted) throw new Error('Refusing to run: name every owner you expect, as CONFIRM_OWNERS="0xfirst,0xsecond,0xthird"');
  const held = (safeOwners as readonly Address[]).map((owner) => getAddress(owner)).sort();
  if (held.join(",") !== expected.join(",")) throw new Error(`Refusing to run: ${safe} is held by ${held.join(", ")}, and you named ${expected.join(", ")}`);

  const four = contracts();
  const state = await Promise.all(
    four.map(async (contract) => ({ ...contract, owner: getAddress(String(await publicClient.readContract({ address: contract.address, abi: ownableAbi, functionName: "owner" }))) })),
  );
  console.log(JSON.stringify({ chainId: MONAD_CHAIN_ID, safe, safeOwners: held, threshold: wanted, contracts: state }, null, 2));

  if (process.env.VERIFY === "1") {
    const notYet = state.filter((contract) => contract.owner !== safe);
    if (notYet.length > 0) throw new Error(`Not handed over: ${notYet.map((contract) => `${contract.name} is owned by ${contract.owner}`).join("; ")}`);
    console.log(`All four contracts answer ${safe} as their owner.`);
    return;
  }

  const done = state.filter((contract) => contract.owner === safe);
  const toSend = state.filter((contract) => contract.owner !== safe);
  // Every one of them is owned by one address today. Two different owners among the four would mean this run is not
  // looking at what it thinks it is, and each call would need its own signer anyway.
  const owners = new Set(toSend.map((contract) => contract.owner));
  if (owners.size > 1) throw new Error(`Refusing to run: the contracts left to hand over answer to ${[...owners].join(" and ")}, so no single wallet can sign them all`);
  if (toSend.length === 0) {
    console.log(`Nothing to send: all four already answer ${safe}.`);
    return;
  }
  const from = [...owners][0];

  const calls = toSend.map((contract) => ({
    step: `hand ${contract.name} to the Safe`,
    from,
    to: contract.address,
    value: "0",
    gas: addMonadGasBuffer(TRANSFER_CEILING).toString(),
    data: transferOwnershipData(safe),
  }));
  console.log(JSON.stringify({ alreadyDone: done.map((contract) => contract.name), calls }, null, 2));

  if (process.env.SEND !== "1") {
    console.log(`Sign these ${calls.length} from ${from}, then run VERIFY=1 SAFE_ADDRESS=${safe} CONFIRM_OWNERS="${expected.join(",")}" pnpm safe:handover.`);
    // The owner is a hardware wallet in the shape this was built for, and a hardware wallet never hands over its key,
    // so SEND=1 below is not a road it can take. The calls above are what it signs, one at a time, and
    // docs/OPERATIONS.md carries the exact command.
    console.log(`From a hardware wallet, send each one with: cast send <to> "transferOwnership(address)" ${safe} --ledger --rpc-url ${monadRpcUrl()} --from ${from}`);
    return;
  }
  const key = process.env.OWNER_PRIVATE_KEY?.trim();
  if (!key) throw new Error("SEND=1 needs OWNER_PRIVATE_KEY in your own shell, and it must be the current owner; nothing in this repository holds that key");
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  if (getAddress(account.address) !== from) throw new Error(`Refusing to send: this key is ${account.address}, and the owner is ${from}`);
  const walletClient = createWalletClient({ account, chain: monadChain, transport: monadTransport() });

  for (const contract of toSend) {
    const data = transferOwnershipData(safe);
    const estimate = await publicClient.estimateGas({ account: account.address, to: contract.address, data });
    if (estimate > TRANSFER_CEILING) throw new Error(`Refusing to send: handing over ${contract.name} estimates ${estimate}, above the ceiling ${TRANSFER_CEILING}`);
    const hash = await walletClient.sendTransaction({ to: contract.address, data, gas: addMonadGasBuffer(TRANSFER_CEILING) });
    const receipt = await waitForFinality(publicClient, hash);
    if (receipt.status !== "success") throw new Error(`Handing over ${contract.name} reverted in ${hash}`);
    const now = getAddress(String(await publicClient.readContract({ address: contract.address, abi: ownableAbi, functionName: "owner" })));
    if (now !== safe) throw new Error(`${contract.name} still answers ${now} after ${hash}`);
    console.log(JSON.stringify({ step: `handed ${contract.name} over`, contract: contract.address, txHash: hash, block: receipt.blockNumber.toString(), owner: now }));
  }
  console.log(`All four contracts now answer ${safe}. Every owner action from here needs two signatures: see docs/OPERATIONS.md.`);
}

main().catch((error) => {
  console.error("SAFE_HANDOVER_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
