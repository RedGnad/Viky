import type { RailReach } from "./rail-country";
import type { PublishedFee, WayIn } from "./rails";

/**
 * What a gift should be worth, and what a funder must pay for it.
 *
 * One floor is not ours: the funder cannot pay less than the card rail's smallest payment. There used to be a
 * second, the smallest payout the rail would take to a card, and the suggested amount was built on it. The rail
 * pays out to no card in France or anywhere else in the EEA (D72), so that floor decides nothing any more and is
 * gone from here.
 *
 * Measured on 14 Sep 2026, end to end, the rail's own fee and the unspendable reserve both taken out:
 * 25 EUR becomes $28.51, 35 EUR becomes $40.01, 50 EUR becomes $57.26. Those are not proportional to each
 * other, and the reason is worth keeping in the model rather than smoothing away: the reserve is a fixed
 * cost, so it weighs four times as heavily on the smallest payment as on the largest.
 */

/** The smallest card payment the rail that sells the chain's coin accepts (D20). */
export const SMALLEST_CARD_PAYMENT_EUR = 25;
/**
 * What the funder's screen offers before they choose: the round dollar amount one smallest card payment covers, so
 * an ordinary first gift takes one payment rather than two (D72).
 */
export const SUGGESTED_GIFT_DOLLARS = 25;

/**
 * The three measurements the rest of this rests on, taken on 14 Sep 2026: what one euro buys of the coin
 * once the rail has taken its 3.8 %, what one of those coins is then worth as money a gift can hold, and how
 * many of them can never be spent because the chain holds them (D53, D56).
 */
const COIN_PER_EURO = 49.2338;
const DOLLARS_PER_COIN = 0.023372;
const UNSPENDABLE_COINS = 11;

/**
 * How far the rate may move against a funder before what they were told to buy falls short. The rates above are a
 * day's measurement and the coin moves daily; a margin costs the funder nothing, because whatever is left over stays
 * in their own account for the next gift.
 */
const RATE_MARGIN = 1.1;

/** What a card payment is worth inside Viky, at the rate measured. An estimate, and named as one. */
export function roughlyInDollars(euros: number): number {
  const coins = euros * COIN_PER_EURO - UNSPENDABLE_COINS;
  if (coins <= 0) return 0;
  return Math.round(coins * DOLLARS_PER_COIN * 100) / 100;
}

/**
 * The same question for a rail that sells what a gift already holds (D101): no coin to swap, so no reserve is left
 * behind and nothing is lost to a second price. What the person pays, less what that rail keeps, becomes dollars at
 * the day's euro rate. Their fee is the larger of their share and their minimum, exactly as the way out's is.
 */
export function giftCoinDollars(euros: number, way: WayIn, usdPerEur: number): number {
  const left = euros - serviceChargeEur(euros, way.fee);
  if (left <= 0 || !(usdPerEur > 0)) return 0;
  return Math.round(left * usdPerEur * 100) / 100;
}

/**
 * What a service keeps of a card payment, in its own currency, from the figures it publishes: the larger of its share
 * and its minimum (`PublishedFee`). This is the figure the line "What the card service charges" prints (D239), never a
 * difference between two measurements: the sheet used to print what the euros were worth at the day's rate less what
 * the chain-coin measurement of 14 Sep 2026 said would arrive, and that difference is the noise between two days'
 * prices, negative as often as not, which `Math.max(0, ...)` turned into "about $0.00" on a rail that keeps 3.8 %.
 */
export function serviceChargeEur(euros: number, fee: PublishedFee): number {
  if (!(euros > 0)) return 0;
  return Math.max((euros * fee.percent) / 100, fee.minimum);
}

/** The same figure in dollars at the day's rate, for the line on the sheet, and nothing without a rate. */
export function serviceChargeDollars(euros: number, way: WayIn, usdPerEur: number | undefined): number | undefined {
  if (usdPerEur === undefined || !(usdPerEur > 0)) return undefined;
  return Math.round(serviceChargeEur(euros, way.fee) * usdPerEur * 100) / 100;
}

