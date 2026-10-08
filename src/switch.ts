import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Switch, the mobile money way out (the founder, 2 Oct 2026): a dollar on Monad in, a payout to a mobile money number
 * in one of the countries Switch covers. Server only: every call carries the service key, read from the environment
 * here and nowhere else, never printed, never sent to a browser.
 *
 * Read at the source on 2 Oct 2026 (docs.onswitch.xyz, `llms-full.txt` and `openapi.json`, 36 routes, Switch Labs):
 *
 *   GET  /coverage?direction=OFFRAMP      the countries paid, their channels, their published settlement time and
 *                                         their limits per payout ("$10", "$100,000", in US dollars);
 *   GET  /beneficiary/requirement         the fields a payout needs for a country and a channel, with their rules and,
 *                                         for mobile money, the operators (`mobile_network`) Switch pays there;
 *   POST /offramp/quote                   what a payout of this many dollars gives in the local currency, now: moves
 *                                         nothing;
 *   POST /offramp/initiate                opens a payout and answers a deposit address for one use, valid 30 minutes:
 *                                         the payout leaves when the dollars arrive there, and not before;
 *   GET  /payment/status?reference=       its state: AWAITING_DEPOSIT, PROCESSING, SCHEDULED, COMPLETED, FAILED,
 *                                         REVERSED or BLOCKED;
 *   the webhook                           a POST to `callback_url` on each change, signed: `x-switch-signature` is the
 *                                         HMAC-SHA256 hex digest of the raw body under the service key.
 *
 * Live on 2 Oct 2026 the key answered coverage, requirements and rates, and refused every quote with "Access key not
 * enabled for REMITTANCE": until Switch enables it, no payout can be priced, and the way is offered nowhere. From 23:23
 * UTC that day it answers them: in Senegal and in Ivory Coast alike, 589.21703 francs a dollar, 5 892.17 F for $10 and
 * 8 838.26 F for $15, 8 800 F for $14.935075, against 587.233 published by GET /rates in the same minute, and with no
 * `fee` in the answer, where the docs' example carries one. No payout has run yet.
 *
 * The way IN (the founder, 8 Oct 2026): a payer's mobile money in, a dollar on Monad out, on the payer's own account.
 * Read at the source that day (the same `openapi.json`):
 *
 *   GET  /coverage?direction=ONRAMP                 the countries collected from, by channel, with the same limits;
 *   GET  /institution?country=&channel=MOBILEMONEY  the operators Switch names in a country (ORANGE, WAVE, MTN...);
 *   GET  /rates?direction=ONRAMP                    its published rate for each currency, to a dollar;
 *   POST /onramp/quote                              what so much local money delivers in dollars, or, with
 *                                                   `exact_output`, the local money so many dollars cost: moves nothing;
 *   POST /onramp/initiate                           opens a collection from `payer.mobile_number` on
 *                                                   `payer.mobile_network`. Not called anywhere in this code yet.
 *
 * Live on 8 Oct 2026, 09:26 to 09:40 UTC, the key answered every one of those reads. Coverage: 18 countries with
 * mobile money (GH KE CD UG CI CM SN RW BJ ML TZ ZM SL MW LR GM EG BW), from $10 a payment ($1 in Ivory Coast) to
 * $100,000, "5-10 minutes". Quotes to `monad:usdc`: 617.393322 francs a dollar in Senegal and Ivory Coast (10 000 F
 * deliver 16.197130 dollars, and exactly 10 dollars cost 6 173.94 F), against 617.393939 published for the way in,
 * 587.3327 quoted the same minute for the way out, and 586.8811 at the fixed parity with the euro (ECB reference rate
 * of 7 Oct 2026, 1.1177): the way in costs a payer in CFA francs 5.2 % over parity. 131.575626 shillings in Kenya,
 * 628.526544 francs in Cameroon, 12.316584 cedis in Ghana. No `fee` in an answer; a quote holds about five minutes.
 * GET /beneficiary/requirement answers 404 for ONRAMP: the fields of a payer are published nowhere but in the API
 * description. What the payer then does on their phone is not documented at all, and no collection has been opened.
 */

export const SWITCH_API = "https://api.onswitch.xyz";
/** The dollar on Monad Switch takes, as its own asset list names it (GET /asset: `monad:usdc`, the same contract as ours). */
export const SWITCH_ASSET = "monad:usdc";
export const SWITCH_CHANNEL = "MOBILEMONEY";

