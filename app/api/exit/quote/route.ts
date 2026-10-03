import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { exitExchangeAddress, exitRouterAddress, heldAusd } from "@/src/exit-relay";
import { issueExitTicket } from "@/src/exit-ticket";
import { coinAt, exactly, isNative, USDC } from "@/src/coins";
import { CONVERSION_RESERVE } from "@/src/funding-step";
import { formatAusd } from "@/src/gift-reader";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { kuruQuote } from "@/src/kuru";
import { assertWithinCeilings, assertWithinCorridor, offerIn } from "@/src/mobile-money-server";
import { afterTheReserve, cardSellLimits, dollarsForTheMinimum } from "@/src/mercuryo";
import { AUSD_ADDRESS, USDC_ADDRESS } from "@/src/monad/chain";
import { inFiat, payoutAsset, withinPayoutRange } from "@/src/ramp";
import { WAYS_OUT } from "@/src/rails";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { relayerClients } from "@/src/relayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What an exchange would give for the amount they chose, in the coin the way out they picked takes.
 *
 * The figure returned is the exchange's guaranteed floor, not its hoped-for output, and it is what the
 * signature binds: at least this much comes back or nothing moves at all.
 *
 * Under form C (D76) this figure is no longer a promise anybody has to act on before it exists. The order at
 * the payout service is placed afterwards, for the coin that actually arrived, so the floor is only what it
 * says it is, protection against the rate moving while the transaction is in flight. That is why nothing here
 * truncates it to what a screen can print.
 *
 * Which coin comes from the person's own choice of way out (D77), and travels on inside the ticket so the
 * step that asks for a signature cannot be pointed at the other corridor.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });

    const account = getAddress(auth.account);
    const router = exitRouterAddress();
    const exchange = exitExchangeAddress();

    const body = await readJsonBody<{ amount?: string; coin?: string; purpose?: string; country?: string }>(request, 1_024);
    let amount: bigint;
    try {
      amount = BigInt(String(body.amount ?? ""));
    } catch {
      throw new GiftApiError("INVALID_REQUEST", "Please try again");
    }
    if (amount <= 0n) throw new GiftApiError("INVALID_AMOUNT", "Enter an amount");

    // The coin has to be one of the ways out we actually offer. Anything else would be a corridor nobody has
    // read the terms of, quoted against a payout service that may never have heard of it.
    const wanted = String(body.coin ?? "").trim().toLowerCase();
    const way = WAYS_OUT.find((out) => out.coin.toLowerCase() === wanted);
    if (!way) throw new GiftApiError("UNKNOWN_WAY_OUT", "Choose how you want to be paid.");

    const held = await heldAusd(account);
    if (held < amount) throw new GiftApiError("NOT_ENOUGH", "That is more than you have.", 409);

    // Quoted as the router, because the router is what will call the exchange. The exchange's calldata names
    // no account of its own (measured 14 Sep): the proceeds go to whoever calls it, which is the router.
    const quote = await kuruQuote({ userAddress: router, tokenIn: AUSD_ADDRESS, tokenOut: way.coin, amount });
    if (getAddress(quote.to) !== exchange) throw new GiftApiError("NOT_CONFIGURED", "Viky cannot pay out yet.", 503);

    const floor = BigInt(quote.minOut);
    if (floor <= 0n) throw new GiftApiError("QUOTE_UNAVAILABLE", "No route for this right now. Try again shortly.", 503);

    // Whether this payout service would take a sale of this size today, asked of them, never remembered: they
    // publish it in their own currency and it moves with the rate. Each of the two publishes it somewhere we can
    // read, so each is asked: the bank service below, the card service after it.
    let payout: { currency: string; worth: number; smallest: number; largest: number } | undefined;
    // The same dollars bound for a mobile money number (the founder, 2 Oct 2026): it is that country's corridor at
    // Switch that has limits to keep, read from Switch now, and the bank service's own limits have nothing to say.
    const mobileMoney = body.purpose === "mobile-money";
    if (mobileMoney) {
      if (getAddress(way.coin) !== getAddress(USDC_ADDRESS)) throw new GiftApiError("UNKNOWN_WAY_OUT", "Choose how you want to be paid.");
      const offer = await offerIn(String(body.country ?? ""));
      if (!offer.offered) throw new GiftApiError("NOT_OFFERED", "Mobile money is not offered for this country. Nothing was taken.", 409);
      assertWithinCorridor(floor, offer);
      await assertWithinCeilings(account, amount);
    } else if (getAddress(way.coin) === getAddress(USDC_ADDRESS)) {
      const asset = await payoutAsset();
      // They name the coin's own contract in that list, and it must be the one this router hands back. If they
      // ever move to another, the swap would still work and the payout would be watched for somewhere else.
      if (getAddress(asset.address) !== getAddress(USDC_ADDRESS)) {
        throw new GiftApiError("NOT_CONFIGURED", "Viky cannot pay out yet.", 503);
      }
      const range = withinPayoutRange(floor, asset);
      if (range.tooSmall) {
        throw new GiftApiError(
          "BELOW_PAYOUT_MINIMUM",
          `${way.name} takes at least ${asset.minFiat.toFixed(2)} ${asset.currency}, about $${(asset.minFiat / asset.price).toFixed(2)} today. Send at least that.`,
          409,
        );
      }
      if (range.tooLarge) {
        throw new GiftApiError(
          "ABOVE_PAYOUT_MAXIMUM",
          `${way.name} takes at most ${asset.maxFiat.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${asset.currency} in one sale, about $${(asset.maxFiat / asset.price).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Send less than that.`,
          409,
        );
      }
      payout = {
        currency: asset.currency,
        worth: Number(inFiat(floor, asset).toFixed(2)),
        smallest: asset.minFiat,
        largest: asset.maxFiat,
      };
    }

    // The card service buys the chain's own coin, and two things were missing here (the audit of 1 Oct 2026, D60).
    // Its smallest sale: under it the sale is refused on its page, after the money has become a coin nothing else
    // here takes, so it is refused now, in dollars. And the reserve: an account under it can send nothing (D53), so
    // the first time it is kept out of what comes back, and the figure shown is what can really be sent.
    const coin = coinAt(way.coin) ?? USDC;
    let sendable = floor;
    let kept: string | undefined;
    if (isNative(coin)) {
      const limits = await cardSellLimits();
      const holding = await relayerClients().publicClient.getBalance({ address: account });
      const reserve = afterTheReserve(floor, holding, CONVERSION_RESERVE);
      if (reserve.sendable < limits.coinMin) {
        const least = dollarsForTheMinimum({ amount, floor, kept: reserve.kept, coinMin: limits.coinMin });
        throw new GiftApiError(
          "BELOW_PAYOUT_MINIMUM",
          `${way.name} pays a card from ${limits.fiatMin.toFixed(2)} ${limits.currency}, about ${formatAusd(least)} today. Send at least that.`,
          409,
        );
      }
      sendable = reserve.sendable;
      // What stays, said as the dollars it was a moment ago at this quote's own rate, never as a quantity of a coin.
      if (reserve.kept > 0n) kept = formatAusd((reserve.kept * amount) / floor);
    }

    // Written with the coin's own decimals: the dollar formatter on a figure with eighteen of them printed a number
    // a million million times too large (the audit of 1 Oct 2026).
    const shown = exactly(sendable, coin);
    return NextResponse.json(
      { shown, sells: way.sells, name: way.name, payout, kept, ticket: issueExitTicket({ account, amount, tokenOut: way.coin, floor, shown }) },
      { headers: NO_STORE },
    );
  } catch (error) {
    return giftErrorResponse(error);
  }
}