/**
 * What a card that buys the chain's coin asks beyond what the gift needs and its own charge, in euros (the founder,
 * 29 Sep 2026): the tenth added for the coin's price (`RATE_MARGIN`), the coin that stays in the account
 * (`UNSPENDABLE_COINS`) and the whole euro, less what the measured rate differs from the day's. Real money paid; what is
 * not used stays in the account. Nothing for a card that sells what a gift holds, whose euros are the day's rate.
 */
export function chainMarginEur(euros: number, shortfallUnits: bigint, way: WayIn, usdPerEur: number | undefined): number {
  if (way.arrives !== "chain" || !(usdPerEur !== undefined && usdPerEur > 0) || !(euros > 0)) return 0;
  return euros - Number(shortfallUnits) / 1_000_000 / usdPerEur - serviceChargeEur(euros, way.fee);
}

/**
 * True when what the line prints is the service's published ceiling rather than its rate: a share published as "up
 * to", and larger than the minimum at this amount. The line then says "up to" rather than "about".
 */
export function serviceChargeIsCeiling(euros: number, fee: PublishedFee): boolean {
  return fee.upTo && (euros * fee.percent) / 100 > fee.minimum;
}

/**
 * What a card payment is worth inside Viky on either rail. The rate matters only to the one that sells what a gift
 * holds; the other's figures are the measurement of 14 Sep 2026 and need none.
 */
export function arrivesInDollars(euros: number, way: WayIn, usdPerEur: number | undefined): number | undefined {
  if (way.arrives === "chain") return roughlyInDollars(euros);
  return usdPerEur === undefined ? undefined : giftCoinDollars(euros, way, usdPerEur);
}

/**
 * How many whole euros a funder must pay on the card rail to cover what their account is short of (D72).
 *
 * The defect it answers: the screen suggested $50, the funder bought the rail's smallest 25 EUR, received about
 * $28.50, and the page went on waiting for a gift that could not be made, because nothing had said how much to buy.
 * It inverts `roughlyInDollars` with a tenth added for the rate, and never goes below the smallest payment the rail
 * would take.
 */
export function eurosToBuy(shortfallUnits: bigint): number {
  if (shortfallUnits <= 0n) return 0;
  return Math.max(SMALLEST_CARD_PAYMENT_EUR, eurosToCover(shortfallUnits));
}

/** The same figure before that rail's floor: what the gift needs of it, which decides whether it is offered (D125). */
export function eurosToCover(shortfallUnits: bigint): number {
  if (shortfallUnits <= 0n) return 0;
  const dollars = Number(shortfallUnits) / 1_000_000;
  const coins = dollars / DOLLARS_PER_COIN + UNSPENDABLE_COINS;
  return Math.ceil((coins / COIN_PER_EURO) * RATE_MARGIN);
}

/**
 * How many whole euros a way in needs for this shortfall, before its floor: what the person is asking of it (D125).
 *
 * The rail that sells the chain's coin keeps the model above: its coin moves daily, and the tenth added for the rate
 * is what stops a payment falling short. The rail that sells what a gift holds needs no such margin, because what it
 * sells does not move against the dollar: the euros are the dollars at the day's rate, plus that rail's own fee,
 * which is the larger of their share and their minimum, rounded up to the whole euro.
 */
export function eurosNeededOn(shortfallUnits: bigint, way: WayIn, usdPerEur: number | undefined): number | undefined {
  if (shortfallUnits <= 0n) return 0;
  if (way.arrives === "chain") return eurosToCover(shortfallUnits);
  if (!(usdPerEur !== undefined && usdPerEur > 0)) return undefined;
  const dollars = Number(shortfallUnits) / 1_000_000;
  const euros = dollars / usdPerEur;
  // Their fee both ways round: the share is taken out of what is paid, so the amount grows by 1/(1 - share).
  const withShare = way.fee.percent > 0 ? euros / (1 - way.fee.percent / 100) : euros;
  const withMinimum = euros + way.fee.minimum;
  return Math.ceil(Math.max(withShare, withMinimum));
}

