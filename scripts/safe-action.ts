import "../src/load-env";
import { createPublicClient, createWalletClient, getAddress, recoverAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addMonadGasBuffer } from "../src/monad-gas";
import { MONAD_CHAIN_ID, monadChain, monadRpcUrl, scriptTransport, waitForFinality } from "../src/monad/chain";
import { decodeContractError } from "../src/relayer";
import { safeActionCall } from "../src/safe-actions";
import { execTransactionData, packSafeSignatures, safeAbi, safeCall, safeTxHash, SAFE_VERSION, type SafeTransaction } from "../src/safe";
import { signWithHiddenPhrase } from "../src/safe-phrase";

/**
 * One owner action, signed by both keys of the Safe and executed (mitigation a). It is the whole of what the
 * contracts' owner can still do once the Safe holds them: pausing, changing the evidence signer, and, for a contract
 * of the second version, accepting its ownership (src/safe-actions.ts names every action and every target).
 *
 *   TARGET=escrow | earlier-escrow | milestone | router | escrow-v2 | milestone-v2 | anchor | escrow-v3
 *   ACTION=creation-paused | checkin-paused | proof-paused (with PAUSED=true|false), evidence-signer | anchorer (with
 *          VALUE=0x…), accept-ownership, raw (with TO and DATA)
 *   TARGET_ADDRESS=0x…  a contract of the second version the app does not know yet, as its deployment printed it
 *
 * Before anything is printed to sign, the call is run as the Safe against the chain's own state: one the contract would
 * refuse (a pause sent too soon, an ownership that was not handed to this Safe) is refused here, with the contract's
 * own word, and not after two people have signed it.
 *
 * It runs in three passes, and each pass can happen on a different machine:
 *   1. build:   ACTION=… pnpm safe:action                          prints the transaction and the hash to sign
 *   2. sign:    SIGN=1 ACTION=… pnpm safe:action                   prints one signature, once per key: a phrase on
 *                                                                  paper is typed at its hidden prompt, a raw key
 *                                                                  comes as SIGNER_PRIVATE_KEY in your own shell
 *   3. execute: SIGNATURES="0x…,0x…" SEND=1 … pnpm safe:action     packs both and sends it
 *
 * Nothing in this repository keeps a key, and step 3 recovers both signers from the signatures themselves: a
 * signature from somebody who is not an owner of this Safe, or one taken over a different transaction, is refused
 * before any gas is spent. The nonce is the Safe's own, so a transaction signed for one nonce cannot be replayed at
 * another.
 */

const ownership = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "pendingOwner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "pendingEvidenceSigner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

async function main() {
  // A rehearsal speaks to its local node and to nothing else, and a local node is taken for nothing but a rehearsal
  // (the review of 2 Oct 2026, R-10): the ordinary transport falls back to the public endpoint when its first
  // provider fails, which for a rehearsal would be mainnet.
  const transport = scriptTransport(monadRpcUrl(), Boolean(process.env.REHEARSAL));
  const publicClient = createPublicClient({ chain: monadChain, transport });
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

  const call = safeActionCall(process.env);
  // An ownership is accepted by the one it was handed to, and by nobody else: read before anybody signs.
  if (call.action === "accept-ownership") {
    const [owner, pending] = await Promise.all([
      publicClient.readContract({ address: call.to, abi: ownership, functionName: "owner" }),
      publicClient.readContract({ address: call.to, abi: ownership, functionName: "pendingOwner" }),
    ]);
    if (getAddress(owner) === safe) throw new Error(`Nothing to accept: ${safe} already owns ${call.to}`);
    if (getAddress(pending) !== safe) throw new Error(`Refusing to run: the ownership of ${call.to} is offered to ${pending}, not to this Safe ${safe}. Its owner today is ${owner}`);
  }
  // Run as the Safe against the chain's own state: what the contract would refuse is refused here, in its own word.
  try {
    await publicClient.call({ account: safe, to: call.to, data: call.data });
  } catch (error) {
    const refusal = call.target ? decodeContractError(error, call.target.abi) : undefined;
    throw new Error(`Refusing to run: the contract would refuse this${refusal ? ` (${refusal})` : ""}. Nothing was signed`);
  }
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
    if (!key) {
      // A paper owner: the words are asked here with the terminal's echo off, never written on a command line.
      const signed = await signWithHiddenPhrase({ hash, owners, input: process.stdin, output: process.stderr });
      console.log(JSON.stringify({ step: "signed", owner: signed.owner, hash, signature: signed.signature }, null, 2));
      console.log(`Take this signature to the other key, and check it signs the same hash. With both: SIGNATURES="first,second" SEND=1 … pnpm safe:action`);
      return;
    }
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
    // Every key signs where it already lives: cast signs the hash from a keystore (with the fingerprint or its
    // password) or from a hardware wallet, and a phrase on paper is typed at this script's hidden prompt (SIGN=1),
    // never on a command line, where the shell's history file would keep it. SIGN=1 with SIGNER_PRIVATE_KEY stays for
    // a raw key, which is the rarer case.
    console.log(`Sign this hash with ${threshold} of the owners, each where their key lives:`);
    console.log(`  cast wallet sign --no-hash ${hash} --keystore <the keystore file>`);
    console.log(`  SIGN=1 NONCE=${nonce} … pnpm safe:action   (a phrase on paper, the same ACTION: the words are asked at a hidden prompt, never put on the command line)`);
    console.log(`  cast wallet sign --no-hash ${hash} --ledger`);
    console.log(`Then: SIGNATURES="0xfirst,0xsecond" SEND=1 … (same ACTION, and NONCE=${nonce} if the Safe moves meanwhile).`);
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
  const walletClient = createWalletClient({ account, chain: monadChain, transport });
  const sent = await walletClient.sendTransaction({ to: safe, data, gas });
  const receipt = await waitForFinality(publicClient, sent);
  if (receipt.status !== "success") throw new Error(`The Safe transaction reverted in ${sent}`);
  const after = (await read("nonce")) as bigint;
  console.log(JSON.stringify({ step: call.step, txHash: sent, block: receipt.blockNumber.toString(), safeNonce: after.toString() }, null, 2));
  // Read back, never taken from the receipt: the Safe owns it, nobody else is offered it, and no signer is waiting.
  if (call.action === "accept-ownership") {
    const [owner, pending] = await Promise.all([
      publicClient.readContract({ address: call.to, abi: ownership, functionName: "owner" }),
      publicClient.readContract({ address: call.to, abi: ownership, functionName: "pendingOwner" }),
    ]);
    if (getAddress(owner) !== safe || !/^0x0{40}$/.test(pending)) throw new Error(`The ownership of ${call.to} did not move: its owner is ${owner}`);
    const waiting = call.target?.key === "anchor" ? null : await publicClient.readContract({ address: call.to, abi: ownership, functionName: "pendingEvidenceSigner" });
    if (waiting && !/^0x0{40}$/.test(waiting)) throw new Error(`A signer is waiting on ${call.to}: ${waiting}. Call it off before anything else (ACTION=evidence-signer VALUE=0x0000000000000000000000000000000000000000)`);
    console.log(JSON.stringify({ step: "read back", contract: call.to, owner, pendingOwner: pending, ...(waiting ? { pendingEvidenceSigner: waiting } : {}) }, null, 2));
  }
}

main().catch((error) => {
  console.error("SAFE_ACTION_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
