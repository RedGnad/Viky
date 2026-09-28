import assert from "node:assert/strict";
import test from "node:test";
import { CARD_PAYOUT_CLOSED, GIFT_CARD_SUN_FROM_EUROS, inTheSun, orderUses, SMALL_SHARE, smallFor, usesFor } from "../src/use-money";

/** "Use your money" (D270): the uses for the number's country, and the one that takes the sun. */

const serves = { Ramp: "serves", Mercuryo: "serves" } as const;
const senegal = { Ramp: "does-not", Mercuryo: "serves" } as const;

test("only what works for the number's country is offered", () => {
  assert.deepEqual(usesFor("sn", senegal, true), ["phone", "card"], "Senegal: no bank payout there");
  assert.deepEqual(usesFor("fr", serves, true), ["phone", "bank"], "France: the card rail pays no card in the EEA");
  assert.deepEqual(usesFor("us", { Ramp: "serves", Mercuryo: "serves" }, false), ["bank"], "nor in the United States");
  assert.deepEqual(usesFor("gb", { Ramp: "serves", Mercuryo: "does-not" }, true), ["phone", "bank"], "its own list restricts Britain");
  assert.deepEqual(usesFor(null, {}, true), ["phone", "bank", "card"], "a country nobody knows hides nothing");
  assert.equal(CARD_PAYOUT_CLOSED.length, 31, "the thirty of the EEA and the United States");
});

test("the sun goes to what gives the most without a word of crypto", () => {
  assert.equal(SMALL_SHARE, 0.1);
  assert.equal(smallFor({ percent: 3.95, upTo: true, minimum: 4, currency: "EUR" }, 18), true, "4 EUR of 18 is small");
  assert.equal(smallFor({ percent: 0.99, upTo: false, minimum: 1.99, currency: "EUR" }, 103), false);
  // The mockups: $20.99 in Senegal, the phone first; $120 in France, the bank first, the phone last.
  assert.deepEqual(orderUses(["phone", "card"], 18, () => 15), ["phone", "card"]);
  assert.deepEqual(orderUses(["phone", "bank"], 103, () => 100), ["bank", "phone"]);
  // A large amount where the card pays: the card first.
  assert.deepEqual(orderUses(["phone", "card"], 200, () => 190), ["card", "phone"]);
  // Both rails and a large amount: the one that leaves more first.
  assert.deepEqual(orderUses(["phone", "bank", "card"], 200, (use) => (use === "bank" ? 197 : 190)), ["bank", "card", "phone"]);
  // No phone and a small amount: the rail still stands, it is all there is.
  assert.deepEqual(orderUses(["bank"], 10, () => 8), ["bank"]);
  assert.deepEqual(orderUses([], 10, () => 8), []);
});

test("a gift card comes second, whatever leads, as both mockups draw it, and only with a country (D271)", () => {
  // Senegal, a small amount: the phone leads, the gift card follows, then the card rail.
  const senegal = usesFor("SN", { Ramp: "does-not" }, true, true);
  assert.deepEqual(orderUses(senegal, 20, () => 10), ["phone", "giftcard", "card"]);
  // France, a larger amount: the bank leads, the gift card follows, then the phone.
  const france = usesFor("FR", {}, true, true);
  assert.deepEqual(orderUses(france, 120, (use) => (use === "bank" ? 99 : undefined)), ["bank", "giftcard", "phone"]);
  assert.equal(usesFor(null, {}, true, true).includes("giftcard"), false, "no country, no list of cards");
  assert.equal(usesFor("SN", {}, true, false).includes("giftcard"), false, "not offered, not shown");
});

test("the gift card's button takes the main colour from an ordinary card's price, the first card always", () => {
  assert.equal(GIFT_CARD_SUN_FROM_EUROS, 10);
  assert.equal(inTheSun("phone", 0, 3), true, "the first card, whatever the amount");
  assert.equal(inTheSun("giftcard", 1, 10), true, "ten euros: an ordinary card");
  assert.equal(inTheSun("giftcard", 1, 42.5), true);
  assert.equal(inTheSun("giftcard", 1, 9.99), false, "below it, a second choice");
  assert.equal(inTheSun("giftcard", 1, undefined), false, "an amount not known yet is not in the sun");
  assert.equal(inTheSun("bank", 2, 500), false, "only the gift card joins the first");
});
