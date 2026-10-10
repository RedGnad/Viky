import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { faceValue, namedInPlural } from "../src/currencies";
import { articleFor, GIFT_CARD_OUT, MOBILE_OUT, PHONE_OUT } from "../src/sentences";

/**
 * Spending from the balance: one rule for the gift card, the phone top-up and mobile money (the founder, 10 Oct 2026,
 * on a mockup, after the first real tester). One currency for the account's money, the one the person reads in; the
 * price asked the moment the choice is whole, and shown in place; one way to choose at a time; one button, with what
 * did not happen said under it; the fees said once, in the sentence under the total.
 *
 * The screens are walked in a browser (test/browser/spend-from-the-balance.spec.ts). This holds the sentences, and
 * that each screen is built on the one piece that keeps the rule.
 */
const read = (file: string) => readFileSync(file, "utf8");
const kit = read("app/kit/SpendChoice.tsx");
const card = read("app/components/GiftCardOut.tsx");
const phone = read("app/components/PhoneTopUp.tsx");
const mobile = read("app/components/MobileMoneyOut.tsx");
const out = read("app/components/CashOut.tsx");

test("a face value is printed as the thing bought prints it, and an amount is asked in its currency's own name", () => {
  assert.deepEqual([faceValue(10, "EUR"), faceValue(7.5, "USD"), faceValue(20, "GBP"), faceValue(5000, "XOF")], ["€10", "$7.50", "£20", "5 000 FCFA"]);
  assert.deepEqual([namedInPlural("EUR"), namedInPlural("USD"), namedInPlural("XOF"), namedInPlural("XAF")], ["euros", "US dollars", "CFA francs", "CFA francs"]);
  // "A" or "An", by the way the number is said.
  assert.deepEqual(["€8", "€10", "€11", "€18", "€80", "€100", "€118", "€1,100", "11 000 FCFA", "5 000 FCFA", "$8.50"].map(articleFor), ["An", "A", "An", "An", "An", "A", "A", "A", "An", "A", "An"]);
});

test("the fees are said once, in the sentence under the total, with what stays", () => {
  assert.equal(GIFT_CARD_OUT.total("€10", "Amazon.fr", "€4.71", "€0.31"), "A €10 Amazon.fr card and €0.31 of fees. €4.71 stays with you.");
  assert.equal(GIFT_CARD_OUT.total("€8", "Nike France", "€4.71"), "An €8 Nike France card. €4.71 stays with you.");
  assert.equal(GIFT_CARD_OUT.card("€10", "Amazon.fr"), "A €10 Amazon.fr card");
  assert.equal(PHONE_OUT.total("€10", PHONE_OUT.kindsInASentence.credit, "Orange", "€4.74", "€0.28"), "€10 of credit on the phone, through Orange, and €0.28 of fees. €4.74 stays with you.");
  assert.equal(PHONE_OUT.total("5 000 FCFA", PHONE_OUT.kindsInASentence.data, "Orange", "€4.74"), "5 000 FCFA of mobile data on the phone, through Orange. €4.74 stays with you.");
  assert.equal(MOBILE_OUT.fromBalance("€13.80", "3 Oct, 10:15", "€1.22"), "€13.80 from your balance, at the rate of 3 Oct, 10:15. €1.22 stays with you.");
  // The amount asked, and its bounds, in the thing's own currency by its name and its sign.
  assert.equal(GIFT_CARD_OUT.howMuch("euros"), "How much, in euros");
  assert.equal(GIFT_CARD_OUT.range("€5", "€500"), "Between €5 and €500.");
  assert.equal(PHONE_OUT.another, "Another amount");
  assert.equal(GIFT_CARD_OUT.another, "Another amount");
});

