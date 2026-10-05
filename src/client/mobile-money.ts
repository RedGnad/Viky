import type { LocalAccount } from "viem";
import { getAddress, type Hex } from "viem";
import { USDC } from "../coins";
import { MOBILE_REFUSALS } from "../mobile-money";
import type { ChangedDollars, LocalPrice, MobileOffer, PayableNow, StartedPayout, FollowedPayout } from "../mobile-money-server";
import { ApiError, getJson, postJson } from "./api";
import { quoteWayOut, takeTheWayOut, type WayOutQuote } from "./exit";
import { sendOwnMoney } from "./gift";

/**
 * The mobile money way out from the browser (the founder, 2 Oct 2026). Three moves, each one an existing one: the
 * exchange of the person's dollars into the dollar Switch takes (the way out's own router, unchanged), the payout
 * opened for what that exchange really made, and those dollars sent to the payout's deposit address by the person's
 * own signature, relayed like every send. Then the screen follows the payout to its end, and finds it again from the
 * server's ledger when the person comes back.
 */

export type { ChangedDollars, MobileOffer, PayableNow, StartedPayout, FollowedPayout };

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

/** What this account can really send to a number in its country now, the cost included, and dollars already changed. */
export function payableFor(country: string): Promise<PayableNow> {
  return getJson<PayableNow>(`/api/mobile-money/payable?country=${encodeURIComponent(country)}`);
}

/** The payout the way out still owes this account a screen for, or none. */
export function latestMobilePayout(): Promise<FollowedPayout | null> {
  return getJson<{ payout: FollowedPayout | null }>("/api/mobile-money/latest").then((answer) => answer.payout);
}

/** The end of a payout was shown to its account: it is not shown again. */
export function sawMobilePayout(reference: string): Promise<unknown> {
  return postJson("/api/mobile-money/seen", { reference });
}

/**
 * A step that changes the money did not answer: said as mobile money not being reachable, in the words this way out
 * uses, since the person is sending money to a number and was never told of anything else (the founder, 5 Oct 2026).
 */
function inThisWaysWords(error: unknown): unknown {
  if (error instanceof ApiError && error.code === "QUOTE_UNAVAILABLE") return new ApiError({ status: error.status, code: error.code, message: MOBILE_REFUSALS.notNow });
  return error;
}

/** The amount costs more than the account can change for it: said under the field, in the country's money. */
export class MoreThanHeld extends Error {
  constructor() {
    super("More than the account can change for this amount");
    this.name = "MoreThanHeld";
  }
}

/**
 * How much of the balance has to be changed for the exchange to guarantee at least `needed`, never more than `spend`,
 * which is what the account may change now. The exchange gives a little less than it takes, so the first ask falls
 * short and the second is that much larger; when even all of `spend` does not make it, the amount costs more than the
 * account holds, and that is said as such (it used to be asked anyway, refused, and shown as an amount nobody
 * could price).
 */
export async function changeFor(needed: bigint, spend: bigint, ask: (amount: bigint) => Promise<WayOutQuote>): Promise<Readonly<{ dollars: bigint; exchange: WayOutQuote }>> {
  if (spend <= 0n) throw new MoreThanHeld();
  const within = (amount: bigint) => (amount < spend ? amount : spend);
  const made = async (dollars: bigint) => {
    const exchange = await ask(dollars);
    return { dollars, exchange, floor: unitsOfShown(exchange.shown) };
  };
  let tried = await made(within(needed));
  if (tried.floor < needed && tried.dollars < spend && tried.floor > 0n) tried = await made(within((tried.dollars * needed) / tried.floor + 1n));
  // The second ask can fall a hair short when the rate ticks between the two: all that may be changed, once.
  if (tried.floor < needed && tried.dollars < spend) tried = await made(spend);
  if (tried.floor < needed) throw new MoreThanHeld();
  return { dollars: tried.dollars, exchange: tried.exchange };
}

export type MobilePrice = Readonly<{ ticket: string; dollars: bigint; local: number; currency: string; at: string }>;

/**
 * What it takes to put this much local currency on the number now (the founder, 3 Oct 2026): Switch's quote for exactly
 * that amount says how many dollars must reach it; the exchange is then asked for enough of the balance to make them,
 * within what the account may change (`changeFor`). Moves nothing.
 */
export async function priceMobileMoney(input: { local: number; country: string; spend: bigint }): Promise<MobilePrice> {
  const quote = await postJson<LocalPrice>("/api/mobile-money/quote", { country: input.country, local: input.local });
  try {
    const { dollars, exchange } = await changeFor(BigInt(quote.sourceUnits), input.spend, (amount) => quoteWayOut({ amount, coin: USDC.address, mobileMoneyIn: input.country }));
    return { ticket: exchange.ticket, dollars, local: quote.local, currency: quote.currency, at: quote.at };
  } catch (error) {
    // The balance moved under the screen: the exchange's own refusal for more than is held is the same answer.
    if (error instanceof ApiError && error.code === "NOT_ENOUGH") throw new MoreThanHeld();
    throw inThisWaysWords(error);
  }
}

type Beneficiary = Readonly<{ country: string; network: string; number: string; holderName: string }>;
type OnStep = (step: "changing" | "placing" | "sending") => void;

/**
 * Sends dollars already changed: the payout opened for what that change made, or found again when it was already
 * opened, then those dollars to its deposit address, which is checked to be a plain address before anything is signed
 * for it. Returns the payout to follow. This is where a payout that was cut after the change starts again, so money is
 * never changed twice (the founder, 5 Oct 2026).
 */
export async function sendChangedDollars(input: Beneficiary & { account: LocalAccount; exitTx: string; onStep?: OnStep }): Promise<StartedPayout> {
  input.onStep?.("placing");
  const payout = await postJson<StartedPayout>("/api/mobile-money/start", {
    exitTx: input.exitTx,
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

/** Sends it from the balance: the money changed first, then sent as dollars already changed are. */
export async function sendToMobileMoney(input: Beneficiary & { account: LocalAccount; ticket: string; onStep?: OnStep }): Promise<StartedPayout> {
  input.onStep?.("changing");
  const changed = await takeTheWayOut({ account: input.account, ticket: input.ticket }).catch((error) => {
    throw inThisWaysWords(error);
  });
  if (!changed.hash) throw new Error("The change left nothing to follow");
  return sendChangedDollars({ ...input, exitTx: changed.hash });
}

export function followMobileMoney(reference: string): Promise<FollowedPayout> {
  return getJson<FollowedPayout>(`/api/mobile-money/status?reference=${encodeURIComponent(reference)}`);
}