export type SwitchErrorCode = "NOT_CONFIGURED" | "NOT_ENABLED" | "RATE_LIMITED" | "REFUSED" | "UNAVAILABLE" | "BAD_ANSWER";

export class SwitchError extends Error {
  constructor(
    readonly code: SwitchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SwitchError";
  }
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Whether the key is set where this runs: a boolean, never its length nor a part of it. */
export function switchConfigured(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return Boolean(env.SWITCH_SERVICE_KEY?.trim());
}

function keyOf(env: Readonly<Record<string, string | undefined>>): string {
  const key = env.SWITCH_SERVICE_KEY?.trim();
  if (!key) throw new SwitchError("NOT_CONFIGURED", "The mobile money service is not set up here");
  return key;
}

/** One call to Switch: its answer's `data`, or a typed refusal. Their message is kept for the logs, never shown as is. */
export async function switchCall<T>(path: string, input: { body?: unknown; fetchLike?: FetchLike; env?: Readonly<Record<string, string | undefined>> } = {}): Promise<T> {
  const env = input.env ?? process.env;
  const key = keyOf(env);
  let response: Response;
  try {
    response = await (input.fetchLike ?? (fetch as unknown as FetchLike))(`${SWITCH_API}${path}`, {
      method: input.body === undefined ? "GET" : "POST",
      headers: { "x-service-key": key, accept: "application/json", ...(input.body === undefined ? {} : { "content-type": "application/json" }) },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new SwitchError("UNAVAILABLE", "The mobile money service did not answer");
  }
  type Answer = { success?: boolean; message?: string; data?: unknown };
  let parsed: Answer | null;
  try {
    parsed = (await response.json()) as Answer;
  } catch {
    parsed = null;
  }
  if (response.status === 429) throw new SwitchError("RATE_LIMITED", "The mobile money service asked to wait");
  if (response.status >= 500) throw new SwitchError("UNAVAILABLE", `The mobile money service failed (${response.status})`);
  const said = typeof parsed?.message === "string" ? parsed.message.slice(0, 200) : "";
  // Measured on 2 Oct 2026: a key not yet opened to payouts answers 400 "Access key not enabled for REMITTANCE".
  if (/not enabled/i.test(said)) throw new SwitchError("NOT_ENABLED", `The mobile money service refused: ${said}`);
  if (!response.ok || parsed?.success !== true) throw new SwitchError("REFUSED", `The mobile money service refused (${response.status}): ${said}`);
  if (parsed.data === undefined || parsed.data === null) throw new SwitchError("BAD_ANSWER", "The mobile money service answered with nothing");
  return parsed.data as T;
}

const text = (value: unknown): string => {
  if (typeof value !== "string") throw new SwitchError("BAD_ANSWER", "The mobile money service answered something unexpected");
  return value;
};
const number = (value: unknown): number => {
  const figure = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(figure) || figure < 0) throw new SwitchError("BAD_ANSWER", "The mobile money service answered something unexpected");
  return figure;
};

/** "$10", "$100,000", "$0.5": a limit as Switch writes it, in dollar units of six decimals. */
export function dollarsOfLimit(limit: unknown): bigint {
  const written = text(limit).replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,6})?$/.test(written)) throw new SwitchError("BAD_ANSWER", "The mobile money service answered something unexpected");
  return unitsOf(Number(written));
}

/** A dollar amount Switch writes as a number, in units of six decimals: by its written digits, never by multiplying a float. */
export function unitsOf(amount: number): bigint {
  if (!Number.isFinite(amount) || amount < 0) throw new SwitchError("BAD_ANSWER", "The mobile money service answered something unexpected");
  const [whole, part = ""] = amount.toFixed(6).split(".");
  return BigInt(whole) * 1_000_000n + BigInt(part.padEnd(6, "0").slice(0, 6));
}

/** Units of six decimals as the number Switch takes. Exact: a dollar figure has no more than six decimals. */
export function amountOf(units: bigint): number {
  return Number(`${units / 1_000_000n}.${(units % 1_000_000n).toString().padStart(6, "0")}`);
}

export type Corridor = Readonly<{
  country: string;
  currency: string;
  /** Their own words for the time a mobile money payout takes, as published: "5-10 minutes". */
  settlement: string;
  minimumUnits: bigint;
  maximumUnits: bigint;
}>;

export type SwitchDirection = "OFFRAMP" | "ONRAMP";
type SwitchDeps = { fetchLike?: FetchLike; env?: Readonly<Record<string, string | undefined>> };

