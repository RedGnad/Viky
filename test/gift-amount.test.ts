import { strict as assert } from "node:assert";
import test from "node:test";
import { WAY_IN_CHAIN_COIN, WAY_IN_GIFT_COIN } from "../src/rails.js";
import { arrivesInDollars, eurosToBuy, eurosToBuyOn, roughlyInDollars, SMALLEST_CARD_PAYMENT_EUR, SUGGESTED_GIFT_DOLLARS } from "../src/gift-amount.js";
import { feeSentence, RAIL_CLOSED_IN, WAY_IN, WAY_OUT_CARD, WAY_OUT_EURO, WAYS_OUT } from "../src/rails.js";

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
 * The defect of 15 Sep: the screen suggested $50, the funder bought the rail's smallest 25 EUR, received about
 * $28.50, and the page waited for a gift that could not be made, because nothing said how much to buy.
 */
test("what the funder is told to buy always covers what the account is short of", () => {
  assert.equal(eurosToBuy(0n), 0, "nothing short, nothing to buy");
  assert.equal(eurosToBuy(-5n), 0);
  assert.equal(eurosToBuy(1_000_000n), SMALLEST_CARD_PAYMENT_EUR, "never below the rail's smallest payment");
  assert.equal(eurosToBuy(50_000_000n), 49);
  for (const dollars of [1, 5, 20, 25, 28, 40, 50, 75, 100, 250, 500]) {
    const euros = eurosToBuy(BigInt(dollars) * 1_000_000n);
    assert.ok(Number.isInteger(euros), "whole euros, which is what their page takes");
    // Covered at the rate measured, and still covered if the rate has moved 9 % against the funder since.
    assert.ok(roughlyInDollars(euros) * 0.91 >= dollars, `${euros} EUR for $${dollars} becomes $${roughlyInDollars(euros)}`);
  }
});

test("the suggested gift is what one smallest card payment covers", () => {
  assert.equal(SMALLEST_CARD_PAYMENT_EUR, 25);
  assert.match(WAY_IN.smallest, /25/);
  assert.equal(eurosToBuy(BigInt(SUGGESTED_GIFT_DOLLARS) * 1_000_000n), SMALLEST_CARD_PAYMENT_EUR);
  assert.ok(roughlyInDollars(SMALLEST_CARD_PAYMENT_EUR) >= SUGGESTED_GIFT_DOLLARS);
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
  // The coin is shut in the United Kingdom both ways: their currencies endpoint lists gb for buying it and for
  // selling it (D72). This once said buying was open there.
  assert.ok(WAY_IN.closedIn.includes("United Kingdom"));
  assert.ok(WAY_OUT_CARD.conditions.some((c) => /United Kingdom/i.test(c)));
});

/**
 * Two ways out, not one, and that is the whole point (D77). No single payout service covers the pilot: the
 * euro one refuses Senegal and Ivory Coast outright, and the card one pays nothing in France or the rest of
 * the EEA. Between them the corridors are covered, so neither may quietly become "the" way out.
 */
test("the ways out cover each other's gaps, and each says where it pays", () => {
  assert.equal(WAYS_OUT.length, 2);
  assert.ok(WAY_OUT_EURO.conditions.some((c) => /Senegal|Ivory Coast/i.test(c)), "the euro rail says who it cannot serve");
  // Since S4 no rail names the other one on screen: each says where it pays, and the order the screen puts them in
  // is what says which one fits (R1).
  assert.equal(WAY_OUT_CARD.where, "To your card.");
  for (const out of WAYS_OUT) for (const other of WAYS_OUT) if (other !== out) assert.doesNotMatch(out.where, new RegExp(other.name, "i"), `${out.name} names ${other.name}`);
  assert.ok(WAY_OUT_CARD.conditions.some((c) => /France|EEA/i.test(c)), "and where it pays nothing");
  // Each stands on a source with a date, so nobody has to take our word for a sentence about their money.
  for (const out of WAYS_OUT) {
    assert.ok(out.source.length > 0 && /20\d\d/.test(out.read), `${out.name} must say what was read and when`);
    assert.ok(out.conditions.some((c) => /identity check/i.test(c)));
    assert.ok(out.sells.length > 0 && out.coin.startsWith("0x"));
  }
  // Their published fee is three facts, not a sentence, so the card and the review build the same words from them.
  assert.equal(WAY_OUT_CARD.fee.minimum, 4);
  assert.equal(WAY_OUT_EURO.fee.minimum, 1.99);
  assert.equal(feeSentence(WAY_OUT_EURO), "Ramp keeps 0.99 % with a minimum of 1.99 EUR");
  assert.equal(feeSentence(WAY_OUT_CARD), "Mercuryo keeps up to 3.95 % with a minimum of 4.00 EUR");
});

