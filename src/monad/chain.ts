import { createPublicClient, http, type Hash, type PublicClient, type TransactionReceipt } from "viem";
import { monad } from "viem/chains";

export const MONAD_CHAIN_ID = 143;
export const AUSD_ADDRESS = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a" as const;
export const AUSD_DECIMALS = 6;
export const PUBLIC_RPC_URL = "https://rpc.monad.xyz";

/** Monad finalises k = 3 blocks after inclusion, about 1.2 s at 302 ms per block. */
export const FINALITY_POLL_MS = 300;
export const FINALITY_TIMEOUT_MS = 30_000;

export const monadChain = monad;

export function monadRpcUrl(): string {
  return process.env.NEXT_PUBLIC_MONAD_RPC_URL?.trim() || PUBLIC_RPC_URL;
}

export function createMonadPublicClient(rpcUrl = monadRpcUrl()): PublicClient {
  return createPublicClient({ chain: monadChain, transport: http(rpcUrl) });
}

export class FinalityTimeout extends Error {
  constructor(hash: Hash) {
    super(`Transaction ${hash} was not finalised within ${FINALITY_TIMEOUT_MS} ms`);
    this.name = "FinalityTimeout";
  }
}

/**
 * Resolves only once the block holding the receipt is at or below the `finalized` tag. Anything
 * the person sees as "done" waits for this; a receipt alone is not enough on Monad.
 */
export async function waitForFinality(client: PublicClient, hash: Hash): Promise<TransactionReceipt> {
  const receipt = await client.waitForTransactionReceipt({ hash });
  const deadline = Date.now() + FINALITY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const finalized = await client.getBlock({ blockTag: "finalized" });
    if (finalized.number >= receipt.blockNumber) return receipt;
    await new Promise((resolve) => setTimeout(resolve, FINALITY_POLL_MS));
  }
  throw new FinalityTimeout(hash);
}
