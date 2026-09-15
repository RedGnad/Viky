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

/** The smallest card payment the way in accepts (D20). Nothing smaller can start a gift at all. */
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
 * How many whole euros a funder must pay on the card rail to cover what their account is short of (D72).
 *
 * The defect it answers: the screen suggested $50, the funder bought the rail's smallest 25 EUR, received about
 * $28.50, and the page went on waiting for a gift that could not be made, because nothing had said how much to buy.
 * It inverts `roughlyInDollars` with a tenth added for the rate, and never goes below the smallest payment the rail
 * would take.
 */
export function eurosToBuy(shortfallUnits: bigint): number {
  if (shortfallUnits <= 0n) return 0;
  const dollars = Number(shortfallUnits) / 1_000_000;
  const coins = dollars / DOLLARS_PER_COIN + UNSPENDABLE_COINS;
  return Math.max(SMALLEST_CARD_PAYMENT_EUR, Math.ceil((coins / COIN_PER_EURO) * RATE_MARGIN));
}
