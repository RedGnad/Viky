import type { RailReach } from "./rail-country";
import type { WayIn } from "./rails";

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
  const fee = Math.max((euros * way.fee.percent) / 100, way.fee.minimum);
  const left = euros - fee;
  if (left <= 0 || !(usdPerEur > 0)) return 0;
  return Math.round(left * usdPerEur * 100) / 100;
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

/** One way in as the sheet may offer it: what it costs for this gift, and whether that is only its floor. */
export type WayInOffer = Readonly<{
  way: WayIn;
  /** The whole euros to pay on it, or nothing when no rate was read and this rail's figure needs one. */
  euros: number | undefined;
  /** True when the gift needs less than this rail's floor and the floor is what is paid, the rest staying yours. */
  atFloor: boolean;
}>;

/**
 * Which ways in a gift may be paid on, and in what order (D125).
 *
 * A way whose published floor is above what this gift needs is not offered for this gift: that is not a guess about
 * the person, it is that service's own figure, and at 6 EUR the rail with a 2.49 EUR minimum fee would keep 41 % of
 * the payment. Between the ways left, the one that asks the fewest euros for the same gift leaves the most in the
 * account, and it goes first. A country never hides a way (D96): it may only send one that says it does not serve
 * there to the back. And when no way's floor is met at all, the gift's own minimum does not move: the way with the
 * lowest floor is offered at its floor, and what the payment leaves over stays in the person's account.
 */
export function waysInFor(
  shortfallUnits: bigint,
  ways: readonly WayIn[],
  usdPerEur: number | undefined,
  reach: Readonly<Record<string, RailReach>>,
): readonly WayInOffer[] {
  const rank = (way: WayIn) => (reach[way.name] === "does-not" ? 1 : 0);
  const priced = ways.map((way) => ({ way, needed: eurosNeededOn(shortfallUnits, way, usdPerEur) }));
  let offers: WayInOffer[] = priced
    .filter(({ way, needed }) => needed === undefined || needed === 0 || needed >= way.smallestEur)
    .map(({ way, needed }) => ({ way, euros: needed, atFloor: false }));
  if (offers.length === 0) {
    const lowest = [...ways].sort((left, right) => left.smallestEur - right.smallestEur)[0];
    if (!lowest) return [];
    offers = [{ way: lowest, euros: lowest.smallestEur, atFloor: true }];
  }
  const cost = (offer: WayInOffer) => offer.euros ?? Number.POSITIVE_INFINITY;
  return offers.sort((left, right) => rank(left.way) - rank(right.way) || cost(left) - cost(right));
}
