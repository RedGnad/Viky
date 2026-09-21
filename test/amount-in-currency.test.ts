import { strict as assert } from "node:assert";
import test from "node:test";
import { currencyMark, figureWithMark, readableFigure, typedFromUnits, unitsFromTyped } from "../src/amount-in-currency";
import { AmountError, MAX_GIFT_UNITS, MIN_GIFT_UNITS } from "../src/money";
import type { Rates } from "../src/rates";

/**
 * A gift typed in the currency the person reads in (D143). The chain holds dollars, and that never changes: what
 * this decides is what a person types and what they read back, which is what every app of the kind does, and what
 * keeps a funder in France from meeting a dollar sign on the first screen and closing it.
 */
const RATES: Rates = {
  date: "2026-09-18",
  usdPerEur: 1.1537,
  eurPerUsd: 1 / 1.1537,
  xofPerUsd: (1 / 1.1537) * 655.957,
  eurPer: { USD: 1.1537, EUR: 1, XOF: 655.957, XAF: 655.957, INR: 101.7, JPY: 173.4 },
  readAtMs: Date.parse("2026-09-18T16:00:00Z"),
};

test("a euro figure becomes the dollars the contract will hold, cut to the cent and never rounded up", () => {
  assert.equal(unitsFromTyped("30", "EUR", RATES), 34_610_000n);
  assert.equal(unitsFromTyped("30.00", "EUR", RATES), 34_610_000n);
  assert.equal(unitsFromTyped("26.18", "EUR", RATES), 30_200_000n, "cut to the cent, never rounded up");
  // The other way, for a field that opens on what is already chosen.
  assert.equal(typedFromUnits(30_000_000n, "EUR", RATES), "26.00");
  assert.equal(typedFromUnits(34_610_000n, "EUR", RATES), "30.00");
});

test("a franc figure is whole, and becomes dollars the same way", () => {
  assert.equal(unitsFromTyped("20000", "XOF", RATES), 35_170_000n);
  // A franc has no subunit, so the cent the chain cuts to is worth about three francs: the way back says 19,997
  // for a gift typed as 20,000, and that is the truth of what is held rather than the figure that was typed.
  assert.equal(typedFromUnits(35_170_000n, "XOF", RATES), "19997");
  assert.throws(() => unitsFromTyped("20000.5", "XOF", RATES), AmountError);
});

test("a dollar reader keeps the dollar path, rate or no rate", () => {
  assert.equal(unitsFromTyped("30", "USD", RATES), 30_000_000n);
  assert.equal(unitsFromTyped("30", "EUR", undefined), 30_000_000n, "no rate read, no conversion invented");
  assert.equal(typedFromUnits(30_000_000n, "USD", RATES), "30.00");
  assert.equal(typedFromUnits(30_000_000n, "EUR", undefined), "30.00");
});

test("the contract's own bounds are said in the currency being typed in, with the dollar they really are", () => {
  const small = () => unitsFromTyped("0.50", "EUR", RATES);
  assert.throws(small, (error: unknown) => error instanceof AmountError && /\$1\.00, about €0\.87/.test(error.message));
  const big = () => unitsFromTyped("900", "EUR", RATES);
  assert.throws(big, (error: unknown) => error instanceof AmountError && /\$1,000, about €866\.78/.test(error.message));
  // The franc is grouped in the same sentence, because five figures in a row are read by nobody.
  const franc = () => unitsFromTyped("900000", "XOF", RATES);
  assert.throws(franc, (error: unknown) => error instanceof AmountError && /about F\u202fCFA\u00a0568,568/.test(error.message));
  // And the bounds themselves are the contract's, untouched by any of this.
  assert.equal(MIN_GIFT_UNITS, 1_000_000n);
  assert.equal(MAX_GIFT_UNITS, 1_000_000_000n);
  assert.equal(unitsFromTyped(typedFromUnits(MIN_GIFT_UNITS, "EUR", RATES), "EUR", RATES) >= MIN_GIFT_UNITS, true, "the smallest said is a figure that passes");
});

test("a franc figure is grouped where it is read, and a field still holds plain digits", () => {
  assert.equal(readableFigure("17172", "XOF"), "17,172");
  assert.equal(readableFigure("26.18", "EUR"), "26.18");
});

test("the mark stands in front of the figure in every currency, and both are the source's own (D145, D152)", () => {
  // Read off what Intl formats rather than written here: the euro sits against its figure, the franc and the Swiss
  // franc stand away from theirs, and a currency nobody had thought of is written the way it is written.
  assert.deepEqual(currencyMark("EUR"), { sign: "€", gap: "" });
  assert.deepEqual(currencyMark("USD"), { sign: "$", gap: "" });
  assert.deepEqual(currencyMark("XOF"), { sign: "F\u202fCFA", gap: "\u00a0" });
  assert.deepEqual(currencyMark("CHF"), { sign: "CHF", gap: "\u00a0" });
  assert.equal(figureWithMark("30.00", "USD"), "$30.00");
  assert.equal(figureWithMark("26.18", "EUR"), "€26.18");
  assert.equal(figureWithMark("17,172", "XOF"), "F\u202fCFA\u00a017,172");
});
