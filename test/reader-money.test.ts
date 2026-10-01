import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cardCookieFrom, cardFromCookie } from "../src/card-cookie.js";
import { currencyFor, firstLanguageTag } from "../src/reader-money.js";
import { NOT_OFFERED, offeredCurrencies } from "../src/currencies.js";
import { isDisplayCurrency } from "../src/display-currency.js";
import { PENDING_GIFT_MAX_AGE_MS, type PendingGiftTerms } from "../src/pending-gift.js";

/**
 * What the server must know before it draws a money screen (D160). Every one of these used to be read in the
 * browser only, which is why a card was printed in dollars and corrected a moment later.
 */

test("the language a page is asked in gives its first tag, and nothing when it says nothing", () => {
  assert.equal(firstLanguageTag("fr-FR,fr;q=0.9,en-US;q=0.8"), "fr-FR");
  assert.equal(firstLanguageTag("fr-SN"), "fr-SN");
  assert.equal(firstLanguageTag("en"), "en", "a tag with no country is still a tag");
  assert.equal(firstLanguageTag(null), undefined);
  assert.equal(firstLanguageTag("*"), undefined);
  assert.equal(firstLanguageTag(""), undefined);
});

test("the currency comes from the account first, then the device, then a proposal, and says which", () => {
  assert.deepEqual(currencyFor({ account: "XOF", kept: "EUR", language: "en-US" }), { currency: "XOF", decided: true, proposed: false }, "the account's own choice wins");
  assert.deepEqual(currencyFor({ account: null, kept: "EUR", language: "en-US" }), { currency: "EUR", decided: true, proposed: false }, "then what this device wrote down");
  assert.deepEqual(currencyFor({ account: null, kept: undefined, language: "fr-FR" }), { currency: "EUR", decided: true, proposed: true });
  assert.deepEqual(currencyFor({ account: null, kept: undefined, language: "fr-SN" }), { currency: "XOF", decided: true, proposed: true });
  assert.deepEqual(currencyFor({ account: null, kept: undefined, language: "en-US" }), { currency: "USD", decided: true, proposed: true });
  // A tag with no country is a guess, and the browser's own tag may carry one: the screens are told it was a guess.
  assert.deepEqual(currencyFor({ account: null, kept: undefined, language: "fr" }), { currency: "USD", decided: false, proposed: false });
  assert.deepEqual(currencyFor({ account: null, kept: undefined, language: undefined }), { currency: "USD", decided: false, proposed: false });
  assert.deepEqual(currencyFor({ account: null, kept: "nonsense", language: "fr-FR" }), { currency: "EUR", decided: true, proposed: true }, "a cookie nobody wrote is ignored");
});

test("the connection's country proposes before the language, and nothing is asked when the two disagree", () => {
  // Measured in production before 1 Oct 2026: "fr" alone, "en-US" and "en-GB" read dollars in France.
  for (const language of ["fr", "en-US", "en-GB", undefined]) {
    assert.deepEqual(currencyFor({ account: null, kept: undefined, country: "FR", language }), { currency: "EUR", decided: true, proposed: true }, String(language));
  }
  // A phone in English in Dakar: the connection decides.
  assert.equal(currencyFor({ account: null, kept: undefined, country: "SN", language: "en-US" }).currency, "XOF");
  // The connection silent (not on the platform): the language's region proposes, as before.
  assert.equal(currencyFor({ account: null, kept: undefined, country: null, language: "fr-FR" }).currency, "EUR");
  // The choice made in Me stays first, then what the device kept, whatever the connection says.
  assert.equal(currencyFor({ account: "GBP", kept: "EUR", country: "SN", language: "fr-SN" }).currency, "GBP");
  assert.equal(currencyFor({ account: null, kept: "EUR", country: "SN", language: "fr-SN" }).currency, "EUR");
  // A country whose currency is not offered reads dollars, and that is a decision, kept like any other.
  const offered = new Set(["USD", "EUR", "XOF"]);
  assert.deepEqual(currencyFor({ account: null, kept: undefined, country: "GB", language: "en-GB", mayRead: (code) => offered.has(code) }), { currency: "USD", decided: true, proposed: true });
  assert.deepEqual(currencyFor({ account: null, kept: undefined, country: "MA", language: "fr-MA" }), { currency: "USD", decided: true, proposed: true }, "a country whose currency Viky cannot offer");
  // The server reads the platform's own header, and asks what is offered only when it is about to propose.
  const server = readFileSync("src/reader-money.ts", "utf8");
  assert.match(server, /country: connectionCountry\(sent\.get\("x-vercel-ip-country"\)\),/);
  assert.match(server, /const offered = chosen \|\| isDisplayCurrency\(kept\) \? null : await offeredNow\(usable\);/);
});

