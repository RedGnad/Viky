import {
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  formatEther,
  getAddress,
  http,
  parseEther,
  type Abi,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { giftEscrowAbi } from "./gift-escrow-abi";
import { giftGasLimit, type GiftFunction } from "./gift-gas";
import { addMonadGasBuffer } from "./monad-gas";
import { MONAD_CHAIN_ID, monadChain, monadRpcUrl, waitForFinality } from "./monad/chain";

/**
 * The relayer pays the gas of every recipient action and of every funder action that is not the
 * funder's own signature. It never holds user keys: it only submits attestations and signed intents
 * to the gift contract. Monad rules it follows (docs, DECISIONS.md D6): explicit gas limits with the
 * 7.5 % margin because the declared limit is charged; a balance kept above the 10 MON reserve;
 * nonces managed locally; nothing shown as done before finality (k = 3 blocks).
 */

export const RELAYER_MIN_BALANCE = parseEther("12");

export type RelayerErrorCode = "NOT_CONFIGURED" | "WRONG_CHAIN" | "RESERVE_TOO_LOW" | "REVERTED" | "NOT_FINALISED";

export class RelayerError extends Error {
  constructor(
    readonly code: RelayerErrorCode,
    message: string,
    readonly contractError?: string,
    /** The refusal exactly as the chain gave it, when it carried no typed error to name. Operators only. */
    readonly rawReason?: string,
  ) {
    super(message);
    this.name = "RelayerError";
  }
}

export type RelayerClients = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  address: Hex;
};

let cached: RelayerClients | undefined;

export function relayerClients(): RelayerClients {
  if (cached) return cached;
  const key = process.env.RELAYER_PRIVATE_KEY?.trim();
  if (!key) throw new RelayerError("NOT_CONFIGURED", "The relayer is not configured");
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const transport = http(monadRpcUrl());
  cached = {
    publicClient: createPublicClient({ chain: monadChain, transport }),
    walletClient: createWalletClient({ account, chain: monadChain, transport }),
    address: account.address,
  };
  return cached;
}

/** The contract new gifts are created on. Existing gifts are served by the contract that holds them. */
export function escrowAddress(): Hex {
  const value = process.env.GIFT_ESCROW_ADDRESS?.trim();
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new RelayerError("NOT_CONFIGURED", "The gift contract is not configured");
  return getAddress(value);
}

/**
 * Fails closed on a deployment with no contract configured. Routes call it after the cheap checks on
 * the request and before any database or chain access, so a misconfigured deployment never half-acts.
 */
export function assertGiftContractConfigured(): void {
  escrowAddress();
}

/**
 * The contract holding a gift, read from the gift's own record. A record without one is refused rather
 * than served by the configured contract: after a redeployment that fallback would silently point an
 * older gift at the new contract, where it does not exist (D30). The migration stamps every gift saved
 * before the column existed, and `saveGift` has stamped every gift since.
 */
export function escrowOf(record: { escrow: Hex | null } | null | undefined): Hex {
  const value = record?.escrow?.trim();
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new RelayerError("NOT_CONFIGURED", "This gift is not served by this deployment");
  }
  return getAddress(value);
}

/** Refuses to relay below the reserve plus a working margin, and off Monad mainnet. */
export async function relayerPreflight(clients: RelayerClients = relayerClients()): Promise<{ balance: bigint; chainId: number }> {
  const chainId = await clients.publicClient.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new RelayerError("WRONG_CHAIN", `The relayer is connected to chain ${chainId}, not Monad mainnet`);
  const balance = await clients.publicClient.getBalance({ address: clients.address });
  if (balance < RELAYER_MIN_BALANCE) {
    throw new RelayerError("RESERVE_TOO_LOW", `The relayer holds ${formatEther(balance)} MON, below the 10 MON reserve plus margin`);
  }
  return { balance, chainId };
}

/** Maps a revert to the contract's typed error name, so a refusal is demonstrable and never a raw hex blob. */
export function decodeContractError(error: unknown, abi: Abi = giftEscrowAbi as unknown as Abi): string | undefined {
  const walk = (value: unknown, depth: number): string | undefined => {
    if (!value || typeof value !== "object" || depth > 6) return undefined;
    const candidate = value as { data?: unknown; cause?: unknown; name?: string; errorName?: string };
    if (typeof candidate.errorName === "string") return candidate.errorName;
    // The shape viem actually produces for a typed revert: the name arrives decoded, inside `data`, one
    // layer down. Reading only the hex form missed every one of them, and a refusal the contract named
    // perfectly well reached the person as "this could not be recorded" (D51).
    if (candidate.data && typeof candidate.data === "object") {
      const decoded = candidate.data as { errorName?: unknown; args?: unknown };
      if (typeof decoded.errorName === "string") {
        // "Error" is what Solidity calls a refusal written as a sentence rather than as a named error, and
        // the sentence itself is its only argument. A library inside the contract can refuse this way, so
        // the sentence is the name here: without it the reason is lost and nothing can be said to anyone.
        if (decoded.errorName === "Error" && Array.isArray(decoded.args) && typeof decoded.args[0] === "string") {
          return decoded.args[0];
        }
        return decoded.errorName;
      }
    }
    if (typeof candidate.data === "string" && candidate.data.startsWith("0x") && candidate.data.length >= 10) {
      try {
        return decodeErrorResult({ abi, data: candidate.data as Hex }).errorName;
      } catch {
        // not one of ours
      }
    }
    return walk(candidate.cause, depth + 1);
  };
  return walk(error, 0);
}

