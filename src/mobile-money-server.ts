import { randomUUID } from "node:crypto";
import { getAddress, parseEventLogs, type Hex, type PublicClient } from "viem";
import { USDC } from "./coins";
import { exitRouterAbi } from "./exit-router-abi";
import { exitRouterAddress, heldAusd, heldOf } from "./exit-relay";
import { GiftApiError } from "./gift-api";
import { kuruQuote } from "./kuru";
import { BOUND_MARGIN_PER_MILLE, ceilingProblem, localOfUnits, MOBILE_REFUSALS, mobileMoneyOn, mostNow, numberEnd, operatorInWords, phaseOf, settled, type PayoutPhase } from "./mobile-money";
import { dropUnpaidPayout, lastUnseenPayout, loadPayout, markPayoutSeen, notePayoutState, payoutOfExit, recordPayout, usedToday, type MobilePayout } from "./mobile-money-store";
import { AUSD_ADDRESS, USDC_ADDRESS } from "./monad/chain";
import { openWithdrawalOf, type OpenWithdrawal } from "./open-withdrawal";
import { relayerClients } from "./relayer";
import { mobileMoneyCoverage, openPayout, payoutFields, payoutRates, payoutStatus, quotePayout, SwitchError, type Corridor, type PayoutFields, type PayoutQuote } from "./switch";

/**
 * The mobile money way out on the server (the founder, 2 Oct 2026): what is offered in a country, what a payout would
 * give, opening it for the dollars an exchange really made, and following it to its end. Every refusal is typed and
 * says that nothing was taken, or where the money is.
 *
 * Which countries, their limits and their published time, and the operators of each, are read from Switch while the
 * person looks, kept a few minutes per country in this process so a screen does not ask twice in one sitting (Switch
 * answered 429 to a quick run of reads on 2 Oct 2026), and never copied into this code (the rule of src/rails.ts).
 */

const KEPT_MS = 10 * 60_000;
let coverage: { at: number; rows: readonly Corridor[]; rates: ReadonlyMap<string, number> } | undefined;
const fields = new Map<string, { at: number; fields: PayoutFields }>();
const leasts = new Map<string, { at: number; least: number }>();

export type SwitchReader = Readonly<{
  coverage: () => Promise<readonly Corridor[]>;
  rates: () => Promise<ReadonlyMap<string, number>>;
  fields: (country: string) => Promise<PayoutFields>;
  quote: (input: Parameters<typeof quotePayout>[0]) => Promise<PayoutQuote>;
}>;

export const liveSwitch: SwitchReader = {
  coverage: () => mobileMoneyCoverage(),
  rates: () => payoutRates(),
  fields: (country) => payoutFields(country),
  quote: (input) => quotePayout(input),
};

/** Tests only: forget what was kept. */
export function forgetKeptCoverage(): void {
  coverage = undefined;
  fields.clear();
  leasts.clear();
}

async function corridors(reader: SwitchReader, now: number): Promise<{ rows: readonly Corridor[]; rates: ReadonlyMap<string, number> }> {
  if (coverage && now - coverage.at < KEPT_MS) return coverage;
  const [rows, rates] = await Promise.all([reader.coverage(), reader.rates()]);
  coverage = { at: now, rows, rates };
  return coverage;
}

async function fieldsOf(reader: SwitchReader, country: string, now: number): Promise<PayoutFields> {
  const kept = fields.get(country);
  if (kept && now - kept.at < KEPT_MS) return kept.fields;
  const read = await reader.fields(country);
  fields.set(country, { at: now, fields: read });
  return read;
}

/** A share of an amount, in thousandths, cut down. */
const perMille = (units: bigint, share: number) => (units * BigInt(share)) / 1000n;

/**
 * The smallest payout of a country in its own money: what Switch's quote gives for the corridor's minimum, raised by
 * the margin, so an amount typed at the bound is priced at or over the minimum and is not refused for being under it.
 * It was the minimum at Switch's published rate, which a quote beats by a third of a percent (measured 3 Oct 2026):
 * 5 873 F was offered and priced at $9.97, under the $10.00 it has to reach. Kept ten minutes per country like the
 * rest; when the quote does not answer, the published rate with the margin doubled.
 */
