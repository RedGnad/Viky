import { currencyOf, isCurrencyCode } from "./currencies";
import { RAMPNOW_ORIGIN, RAMPNOW_PUBLIC_KEY } from "./rampnow-frame";

/**
 * Rampnow's own quote for a card payment into USDC on Monad, in the currency a person reads Viky in (the founder,
 * 9 Oct 2026): its page is then opened in that currency, for the amount its quote gave, and the sheet says that amount
 * and no other. No list of currencies is written here: Rampnow's answer says, each time, whether a card pays in one.
 *
 * What is asked is the call its own page makes, read on that page on 9 Oct 2026 without paying:
 * `GET /api/ramp/v1/public/ramp_order/config`, with what is paid, how, what is bought, and `apiKey`. Without a key it
 * answers `internal_err`. The key is the partner's public one, the "App key" of its documentation
 * (docs.rampnow.io/api-reference/widget-mode, "prefixed with pk_live_"), the same the frame's address takes: the
 * founder's own, set by him as `RAMPNOW_API_KEY`. The key its public page sends for a visitor is never used: it is
 * not ours. Its documented quote, `POST /api/partner/v1/ext/ramp_order/quote`, is signed with a secret we do not hold.
 *
 * What the answer carries, as read that day on sixteen amounts in dollars and one in each of twenty currencies:
 *   - `data.initialQuote`: what was asked, `dstAmount` (the USDC that arrive, rounded down to the cent, "0" when the
 *     amount is not quoted), and `feeDetails`, a line for the platform and one for the network, each in the currency
 *     paid;
 *   - `data.assetConfigs["XXX:fiat"]`: whether the currency is `active`, how it is paid (`payinModes`), and how many
 *     of it a euro is (`exchangeRate`); `data.assetConfigs["USDC:monad"].exchangeRate`, the USDC a euro buys;
 *   - `data.paymentModeConfigs.card.minAmount`, its smallest card payment, in euros whatever is paid in ("5": a
 *     payment of 5.61 dollars was not quoted and one of 5.62 was, at 1.1233 dollars a euro).
 * The call takes what is paid and never what is to arrive (`dstAmount` in the address is ignored), so the amount is
 * found by asking: a few readings, each nearer, the last one being the quote the sheet says.
 *
 * A quote is used only when it is understood whole: a fee line of a kind not read here, in another currency, or
 * carrying a discount, and the quote is set aside. The page a person pays on is Rampnow's public one, and a figure
 * that page would not charge is never said.
 */

/** The partner's public key, or nothing: only a key that looks public is ever put in an address. */
export function rampnowKey(env: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  const key = env.RAMPNOW_API_KEY?.trim() ?? "";
  return RAMPNOW_PUBLIC_KEY.test(key) ? key : undefined;
}

/** Whether a quote can be asked at all on this deployment. */
export function rampnowQuotesOn(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return rampnowKey(env) !== undefined;
}

/** The address of one reading: this currency and this amount, by card, for USDC on Monad. */
export function rampnowQuoteAddress(ask: Readonly<{ currency: string; amount: number }>, key: string): string {
  const address = new URL(`${RAMPNOW_ORIGIN}/api/ramp/v1/public/ramp_order/config`);
  const set = (name: string, value: string) => address.searchParams.set(name, value);
  set("orderType", "buy");
  set("srcAmount", String(ask.amount));
  set("srcCurrency", ask.currency);
  set("srcChain", "fiat");
  set("dstCurrency", "USDC");
  set("dstChain", "monad");
  set("paymentMode", "card");
  set("apiKey", key);
  return address.toString();
}

/** What one answer says, for the currency and the amount it was asked. */
export type RampnowReading = Readonly<{
  /** Whether a card pays in this currency: its own entry is active and names the card, and the card is open. */
  taken: boolean;
  /** The USDC that arrive for the amount asked; zero when the amount is not quoted. */
  arrives: number;
  /** What Rampnow keeps of the amount, in the currency paid; nothing when a fee line is not understood. */
  fee: number | undefined;
  /** How many of the currency one USDC costs before any fee, by its own tables. */
  perUsdc: number;
  /** Its smallest card payment, in the currency, at its own rate. */
  smallest: number;
}>;

