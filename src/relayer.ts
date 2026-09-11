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
    throw new RelayerError("REVERTED", name ? `The contract refused: ${name}` : "The contract refused the transaction", name);
  }
  const hash = await clients.walletClient.writeContract({
    address,
    abi,
    functionName,
    args: args as never,
    gas: giftGasLimit(functionName),
    account: clients.walletClient.account!,
    chain: monadChain,
  });
  const receipt = await waitForFinality(clients.publicClient, hash);
  if (receipt.status !== "success") {
    throw new RelayerError("REVERTED", "The transaction was included but reverted");
  }
  return { hash, receipt };
}
