import { strict as assert } from "node:assert";
import test from "node:test";
import { cardCookieFrom, cardFromCookie } from "../src/card-cookie.js";
import { currencyFor, firstLanguageTag } from "../src/reader-money.js";
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

test("the currency comes from the account first, then the device, then the language, and says which", () => {
  assert.deepEqual(currencyFor({ account: "XOF", kept: "EUR", language: "en-US" }), { currency: "XOF", decided: true }, "the account's own choice wins");
  assert.deepEqual(currencyFor({ account: null, kept: "EUR", language: "en-US" }), { currency: "EUR", decided: true }, "then what this device wrote down");
  assert.deepEqual(currencyFor({ account: null, kept: undefined, language: "fr-FR" }), { currency: "EUR", decided: true });
  assert.deepEqual(currencyFor({ account: null, kept: undefined, language: "fr-SN" }), { currency: "XOF", decided: true });
  assert.deepEqual(currencyFor({ account: null, kept: undefined, language: "en-US" }), { currency: "USD", decided: true });
  // A tag with no country is a guess, and the browser's own tag may carry one: the screens are told it was a guess.
  assert.deepEqual(currencyFor({ account: null, kept: undefined, language: "fr" }), { currency: "USD", decided: false });
  assert.deepEqual(currencyFor({ account: null, kept: undefined, language: undefined }), { currency: "USD", decided: false });
  assert.deepEqual(currencyFor({ account: null, kept: "nonsense", language: "fr-FR" }), { currency: "EUR", decided: true }, "a cookie nobody wrote is ignored");
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