/**
 * How many whole euros to pay on the way in the funder chose (D101): what it needs, and never under their floor.
 * Whatever a payment leaves over stays in the person's own account for the next gift.
 */
export function eurosToBuyOn(shortfallUnits: bigint, way: WayIn, usdPerEur: number | undefined): number | undefined {
  const needed = eurosNeededOn(shortfallUnits, way, usdPerEur);
  if (needed === undefined) return undefined;
  return needed === 0 ? 0 : Math.max(way.smallestEur, needed);
}

/** Why a way in refused this gift: its own answer about the country, its published floor, or its own asset list. */
export type WayInRefusal = "country" | "floor" | "paused";

/** The one way in the sheet offers: what it costs for this gift, whether that is only its floor, and whose place it took. */
export type WayInOffer = Readonly<{
  way: WayIn;
  /** The whole euros to pay on it, or nothing when no rate was read and this rail's figure needs one. */
  euros: number | undefined;
  /** True when the gift needs less than this rail's floor and the floor is what is paid, the rest staying yours. */
  atFloor: boolean;
  /** The way the register puts first and why it refused, when this is the next one. Absent while the first stands. */
  insteadOf?: Readonly<{ way: WayIn; because: WayInRefusal }>;
}>;

/** What stops a way in from taking this gift, in the order a person would meet it, or nothing when it takes it. */
function refusalOf(way: WayIn, needed: number | undefined, reach: Readonly<Record<string, RailReach>>): WayInRefusal | undefined {
  if (reach[way.name] === "does-not") return "country";
  if (reach[way.name] === "paused") return "paused";
  if (needed !== undefined && needed !== 0 && needed < way.smallestEur) return "floor";
  return undefined;
}

/**
 * The one way in offered for this gift (D239, the founder's decision of 25 Sep 2026).
 *
 * The register's first way stands in front of the action unless it refuses this person: its own answer says it does
 * not serve their country, its own asset list says it is not selling what a gift holds just now, or its published
 * floor is above what the gift needs. Then the next way that does not refuse takes its place, and the offer carries
 * whose place it took and why, so the sheet can say so in our words. A silence ("unknown") is not a refusal.
 *
 * When every way refuses on its floor, the gift's own minimum does not move (D125): of the ways a country or a pause
 * has not shut, the one with the lowest floor is paid at its floor, and what is left over stays in the account. When
 * a country has shut every way, the first stands with no sentence: a country is a guess, and a guess never leaves the
 * sheet with nothing to pay on; the rail's own identity check decides.
 */
export function wayInFor(
  shortfallUnits: bigint,
  ways: readonly [WayIn, ...WayIn[]],
  usdPerEur: number | undefined,
  reach: Readonly<Record<string, RailReach>>,
): WayInOffer {
  const priced = ways.map((way) => ({ way, needed: eurosNeededOn(shortfallUnits, way, usdPerEur), because: undefined as WayInRefusal | undefined }));
  for (const entry of priced) entry.because = refusalOf(entry.way, entry.needed, reach);
  const first = priced[0];
  if (first.because === undefined) return { way: first.way, euros: first.needed, atFloor: false };
  const insteadOf = { way: first.way, because: first.because };
  const next = priced.slice(1).find((entry) => entry.because === undefined);
  if (next) return { way: next.way, euros: next.needed, atFloor: false, insteadOf };
  const lowest = priced.filter((entry) => entry.because === "floor").sort((left, right) => left.way.smallestEur - right.way.smallestEur)[0];
  if (!lowest) return { way: first.way, euros: first.needed, atFloor: false };
  return { way: lowest.way, euros: lowest.way.smallestEur, atFloor: true, ...(lowest.way === first.way ? {} : { insteadOf }) };
}