/** The countries Switch pays to mobile money, as GET /coverage?direction=OFFRAMP answers now: rows with that channel only. */
export async function mobileMoneyCoverage(deps: SwitchDeps = {}): Promise<readonly Corridor[]> {
  return coverageOf("OFFRAMP", deps);
}

/** The countries Switch collects mobile money in, as GET /coverage?direction=ONRAMP answers now: the same rows, the other way. */
export async function mobileMoneyInCoverage(deps: SwitchDeps = {}): Promise<readonly Corridor[]> {
  return coverageOf("ONRAMP", deps);
}

async function coverageOf(direction: SwitchDirection, deps: SwitchDeps): Promise<readonly Corridor[]> {
  const rows = await switchCall<unknown[]>(`/coverage?direction=${direction}`, deps);
  if (!Array.isArray(rows)) throw new SwitchError("BAD_ANSWER", "The mobile money service answered something unexpected");
  const out: Corridor[] = [];
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const channels = Array.isArray(row.channel) ? row.channel : [];
    const directions = Array.isArray(row.direction) ? row.direction : [];
    if (!channels.includes(SWITCH_CHANNEL) || !directions.includes(direction)) continue;
    const limits = (row.payout_limit as Record<string, Record<string, unknown>> | undefined)?.[SWITCH_CHANNEL];
    const settlement = (row.settlement_time as Record<string, unknown> | undefined)?.[SWITCH_CHANNEL];
    const currencies = Array.isArray(row.currency) ? row.currency : [];
    if (!limits || typeof settlement !== "string" || typeof currencies[0] !== "string") continue;
    out.push({
      country: text(row.country).toUpperCase(),
      currency: currencies[0],
      settlement,
      minimumUnits: dollarsOfLimit(limits.min),
      maximumUnits: dollarsOfLimit(limits.max),
    });
  }
  return out;
}

export type PayoutFields = Readonly<{
  /** The operators Switch pays in this country, by its own codes and names: ORANGE, WAVE, MTN... */
  networks: ReadonlyArray<{ code: string; name: string }>;
  /** The rules Switch gives for the number and the holder's name, kept as it gives them. */
  numberRule: string;
  nameRule: string;
}>;

/** What a mobile money payout needs in a country, as GET /beneficiary/requirement answers now. */
export async function payoutFields(country: string, deps: { fetchLike?: FetchLike; env?: Readonly<Record<string, string | undefined>> } = {}): Promise<PayoutFields> {
  const rows = await switchCall<unknown[]>(`/beneficiary/requirement?direction=OFFRAMP&country=${encodeURIComponent(country)}&channel=${SWITCH_CHANNEL}&type=INDIVIDUAL`, deps);
  if (!Array.isArray(rows)) throw new SwitchError("BAD_ANSWER", "The mobile money service answered something unexpected");
  const field = (path: string) => rows.find((row) => (row as { path?: unknown }).path === path) as { regex?: unknown; option?: unknown } | undefined;
  const network = field("mobile_network");
  const options = Array.isArray(network?.option) ? network.option : [];
  const networks = options.map((option) => ({ code: text((option as { code?: unknown }).code), name: text((option as { name?: unknown }).name) }));
  const numberRule = field("mobile_number")?.regex;
  const nameRule = field("holder_name")?.regex;
  if (networks.length === 0 || typeof numberRule !== "string" || typeof nameRule !== "string") throw new SwitchError("BAD_ANSWER", "The mobile money service answered something unexpected");
  return { networks, numberRule, nameRule };
}

export type PayoutQuote = Readonly<{
  /** The local amount the payout gives, and its currency. */
  local: number;
  currency: string;
  /** The dollars that must be sent for it, as Switch counts them. */
  sourceUnits: bigint;
  rate: number;
  /** What Switch keeps, in dollars, when its quote says. */
  feeUnits: bigint | null;
  /** When the quote was made and until when it holds, as Switch dates them. */
  at: string;
  expiry: string | null;
  settlement: string | null;
}>;

/**
 * What a payout gives now, in the country's currency. Moves nothing. Asked either for so many dollars sent, or, with
 * `local`, for so much local currency delivered: Switch's `exact_output`, which then counts the dollars that must be sent
 * for it (docs.onswitch.xyz, Get quote, read 2 Oct 2026).
 */
