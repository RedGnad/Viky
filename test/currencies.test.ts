import { strict as assert } from "node:assert";
import test from "node:test";
import { CURRENCIES_WHEN_SILENT, currencyOf, figureIn, isCurrencyCode, markOf, offeredCurrencies, perDollar } from "../src/currencies";
import { parseEcbRates } from "../src/rates";

/**
 * Which currencies a person may read Viky in (D152): what the two rails will pay somebody in, crossed with what the
 * rate file can convert into. Nothing here is a list written by hand, and the one list that is, the three to fall
 * back on, is only reached when a source says nothing at all.
 *
 * The file below is the shape of the ECB's own, with the lines that matter for these questions.
 */
const FILE = `<?xml version="1.0" encoding="UTF-8"?><gesmes:Envelope><Cube><Cube time='2026-09-18'>
  <Cube currency='USD' rate='1.1537'/>
  <Cube currency='JPY' rate='173.4'/>
  <Cube currency='GBP' rate='0.8654'/>
  <Cube currency='CHF' rate='0.9321'/>
  <Cube currency='INR' rate='101.7'/>
  <Cube currency='CNY' rate='8.2129'/>
</Cube></Cube></gesmes:Envelope>`;

const RATES = parseEcbRates(FILE, Date.parse("2026-09-18T16:00:00Z"));

test("the rate file gives every line it carries, plus the euro and the two CFA francs", () => {
  assert.equal(RATES.eurPer.USD, 1.1537);
  assert.equal(RATES.eurPer.EUR, 1, "the euro is its own unit");
  assert.equal(RATES.eurPer.XOF, 655.957, "fixed by treaty, not published daily");
  assert.equal(RATES.eurPer.XAF, 655.957);
  // A dollar buys what the file says it buys, through the euro, which is the unit the file is written in.
  assert.equal(perDollar("USD", RATES), 1);
  assert.ok(Math.abs((perDollar("EUR", RATES) ?? 0) - 1 / 1.1537) < 1e-12);
  assert.ok(Math.abs((perDollar("JPY", RATES) ?? 0) - 173.4 / 1.1537) < 1e-9);
  assert.equal(perDollar("ZAR", RATES), undefined, "a currency the file does not carry cannot be converted into");
  assert.equal(perDollar("EUR", undefined), undefined, "and nothing is converted without a file at all");
});

test("a currency is offered when a rail pays it and the file converts it, and never otherwise", () => {
  const payable = ["USD", "EUR", "GBP", "CHF", "INR", "XOF", "BRL", "THB"];
  const offered = offeredCurrencies(payable, RATES);
  assert.deepEqual([...offered].sort(), ["CHF", "EUR", "GBP", "INR", "USD", "XOF"], "the two with no rate are left out");
  // The one the founder named: the yuan has a rate in the file and no rail will pay it, so it must never appear.
  assert.ok(RATES.eurPer.CNY !== undefined, "the file does carry it");
  assert.equal(offered.includes("CNY"), false, "and it is still not offered");
  // Sorted by name, which is how the list is read: Swiss Franc, Euro, British Pound, Indian Rupee, US Dollar...
  assert.deepEqual(
    [...offered],
    [...offered].sort((left, right) => currencyOf(left).name.localeCompare(currencyOf(right).name, "en-GB")),
  );
});

test("a source that says nothing leaves the three the product was built on, never a list invented here", () => {
  assert.deepEqual(offeredCurrencies(null, RATES), CURRENCIES_WHEN_SILENT, "no rail answered");
  assert.deepEqual(offeredCurrencies([], RATES), CURRENCIES_WHEN_SILENT, "a rail answered nothing");
  assert.deepEqual(offeredCurrencies(["USD", "EUR", "XOF"], undefined), CURRENCIES_WHEN_SILENT, "no rate file");
  assert.deepEqual(offeredCurrencies(["GBP"], RATES), CURRENCIES_WHEN_SILENT, "and one currency is not a list");
  assert.deepEqual(CURRENCIES_WHEN_SILENT, ["USD", "EUR", "XOF"]);
});

test("what a currency is called, its sign and its decimals come from the runtime, not from us", () => {
  assert.deepEqual(currencyOf("EUR"), { code: "EUR", sign: "€", name: "Euro", decimals: 2 });
  assert.equal(currencyOf("JPY").decimals, 0, "the yen counts in whole units");
  assert.equal(currencyOf("XOF").decimals, 0);
  assert.equal(currencyOf("INR").name, "Indian Rupee");
  assert.equal(currencyOf("INR").sign, "₹");
  // The sign stands against its figure or away from it, as that currency is written, never as we decide.
  assert.deepEqual(markOf("EUR"), { sign: "€", gap: "" });
  assert.deepEqual(markOf("CHF"), { sign: "CHF", gap: " " });
  assert.equal(figureIn(1234.5, "EUR"), "1,234.50");
  assert.equal(figureIn(1234.5, "JPY"), "1,235", "a whole currency is a whole figure");
});

test("a code names a currency or it does not, and three letters alone are not enough", () => {
  assert.ok(isCurrencyCode("USD") && isCurrencyCode("XOF") && isCurrencyCode("GBP") && isCurrencyCode("INR"));
  assert.equal(isCurrencyCode("ZZZ"), false, "well formed and nobody's money");
  assert.equal(isCurrencyCode("usd"), false);
  assert.equal(isCurrencyCode("DOLLAR"), false);
  assert.equal(isCurrencyCode(42), false);
  assert.equal(isCurrencyCode(undefined), false);
});