async function leastLocalOf(reader: SwitchReader, corridor: Corridor, rate: number, now: number): Promise<number> {
  const kept = leasts.get(corridor.country);
  if (kept && now - kept.at < KEPT_MS) return kept.least;
  try {
    const quote = await reader.quote({ country: corridor.country, units: corridor.minimumUnits });
    if (quote.currency !== corridor.currency || !(quote.local > 0)) throw new Error("Not a quote for this corridor");
    const least = Math.ceil(quote.local * (1 + BOUND_MARGIN_PER_MILLE / 1000));
    leasts.set(corridor.country, { at: now, least });
    return least;
  } catch {
    return Math.ceil(localOfUnits(corridor.minimumUnits, rate, "up") * (1 + (2 * BOUND_MARGIN_PER_MILLE) / 1000));
  }
}

/**
 * What is kept of a country, without asking Switch anything: its operators as a person reads them and its published
 * time. For a screen that follows a payout every few seconds, which must never be a reason to ask Switch again.
 */
function keptAbout(country: string): Readonly<{ operators: ReadonlyArray<{ code: string; name: string }>; settlement: string }> | null {
  const corridor = coverage?.rows.find((row) => row.country === country.toUpperCase());
  const kept = fields.get(country.toUpperCase());
  if (!corridor || !kept) return null;
  return { operators: kept.fields.networks.map((network) => ({ code: network.code, name: operatorInWords(network.name) })), settlement: corridor.settlement };
}

export type MobileOffer =
  | Readonly<{
      offered: true;
      country: string;
      currency: string;
      settlement: string;
      minimumUnits: string;
      maximumUnits: string;
      /** The smallest payout in the country's money, as a quote prices it: what the card and the field both say. */
      leastLocal: number;
      operators: ReadonlyArray<{ code: string; name: string }>;
      numberRule: string;
      nameRule: string;
      /** Switch's published rate from a dollar to the country's currency: what the field's bounds are said in, never a price. */
      rate: number;
    }>
  | Readonly<{ offered: false }>;

/**
 * What the way is in a country, or that it is not offered there: switched off, not covered, or Switch not answering.
 * A screen that is told "not offered" shows no card, which is what the README's second rule asks.
 */
export async function offerIn(country: string | null, deps: { reader?: SwitchReader; env?: Readonly<Record<string, string | undefined>>; now?: () => number } = {}): Promise<MobileOffer> {
  if (!mobileMoneyOn(deps.env) || !country || !/^[A-Za-z]{2}$/.test(country)) return { offered: false };
  const reader = deps.reader ?? liveSwitch;
  const now = (deps.now ?? Date.now)();
  try {
    const read = await corridors(reader, now);
    const corridor = read.rows.find((row) => row.country === country.toUpperCase());
    const rate = corridor ? read.rates.get(corridor.currency) : undefined;
    if (!corridor || !rate) return { offered: false };
    const fields = await fieldsOf(reader, corridor.country, now);
    return {
      offered: true,
      country: corridor.country,
      currency: corridor.currency,
      settlement: corridor.settlement,
      minimumUnits: corridor.minimumUnits.toString(),
      maximumUnits: corridor.maximumUnits.toString(),
      leastLocal: await leastLocalOf(reader, corridor, rate, now),
      operators: fields.networks.map((network) => ({ code: network.code, name: operatorInWords(network.name) })),
      numberRule: fields.numberRule,
      nameRule: fields.nameRule,
      rate,
    };
  } catch {
    return { offered: false };
  }
}

/**
 * The countries the way is offered in: where Switch has a corridor to mobile money and publishes a rate for its
 * currency, which is what `offerIn` asks before it offers the way there. Nothing while the way is switched off, so
 * the list of countries a person picks from never names one for a way that is not open. It throws when Switch does
 * not answer: whoever asks says it could not be read.
 */