/** Nothing Viky does should ever need this much; beyond it something is wrong and no money is risked. */
const RUNAWAY_GAS = 2_000_000n;

/**
 * What to declare for one call. The estimate is what the chain says this exact call costs right now, in its
 * current state and against the real token, which is the only number that means anything on a chain that
 * charges the declared limit.
 */
export async function relayGasLimit(
  clients: RelayerClients,
  call: { address: Hex; abi: Abi; functionName: string; args: readonly unknown[]; value?: bigint },
  /**
   * A recorded figure to stay above, for calls whose cost is known in advance. The way out has none on
   * purpose: it carries an exchange's own call inside it, so nobody can write down what it costs. Estimating
   * is the only honest number there, which is what D52 cost us to learn.
   */
  floor = 0n,
): Promise<bigint> {
  let estimated: bigint;
  try {
    estimated = await clients.publicClient.estimateContractGas({
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args as never,
      account: clients.address,
      value: call.value,
    });
  } catch {
    // An estimate can fail for reasons the call itself survives. Fall back to the recorded figure rather
    // than refusing: it is the behaviour we had before, and it is never the lower of the two. With no
    // recorded figure there is nothing to fall back to, and declaring a guess is how D52 happened: refuse.
    if (floor === 0n) throw new RelayerError("NOT_CONFIGURED", "Viky could not work out what this costs. Nothing was changed.");
    return floor;
  }
  const wanted = addMonadGasBuffer(estimated);
  if (wanted > RUNAWAY_GAS) throw new RelayerError("NOT_CONFIGURED", "Viky is not ready for this yet. Nothing was changed.");
  return wanted > floor ? wanted : floor;
}

export type RelayResult = Readonly<{ hash: Hash; receipt: TransactionReceipt }>;

/**
 * Submits one contract call with an explicit gas limit and waits for finality. A revert becomes a
 * `RelayerError` carrying the contract's typed error name.
 */
export async function relay(
  functionName: GiftFunction,
  args: readonly unknown[],
  escrow: Hex = escrowAddress(),
  clients: RelayerClients = relayerClients(),
): Promise<RelayResult> {
  await relayerPreflight(clients);
  const address = escrow;
  const abi = giftEscrowAbi as unknown as Abi;
  try {
    // Simulate first: a refusal costs nothing and comes back with its typed error.
    await clients.publicClient.simulateContract({ address, abi, functionName, args: args as never, account: clients.address });
  } catch (error) {
    const name = decodeContractError(error);
    // Not a typed error means an older library inside the contract reverted with a plain string, and the
    // whole reason used to vanish on its way to the person. Keep it on the error itself.
    const raw = name ? undefined : (error instanceof Error ? error.message : String(error)).slice(0, 400).replace(/\s+/g, " ");
    if (raw) console.error(`contract refused without a typed error: ${raw}`);
    throw new RelayerError("REVERTED", name ? `The contract refused: ${name}` : "The contract refused the transaction", name, raw);
  }
  // Monad charges the limit that is declared, not what is used, so the docs ask for an accurate one rather
  // than a generous one. Ours came from a Foundry suite running against a mock token, and the real AUSD is a
  // proxy that costs more: the withdrawal path was declared 172,000 against a real cost near 170,000, which
  // is not a margin (D52). Estimated against the chain now, with the same margin on top, and the recorded
  // figure kept only as a floor so a suspiciously low estimate cannot under-declare either.
  const gas = await relayGasLimit(clients, { address, abi, functionName, args }, giftGasLimit(functionName));
  const hash = await clients.walletClient.writeContract({
    address,
    abi,
    functionName,
    args: args as never,
    gas,
    account: clients.walletClient.account!,
    chain: monadChain,
  });
  const receipt = await waitForFinality(clients.publicClient, hash);
  if (receipt.status !== "success") {
    throw new RelayerError("REVERTED", "The transaction was included but reverted");
  }
  return { hash, receipt };
}