const positive = (value: unknown): number | undefined => {
  const read = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  return Number.isFinite(read) && read > 0 ? read : undefined;
};

/** The fee lines read here: the platform's and the network's. Any other kind is not understood. */
const FEE_LINES: readonly string[] = ["platform", "network"];

/**
 * One answer, read: nothing when it is not the answer to what was asked, or when its tables do not say what a
 * currency costs. A quote of zero is an answer: the amount is under its smallest payment, or the currency is not taken.
 */
export function readRampnowAnswer(body: unknown, ask: Readonly<{ currency: string; amount: number }>): RampnowReading | null {
  const answer = body as { code?: unknown; data?: Record<string, unknown> } | null;
  if (typeof answer !== "object" || answer === null || answer.code !== 0 || typeof answer.data !== "object" || answer.data === null) return null;
  const data = answer.data as {
    assetConfigs?: Record<string, { status?: unknown; payinModes?: unknown; exchangeRate?: unknown } | undefined>;
    paymentModeConfigs?: { card?: { status?: unknown; minAmount?: unknown } };
    initialQuote?: { srcCurrency?: unknown; srcAmount?: unknown; dstCurrency?: unknown; dstChain?: unknown; paymentMode?: unknown; dstAmount?: unknown; feeDetails?: unknown };
  };
  const fiat = data.assetConfigs?.[`${ask.currency}:fiat`];
  const card = data.paymentModeConfigs?.card;
  // A currency its tables do not carry, or carry without the card: an answer, and not a quote.
  const taken = fiat?.status === "active" && Array.isArray(fiat.payinModes) && fiat.payinModes.includes("card") && card?.status === "active";
  if (!taken) return { taken: false, arrives: 0, fee: undefined, perUsdc: 0, smallest: 0 };
  const perEuro = positive(fiat.exchangeRate);
  const usdcPerEuro = positive(data.assetConfigs?.["USDC:monad"]?.exchangeRate);
  const smallestEur = positive(card.minAmount);
  if (perEuro === undefined || usdcPerEuro === undefined || smallestEur === undefined) return null;
  const quote = data.initialQuote;
  // The quote must be the one asked for: this currency, this amount, a card, USDC on Monad.
  if (!quote || quote.srcCurrency !== ask.currency || quote.dstCurrency !== "USDC" || quote.dstChain !== "monad" || quote.paymentMode !== "card" || Number(quote.srcAmount) !== ask.amount) return null;
  const arrives = positive(quote.dstAmount) ?? 0;
  const lines = Array.isArray(quote.feeDetails) ? (quote.feeDetails as readonly Record<string, unknown>[]) : [];
  const understood = lines.length > 0 && lines.every((line) => typeof line.type === "string" && FEE_LINES.includes(line.type) && line.currency === ask.currency && Number.isFinite(Number(line.fee)) && Number(line.fee) >= 0 && !("discount" in line) && !("discountValue" in line));
  const fee = arrives > 0 && understood ? lines.reduce((sum, line) => sum + Number(line.fee), 0) : undefined;
  return { taken: true, arrives, fee, perUsdc: perEuro / usdcPerEuro, smallest: smallestEur * perEuro };
}

/** A card payment as Rampnow quotes it: what the card pays, what Rampnow keeps of it, and the USDC that arrive. */
export type CardQuote = Readonly<{ currency: string; amount: number; fee: number; arrives: number }>;

export type CardQuoteAnswer =
  | Readonly<{ state: "quoted"; quote: CardQuote }>
  /** A card pays in this currency, and what the gift needs is under its smallest payment, said in whole units. */
  | Readonly<{ state: "under"; currency: string; smallest: number }>
  /**
   * No quote to say: no key is set, a card does not pay in this currency, Rampnow did not answer in time, or its
   * answer is not understood. The sheet then asks the card in dollars, by the rule measured.
   */
  | Readonly<{ state: "none"; because: "off" | "not-taken" | "silent" | "not-understood" }>;