test("the price is no press any more, and no sentence says dollars of its own", () => {
  const sentences = read("src/sentences.ts");
  assert.doesNotMatch(sentences, /See the price/);
  for (const words of [GIFT_CARD_OUT, PHONE_OUT] as const) {
    assert.equal("getPrice" in words, false);
    assert.equal("costs" in words, false);
    assert.equal("aboutDollars" in words, false);
    assert.deepEqual([words.confirm, words.confirming].map((word) => typeof word), ["string", "string"]);
  }
  assert.deepEqual([GIFT_CARD_OUT.confirm, GIFT_CARD_OUT.confirming, PHONE_OUT.confirm, PHONE_OUT.confirming], ["Buy the card", "Buying the card", "Top it up", "Topping it up"]);
  // The three screens say the account's money through what they are given, the currency the person reads in: none
  // of them writes a dollar sign itself.
  for (const [name, screen] of [["the gift card", card], ["the phone", phone], ["mobile money", mobile]] as const) {
    assert.doesNotMatch(screen, /twoDecimalsDown|function dollars|dollarsOf|`\$\$\{/, name);
    assert.match(screen, /say: \(units: bigint\) => string/, name);
  }
  // Said by the balance's own figure, so what stays is what the balance reads after: a dollar is cut to the cent.
  assert.match(out, /const heldLed = \(\): LedAmount => money\.led\(dollarsHeld\);/);
  assert.match(out, /const sayHeld = \(units: bigint\): string => money\.led\(units\)\.lead;/);
  assert.match(out, /<GiftCardOut country=\{countryNow\} rates=\{money\.rates\} say=\{sayHeld\} /);
  assert.match(out, /<PhoneTopUp rates=\{money\.rates\} say=\{sayHeld\} /);
  assert.match(out, /<MobileMoneyOut offer=\{mobileOffered\} payable=\{mobilePayable\} held=\{ausd\} say=\{sayHeld\} /);
  // An amount that came back is said the same way: the order tells its units, and the screen says them.
  assert.match(read("src/phone-order.ts"), /amount: dollars\(order\.ausdUnits\), units: order\.ausdUnits\.toString\(\),/);
  for (const screen of [card, phone]) assert.match(screen, /const took = status\.units \? props\.say\(BigInt\(status\.units\)\) : status\.amount;/);
});

test("the gift card and the phone are built on the one piece that keeps the rule", () => {
  for (const screen of [card, phone]) {
    assert.match(screen, /<SpendChoice\n/);
    assert.doesNotMatch(screen, /<Button doing=\{busy \? W\.(confirming|pricing)/);
    assert.match(screen, /refused=\{refused\}/);
  }
  // One way to choose at a time: the fixed amounts are buttons, the field stands behind "Another amount", or alone.
  assert.match(kit, /const \[typing, setTyping\] = useState\(packages\.length === 0\);/);
  assert.match(kit, /\{typing && range \? \(\n\s+<label /);
  assert.match(kit, /\{words\.another\}/);
  // The price is asked the moment the choice is whole: at the press of an amount, and once the typing is over.
  assert.match(kit, /setPackageId\(one\.id\);\n\s+setTyping\(false\);\n\s+setTyped\(""\);\n\s+void priceOf\(\{ packageId: one\.id \}\);/);
  assert.match(kit, /const timer = window\.setTimeout\(\(\) => void priceOf\(\{ value \}\), TYPED_SETTLES_MS\);/);
  assert.match(kit, /export const TYPED_SETTLES_MS = 700;/);
  // An answer to a choice since changed is dropped.
  assert.match(kit, /if \(turn\.current === mine\) setPrice\(answered\);/);
  // One currency: the total and what stays through `say`, the face values in the thing's own.
  assert.match(kit, /<p className=\{CARD_AMOUNT\}>\{say\(price\.ausdUnits\)\}<\/p>/);
  assert.match(kit, /total\(price, say\(held > price\.ausdUnits \? held - price\.ausdUnits : 0n\), price\.feeUnits > 0n \? say\(price\.feeUnits\) : undefined\)/);
  assert.match(kit, /\{faceValue\(Number\(one\.value\), currency\)\}/);
  // One button, and what did not happen under it. A price that ran out is asked again at once, the refusal kept.
  assert.match(kit, /<Button doing=\{paying \? words\.confirming : null\} waiting=\{!price \|\| asking\} failed=\{failed\} failedId="spend-refused"/);
  assert.match(kit, /if \(error instanceof ApiError && error\.code === "PRICE_EXPIRED" && chosen\) void priceOf\(chosen, true\);/);
  // Mobile money already asked its price by itself: it says what did not happen under its button too.
  assert.match(mobile, /<Button doing=\{busy \? doing : null\} failed=\{problem\} failedId="mobile-refused"/);
});
