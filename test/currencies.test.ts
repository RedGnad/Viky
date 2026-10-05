import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import { amountByItsLetters, amountIn, asRead, CURRENCIES_WHEN_SILENT, currencyOf, figureIn, isCurrencyCode, lettersOf, markOf, offeredCurrencies, perDollar, written } from "../src/currencies";
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
  assert.deepEqual(currencyOf("EUR"), { code: "EUR", sign: "€", name: "Euro", decimals: 2, after: false });
  assert.equal(currencyOf("JPY").decimals, 0, "the yen counts in whole units");
  assert.equal(currencyOf("XOF").decimals, 0);
  assert.equal(currencyOf("INR").name, "Indian Rupee");
  assert.equal(currencyOf("INR").sign, "₹");
  // The sign stands against its figure or away from it, as that currency is written, never as we decide.
  assert.deepEqual(markOf("EUR"), { sign: "€", gap: "", after: false });
  assert.deepEqual(markOf("CHF"), { sign: "CHF", gap: "\u00a0", after: false });
  assert.equal(figureIn(1234.5, "EUR"), "1,234.50");
  assert.equal(figureIn(1234.5, "JPY"), "1,235", "a whole currency is a whole figure");
});

test("the CFA franc is written and named as the people who count in it do, and is one line of the list", () => {
  // The founder, 5 Oct 2026. Intl names the two "West African CFA Franc" and "Central African CFA Franc": in a list
  // sorted by name the first was the last line, after the US dollar, and he took it for gone. And it writes "F CFA
  // 5,000" for one, "FCFA 5,000" for the other. Orange Money's price list in Côte d'Ivoire and Wave's terms there
  // write "FCFA" after the figure, and neither says XOF.
  assert.deepEqual(currencyOf("XOF"), { code: "XOF", sign: "FCFA", name: "CFA franc", decimals: 0, after: true });
  assert.deepEqual(currencyOf("XAF"), { code: "XAF", sign: "FCFA", name: "CFA franc", decimals: 0, after: true });
  assert.equal(amountIn(5000, "XOF"), "5\u00a0000\u00a0FCFA");
  assert.equal(amountIn(1234567.4, "XAF"), "1\u00a0234\u00a0567\u00a0FCFA");
  assert.equal(written("26.18", "EUR"), "€26.18");
  assert.equal(amountIn(26.18, "CHF"), "CHF\u00a026.18", "every other currency as Intl writes it");
  assert.equal(figureIn(17172.4, "XOF"), "17\u00a0172", "the thousands a space apart, a space no line breaks at");
  // By its letters where no sign is drawn: a payout service's own currency is named by its code, a franc by "FCFA".
  assert.equal(lettersOf("XOF"), "FCFA");
  assert.equal(lettersOf("EUR"), "EUR");
  assert.equal(amountByItsLetters(5000, "XOF"), "5\u00a0000\u00a0FCFA");
  assert.equal(amountByItsLetters(5000, "NGN"), "5,000 NGN");
  // Nothing else is written down: the exception is these two, and a test would have to be changed to add a third.
  const source = readFileSync("src/currencies.ts", "utf8");
  assert.deepEqual([...source.slice(source.indexOf("const WRITTEN_AFTER"), source.indexOf("};", source.indexOf("const WRITTEN_AFTER"))).matchAll(/^  ([A-Z]{3}): /gm)].map((match) => match[1]), ["XOF", "XAF"]);
});

test("two currencies that read alike are one line of the list: the two CFA francs, and only while their rates agree", () => {
  // The founder, 5 Oct 2026: "since the two are at the same rate, is it really useful to have both?" A currency here
  // is what amounts are read in, and the two read alike to the franc. Named apart they also took two lines on a phone.
  const rates = { date: "2026-10-02", usdPerEur: 1.1225, eurPerUsd: 1 / 1.1225, xofPerUsd: 655.957 / 1.1225, eurPer: { USD: 1.1225, EUR: 1, XOF: 655.957, XAF: 655.957, CAD: 1.5, AUD: 1.7, CZK: 25, CHF: 0.93 }, readAtMs: 0 };
  const offered = offeredCurrencies(["USD", "XAF", "CHF", "CZK", "XOF", "CAD", "AUD", "EUR"], rates);
  const lines = asRead(offered, rates);
  assert.deepEqual(lines.map((codes) => codes.join(" · ")), ["AUD", "CAD", "XOF · XAF", "CZK", "EUR", "CHF", "USD"], "one line for the francs, among the C's, West Africa's code first");
  assert.deepEqual(lines.map((codes) => currencyOf(codes[0]).name), ["Australian Dollar", "Canadian Dollar", "CFA franc", "Czech Koruna", "Euro", "Swiss Franc", "US Dollar"]);
  // The order inside the line does not depend on the order the rails listed them in.
  assert.deepEqual(asRead(["XAF", "XOF"], rates), [["XOF", "XAF"]]);
  assert.deepEqual(asRead(["XOF", "XAF"], rates), [["XOF", "XAF"]]);
  // One of the two alone is a line of its own, by the same name.
  assert.deepEqual(asRead(["EUR", "XAF"], rates), [["EUR"], ["XAF"]]);
  // Nothing else is ever joined: two dollars share a sign and not a name.
  assert.equal(asRead(["AUD", "CAD", "USD"], rates).length, 3);
  // And the two are one line because they read alike, which is asked of the day's rates: were the parities ever to
  // part, they would be two lines again, by the same name, and each with its own figure.
  const parted = { ...rates, eurPer: { ...rates.eurPer, XAF: 700 } };
  assert.deepEqual(asRead(["XOF", "XAF"], parted), [["XOF"], ["XAF"]]);
  assert.equal(perDollar("XOF", rates), perDollar("XAF", rates));
  // Before any rate has been read there is no figure on a line to disagree, and they stand together.
  assert.deepEqual(asRead(["XOF", "XAF"], undefined), [["XOF", "XAF"]]);
  // The sheet draws those lines: both codes over the one name, pressed when either is being read, and a press
  // chooses the one already read in, else the one this device would propose, else the first.
  const sheet = readFileSync("app/kit/CurrencySheet.tsx", "utf8");
  assert.match(sheet, /const lines = asRead\(offered, rates\);/);
  assert.match(sheet, /const code = codes\.includes\(currency\) \? currency : codes\.includes\(proposed\) \? proposed : codes\[0\];/);
  assert.match(sheet, /const chosen = codes\.includes\(currency\);/);
  assert.match(sheet, /<span className=\{CARD_LABEL\}>\{codes\.join\(" · "\)\}<\/span>/);
  // One line a currency: a name is cut rather than wrapped.
  assert.match(sheet, /<span data-currency-name="" className="truncate">/);
});

test("a code names a currency or it does not, and three letters alone are not enough", () => {
  assert.ok(isCurrencyCode("USD") && isCurrencyCode("XOF") && isCurrencyCode("GBP") && isCurrencyCode("INR"));
  assert.equal(isCurrencyCode("ZZZ"), false, "well formed and nobody's money");
  assert.equal(isCurrencyCode("usd"), false);
  assert.equal(isCurrencyCode("DOLLAR"), false);
  assert.equal(isCurrencyCode(42), false);
  assert.equal(isCurrencyCode(undefined), false);
});
