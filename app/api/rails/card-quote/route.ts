import { NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { cardQuoteAsk, quoteForUsdc } from "@/src/rampnow-quote";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rampnow's quote for what a gift needs of a card, in the currency the person reads Viky in (src/rampnow-quote.ts):
 * what the card pays, what Rampnow keeps of it, and the USDC that arrive; or that the gift is under its smallest
 * payment; or that there is no quote, and the sheet then asks the card in dollars by the rule measured.
 *
 * Asked by the pay sheet before anybody has an account, so it reads no session: a currency and an amount of USDC say
 * nothing of a person, and nothing else is sent to Rampnow. The key that asks is the server's, and stays there.
 */
export async function GET(request: Request) {
  const rate = checkRateLimit("status", request);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
  const need = cardQuoteAsk(new URL(request.url).searchParams);
  if (!need) return NextResponse.json({ state: "none", because: "not-understood" }, { headers: NO_STORE });
  return NextResponse.json(await quoteForUsdc(need), { headers: NO_STORE });
}
