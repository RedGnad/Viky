import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { floorInWords, PAYOUT_MAXIMUM, PAYOUT_MINIMUM, shownFloor } from "@/src/exit-plan";
import { exitExchangeAddress, exitRouterAddress, heldAusd } from "@/src/exit-relay";
import { issueExitTicket } from "@/src/exit-ticket";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { kuruQuote, NATIVE_MON } from "@/src/kuru";
import { AUSD_ADDRESS } from "@/src/monad/chain";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the way out is worth, for the signed-in account only.
 *
 * The figure returned is the exchange's guaranteed floor, not its hoped-for output, and it is truncated to
 * the decimals the screen prints. That is the whole point: the person reads this figure, leaves Viky, and
 * places an order at the payout service for exactly it. Whatever we show, we then bind into their signature
 * (src/exit-plan.ts), so they are delivered at least the order they placed or nothing moves at all. Showing
 * the hoped-for figure instead would turn every ordinary bit of slippage into a failed payout.
 *
 * It comes back signed (src/exit-ticket.ts) so the browser carries it to the next step without being able to
 * lower it.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });

    const account = getAddress(auth.account);
    const router = exitRouterAddress();
    const exchange = exitExchangeAddress();

    const body = await readJsonBody<{ amount?: string }>(request, 1_024);
    let amount: bigint;
    try {
      amount = BigInt(String(body.amount ?? ""));
    } catch {
      throw new GiftApiError("INVALID_REQUEST", "Please try again");
    }
    if (amount <= 0n) throw new GiftApiError("INVALID_AMOUNT", "Enter an amount");
    const held = await heldAusd(account);
    if (held < amount) throw new GiftApiError("NOT_ENOUGH", "That is more than you have.", 409);

    // Quoted as the router, because the router is what will call the exchange. The exchange's calldata names
    // no account of its own (measured 14 Sep): the proceeds go to whoever calls it, which is the router.
    const quote = await kuruQuote({ userAddress: router, tokenIn: AUSD_ADDRESS, tokenOut: NATIVE_MON, amount });
    if (getAddress(quote.to) !== exchange) throw new GiftApiError("NOT_CONFIGURED", "Viky cannot pay out yet.", 503);

    const floor = shownFloor(BigInt(quote.minOut));
    if (floor <= 0n) throw new GiftApiError("QUOTE_UNAVAILABLE", "No route for this right now. Try again shortly.", 503);
    // Said here rather than at the end of the journey: below their minimum the order cannot be placed at
    // all, and a person should learn that before they leave Viky to place it (D60).
    if (floor < PAYOUT_MINIMUM) {
      throw new GiftApiError("BELOW_PAYOUT_MINIMUM", "This is under the smallest payout the service will take. Wait until you have a little more.", 409);
    }
    if (floor > PAYOUT_MAXIMUM) {
      throw new GiftApiError("ABOVE_PAYOUT_MAXIMUM", "This is more than the service will pay out at once. Take it out in two goes.", 409);
    }
    const shown = floorInWords(floor);
    return NextResponse.json({ shown, ticket: issueExitTicket({ account, amount, floor, shown }) }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
