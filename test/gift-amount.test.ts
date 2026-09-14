import { strict as assert } from "node:assert";
import test from "node:test";
import {
  cashableOnItsOwn,
  payoutFloorInDollars,
  payoutFloorInWords,
  roughlyInDollars,
  SMALLEST_CARD_PAYMENT_EUR,
  SUGGESTED_GIFT_EUR,
} from "../src/gift-amount.js";
import { RAIL_CLOSED_IN, WAY_IN, WAY_OUT } from "../src/rails.js";

/**
 * These are the numbers the funder's screen will rest on, and every one of them is a measurement rather than
 * a preference. If the rate moves enough to break one of these, the screen is lying and this must say so.
 */

test("what a card payment becomes inside Viky matches what was measured on 14 Sep", () => {
  // Measured: $28.513328, $40.010471, $57.257001. Within a cent of each, and never above.
  assert.equal(roughlyInDollars(25), 28.51);
  assert.equal(roughlyInDollars(35), 40.02);
  assert.equal(roughlyInDollars(50), 57.28);
  // The reserve is paid once whatever the size, so one payment of fifty keeps more than two of twenty five.
  // If this ever reads as exactly proportional, somebody has smoothed the reserve away and the smallest
  // gift is being oversold by about a quarter of a dollar.
  assert.ok(roughlyInDollars(50) > roughlyInDollars(25) * 2);
  assert.equal(roughlyInDollars(0.1), 0, "a payment too small to clear the reserve is worth nothing");
});

/**
 * The floor is fixed in the rail's own coin, never in dollars, so its dollar value moves with the rate every
 * day. That is why a person is told "about $21" and never a figure to the cent: a cent-exact promise could be
 * broken by the rate before they finished reading it. This pins the arithmetic and the hedged words apart.
 */
test("the payout floor is about twenty one dollars, and is only ever said as about", () => {
  const floor = payoutFloorInDollars();
  assert.ok(floor > 20 && floor < 21.5, `floor was ${floor}`);
  assert.equal(payoutFloorInWords(), "about $21");
  // The cent-exact figure is ours to compute with and never a person's to read.
  assert.doesNotMatch(payoutFloorInWords(), /\d\.\d/, "no screen may carry cents on a floor that moves daily");
});

/** This is the whole reason the suggested amount is what it is. */
test("fifty euros earned five days of seven can be cashed out, twenty five cannot", () => {
  assert.equal(cashableOnItsOwn(SUGGESTED_GIFT_EUR, 5, 7), true);
  assert.equal(cashableOnItsOwn(SMALLEST_CARD_PAYMENT_EUR, 5, 7), false);
  // And a finished gift at the smallest card payment only just clears it, which is why it is not the default.
  assert.equal(cashableOnItsOwn(SMALLEST_CARD_PAYMENT_EUR, 7, 7), true);
});

test("nothing is cashable out of nothing", () => {
  assert.equal(cashableOnItsOwn(50, 0, 7), false);
  assert.equal(cashableOnItsOwn(50, 5, 0), false);
});

test("the smallest gift is the rail's floor, and the suggestion is twice it", () => {
  assert.equal(SMALLEST_CARD_PAYMENT_EUR, 25);
  assert.equal(SUGGESTED_GIFT_EUR, 50);
  assert.match(WAY_IN.smallest, /25/);
});

/**
 * A recipient in one of these countries can be given a gift, can earn it, and can never turn it into money.
 * The list decides who the pilot's cross-border gifts can go to, so it is held here rather than remembered.
 */
test("the countries the rails will not serve are the ones their own page lists", () => {
  for (const country of ["Morocco", "Tunisia", "Algeria", "Mali", "Hungary", "Iceland"]) {
    assert.ok(RAIL_CLOSED_IN.includes(country), `${country} must be listed as closed`);
  }
  for (const country of ["Senegal", "Ivory Coast", "France", "Belgium"]) {
    assert.ok(!RAIL_CLOSED_IN.includes(country), `${country} must not be listed as closed`);
  }
  // Selling is shut in the United Kingdom while buying is not, so only the way out carries it.
  assert.ok(WAY_OUT.closedIn.includes("United Kingdom"));
  assert.ok(!WAY_IN.closedIn.includes("United Kingdom"));
});

test("the way out says a card and an identity check, because both stop people", () => {
  assert.ok(WAY_OUT.conditions.some((c) => /identity check/i.test(c)));
  assert.ok(WAY_OUT.conditions.some((c) => /card/i.test(c)));
  assert.match(WAY_OUT.fee, /4 EUR/);
});
