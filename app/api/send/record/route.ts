import { NextResponse } from "next/server";
import { getAddress, isAddress, type Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { MON } from "@/src/coins";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { createMonadPublicClient } from "@/src/monad/chain";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { recordSend } from "@/src/send-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Writes down a send the person made from their own account, the chain's own coin, which nobody can relay for
 * them. The browser reports the hash; nothing is believed from it. The transaction is read back from the chain
 * and must be from this account, to the destination named, and included, before a row is written. What it
 * returns is the same reference the relayed sends get, so the confirmation reads the same on both branches.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ hash?: string; to?: string }>(request, 1_024);
    const hash = String(body.hash ?? "");
    const to = String(body.to ?? "");
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash) || !isAddress(to)) throw new GiftApiError("INVALID_REQUEST", "Please try again");

    const client = createMonadPublicClient();
    const [transaction, receipt] = await Promise.all([client.getTransaction({ hash: hash as Hex }), client.getTransactionReceipt({ hash: hash as Hex })]);
    const from = getAddress(auth.account);
    if (getAddress(transaction.from) !== from || !transaction.to || getAddress(transaction.to) !== getAddress(to) || receipt.status !== "success") {
      throw new GiftApiError("NOT_YOURS", "That is not a send from this account.", 403);
    }
    const recorded = await recordSend({ account: from, coin: MON.address, destination: getAddress(to), amount: transaction.value, txHash: hash as Hex });
    return NextResponse.json({ recorded: true, reference: recorded.reference }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
