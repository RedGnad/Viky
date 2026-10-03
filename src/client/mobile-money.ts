import type { LocalAccount } from "viem";
import { getAddress, type Hex } from "viem";
import { USDC } from "../coins";
import type { LocalPrice, MobileOffer, StartedPayout, FollowedPayout } from "../mobile-money-server";
import { getJson, postJson } from "./api";
import { quoteWayOut, takeTheWayOut } from "./exit";
import { sendOwnMoney } from "./gift";

/**
 * The mobile money way out from the browser (the founder, 2 Oct 2026). Three moves, each one an existing one: the
 * exchange of the person's dollars into the dollar Switch takes (the way out's own router, unchanged), the payout
 * opened for what that exchange really made, and those dollars sent to the payout's deposit address by the person's
 * own signature, relayed like every send. Then the screen follows the payout to its end.
 */

export type { MobileOffer, StartedPayout, FollowedPayout };

/** The offer for a country, with the most this account can send in one payout now when it is offered. */
export type AccountOffer = MobileOffer | (Extract<MobileOffer, { offered: true }> & Readonly<{ mostUnits: string }>);

export function mobileMoneyOffer(country: string): Promise<AccountOffer> {
  return getJson<AccountOffer>(`/api/mobile-money/offer?country=${encodeURIComponent(country)}`);
}

/** "10.5", "10.123456": the exchange's floor as it writes it, in units of six decimals, by its digits. */
export function unitsOfShown(shown: string): bigint {
  const [whole, part = ""] = shown.trim().split(".");
  if (!/^\d+$/.test(whole) || !/^\d{0,6}$/.test(part)) throw new Error("Not an amount");
  return BigInt(whole) * 1_000_000n + BigInt(part.padEnd(6, "0"));
}

export type MobilePrice = Readonly<{ ticket: string; dollars: bigint; local: number; currency: string; at: string }>;

/**
 * What it takes to put this much local currency on the number now (the founder, 3 Oct 2026): Switch's quote for exactly
 * that amount says how many dollars must reach it; the exchange is then asked for enough of the balance to make them, a
 * second time with more when its floor falls short. Moves nothing.
 */
export async function priceMobileMoney(input: { local: number; country: string }): Promise<MobilePrice> {
  const quote = await postJson<LocalPrice>("/api/mobile-money/quote", { country: input.country, local: input.local });
  const needed = BigInt(quote.sourceUnits);
  let dollars = needed;
  let exchange = await quoteWayOut({ amount: dollars, coin: USDC.address, mobileMoneyIn: input.country });
  const floor = unitsOfShown(exchange.shown);
  if (floor < needed) {
    // The exchange gives a little less than it takes: ask for that much more, once, and refuse if it still falls short.
    dollars = (dollars * needed) / floor + 1n;
    exchange = await quoteWayOut({ amount: dollars, coin: USDC.address, mobileMoneyIn: input.country });
    if (unitsOfShown(exchange.shown) < needed) throw new Error("The exchange cannot make enough for this amount right now");
  }
  return { ticket: exchange.ticket, dollars, local: quote.local, currency: quote.currency, at: quote.at };
}

/**
 * Sends it: the exchange, the payout opened for what it made, then those dollars to the deposit address, which is
 * checked to be a plain address before anything is signed for it. Returns the payout to follow.
 */
export async function sendToMobileMoney(input: {
  account: LocalAccount;
  ticket: string;
  country: string;
  network: string;
  number: string;
  holderName: string;
  onStep?: (step: "changing" | "placing" | "sending") => void;
}): Promise<StartedPayout> {
  input.onStep?.("changing");
  const exchanged = await takeTheWayOut({ account: input.account, ticket: input.ticket });
  if (!exchanged.hash) throw new Error("The exchange left no transaction to follow");
  input.onStep?.("placing");
  const payout = await postJson<StartedPayout>("/api/mobile-money/start", {
    exitTx: exchanged.hash,
    country: input.country,
    network: input.network,
    number: input.number,
    holderName: input.holderName,
  });
  input.onStep?.("sending");
  await sendOwnMoney({ account: input.account, to: getAddress(payout.depositAddress) as Hex, amount: BigInt(payout.depositUnits), coin: USDC });
  await postJson("/api/mobile-money/deposited", { reference: payout.reference });
  return payout;
}

export function followMobileMoney(reference: string): Promise<FollowedPayout> {
  return getJson<FollowedPayout>(`/api/mobile-money/status?reference=${encodeURIComponent(reference)}`);
}
