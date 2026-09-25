import assert from "node:assert/strict";
import test from "node:test";
import { CARD_PAYOUT_CLOSED, orderUses, SMALL_SHARE, smallFor, usesFor } from "../src/use-money";

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