export async function quotePayout(
  input: Readonly<{ country: string; units: bigint } | { country: string; local: number; currency: string }>,
  deps: { fetchLike?: FetchLike; env?: Readonly<Record<string, string | undefined>>; now?: () => Date } = {},
): Promise<PayoutQuote> {
  const asked =
    "local" in input
      ? { amount: input.local, country: input.country, currency: input.currency, asset: SWITCH_ASSET, channel: SWITCH_CHANNEL, exact_output: true }
      : { amount: amountOf(input.units), country: input.country, asset: SWITCH_ASSET, channel: SWITCH_CHANNEL };
  const data = await switchCall<Record<string, unknown>>("/offramp/quote", { ...deps, body: asked });
  const destination = data.destination as Record<string, unknown> | undefined;
  const source = data.source as Record<string, unknown> | undefined;
  const fee = data.fee as Record<string, unknown> | undefined;
  return {
    local: number(destination?.amount),
    currency: text(destination?.currency),
    sourceUnits: unitsOf(number(source?.amount)),
    rate: number(data.rate),
    feeUnits: fee && typeof fee.total === "number" ? unitsOf(fee.total) : null,
    at: (deps.now ?? (() => new Date()))().toISOString(),
    expiry: typeof data.expiry === "string" ? data.expiry : null,
    settlement: typeof data.settlement === "string" ? data.settlement : null,
  };
}

/** Switch's published rate for each local currency, from a dollar, for payouts: GET /rates?direction=OFFRAMP. */
export async function payoutRates(deps: SwitchDeps = {}): Promise<ReadonlyMap<string, number>> {
  return ratesOf("OFFRAMP", deps);
}

/** Its published rate for the way in, to a dollar: GET /rates?direction=ONRAMP. Not the same figure: 617.39 against 587.22 francs on 8 Oct 2026. */
export async function payInRates(deps: SwitchDeps = {}): Promise<ReadonlyMap<string, number>> {
  return ratesOf("ONRAMP", deps);
}

async function ratesOf(direction: SwitchDirection, deps: SwitchDeps): Promise<ReadonlyMap<string, number>> {
  const rows = await switchCall<unknown[]>(`/rates?direction=${direction}`, deps);
  if (!Array.isArray(rows)) throw new SwitchError("BAD_ANSWER", "The mobile money service answered something unexpected");
  const rates = new Map<string, number>();
  for (const row of rows) {
    const { currency, rate } = row as { currency?: unknown; rate?: unknown };
    if (typeof currency === "string" && typeof rate === "number" && rate > 0) rates.set(currency, rate);
  }
  return rates;
}

export type Operator = Readonly<{ code: string; name: string }>;

/**
 * The operators Switch names for mobile money in a country, by its own codes: GET /institution. For the way in this is
 * the only place they are published, since GET /beneficiary/requirement has nothing for ONRAMP (404, 8 Oct 2026).
 */
export async function mobileMoneyOperators(country: string, deps: SwitchDeps = {}): Promise<readonly Operator[]> {
  const rows = await switchCall<unknown[]>(`/institution?country=${encodeURIComponent(country)}&channel=${SWITCH_CHANNEL}`, deps);
  if (!Array.isArray(rows)) throw new SwitchError("BAD_ANSWER", "The mobile money service answered something unexpected");
  return rows.map((row) => ({ code: text((row as { code?: unknown }).code), name: text((row as { name?: unknown }).name) }));
}

export type PayInQuote = Readonly<{
  /** What the payer pays, in their own money. */
  local: number;
  currency: string;
  /** The dollars it delivers on Monad, in units of six decimals. */
  units: bigint;
  rate: number;
  /** What Switch keeps, in the payer's money, when its quote says. */
  feeLocal: number | null;
  at: string;
  expiry: string | null;
  settlement: string | null;
}>;

/**
 * What a payment by mobile money delivers now. Moves nothing. Asked either for so much local money paid, or, with
 * `units`, for so many dollars delivered: Switch's `exact_output`, which then counts the local money they cost. The
 * answer must be in the currency asked and deliver the dollar on Monad, or it is not a quote for this way.
 */