export type RampnowQuoteDeps = Readonly<{
  key: string | undefined;
  /** One reading of Rampnow: its answer as it came, or nothing when it did not come in time. */
  ask: (address: string) => Promise<unknown>;
}>;

/** How many readings one quote may take. Each is 300 KB of Rampnow's answer: three or four find the amount. */
export const MOST_READINGS = 5;

/** A cent of USDC: what arrives is said to the cent, so less than this is no difference. */
const USDC_CENT = 0.01;

/**
 * The quote for what a gift needs: the smallest amount found, in this currency, whose card payment brings at least
 * `usdc`. Found by asking, since the call takes what is paid: first the need itself, read as an amount, which brings
 * the tables; then the need at their rate; then nearer by what the last two readings say an extra unit brings.
 *
 * Whole units of the currency are the floor said (the founder's rule for dollars, 9 Oct 2026: five euros at the rate,
 * to the dollar above): a payment at that floor that brings more than the gift needs is "under", and no card is
 * offered for it, as under any card service's smallest payment.
 */
export async function rampnowQuote(need: Readonly<{ currency: string; usdc: number }>, deps: RampnowQuoteDeps): Promise<CardQuoteAnswer> {
  if (!deps.key) return { state: "none", because: "off" };
  if (!isCurrencyCode(need.currency) || !(need.usdc > 0)) return { state: "none", because: "not-understood" };
  const scale = 10 ** currencyOf(need.currency).decimals;
  /** Up to the currency's own smallest unit, and never down: it is what a card is asked for. */
  const up = (amount: number) => Math.ceil(Math.round(amount * scale * 1_000) / 1_000) / scale;
  const unit = 1 / scale;
  const points: { amount: number; arrives: number; fee: number }[] = [];
  let best: CardQuote | undefined;
  let shortAt = 0;
  let amount = up(need.usdc);
  for (let reading = 0; reading < MOST_READINGS; reading += 1) {
    const ask = { currency: need.currency, amount };
    const body = await deps.ask(rampnowQuoteAddress(ask, deps.key)).catch(() => undefined);
    if (body === undefined) return best ? { state: "quoted", quote: best } : { state: "none", because: "silent" };
    const read = readRampnowAnswer(body, ask);
    if (!read) return { state: "none", because: "not-understood" };
    if (!read.taken) return { state: "none", because: "not-taken" };
    const floor = Math.ceil(read.smallest - 1e-9);
    if (read.arrives > 0 && read.fee === undefined) return { state: "none", because: "not-understood" };
    if (read.arrives > 0 && read.fee !== undefined) points.push({ amount, arrives: read.arrives, fee: read.fee });
    // What an extra unit of the currency brings: from the last two readings when there are two, else from the tables.
    const [before, last] = points.slice(-2);
    const perUsdc = before && last && last.amount !== before.amount && last.arrives > before.arrives ? (last.amount - before.amount) / (last.arrives - before.arrives) : read.perUsdc;
    let next: number;
    if (read.arrives >= need.usdc && read.fee !== undefined) {
      // At its floor and still more than the gift needs: the gift is under its smallest payment.
      if (amount <= floor) return read.arrives - need.usdc >= USDC_CENT ? { state: "under", currency: need.currency, smallest: floor } : { state: "quoted", quote: { currency: need.currency, amount, fee: read.fee, arrives: read.arrives } };
      if (!best || amount < best.amount) best = { currency: need.currency, amount, fee: read.fee, arrives: read.arrives };
      const over = (read.arrives - need.usdc) * perUsdc;
      // Near enough: a fifth of one per cent of the payment, or two of its smallest units. What is over stays in the account.
      if (over <= Math.max(2 * unit, amount * 0.002)) return { state: "quoted", quote: best };
      next = Math.max(floor, shortAt + unit, up(amount - over));
      if (next >= amount) return { state: "quoted", quote: best };
    } else {
      // Not quoted, or short: from its floor at least, and by what is missing, a unit more so a cent rounded down is covered.
      shortAt = Math.max(shortAt, amount);
      next = read.arrives > 0 ? up(amount + (need.usdc - read.arrives) * perUsdc + unit) : Math.max(floor, up(need.usdc * read.perUsdc));
      // The same amount twice says nothing new: its floor is not quoted, which is not an answer read here.
      if (next <= amount) return { state: "none", because: "not-understood" };
      if (best && next >= best.amount) return { state: "quoted", quote: best };
    }
    amount = next;
  }
  return best ? { state: "quoted", quote: best } : { state: "none", because: "not-understood" };
}