test("the first proposal is kept on the device, and written on an account that has no currency of its own", () => {
  const start = readFileSync("src/client/money-start.tsx", "utf8");
  assert.match(start, /if \(proposed\) keepTheProposal\(currency\);/);
  assert.match(start, /if \(document\.cookie\.split\("; "\)\.some\(\(one\) => one\.startsWith\(`\$\{CURRENCY_COOKIE\}=`\)\)\) return;/, "never over what is already kept");
  assert.match(readFileSync("app/layout.tsx", "utf8"), /proposed: money\.proposed,/);
  const hook = readFileSync("src/client/display-currency.ts", "utf8");
  assert.match(hook, /const kept = answer\.displayCurrency \?\? keptOnTheDevice\(\);/);
  assert.match(hook, /if \(answer\.displayCurrency === null && kept && !givenToTheAccount\.has\(address\)\) \{/, "once, and only where the account has none");
  assert.match(hook, /putJson<\{ displayCurrency: DisplayCurrency \}>\("\/api\/account\/preferences", \{ displayCurrency: kept \}\)/);
});

const CARD: PendingGiftTerms = {
  account: "0xabc",
  recipientName: "Léa",
  funderName: "Maman",
  conditionId: "duolingo-lesson",
  username: "lea",
  dollars: "45",
  days: "90",
  target: "1",
  typedAmount: "45",
  typedIn: "EUR",
};

test("the card's cookie carries its figures and none of its people", () => {
  const written = cardCookieFrom(CARD, 1_000_000);
  const text = decodeURIComponent(written);
  assert.equal(text.includes("Léa"), false, "a first name is not sent with every request for a font");
  assert.equal(text.includes("Maman"), false);
  assert.equal(text.includes("0xabc"), false, "nor the account");
  assert.equal(text.includes("lea"), false, "nor the name of the goal's own account");
  const read = cardFromCookie(written, 1_000_000);
  assert.equal(read?.dollars, "45");
  assert.equal(read?.days, "90");
  assert.equal(read?.conditionId, "duolingo-lesson");
  assert.equal(read?.typedAmount, "45");
  assert.equal(read?.typedIn, "EUR");
  assert.equal(read?.recipientName, "", "the names stay on the device, so the card asks for one as it did");
});

test("a card's cookie stops describing a card once the card itself would be gone", () => {
  const written = cardCookieFrom(CARD, 1_000_000);
  assert.ok(cardFromCookie(written, 1_000_000 + PENDING_GIFT_MAX_AGE_MS - 1_000));
  assert.equal(cardFromCookie(written, 1_000_000 + PENDING_GIFT_MAX_AGE_MS + 1_000), undefined, "the same age limit as the card");
  assert.equal(cardFromCookie("not json", 1_000_000), undefined);
  assert.equal(cardFromCookie("%E0%A4%A", 1_000_000), undefined, "a cookie that is not even text");
  assert.equal(cardFromCookie(undefined, 1_000_000), undefined);
});

/** A currency the product does not offer is not in the list, and is not a choice a cookie can keep (22 Sep 2026). */
test("the shekel is not offered, and not read in", () => {
  assert.equal(NOT_OFFERED.has("ILS"), true);
  const rates = { date: "2026-09-21", readAtMs: Date.now(), usdPerEur: 1.17, eurPerUsd: 0.855, xofPerUsd: 561, eurPer: { USD: 1.17, GBP: 0.86, ILS: 4.3, JPY: 172 } };
  const offered = offeredCurrencies(["USD", "GBP", "ILS", "JPY"], rates);
  assert.equal(offered.includes("ILS"), false, "not in the list a person picks from");
  assert.equal(offered.includes("GBP"), true, "and the rest of the list is untouched");
  assert.equal(isDisplayCurrency("ILS"), false, "and a cookie or an account that says so is ignored");
  assert.equal(isDisplayCurrency("GBP"), true);
  assert.deepEqual(currencyFor({ account: null, kept: "ILS", language: "fr-FR" }), { currency: "EUR", decided: true, proposed: true }, "a device that kept it reads in what its language proposes");
});
