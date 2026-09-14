import { PAYOUT_MINIMUM } from "./exit-plan";

/**
 * What a gift should be worth, and why the floor is not ours.
 *
 * Two different numbers get confused if they are not written down together. The funder cannot put in less
 * than the card rail's own smallest payment, so that is a hard floor on the first gift anybody makes. And the
 * recipient cannot turn earnings into money on their card below the payout rail's own smallest order, which
 * at the rate measured on 14 Sep is close to twenty one dollars (D60). Neither is a rule of Viky's; both
 * decide what a gift is worth making.
 *
 * Measured on 14 Sep 2026, end to end, the rail's own fee and the unspendable reserve both taken out:
 * 25 EUR becomes $28.51, 35 EUR becomes $40.01, 50 EUR becomes $57.26. Those are not proportional to each
 * other, and the reason is worth keeping in the model rather than smoothing away: the reserve is a fixed
 * cost, so it weighs four times as heavily on the smallest payment as on the largest.
 */

/** The smallest card payment the way in accepts (D20). Nothing smaller can start a gift at all. */
export const SMALLEST_CARD_PAYMENT_EUR = 25;
/** What the funder's screen offers before they choose, so an ordinary gift is one the recipient can cash. */
export const SUGGESTED_GIFT_EUR = 50;

/**
 * The three measurements the rest of this rests on, taken on 14 Sep 2026: what one euro buys of the coin
 * once the rail has taken its 3.8 %, what one of those coins is then worth as money a gift can hold, and how
 * many of them can never be spent because the chain holds them (D53, D56).
 */
const COIN_PER_EURO = 49.2338;
const DOLLARS_PER_COIN = 0.023372;
const UNSPENDABLE_COINS = 11;

/** What a card payment is worth inside Viky, at the rate measured. An estimate, and named as one. */
export function roughlyInDollars(euros: number): number {
  const coins = euros * COIN_PER_EURO - UNSPENDABLE_COINS;
  if (coins <= 0) return 0;
  return Math.round(coins * DOLLARS_PER_COIN * 100) / 100;
}

/** The payout rail's smallest order, in dollars, at the same measured rate. */
export function payoutFloorInDollars(): number {
  const coins = Number(PAYOUT_MINIMUM / 1_000_000_000_000n) / 1_000_000;
  return Math.round(coins * DOLLARS_PER_COIN * 100) / 100;
}

/**
 * Whether a gift of this many euros, earned this many days out of its length, leaves the recipient enough to
 * be paid out on its own. The honest answer for a small gift is no, and the screen says so rather than
 * letting them find out at the end. It is only ever "on its own": earnings stay in the recipient's account
 * across gifts, so a gift too small to cash today is waiting rather than lost.
 */
export function cashableOnItsOwn(euros: number, earnedDays: number, durationDays: number): boolean {
  if (durationDays <= 0 || earnedDays <= 0) return false;
  return (roughlyInDollars(euros) * earnedDays) / durationDays >= payoutFloorInDollars();
}