export async function mobileMoneyCountries(deps: { reader?: SwitchReader; env?: Readonly<Record<string, string | undefined>>; now?: () => number } = {}): Promise<readonly string[] | null> {
  if (!mobileMoneyOn(deps.env)) return null;
  const read = await corridors(deps.reader ?? liveSwitch, (deps.now ?? Date.now)());
  return read.rows.filter((row) => Boolean(read.rates.get(row.currency))).map((row) => row.country.toLowerCase());
}

/** A refusal from Switch, said to the person: what happened and that nothing was taken. */
export function switchRefusal(error: unknown): GiftApiError {
  if (error instanceof GiftApiError) return error;
  if (error instanceof SwitchError) {
    switch (error.code) {
      case "NOT_CONFIGURED":
      case "NOT_ENABLED":
        return new GiftApiError("NOT_CONFIGURED", "Mobile money is not open here yet. Nothing was taken.", 503);
      case "RATE_LIMITED":
      case "UNAVAILABLE":
        return new GiftApiError("PAYOUT_SERVICE_SILENT", "The mobile money service did not answer just now. Nothing was taken: try again in a minute.", 503);
      case "REFUSED":
        return new GiftApiError("PAYOUT_REFUSED", "The mobile money service refused this payout. Nothing was taken.", 409);
      default:
        return new GiftApiError("PAYOUT_SERVICE_SILENT", "The mobile money service answered something unexpected. Nothing was taken.", 503);
    }
  }
  return new GiftApiError("PAYOUT_SERVICE_SILENT", "The mobile money service did not answer just now. Nothing was taken.", 503);
}

