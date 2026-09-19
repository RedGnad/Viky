import "../src/load-env";
import { createPublicClient, createWalletClient, getAddress, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addMonadGasBuffer } from "../src/monad-gas";
import { MONAD_CHAIN_ID, monadChain, monadRpcUrl, waitForFinality } from "../src/monad/chain";
import {
  checkOwners,
  predictSafeAddress,
  safeAbi,
  safeCreationData,
  safeProxyFactoryAbi,
  safeSetupData,
  SAFE_FALLBACK_HANDLER,
  SAFE_L2_SINGLETON,
  SAFE_PROXY_FACTORY,
  SAFE_VERSION,
} from "../src/safe";

/**
 * Creates the Safe of two keys that is to own the four contracts (mitigation a). It reads no key of ours and holds
 * none: by default it writes the transaction out, and the founder signs it from his own wallet.
 *
 * `SAFE_OWNERS="0xA,0xB" pnpm safe:create` prints the address the Safe will have, the transaction that makes it,
 * and the salt that decides the address. Pass that salt back on the run that sends, or the address moves.
 *
 * The address is worked out before anything is sent, from the factory's own proxy code read live, and the same
 * arithmetic is checked in `test/safe.test.ts` against a Safe that already exists on Monad. Once it is made, this
 * script reads the Safe back and refuses to call it good on anything but its own answers.
 */

/**
 * How many of the owners have to sign. Two, unless the run says otherwise: one signature is a key, not a Safe, and
 * the shape this was built for is two of three, so a key lost leaves the other two able to act (the founder's
 * redesign of 19 Sep 2026, which takes his personal hardware wallet out of the project entirely).
 */
function thresholdFromEnv(): number {
  const raw = process.env.SAFE_THRESHOLD?.trim();
  const threshold = raw ? Number(raw) : 2;
  if (!Number.isSafeInteger(threshold) || threshold < 2) throw new Error(`A Safe of ${threshold} signature is a key with extra steps; SAFE_THRESHOLD is two or more`);
  return threshold;
}

function ownersFromEnv(threshold: number): readonly Address[] {
  const raw = process.env.SAFE_OWNERS?.trim();
  if (!raw) throw new Error('SAFE_OWNERS is required, as SAFE_OWNERS="0xfirst,0xsecond,0xthird"');
  const owners = raw.split(",").map((value) => getAddress(value.trim()));
  if (owners.length < threshold) throw new Error(`A Safe of ${threshold} signatures needs at least ${threshold} owners, and ${owners.length} were given`);
  return checkOwners(owners, threshold);
}

async function main() {
  const publicClient = createPublicClient({ chain: monadChain, transport: http(monadRpcUrl()) });
  const chainId = await publicClient.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`Refusing to run: chain id ${chainId} is not Monad mainnet (${MONAD_CHAIN_ID})`);

  // Nothing is built on an address that holds no code: a Safe made against an empty singleton is money in a hole.
  for (const [name, address] of [
    ["proxy factory", SAFE_PROXY_FACTORY],
    ["singleton", SAFE_L2_SINGLETON],
    ["fallback handler", SAFE_FALLBACK_HANDLER],
  ] as const) {
    const code = await publicClient.getCode({ address });
    if (!code || code === "0x") throw new Error(`Refusing to run: no code at the ${name}, ${address}, on this chain`);
  }

  const threshold = thresholdFromEnv();
  const owners = ownersFromEnv(threshold);
  const initializer = safeSetupData(owners, threshold);
  const saltNonce = process.env.SAFE_SALT_NONCE?.trim() ? BigInt(process.env.SAFE_SALT_NONCE.trim()) : BigInt(Date.now());
  const proxyCreationCode = (await publicClient.readContract({ address: SAFE_PROXY_FACTORY, abi: safeProxyFactoryAbi, functionName: "proxyCreationCode" })) as Hex;
  const safe = predictSafeAddress({ proxyCreationCode, initializer, saltNonce });
  const already = await publicClient.getCode({ address: safe });
  if (already && already !== "0x") throw new Error(`Refusing to run: ${safe} already holds code, so this salt has been used; choose another SAFE_SALT_NONCE`);

  const data = safeCreationData(initializer, saltNonce);
  const from = process.env.SAFE_SENDER?.trim() ? getAddress(process.env.SAFE_SENDER.trim()) : owners[0];
  const gas = addMonadGasBuffer(await publicClient.estimateGas({ account: from, to: SAFE_PROXY_FACTORY, data }));
  console.log(
    JSON.stringify(
      {
        chainId: MONAD_CHAIN_ID,
        safeWillBe: safe,
        owners,
        threshold,
        version: SAFE_VERSION,
        saltNonce: saltNonce.toString(),
        call: { from, to: SAFE_PROXY_FACTORY, value: "0", gas: gas.toString(), data },
      },
      null,
      2,
    ),
  );

  if (process.env.SEND !== "1") {
    console.log(`Sign this from one of your own wallets. Keep SAFE_SALT_NONCE=${saltNonce}: it is what makes the address above, and another salt makes another address.`);
    return;
  }
  if (!process.env.SAFE_SALT_NONCE?.trim()) throw new Error("Refusing to send without SAFE_SALT_NONCE: run it once to see the address, then send with that same salt");
  const key = process.env.SAFE_SENDER_PRIVATE_KEY?.trim();
  if (!key) throw new Error("SEND=1 needs SAFE_SENDER_PRIVATE_KEY in your own shell; nothing in this repository holds a key");
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const walletClient = createWalletClient({ account, chain: monadChain, transport: http(monadRpcUrl()) });
  const hash = await walletClient.sendTransaction({ to: SAFE_PROXY_FACTORY, data, gas });
  const receipt = await waitForFinality(publicClient, hash);
  if (receipt.status !== "success") throw new Error(`The creation reverted in ${hash}`);

  // Read the Safe back, and believe its own answers rather than the receipt.
  const code = await publicClient.getCode({ address: safe });
  if (!code || code === "0x") throw new Error(`The transaction succeeded but ${safe} holds no code`);
  const read = (functionName: "VERSION" | "getOwners" | "getThreshold" | "nonce") => publicClient.readContract({ address: safe, abi: safeAbi, functionName });
  const [version, onChainOwners, onChainThreshold, nonce] = await Promise.all([read("VERSION"), read("getOwners"), read("getThreshold"), read("nonce")]);
  console.log(JSON.stringify({ step: "created", safe, txHash: hash, block: receipt.blockNumber.toString(), version, owners: onChainOwners, threshold: Number(onChainThreshold), nonce: Number(nonce) }, null, 2));
  if (String(version) !== SAFE_VERSION) throw new Error(`The Safe says version ${version}, not ${SAFE_VERSION}`);
  if (Number(onChainThreshold) !== threshold) throw new Error(`The Safe asks for ${onChainThreshold} signatures, not ${threshold}`);
  const got = (onChainOwners as readonly Address[]).map((owner) => getAddress(owner)).sort();
  if (got.join(",") !== [...owners].sort().join(",")) throw new Error(`The Safe holds ${got.join(", ")}, not the owners that were asked for`);
  console.log(`The Safe is ${safe}. Hand the four contracts over with SAFE_ADDRESS=${safe} pnpm safe:handover.`);
}

main().catch((error) => {
  console.error("SAFE_CREATE_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
