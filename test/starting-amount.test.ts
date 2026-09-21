import { strict as assert } from "node:assert";
import test from "node:test";
import { unitsFromTyped } from "../src/amount-in-currency";
import { parseEcbRates } from "../src/rates";
import { roundFigure, startingFigure } from "../src/starting-amount";

/**
 * What the card starts on (D157): thirty dollars, thirty euros, fifteen thousand francs, a round figure in whatever
 * the reader reads in, and the account's own money when it holds any.
 */
const FILE = `<Cube><Cube time='2026-09-18'><Cube currency='USD' rate='1.1537'/><Cube currency='INR' rate='109.8755'/><Cube currency='JPY' rate='173.4'/><Cube currency='GBP' rate='0.8654'/></Cube></Cube>`;
const RATES = parseEcbRates(FILE, Date.parse("2026-09-18T16:00:00Z"));

test("a round figure is the nearest rung of the ladder every price list climbs", () => {
  assert.equal(roundFigure(26.18), 30);
  assert.equal(roundFigure(17172), 15000);
  assert.equal(roundFigure(2876), 3000);
  assert.equal(roundFigure(22.48), 20);
  assert.equal(roundFigure(4510), 5000);
  assert.equal(roundFigure(1.4), 1.5);
  assert.equal(roundFigure(0), 0);
});

test("the card starts on thirty, round, in the reader's own currency, and on the dollar without a rate", () => {
  assert.deepEqual(startingFigure("USD", RATES), { typed: "30.00", dollars: "30", fromTheAccount: false });
  assert.deepEqual(startingFigure("EUR", undefined), { typed: "30.00", dollars: "30", fromTheAccount: false }, "no rate, no conversion invented");
  const euros = startingFigure("EUR", RATES);
  assert.equal(euros.typed, "30.00", "thirty euros, not 26.18");
  assert.equal(euros.dollars, "34.61", "which the chain holds as the dollars they are, cut to the cent");
  const francs = startingFigure("XOF", RATES);
  assert.equal(francs.typed, "15000", "fifteen thousand francs, not 17,172");
  assert.equal(startingFigure("INR", RATES).typed, "3000.00");
  assert.equal(startingFigure("JPY", RATES).typed, "5000", "a whole currency starts whole");
  // What the field shows is what the dollars make, both ways: the draft never holds more than the figure asked for.
  assert.equal(unitsFromTyped(euros.typed, "EUR", RATES), unitsFromTyped(euros.dollars, "USD", undefined));
});

test("signed in with money in the account, the card starts on that money, within the gift's bounds", () => {
  assert.deepEqual(startingFigure("USD", RATES, 10_130_000n), { typed: "10.13", dollars: "10.13", fromTheAccount: true });
  assert.equal(startingFigure("EUR", RATES, 10_130_000n).typed, "8.78");
  assert.equal(startingFigure("USD", RATES, 0n).fromTheAccount, false, "nothing in the account is nothing to start on");
  assert.equal(startingFigure("USD", RATES, 500_000n).fromTheAccount, false, "under the smallest gift, the round default");
  assert.equal(startingFigure("USD", RATES, 2_000_000_000n).fromTheAccount, false, "over the pilot's ceiling, the round default");
});