/** Refuses an amount outside what the country's corridor pays, in the dollars it publishes. */
export function assertWithinCorridor(units: bigint, offer: Extract<MobileOffer, { offered: true }>): void {
  const dollars = (value: string) => `$${(Number(BigInt(value)) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (units < BigInt(offer.minimumUnits)) throw new GiftApiError("BELOW_PAYOUT_MINIMUM", `Mobile money pays from ${dollars(offer.minimumUnits)} in one payout. Send at least that.`, 409);
  if (units > BigInt(offer.maximumUnits)) throw new GiftApiError("ABOVE_PAYOUT_MAXIMUM", `Mobile money pays at most ${dollars(offer.maximumUnits)} in one payout.`, 409);
}

/** Refuses one more payout of this many dollars past a ceiling, per payout or per account and day, by its sentence. */
export async function assertWithinCeilings(account: string, units: bigint, used: (account: string) => Promise<bigint> = usedToday): Promise<void> {
  const problem = ceilingProblem(units, await used(account));
  if (problem) throw new GiftApiError("OVER_CEILING", problem, 409);
}

/** The most this account can send to mobile money in one payout now, by the two ceilings. */
export async function mostForAccount(account: string, used: (account: string) => Promise<bigint> = usedToday): Promise<bigint> {
  return mostNow(await used(account));
}

/** Dollars this account already changed for a payout service and has not sent on, and what they give on a number. */
export type ChangedDollars = Readonly<{ exitTx: string; units: string; local: number; currency: string }>;

/**
 * Whether dollars already changed are waiting in the account, from which a payout can leave (the founder, 5 Oct 2026:
 * money is never changed twice). The payout is three steps, changing the money, opening the payout, sending the
 * dollars to it, and a cut after the first leaves the dollars in the account, changed. The screen used to know nothing
 * of them: a new press priced again and changed other dollars, and the first ones stayed where they were.
 *
 * Read from what was written down, never from a balance (src/open-withdrawal.ts): the last way out that landed for
 * this account into the dollar Switch takes, with nothing sent since. They count when the account still holds them,
 * when no payout was paid from them, and when the country's corridor and the ceilings take that much. Anything else is
 * not for this way out, and the form opens as usual.
 */
export async function changedAndWaiting(
  input: { account: string; offer: Extract<MobileOffer, { offered: true }> },
  deps: {
    reader?: SwitchReader;
    open?: (account: string) => Promise<OpenWithdrawal | null>;
    heldUsdc?: (account: Hex) => Promise<bigint>;
    client?: PublicClient;
    used?: (account: string) => Promise<bigint>;
    now?: () => number;
  } = {},
): Promise<ChangedDollars | null> {
  const open = await (deps.open ?? openWithdrawalOf)(input.account);
  if (!open?.txHash || getAddress(open.coin) !== getAddress(USDC_ADDRESS)) return null;
  const existing = await payoutOfExit(open.txHash);
  if (existing && (existing.account !== input.account.toLowerCase() || existing.depositSentAt)) return null;
  const units = await exitProceeds({ exitTx: open.txHash, account: input.account }, deps.client);
  if ((await (deps.heldUsdc ?? ((account: Hex) => heldOf(USDC_ADDRESS, account)))(getAddress(input.account))) < units) return null;
  if (units < BigInt(input.offer.minimumUnits) || units > BigInt(input.offer.maximumUnits)) return null;
  // A payout already opened for them and still open counts in the day already: only a new one is held to the ceilings.
  const stillOpen = existing !== null && existing.expiresAt.getTime() > (deps.now ?? Date.now)();
  if (!stillOpen && ceilingProblem(units, await (deps.used ?? usedToday)(input.account))) return null;
  const quote = await (deps.reader ?? liveSwitch).quote({ country: input.offer.country, units });
  if (quote.currency !== input.offer.currency || !(quote.local > 0)) throw new GiftApiError("PAYOUT_SERVICE_SILENT", MOBILE_REFUSALS.notNow, 503);
  return { exitTx: open.txHash, units: units.toString(), local: Math.floor(quote.local), currency: quote.currency };
}

/** What the exchange guarantees for so much of the balance, in the dollar Switch takes: the floor a signature would bind. */
async function exchangeFloor(amount: bigint): Promise<bigint> {
  const quote = await kuruQuote({ userAddress: exitRouterAddress(), tokenIn: AUSD_ADDRESS, tokenOut: USDC_ADDRESS, amount });
  return BigInt(quote.minOut);
}

export type PayableNow = Readonly<{
  /** The smallest and the largest amount this account can send now, in the country's money, the cost included. */
  leastLocal: number;
  mostLocal: number;
  /** What holds the largest down: what the account holds, a ceiling of ours, or the corridor's own largest payout. */
  by: "balance" | "ceiling" | "corridor";
  /** The most of the balance one payout may change now: what the account holds, or what the ceilings leave. */
  spendUnits: string;
  changed: ChangedDollars | null;
}>;

/**
 * What this account can really send to a number now, in the country's own money (the founder, 5 Oct 2026).
 *
 * The field used to open on the balance at Switch's published rate, without the cost of changing it: the amount it
 * proposed then asked the exchange for a little more than the account held ($15.09 for $15.00), the exchange refused,
 * and the screen said the amount could not be priced under a button that did nothing. The largest amount is now read
 * the way it will be paid: what the exchange guarantees for all the account may change, cut to the corridor's largest
 * payout, less the margin, and Switch's own quote for that many dollars, cut down to the franc.
 */
export async function payableNow(
  input: { account: string; country: string },
  deps: {
    reader?: SwitchReader;
    env?: Readonly<Record<string, string | undefined>>;
    now?: () => number;
    used?: (account: string) => Promise<bigint>;
    held?: (account: Hex) => Promise<bigint>;
    floor?: (amount: bigint) => Promise<bigint>;
    changed?: typeof changedAndWaiting;
  } = {},
): Promise<PayableNow> {
  const offer = await offerIn(input.country, deps);
  if (!offer.offered) throw new GiftApiError("NOT_OFFERED", "Mobile money is not offered for this country.", 409);
  try {
    const [held, ceiling, changed] = await Promise.all([
      (deps.held ?? ((account: Hex) => heldAusd(account)))(getAddress(input.account)),
      mostForAccount(input.account, deps.used),
      (deps.changed ?? changedAndWaiting)({ account: input.account, offer }, deps),
    ]);
    const spend = held < ceiling ? held : ceiling;
    let by: PayableNow["by"] = held <= ceiling ? "balance" : "ceiling";
    let mostLocal = 0;
    if (spend > 0n) {
      let payable = await (deps.floor ?? exchangeFloor)(spend);
      const largest = BigInt(offer.maximumUnits);
      if (payable > largest) {
        payable = largest;
        by = "corridor";
      }
      payable -= perMille(payable, BOUND_MARGIN_PER_MILLE);
      if (payable >= BigInt(offer.minimumUnits)) {
        const quote = await (deps.reader ?? liveSwitch).quote({ country: offer.country, units: payable });
        if (quote.currency !== offer.currency || !(quote.local > 0)) throw new GiftApiError("PAYOUT_SERVICE_SILENT", MOBILE_REFUSALS.notNow, 503);
        mostLocal = Math.floor(quote.local);
      } else {
        // Under the smallest payout nothing can be sent and nothing is quoted: what the balance is worth is said at
        // the published rate, for the sentence that stands in place of the form.
        mostLocal = Math.min(localOfUnits(payable, offer.rate, "down"), offer.leastLocal - 1);
      }
    }
    return { leastLocal: offer.leastLocal, mostLocal, by, spendUnits: spend.toString(), changed };
  } catch (error) {
    // The exchange, Switch or the journal did not answer: one sentence, in the person's own words, and nothing moved.
    if (error instanceof GiftApiError && error.code === "SIGN_IN_REQUIRED") throw error;
    throw new GiftApiError("PAYOUT_SERVICE_SILENT", MOBILE_REFUSALS.notNow, 503);
  }
}

export type LocalPrice = Readonly<{ local: number; currency: string; sourceUnits: string; at: string }>;

/**
 * What it takes to deliver so much local currency, the amount the person typed: Switch's quote with `exact_output`,
 * which counts the dollars that must be sent for it (the founder, 3 Oct 2026: the figure in francs is the quote's for
 * the amount typed). An answer that does not deliver what was asked is refused rather than shown.
 */
export async function priceInLocal(input: { account: string; country: string; local: number }, deps: { reader?: SwitchReader; env?: Readonly<Record<string, string | undefined>>; now?: () => number; used?: (account: string) => Promise<bigint> } = {}): Promise<LocalPrice> {
  const offer = await offerIn(input.country, deps);
  if (!offer.offered) throw new GiftApiError("NOT_OFFERED", "Mobile money is not offered for this country.", 409);
  if (!Number.isFinite(input.local) || input.local <= 0) throw new GiftApiError("INVALID_AMOUNT", "Enter an amount", 400);
  let quote: PayoutQuote;
  try {
    quote = await (deps.reader ?? liveSwitch).quote({ country: offer.country, local: input.local, currency: offer.currency });
  } catch (error) {
    throw switchRefusal(error);
  }
  if (quote.currency !== offer.currency || Math.abs(quote.local - input.local) > input.local * 0.01 || quote.sourceUnits <= 0n) {
    throw new GiftApiError("PAYOUT_SERVICE_SILENT", "The mobile money service priced something else. Nothing was taken.", 503);
  }
  assertWithinCorridor(quote.sourceUnits, offer);
  await assertWithinCeilings(input.account, quote.sourceUnits, deps.used);
  return { local: quote.local, currency: quote.currency, sourceUnits: quote.sourceUnits.toString(), at: quote.at };
}

/**
 * The dollars an exchange really made for this account: its `Exited` event, read from the transaction's receipt and
 * checked to be the way out's own, for this payer, into the dollar Switch takes. Never a figure the browser gives.
 */
export async function exitProceeds(input: { exitTx: Hex; account: string }, client: PublicClient = relayerClients().publicClient as PublicClient): Promise<bigint> {
  const receipt = await client.getTransactionReceipt({ hash: input.exitTx }).catch(() => null);
  if (!receipt || receipt.status !== "success") throw new GiftApiError("EXIT_NOT_FOUND", MOBILE_REFUSALS.stillChanging, 409);
  const router = exitRouterAddress();
  const exited = parseEventLogs({ abi: exitRouterAbi, logs: receipt.logs, eventName: "Exited" }).filter((log) => getAddress(log.address) === router);
  const mine = exited.find((log) => getAddress(String(log.args.payer)) === getAddress(input.account) && getAddress(String(log.args.tokenOut)) === getAddress(USDC.address));
  if (!mine) throw new GiftApiError("EXIT_NOT_YOURS", MOBILE_REFUSALS.notChangedHere, 403);
  return BigInt(mine.args.amountOut as bigint);
}

export type StartedPayout = Readonly<{ reference: string; depositAddress: string; depositUnits: string; expiresAt: string; local: number; currency: string }>;

/**
 * Opens a payout for the dollars an exchange made, or returns the one already opened for it. One exchange is paid out
 * once: a payout whose window closed with nothing sent is forgotten first, and only then is another opened.
 */
export async function startPayout(
  input: { account: string; exitTx: Hex; country: string; network: string; number: string; holderName: string; callbackUrl: string },
  deps: { reader?: SwitchReader; env?: Readonly<Record<string, string | undefined>>; client?: PublicClient; open?: typeof openPayout; now?: () => number; used?: (account: string) => Promise<bigint> } = {},
): Promise<StartedPayout> {
  const offer = await offerIn(input.country, { reader: deps.reader, env: deps.env, now: deps.now });
  if (!offer.offered) throw new GiftApiError("NOT_OFFERED", "Mobile money is not offered for this country. Nothing was taken.", 409);
  if (!offer.operators.some((operator) => operator.code === input.network)) throw new GiftApiError("UNKNOWN_OPERATOR", MOBILE_REFUSALS.chooseOperator, 400);
  if (!new RegExp(offer.numberRule).test(input.number)) throw new GiftApiError("INVALID_NUMBER", MOBILE_REFUSALS.numberNotTaken, 400);
  if (!new RegExp(offer.nameRule).test(input.holderName)) throw new GiftApiError("INVALID_NAME", MOBILE_REFUSALS.writeTheName, 400);

  const existing = await payoutOfExit(input.exitTx);
  if (existing) {
    if (existing.account !== input.account.toLowerCase()) throw new GiftApiError("EXIT_NOT_YOURS", MOBILE_REFUSALS.notChangedHere, 403);
    const now = (deps.now ?? Date.now)();
    if (existing.depositSentAt || existing.expiresAt.getTime() > now) return started(existing);
    await dropUnpaidPayout(existing.reference);
  }
  const units = await exitProceeds({ exitTx: input.exitTx, account: input.account }, deps.client);
  assertWithinCorridor(units, offer);
  // Checked again where the money is about to leave: a price moves nothing and counts for nothing.
  await assertWithinCeilings(input.account, units, deps.used);
  let opened;
  try {
    opened = await (deps.open ?? openPayout)({
      reference: randomUUID(),
      country: offer.country,
      units,
      beneficiary: { network: input.network, number: input.number, holderName: input.holderName },
      refundAddress: getAddress(input.account),
      callbackUrl: input.callbackUrl,
    });
  } catch (error) {
    throw switchRefusal(error);
  }
  // Exactly what this exchange made, and never more: a deposit Switch asks above it would take dollars the person did
  // not mean for this payout.
  if (opened.depositUnits > units) throw new GiftApiError("PAYOUT_REFUSED", MOBILE_REFUSALS.askedForMore, 409);
  const row = await recordPayout({
    reference: opened.reference,
    account: input.account,
    country: offer.country,
    network: input.network,
    numberEnd: numberEnd(input.number),
    exitTx: input.exitTx,
    units,
    depositAddress: getAddress(opened.depositAddress),
    depositUnits: opened.depositUnits,
    localAmount: opened.local,
    localCurrency: opened.currency,
    rate: opened.rate,
    status: opened.status,
    // Switch's own window for the deposit: 30 minutes from now (its initiate answer's note, read 2 Oct 2026).
    expiresAt: new Date((deps.now ?? Date.now)() + 30 * 60_000),
  });
  return started(row);
}

function started(row: MobilePayout): StartedPayout {
  return { reference: row.reference, depositAddress: row.depositAddress, depositUnits: row.depositUnits.toString(), expiresAt: row.expiresAt.toISOString(), local: row.localAmount, currency: row.localCurrency };
}

export type FollowedPayout = Readonly<{
  reference: string;
  phase: PayoutPhase;
  status: string;
  network: string;
  /** The operator as a person reads it, and the time Switch publishes for the country when it can be read: a payout found again is shown without the form that knew them. */
  operator: string;
  settlement: string | null;
  numberEnd: string;
  local: number;
  currency: string;
  units: string;
  country: string;
}>;

/** How often the status route asks Switch itself, at most, for a payout the webhook has not settled. */
export const ASK_SWITCH_EVERY_MS = 15_000;

/**
 * Where a payout stands, for its own account only. The webhook is the first word; when it is late, Switch's status
 * route is asked, at most every fifteen seconds, so a lost webhook never leaves a screen waiting for good.
 */
export async function followPayout(
  input: { reference: string; account: string },
  deps: { status?: typeof payoutStatus; now?: () => number; reader?: SwitchReader; env?: Readonly<Record<string, string | undefined>>; /** Read the country from Switch when nothing is kept of it: once, when a payout is found again, never on each look. */ readCountry?: boolean } = {},
): Promise<FollowedPayout> {
  let row = await loadPayout(input.reference);
  if (!row || row.account !== input.account.toLowerCase()) throw new GiftApiError("UNKNOWN_PAYOUT", "No such payout for this account.", 404);
  const now = (deps.now ?? Date.now)();
  const phaseNow = (payout: MobilePayout) => phaseOf(payout.status, { depositSent: payout.depositSentAt !== null, expired: payout.expiresAt.getTime() < now });
  if (!settled(phaseNow(row)) && (!row.checkedAt || now - row.checkedAt.getTime() >= ASK_SWITCH_EVERY_MS)) {
    try {
      const state = await (deps.status ?? payoutStatus)(row.reference);
      await notePayoutState(row.reference, state);
      row = (await loadPayout(input.reference)) ?? row;
    } catch {
      // Switch did not answer this time: the screen goes on with what was last known, and asks again later.
    }
  }
  // The operator's name and the country's time, as the form said them, from what is kept of the country. A look every
  // five seconds asks Switch nothing for them: without them the operator is said by its code and the time is left out.
  let about = keptAbout(row.country);
  if (!about && deps.readCountry) {
    const offer = await offerIn(row.country, { reader: deps.reader, env: deps.env, now: deps.now });
    about = offer.offered ? { operators: offer.operators, settlement: offer.settlement } : null;
  }
  const operator = about?.operators.find((one) => one.code === row.network)?.name ?? operatorInWords(row.network);
  return {
    reference: row.reference,
    phase: phaseNow(row),
    status: row.status,
    network: row.network,
    operator,
    settlement: about?.settlement ?? null,
    numberEnd: row.numberEnd,
    local: row.localAmount,
    currency: row.localCurrency,
    units: row.units.toString(),
    country: row.country,
  };
}

/**
 * The payout the way out owes this account a screen for (the founder, 5 Oct 2026): the last one money left for, until
 * it is finished and was seen finished. Its reference lived only in the screen that was open, so "Back", a closed tab
 * or a reload lost "On its way", "Arrived" and the failure alike. Read from the ledger for the account, never from
 * the browser.
 */
export async function latestPayout(account: string, deps: Parameters<typeof followPayout>[1] = {}): Promise<FollowedPayout | null> {
  const row = await lastUnseenPayout(account);
  return row ? followPayout({ reference: row.reference, account }, { ...deps, readCountry: true }) : null;
}

/** The account was shown the end of a payout: it is not shown again. Only a finished payout can be seen finished. */
export async function sawPayout(input: { reference: string; account: string }, deps: Parameters<typeof followPayout>[1] = {}): Promise<boolean> {
  const followed = await followPayout(input, deps);
  return settled(followed.phase) ? markPayoutSeen(input.reference, input.account) : false;
}
