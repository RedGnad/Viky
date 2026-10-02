import { randomUUID } from "node:crypto";
import { getAddress, parseEventLogs, type Hex, type PublicClient } from "viem";
import { USDC } from "./coins";
import { exitRouterAbi } from "./exit-router-abi";
import { exitRouterAddress } from "./exit-relay";
import { GiftApiError } from "./gift-api";
import { mobileMoneyOn, numberEnd, operatorInWords, phaseOf, settled, type PayoutPhase } from "./mobile-money";
import { dropUnpaidPayout, loadPayout, notePayoutState, payoutOfExit, recordPayout, type MobilePayout } from "./mobile-money-store";
import { relayerClients } from "./relayer";
import { mobileMoneyCoverage, openPayout, payoutFields, payoutStatus, quotePayout, SwitchError, type Corridor, type PayoutFields, type PayoutQuote } from "./switch";

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
let coverage: { at: number; rows: readonly Corridor[] } | undefined;
const fields = new Map<string, { at: number; fields: PayoutFields }>();

export type SwitchReader = Readonly<{
  coverage: () => Promise<readonly Corridor[]>;
  fields: (country: string) => Promise<PayoutFields>;
  quote: (input: { country: string; units: bigint }) => Promise<PayoutQuote>;
}>;

export const liveSwitch: SwitchReader = {
  coverage: () => mobileMoneyCoverage(),
  fields: (country) => payoutFields(country),
  quote: (input) => quotePayout(input),
};

/** Tests only: forget what was kept. */
export function forgetKeptCoverage(): void {
  coverage = undefined;
  fields.clear();
}

async function corridors(reader: SwitchReader, now: number): Promise<readonly Corridor[]> {
  if (coverage && now - coverage.at < KEPT_MS) return coverage.rows;
  const rows = await reader.coverage();
  coverage = { at: now, rows };
  return rows;
}

async function fieldsOf(reader: SwitchReader, country: string, now: number): Promise<PayoutFields> {
  const kept = fields.get(country);
  if (kept && now - kept.at < KEPT_MS) return kept.fields;
  const read = await reader.fields(country);
  fields.set(country, { at: now, fields: read });
  return read;
}

export type MobileOffer =
  | Readonly<{
      offered: true;
      country: string;
      currency: string;
      settlement: string;
      minimumUnits: string;
      maximumUnits: string;
      operators: ReadonlyArray<{ code: string; name: string }>;
      numberRule: string;
      nameRule: string;
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
    const corridor = (await corridors(reader, now)).find((row) => row.country === country.toUpperCase());
    if (!corridor) return { offered: false };
    const read = await fieldsOf(reader, corridor.country, now);
    return {
      offered: true,
      country: corridor.country,
      currency: corridor.currency,
      settlement: corridor.settlement,
      minimumUnits: corridor.minimumUnits.toString(),
      maximumUnits: corridor.maximumUnits.toString(),
      operators: read.networks.map((network) => ({ code: network.code, name: operatorInWords(network.name) })),
      numberRule: read.numberRule,
      nameRule: read.nameRule,
    };
  } catch {
    return { offered: false };
  }
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

/**
 * The dollars an exchange really made for this account: its `Exited` event, read from the transaction's receipt and
 * checked to be the way out's own, for this payer, into the dollar Switch takes. Never a figure the browser gives.
 */
export async function exitProceeds(input: { exitTx: Hex; account: string }, client: PublicClient = relayerClients().publicClient as PublicClient): Promise<bigint> {
  const receipt = await client.getTransactionReceipt({ hash: input.exitTx }).catch(() => null);
  if (!receipt || receipt.status !== "success") throw new GiftApiError("EXIT_NOT_FOUND", "That exchange is not on the network yet. Try again in a moment.", 409);
  const router = exitRouterAddress();
  const exited = parseEventLogs({ abi: exitRouterAbi, logs: receipt.logs, eventName: "Exited" }).filter((log) => getAddress(log.address) === router);
  const mine = exited.find((log) => getAddress(String(log.args.payer)) === getAddress(input.account) && getAddress(String(log.args.tokenOut)) === getAddress(USDC.address));
  if (!mine) throw new GiftApiError("EXIT_NOT_YOURS", "That exchange did not make dollars for this account.", 403);
  return BigInt(mine.args.amountOut as bigint);
}

export type StartedPayout = Readonly<{ reference: string; depositAddress: string; depositUnits: string; expiresAt: string; local: number; currency: string }>;

/**
 * Opens a payout for the dollars an exchange made, or returns the one already opened for it. One exchange is paid out
 * once: a payout whose window closed with nothing sent is forgotten first, and only then is another opened.
 */
export async function startPayout(
  input: { account: string; exitTx: Hex; country: string; network: string; number: string; holderName: string; callbackUrl: string },
  deps: { reader?: SwitchReader; env?: Readonly<Record<string, string | undefined>>; client?: PublicClient; open?: typeof openPayout; now?: () => number } = {},
): Promise<StartedPayout> {
  const offer = await offerIn(input.country, { reader: deps.reader, env: deps.env, now: deps.now });
  if (!offer.offered) throw new GiftApiError("NOT_OFFERED", "Mobile money is not offered for this country. Nothing was taken.", 409);
  if (!offer.operators.some((operator) => operator.code === input.network)) throw new GiftApiError("UNKNOWN_OPERATOR", "Choose your operator from the list.", 400);
  if (!new RegExp(offer.numberRule).test(input.number)) throw new GiftApiError("INVALID_NUMBER", "That number is not one this operator takes. Digits only, as your operator gives it.", 400);
  if (!new RegExp(offer.nameRule).test(input.holderName)) throw new GiftApiError("INVALID_NAME", "Write the name on the account, as your operator has it.", 400);

  const existing = await payoutOfExit(input.exitTx);
  if (existing) {
    if (existing.account !== input.account.toLowerCase()) throw new GiftApiError("EXIT_NOT_YOURS", "That exchange did not make dollars for this account.", 403);
    const now = (deps.now ?? Date.now)();
    if (existing.depositSentAt || existing.expiresAt.getTime() > now) return started(existing);
    await dropUnpaidPayout(existing.reference);
  }
  const units = await exitProceeds({ exitTx: input.exitTx, account: input.account }, deps.client);
  assertWithinCorridor(units, offer);
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
  if (opened.depositUnits > units) throw new GiftApiError("PAYOUT_REFUSED", "The mobile money service asked for more than the exchange made. Nothing was sent.", 409);
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

export type FollowedPayout = Readonly<{ reference: string; phase: PayoutPhase; status: string; network: string; numberEnd: string; local: number; currency: string; units: string; country: string }>;

/** How often the status route asks Switch itself, at most, for a payout the webhook has not settled. */
export const ASK_SWITCH_EVERY_MS = 15_000;

/**
 * Where a payout stands, for its own account only. The webhook is the first word; when it is late, Switch's status
 * route is asked, at most every fifteen seconds, so a lost webhook never leaves a screen waiting for good.
 */
export async function followPayout(
  input: { reference: string; account: string },
  deps: { status?: typeof payoutStatus; now?: () => number } = {},
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
  return { reference: row.reference, phase: phaseNow(row), status: row.status, network: row.network, numberEnd: row.numberEnd, local: row.localAmount, currency: row.localCurrency, units: row.units.toString(), country: row.country };
}
