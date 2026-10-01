import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { exitExchangeAddress } from "@/src/exit-relay";
import { quoteIsFor } from "@/src/funding-quote";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { kuruQuote, NATIVE_MON } from "@/src/kuru";
import { AUSD_ADDRESS } from "@/src/monad/chain";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The one conversion the funder screen needs: what a funder bought with their card, turned into what a
 * gift holds, for the signed-in account only. The pair is fixed here rather than taken from the request,
 * so this route can never be used as a general exchange proxy.
 *
 * What the exchange answers is the funder's own account's next transaction, so it is held to two things before it is
 * answered (the audit of 1 Oct 2026): it goes to the one exchange Viky uses, the one the way out is opened to, and it
 * sends exactly the amount asked for. An answer that does not is refused, and nothing is sent.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ amount?: string }>(request, 1_024);
    let amount: bigint;
    try {
      amount = BigInt(String(body.amount ?? ""));
    } catch {
      throw new GiftApiError("INVALID_REQUEST", "Please try again");
    }
    if (amount <= 0n) throw new GiftApiError("INVALID_REQUEST", "Please try again");
    const exchange = exitExchangeAddress();
    const quote = await kuruQuote({ userAddress: getAddress(auth.account), tokenIn: NATIVE_MON, tokenOut: AUSD_ADDRESS, amount });
    if (!quoteIsFor(quote, amount, exchange)) {
      console.error(`funding quote refused: it names ${quote.to} and sends ${quote.value}, for ${amount} to ${exchange}`);
      throw new GiftApiError("QUOTE_UNAVAILABLE", "The exchange is not answering as expected. Nothing was changed. Try again shortly.", 503);
    }
    return NextResponse.json(quote, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
