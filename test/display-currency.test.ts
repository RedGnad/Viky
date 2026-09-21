import assert from "node:assert/strict";
import test from "node:test";
import { aboutInDisplayCurrency, isDisplayCurrency, proposedDisplayCurrency, rateDateInWords, regionOf, SHOWN_IN_DOLLARS, whenInWords } from "../src/display-currency";
import { parseEcbRates } from "../src/rates";

/**
 * One display currency per account, proposed from the device and never asked (decision 1 of the design pass,
 * 17 Sep 2026). A funder in France reads euros, a recipient in Senegal reads CFA francs, for the same gift in
 * dollars on chain; and no figure is ever converted without "about" and the date of the rate.
 */

const RATES = parseEcbRates(
  `<Cube time='2026-09-16'><Cube currency='USD' rate='1.1537'/></Cube>`,
  Date.UTC(2026, 8, 17),
);

test("the device gives a language tag, and only a tag with a region proposes anything", () => {
  assert.equal(regionOf("fr-FR"), "FR");
  assert.equal(regionOf("fr_SN"), "SN");
  assert.equal(regionOf("en-US"), "US");
  assert.equal(regionOf("fr"), undefined, "a language alone names no country");
  assert.equal(regionOf(""), undefined);
  assert.equal(regionOf(undefined), undefined);
  assert.equal(regionOf("zh-Hans-CN"), "CN", "a script subtag is skipped");
});

test("France reads euros, Senegal and Ivory Coast read CFA francs, everybody else reads dollars", () => {
  assert.equal(proposedDisplayCurrency("fr-FR"), "EUR");
  assert.equal(proposedDisplayCurrency("bg-BG"), "EUR", "Bulgaria, since 1 January 2026");
  assert.equal(proposedDisplayCurrency("fr-SN"), "XOF");
  assert.equal(proposedDisplayCurrency("fr-CI"), "XOF");
  assert.equal(proposedDisplayCurrency("en-US"), "USD");
  assert.equal(proposedDisplayCurrency("en-GB"), "USD", "the device proposes one of the three; the pound is chosen from the list (D152)");
  assert.equal(proposedDisplayCurrency("fr"), "USD", "no region, no guess");
  assert.equal(proposedDisplayCurrency(undefined), "USD");
  // Any currency a rate and a rail agree on may be read in since D152, so what is refused is what is not one.
  assert.ok(isDisplayCurrency("EUR") && isDisplayCurrency("XOF") && isDisplayCurrency("USD") && isDisplayCurrency("GBP"));
  assert.equal(isDisplayCurrency("XXXX"), false);
  assert.equal(isDisplayCurrency("eur"), false);
  assert.equal(isDisplayCurrency("ZZZ"), false, "three letters that name no currency are not one");
});

test("a converted figure carries about and the date of the rate; the dollar is never converted to itself", () => {
  assert.equal(rateDateInWords("2026-09-16"), "16 Sep 2026", "as every other date in Viky is written, never the locale's Sept");
  assert.equal(rateDateInWords("2026-01-02"), "2 Jan 2026");
  assert.match(whenInWords(Date.UTC(2026, 8, 17, 12, 5)), /^17 Sep 2026 at /);
  assert.equal(aboutInDisplayCurrency(10_990_000n, "EUR", RATES), `about 9.53 EUR (rate of ${rateDateInWords("2026-09-16")})`);
  // The code names the currency since D152: thirty-one of them, several sharing a sign, and one sentence for all.
  assert.equal(aboutInDisplayCurrency(10_990_000n, "XOF", RATES), `about 6,249 XOF (rate of ${rateDateInWords("2026-09-16")})`);
  assert.equal(aboutInDisplayCurrency(25_000_000n, "EUR", RATES), `about 21.67 EUR (rate of ${rateDateInWords("2026-09-16")})`);
  assert.equal(aboutInDisplayCurrency(10_990_000n, "USD", RATES), undefined);
  assert.equal(aboutInDisplayCurrency(10_990_000n, "EUR", undefined), undefined, "no rate, no figure: the dollar shows alone");
});

test("the one line printed when the rate could not be read says so, in the person's words", () => {
  assert.match(SHOWN_IN_DOLLARS, /Shown in dollars/);
  assert.doesNotMatch(SHOWN_IN_DOLLARS, /\b(wallet|gas|chain|seed|token|address)\b/i);
});
