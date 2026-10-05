import type { Hex } from "viem";
import { lastLandedExit } from "./exit-store";
import { sentSince } from "./send-store";

/**
 * A withdrawal that is open (the founder, 3 Oct 2026): money this account changed for a payout service and has not
 * sent to it yet. It is read from what was written down, the way out that landed and the sends made since, and never
 * from a balance.
 *
 * A balance was what said it, and it was false: any USDC in an account read as "ready to send to Ramp", so the dollars
 * a card payment had just delivered, waiting to become a gift, were shown as a withdrawal under way, on Home, a
 * moment after paying (the founder's payment of 3 Oct 2026: "$5.60 of it is ready to send to Ramp").
 *
 * `atLeast` is the least the way out could give back. The screen holds the balance to it (`heldForWithdrawal`,
 * src/exit-steps.ts): an account that holds less
 * of the coin than that no longer holds what the way out brought, whatever was or was not written down of its leaving
 * (the one way out of 16 Sep 2026 has no send written after it), and nothing is said to be ready.
 */
export type OpenWithdrawal = Readonly<{ coin: Hex; atLeast: bigint; sinceMs: number; /** The transaction that changed it, when it is known. */ txHash: Hex | null }>;

export async function openWithdrawalOf(account: string): Promise<OpenWithdrawal | null> {
  const landed = await lastLandedExit(account);
  if (!landed) return null;
  if (await sentSince(account, landed.tokenOut, landed.sentAtMs)) return null;
  return { coin: landed.tokenOut, atLeast: landed.minOut, sinceMs: landed.sentAtMs, txHash: landed.txHash };
}