/**
 * The two take different coins, which is why the coin travels inside the signature rather than being fixed
 * when the router is deployed. Equal coins here would mean one corridor was silently closed.
 */
test("the two ways out do not take the same coin", () => {
  assert.notEqual(WAY_OUT_EURO.coin.toLowerCase(), WAY_OUT_CARD.coin.toLowerCase());
  assert.equal(WAY_OUT_CARD.coin, "0x0000000000000000000000000000000000000000", "the card rail sells the chain's own coin");
});

/**
 * The second way in (D101): a rail that sells what a gift already holds. Nothing is swapped after it, so no reserve is
 * left behind and no second price applies; what a person pays, less that rail's own fee, becomes dollars at the day's
 * euro rate. Every figure below is theirs, read on 18 Sep 2026 at `https://api.ramp.network/api/host-api/assets`:
 * a 6 EUR floor, 0.99 % to 3.9 %, and a 2.49 EUR minimum fee.
 */
test("the rail that sells what a gift holds costs its fee and its floor, and nothing else", () => {
  const rate = 1.1537; // dollars per euro, the ECB's of 16 Sep 2026, as the rates route answers it
  // A one dollar gift: the fee decides, not the amount, so the floor is what is paid.
  assert.equal(eurosToBuyOn(1_000_000n, WAY_IN_GIFT_COIN, rate), 6);
  // Ten dollars: 8.67 EUR of money plus their 2.49 minimum, rounded up to the whole euro.
  assert.equal(eurosToBuyOn(10_000_000n, WAY_IN_GIFT_COIN, rate), 12);
  // A hundred: their 3.9 % share is larger than the minimum by then, so the share is what applies.
  assert.equal(eurosToBuyOn(100_000_000n, WAY_IN_GIFT_COIN, rate), 91);
  assert.equal(eurosToBuyOn(0n, WAY_IN_GIFT_COIN, rate), 0, "nothing short, nothing to buy");
  // No rate, no figure: nothing is guessed, and the screen says what it can instead.
  assert.equal(eurosToBuyOn(10_000_000n, WAY_IN_GIFT_COIN, undefined), undefined);

  // What lands: the fee out, the rest at the day's rate.
  assert.equal(arrivesInDollars(6, WAY_IN_GIFT_COIN, rate), 4.05);
  assert.equal(arrivesInDollars(12, WAY_IN_GIFT_COIN, rate), 10.97);
  assert.equal(arrivesInDollars(2, WAY_IN_GIFT_COIN, rate), 0, "under their minimum fee nothing arrives at all");

  // The other rail is untouched: its own floor, its own measured figures, and no rate needed.
  assert.equal(eurosToBuyOn(1_000_000n, WAY_IN_CHAIN_COIN, rate), 25);
  assert.equal(arrivesInDollars(25, WAY_IN_CHAIN_COIN, undefined), 28.51);
  assert.equal(WAY_IN_CHAIN_COIN.smallestEur, SMALLEST_CARD_PAYMENT_EUR);

  // What a gift costs to fund, the two rails side by side, at the same gift: the reason the second one exists.
  assert.ok(eurosToBuyOn(1_000_000n, WAY_IN_GIFT_COIN, rate)! < eurosToBuyOn(1_000_000n, WAY_IN_CHAIN_COIN, rate)!);
});