export async function quotePayIn(
  input: Readonly<{ country: string; currency: string; local: number } | { country: string; currency: string; units: bigint }>,
  deps: SwitchDeps & { now?: () => Date } = {},
): Promise<PayInQuote> {
  const exact = "units" in input;
  const data = await switchCall<Record<string, unknown>>("/onramp/quote", {
    ...deps,
    body: { amount: exact ? amountOf(input.units) : input.local, country: input.country, currency: input.currency, asset: SWITCH_ASSET, channel: SWITCH_CHANNEL, exact_output: exact },
  });
  const source = data.source as Record<string, unknown> | undefined;
  const destination = data.destination as Record<string, unknown> | undefined;
  const fee = data.fee as Record<string, unknown> | undefined;
  if (text(source?.currency) !== input.currency) throw new SwitchError("BAD_ANSWER", "The mobile money service priced another currency");
  if (destination?.currency !== "USDC" || destination?.network !== "MONAD") throw new SwitchError("BAD_ANSWER", "The mobile money service priced another dollar");
  return {
    local: number(source?.amount),
    currency: input.currency,
    units: unitsOf(number(destination?.amount)),
    rate: number(data.rate),
    feeLocal: fee && typeof fee.total === "number" ? fee.total : null,
    at: (deps.now ?? (() => new Date()))().toISOString(),
    expiry: typeof data.expiry === "string" ? data.expiry : null,
    settlement: typeof data.settlement === "string" ? data.settlement : null,
  };
}

export type Beneficiary = Readonly<{ network: string; number: string; holderName: string }>;

export type OpenedPayout = Readonly<{
  reference: string;
  status: string;
  /** Where the dollars go, once, and exactly how many: the payout leaves when they arrive there. */
  depositAddress: string;
  depositUnits: bigint;
  local: number;
  currency: string;
  rate: number;
}>;

/**
 * Opens a payout. Nothing moves yet: Switch answers a deposit address for one use and 30 minutes, and the payout leaves
 * when the dollars arrive there. A payout that fails sends them back to `refundAddress`, the person's own account.
 */
export async function openPayout(
  input: { reference: string; country: string; units: bigint; beneficiary: Beneficiary; refundAddress: string; callbackUrl: string },
  deps: { fetchLike?: FetchLike; env?: Readonly<Record<string, string | undefined>> } = {},
): Promise<OpenedPayout> {
  const data = await switchCall<Record<string, unknown>>("/offramp/initiate", {
    ...deps,
    body: {
      amount: amountOf(input.units),
      country: input.country,
      asset: SWITCH_ASSET,
      channel: SWITCH_CHANNEL,
      beneficiary: { holder_type: "INDIVIDUAL", holder_name: input.beneficiary.holderName, mobile_network: input.beneficiary.network, mobile_number: input.beneficiary.number },
      reference: input.reference,
      reason: "GIFT_AND_DONATION",
      refund_address: input.refundAddress,
      callback_url: input.callbackUrl,
      exact_output: false,
    },
  });
  const deposit = data.deposit as Record<string, unknown> | undefined;
  const destination = data.destination as Record<string, unknown> | undefined;
  const address = text(deposit?.address);
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new SwitchError("BAD_ANSWER", "The mobile money service answered something unexpected");
  if (deposit?.asset !== SWITCH_ASSET) throw new SwitchError("BAD_ANSWER", "The mobile money service asked for another dollar");
  return {
    reference: text(data.reference),
    status: text(data.status),
    depositAddress: address,
    depositUnits: unitsOf(number(deposit?.amount)),
    local: number(destination?.amount),
    currency: text(destination?.currency),
    rate: number(data.rate),
  };
}

export type PayoutState = Readonly<{ status: string; local: number | null; currency: string | null; depositHash: string | null }>;

/** A payout's state as Switch answers it, or as its webhook carries it: the same `data` either way. */
export function payoutStateOf(data: unknown): PayoutState {
  const row = (data ?? {}) as Record<string, unknown>;
  const destination = row.destination as Record<string, unknown> | undefined;
  const meta = row.meta as Record<string, unknown> | undefined;
  return {
    status: text(row.status),
    local: typeof destination?.amount === "number" ? destination.amount : null,
    currency: typeof destination?.currency === "string" ? destination.currency : null,
    depositHash: typeof meta?.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(meta.hash) ? meta.hash : null,
  };
}

export async function payoutStatus(reference: string, deps: { fetchLike?: FetchLike; env?: Readonly<Record<string, string | undefined>> } = {}): Promise<PayoutState> {
  return payoutStateOf(await switchCall<unknown>(`/payment/status?reference=${encodeURIComponent(reference)}`, deps));
}

/** Whether a webhook's body was signed by Switch: HMAC-SHA256 of the raw body under the service key, compared in constant time. */
export function signedBySwitch(rawBody: string, signature: string | null, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (!signature || !switchConfigured(env)) return false;
  const expected = Buffer.from(createHmac("sha256", keyOf(env)).update(rawBody, "utf8").digest("hex"), "utf8");
  const given = Buffer.from(signature.trim(), "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
