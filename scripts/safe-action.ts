import "../src/load-env";
import { createPublicClient, createWalletClient, encodeFunctionData, getAddress, http, recoverAddress, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { exitRouterAbi } from "../src/exit-router-abi";
import { giftEscrowAbi } from "../src/gift-escrow-abi";
import { milestoneGiftAbi } from "../src/milestone-gift-abi";
import { addMonadGasBuffer } from "../src/monad-gas";
import { MONAD_CHAIN_ID, monadChain, monadRpcUrl, waitForFinality } from "../src/monad/chain";
import { execTransactionData, packSafeSignatures, safeAbi, safeCall, safeTxHash, SAFE_VERSION, type SafeTransaction } from "../src/safe";

/**
 * One owner action, signed by both keys of the Safe and executed (mitigation a). It is the whole of what the four
 * contracts' owner can still do once the Safe holds them: pausing, registering a goal, changing the evidence signer.
 *
 * It runs in three passes, and each pass can happen on a different machine:
 *   1. build:   ACTION=… pnpm safe:action                          prints the transaction and the hash to sign
 *   2. sign:    SIGN=1 SIGNER_PRIVATE_KEY=0x… pnpm safe:action     prints one signature, once per key
 *   3. execute: SIGNATURES="0x…,0x…" SEND=1 … pnpm safe:action     packs both and sends it
 *
 * Nothing here holds a key, and step 3 recovers both signers from the signatures themselves: a signature from
 * somebody who is not an owner of this Safe, or one taken over a different transaction, is refused before any gas is
 * spent. The nonce is the Safe's own, so a transaction signed for one nonce cannot be replayed at another.
 */

const escrowAbi = giftEscrowAbi as unknown as Abi;
const milestoneAbi = milestoneGiftAbi as unknown as Abi;

function target(): { name: string; address: Address; abi: Abi } {
  const which = (process.env.TARGET?.trim() ?? "escrow").toLowerCase();
  const of = (name: string, value: string | undefined, abi: Abi) => {
    if (!value?.trim()) throw new Error(`No address for ${name}`);
    return { name, address: getAddress(value.trim()), abi };
  };
  if (which === "escrow") return of("gift escrow", process.env.GIFT_ESCROW_ADDRESS, escrowAbi);
  if (which === "earlier-escrow") return of("earlier gift escrow", process.env.NEXT_PUBLIC_EARLIER_GIFT_ESCROW_ADDRESS, escrowAbi);
  if (which === "milestone") return of("milestone gift", process.env.MILESTONE_GIFT_ADDRESS, milestoneAbi);
  // The router holds none of the named actions below (it pauses nothing and signs no evidence): reach it with raw data.
  if (which === "router") return of("exit router", process.env.EXIT_ROUTER_ADDRESS, exitRouterAbi as unknown as Abi);
  throw new Error(`TARGET is escrow, earlier-escrow, milestone or router, and ${which} is none of them`);
}

/** The action in words, turned into the one call it is. Anything else goes through ACTION=raw with its own data. */
function actionCall(): { step: string; to: Address; data: Hex } {
  const action = (process.env.ACTION?.trim() ?? "").toLowerCase();
  if (action === "raw") {
    const to = getAddress(String(process.env.TO?.trim()));
    const data = String(process.env.DATA?.trim()) as Hex;
    if (!/^0x([0-9a-fA-F]{2})+$/.test(data)) throw new Error("DATA must be the call's own bytes, as 0x followed by an even number of hex figures");
    return { step: `raw call to ${to}`, to, data };
  }
  const paused = process.env.PAUSED?.trim();
  const said = (value: string | undefined) => (value === "true" ? true : value === "false" ? false : undefined);
  const { name, address, abi } = target();
  if (action === "creation-paused" || action === "checkin-paused" || action === "proof-paused") {
    const value = said(paused);
    if (value === undefined) throw new Error("PAUSED must be true or false");
    const functionName = action === "creation-paused" ? "setCreationPaused" : action === "checkin-paused" ? "setCheckInPaused" : "setProofPaused";
    return { step: `${value ? "pause" : "unpause"} ${action.replace("-paused", "")} on the ${name}`, to: address, data: encodeFunctionData({ abi, functionName, args: [value] }) };
  }
  if (action === "evidence-signer") {
    const signer = getAddress(String(process.env.VALUE?.trim()));
    return { step: `set the evidence signer of the ${name} to ${signer}`, to: address, data: encodeFunctionData({ abi, functionName: "setEvidenceSigner", args: [signer] }) };
  }
  throw new Error("ACTION is creation-paused, checkin-paused, proof-paused, evidence-signer or raw");
}

async function main() {
  const publicClient = createPublicClient({ chain: monadChain, transport: http(monadRpcUrl()) });
  const chainId = await publicClient.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`Refusing to run: chain id ${chainId} is not Monad mainnet (${MONAD_CHAIN_ID})`);

  const safe = getAddress(String(process.env.SAFE_ADDRESS?.trim()));
  const code = await publicClient.getCode({ address: safe });
  if (!code || code === "0x") throw new Error(`Refusing to run: no code at ${safe} on this chain`);
  const read = (functionName: "VERSION" | "getOwners" | "getThreshold" | "nonce") => publicClient.readContract({ address: safe, abi: safeAbi, functionName });
  const [version, ownersRead, thresholdRead, nonceRead] = await Promise.all([read("VERSION"), read("getOwners"), read("getThreshold"), read("nonce")]);
  if (String(version) !== SAFE_VERSION) throw new Error(`Refusing to run: ${safe} says version ${version}, not ${SAFE_VERSION}`);
  const owners = (ownersRead as readonly Address[]).map((owner) => getAddress(owner));
  const threshold = Number(thresholdRead);
  const nonce = process.env.NONCE?.trim() ? BigInt(process.env.NONCE.trim()) : (nonceRead as bigint);

  const call = actionCall();
  const tx: SafeTransaction = safeCall(call.to, call.data, nonce);
  const hash = safeTxHash(safe, MONAD_CHAIN_ID, tx);
  console.log(
    JSON.stringify(
      { chainId: MONAD_CHAIN_ID, safe, owners, threshold, step: call.step, transaction: { to: tx.to, value: "0", data: tx.data, operation: 0, nonce: nonce.toString() }, signThis: hash },
      null,
      2,
    ),
  );

  if (process.env.SIGN === "1") {
    const key = process.env.SIGNER_PRIVATE_KEY?.trim();
    if (!key) throw new Error("SIGN=1 needs SIGNER_PRIVATE_KEY in your own shell; nothing in this repository holds a key");
    const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
    if (!owners.includes(getAddress(account.address))) throw new Error(`Refusing to sign: ${account.address} is not an owner of ${safe}`);
    const signature = await account.sign({ hash });
    console.log(JSON.stringify({ step: "signed", owner: account.address, signature }, null, 2));
    console.log(`Take this signature to the other key. With both: SIGNATURES="first,second" SEND=1 … pnpm safe:action`);
    return;
  }

  const given = String(process.env.SIGNATURES?.trim() ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0) as Hex[];
  if (given.length === 0) {
    console.log(`Sign this hash with each of the two keys: SIGN=1 SIGNER_PRIVATE_KEY=0x… (same ACTION, and NONCE=${nonce} if the Safe moves meanwhile).`);
    return;
  }
  // Who signed is recovered from the signatures, never taken on trust: a stranger's signature fails here and not on chain.
  const parts = await Promise.all(given.map(async (signature) => ({ owner: getAddress(await recoverAddress({ hash, signature })), signature })));
  const strangers = parts.filter((part) => !owners.includes(part.owner));
  if (strangers.length > 0) throw new Error(`Refusing to run: ${strangers.map((part) => part.owner).join(", ")} signed this but is not an owner of ${safe}`);
  if (parts.length < threshold) throw new Error(`This Safe needs ${threshold} signatures and ${parts.length} were given`);
  const signatures = packSafeSignatures(parts);
  console.log(JSON.stringify({ step: "signatures", signers: parts.map((part) => part.owner), packed: signatures }, null, 2));

  const data = execTransactionData(tx, signatures);
  const executor = process.env.EXECUTOR?.trim() ? getAddress(process.env.EXECUTOR.trim()) : parts[0].owner;
  // Run it against the chain's own state first: a wrong nonce or a signature over another transaction reverts here,
  // where it costs nothing, instead of on chain.
  const gas = addMonadGasBuffer(await publicClient.estimateGas({ account: executor, to: safe, data }));
  console.log(JSON.stringify({ call: { from: executor, to: safe, value: "0", gas: gas.toString(), data } }, null, 2));

  if (process.env.SEND !== "1") {
    console.log("Sign this last one from either owner's wallet: it carries both signatures, and whoever sends it only pays the gas.");
    return;
  }
  const key = process.env.EXECUTOR_PRIVATE_KEY?.trim();
  if (!key) throw new Error("SEND=1 needs EXECUTOR_PRIVATE_KEY in your own shell");
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const walletClient = createWalletClient({ account, chain: monadChain, transport: http(monadRpcUrl()) });
  const sent = await walletClient.sendTransaction({ to: safe, data, gas });
  const receipt = await waitForFinality(publicClient, sent);
  if (receipt.status !== "success") throw new Error(`The Safe transaction reverted in ${sent}`);
  const after = (await read("nonce")) as bigint;
  console.log(JSON.stringify({ step: call.step, txHash: sent, block: receipt.blockNumber.toString(), safeNonce: after.toString() }, null, 2));
}

main().catch((error) => {
  console.error("SAFE_ACTION_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
