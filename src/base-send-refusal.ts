import { BaseError, type Hex, type PublicClient } from "viem";

/**
 * The refusals a node gives before a transaction enters its pool: a nonce already spent, a fee below what it takes, funds
 * that do not cover it, a gas limit it cannot carry. "already known" is not one of them: the node holds the transaction.
 */
const PLAIN_REFUSAL = /nonce too low|replacement transaction underpriced|transaction underpriced|insufficient funds|intrinsic gas too low|exceeds block gas limit/i;

/** JSON-RPC codes a node answers a refused transaction with (EIP-1474: invalid input, transaction rejected). */
const REFUSAL_CODES = new Set([-32000, -32003]);

/** Whether the node answered the send with a plain refusal, as opposed to an answer lost, a timeout or an error it does not explain. */
function plainRefusal(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false;
  const answered = error.walk((cause) => cause instanceof Error && cause.name === "RpcRequestError") as (Error & { code?: number; details?: string }) | null;
  return Boolean(answered && typeof answered.code === "number" && REFUSAL_CODES.has(answered.code) && PLAIN_REFUSAL.test(answered.details ?? ""));
}

/**
 * Whether a signed transaction whose send threw can never land, so that the money it was to pay can go back: the node
 * plainly refused it, and Base does not know it by its hash. Anything else may still land: an answer lost, a timeout,
 * a node that already holds it, an error nobody explains, or a lookup that did not answer.
 */
export async function sendRefusedAndUnknown(error: unknown, hash: Hex, publicClient: Pick<PublicClient, "getTransaction">): Promise<boolean> {
  if (!plainRefusal(error)) return false;
  try {
    await publicClient.getTransaction({ hash });
    return false;
  } catch (lookup) {
    return lookup instanceof Error && lookup.name === "TransactionNotFoundError";
  }
}