/** The most USDC a quote is asked for: Rampnow's own ceiling for a card is 10,000 euros, and a gift is far under it. */
export const MOST_USDC_UNITS = 10_000_000_000n;

/**
 * What the route is asked, read from its address: a currency by its three letters and the USDC needed, in its
 * millionths as an account counts them, said to Rampnow to the cent above. Nothing when either is not what it says.
 */
export function cardQuoteAsk(params: URLSearchParams): Readonly<{ currency: string; usdc: number }> | null {
  const currency = params.get("currency") ?? "";
  const units = params.get("units") ?? "";
  if (!isCurrencyCode(currency) || !/^[1-9]\d{0,11}$/.test(units) || BigInt(units) > MOST_USDC_UNITS) return null;
  return { currency, usdc: Number((BigInt(units) + 9_999n) / 10_000n) / 100 };
}

/** How long one reading may take, and how long a whole quote may: the sheet waits three seconds and no more. */
export const READING_TIMEOUT_MS = 2_000;
export const QUOTE_TIMEOUT_MS = 2_800;

/**
 * How long a quote is said again without asking Rampnow (the founder, 9 Oct 2026: a few seconds, so the same need is
 * not asked twice in a row): twenty seconds, in which its rate does not move a cent on a gift. The screens wait for
 * the amount to stop changing before they ask at all (src/client/card-ask.ts).
 */
export const QUOTE_KEPT_MS = 20_000;

const kept = new Map<string, Readonly<{ at: number; answer: Promise<CardQuoteAnswer> }>>();

/** One reading over the network: Rampnow's answer, or nothing when it is late or is not an answer. */
async function askRampnow(address: string): Promise<unknown> {
  const response = await fetch(address, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(READING_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Rampnow answered ${response.status}`);
  return response.json();
}

/**
 * The quote the route answers with: asked once for the same need within twenty seconds, and cut when Rampnow is slow, in
 * which case nothing is kept and the next press asks again. A need is its currency and its USDC to the cent.
 */
export function quoteForUsdc(need: Readonly<{ currency: string; usdc: number }>, deps: RampnowQuoteDeps = { key: rampnowKey(), ask: askRampnow }, now: number = Date.now()): Promise<CardQuoteAnswer> {
  const name = `${need.currency}:${need.usdc.toFixed(2)}`;
  const held = kept.get(name);
  if (held && now - held.at < QUOTE_KEPT_MS) return held.answer;
  const late = new Promise<CardQuoteAnswer>((resolve) => setTimeout(() => resolve({ state: "none", because: "silent" }), QUOTE_TIMEOUT_MS));
  const answer = Promise.race([rampnowQuote(need, deps), late]).then((said) => {
    // Only a quote is worth saying again: a silence is asked again at the next press.
    if (said.state === "none" && said.because !== "off" && said.because !== "not-taken") kept.delete(name);
    return said;
  });
  if (deps.key) kept.set(name, { at: now, answer });
  if (kept.size > 500) for (const [key, value] of kept) if (now - value.at >= QUOTE_KEPT_MS) kept.delete(key);
  return answer;
}

/** Tests only: nothing kept from one case to the next. */
export function forgetQuotes(): void {
  kept.clear();
}
