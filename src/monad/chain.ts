import { createPublicClient, fallback, http, WaitForTransactionReceiptTimeoutError, type Hash, type PublicClient, type TransactionReceipt, type Transport } from "viem";
import { monad } from "viem/chains";

export const MONAD_CHAIN_ID = 143;
export const AUSD_ADDRESS = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a" as const;
export const AUSD_DECIMALS = 6;
/**
 * The coin the way out ends in, because the payout service takes this one and not what a gift holds (D76).
 *
 * Read on chain on 16 Sep 2026 at https://rpc.monad.xyz: 1798 bytes of code, `decimals` 6, symbol and name
 * USDC, and `authorizationState` answers, so it carries EIP-3009 like AUSD does. The payout service names
 * this same address in its own off-ramp asset list, which is what makes it the right one: sending a coin they
 * do not watch for would be a payment nobody sees.
 */
export const USDC_ADDRESS = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as const;
export const USDC_DECIMALS = 6;
export const PUBLIC_RPC_URL = "https://rpc.monad.xyz";

/**
 * Monad finalises a block two rounds after it is proposed, about 600 ms at 300 ms a block (docs.monad.xyz, MonadBFT:
 * "full finality in two rounds", read 1 Oct 2026). Nothing here counts blocks: `waitForFinality` asks the node for the
 * `finalized` tag.
 *
 * The two waits are fifteen seconds each (the audit of 1 Oct 2026). The wait for the receipt had no limit of its own,
 * so it was the library's three minutes inside functions that live one: the function was cut before any `catch` here
 * could say what had happened.
 */
export const FINALITY_POLL_MS = 300;
export const FINALITY_TIMEOUT_MS = 15_000;
export const RECEIPT_TIMEOUT_MS = 15_000;

export const monadChain = monad;

/**
 * The provider this code asks first. On the server, `MONAD_RPC_URL` when it is set, a server-only variable that never
 * reaches the browser; otherwise the public one the browser reads too.
 */
export function monadRpcUrl(): string {
  const serverOnly = typeof window === "undefined" ? process.env.MONAD_RPC_URL?.trim() : undefined;
  return serverOnly || process.env.NEXT_PUBLIC_MONAD_RPC_URL?.trim() || PUBLIC_RPC_URL;
}

/**
 * Every read and every send goes through this: the configured provider first, then Monad's public endpoint when the
 * provider refuses or fails. On 23 Sep 2026 at 09:21 the provider's key was restricted to the viky.cash origin; a
 * server sends no origin, so every contract read of the server was refused, and every gift said it could not be loaded
 * for an hour (D192). A refusal of the provider must never be a refusal of the product. A contract's own revert is not
 * a provider failure: viem's fallback throws it at once rather than asking again elsewhere.
 */
export function monadTransport(rpcUrl = monadRpcUrl()): Transport {
  if (rpcUrl === PUBLIC_RPC_URL) return http(rpcUrl);
  return fallback([http(rpcUrl), http(PUBLIC_RPC_URL)]);
}

export function createMonadPublicClient(rpcUrl = monadRpcUrl()): PublicClient {
  return createPublicClient({ chain: monadChain, transport: monadTransport(rpcUrl) });
}

/**
 * A transaction that was sent and is not known to be final: no receipt within `RECEIPT_TIMEOUT_MS`, or a receipt whose
 * block was not finalised within `FINALITY_TIMEOUT_MS`. It says neither that the thing was done nor that nothing
 * changed: the transaction may still be final a moment later.
 */
export class FinalityTimeout extends Error {
  constructor(readonly hash: Hash) {
    super(`Transaction ${hash} was not final within the wait`);
    this.name = "FinalityTimeout";
  }
}

/**
 * Resolves only once the block holding the receipt is at or below the `finalized` tag. Anything
 * the person sees as "done" waits for this; a receipt alone is not enough on Monad.
 */
export async function waitForFinality(client: PublicClient, hash: Hash): Promise<TransactionReceipt> {
  let receipt: TransactionReceipt;
  try {
    receipt = await client.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof WaitForTransactionReceiptTimeoutError) throw new FinalityTimeout(hash);
    throw error;
  }
  const deadline = Date.now() + FINALITY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const finalized = await client.getBlock({ blockTag: "finalized" });
    if (finalized.number >= receipt.blockNumber) return receipt;
    await new Promise((resolve) => setTimeout(resolve, FINALITY_POLL_MS));
  }
  throw new FinalityTimeout(hash);
}
