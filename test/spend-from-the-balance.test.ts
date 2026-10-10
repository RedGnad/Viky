import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { faceValue, namedInPlural } from "../src/currencies";
import { amountAsShown, leftAsShown, overFaceAsShown, spendMoney } from "../src/display-currency";
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
  assert.equal(MOBILE_OUT.fromBalance("€13.80", "€1.22"), "€13.80 from your balance. €1.22 stays with you.");
  assert.equal(MOBILE_OUT.staysWithYou("19 FCFA"), "19 FCFA stays with you.");
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
    assert.match(screen, /money: SpendMoney;/, name);
  }
  // Said from the balance the card above shows: an amount as that balance says its own, and what stays worked out
  // on the two figures as they are shown.
  assert.match(out, /const heldLed = \(\): LedAmount => money\.led\(dollarsHeld\);/);
  assert.match(out, /const spending = spendMoney\(dollarsHeld, money\.currency, money\.rates\);/);
  assert.match(out, /<GiftCardOut country=\{countryNow\} rates=\{money\.rates\} money=\{spending\} /);
  assert.match(out, /<PhoneTopUp rates=\{money\.rates\} money=\{spending\} /);
  assert.match(out, /<MobileMoneyOut offer=\{mobileOffered\} payable=\{mobilePayable\} money=\{spending\} /);
  // An amount that came back is said the same way: the order tells its units, and the screen says them.
  assert.match(read("src/phone-order.ts"), /amount: dollars\(order\.ausdUnits\), units: order\.ausdUnits\.toString\(\),/);
  for (const screen of [card, phone]) assert.match(screen, /const took = status\.units \? props\.money\.say\(BigInt\(status\.units\)\) : status\.amount;/);
});

test("the figures of a screen add up as they are shown: what stays is the balance shown less the amount shown", () => {
  const rates = { date: "2026-10-09", usdPerEur: 1.1355, eurPerUsd: 1 / 1.1355, xofPerUsd: 655.957 / 1.1355, eurPer: { USD: 1.1355, EUR: 1, XOF: 655.957 }, readAtMs: 0 };
  // Read in dollars, each figure is cut to the cent. $14.968406 leaves $15.00: the two cut figures used to read
  // $14.96 and $0.03, a cent under the balance beside them (the founder, 10 Oct 2026).
  const dollars = spendMoney(15_000_000n, "USD", rates);
  assert.deepEqual([dollars.say(15_000_000n), dollars.say(14_968_406n), dollars.stays(14_968_406n)], ["$15.00", "$14.96", "$0.04"]);
  assert.deepEqual(dollars.shown(14_968_406n), { text: "$14.96", pieces: 1496, code: "USD" });
  // With no rate the franc is not read: the dollar is, and it says so by its code.
  assert.equal(spendMoney(15_000_000n, "XOF", undefined).shown(1n).code, "USD");
  // Read in euros: 17.36 dollars are €15.29, a card that takes 12.052 of them is €10.61, and €4.68 stays.
  const euros = spendMoney(17_360_000n, "EUR", rates);
  assert.deepEqual([euros.say(17_360_000n), euros.say(12_052_000n), euros.stays(12_052_000n)], ["€15.29", "€10.61", "€4.68"]);
  assert.deepEqual(euros.shown(12_052_000n), { text: "€10.61", pieces: 1061, code: "EUR" });
  // Read in francs, which have no smaller piece: 8 665 less 8 647.
  const francs = spendMoney(15_000_000n, "XOF", rates);
  assert.deepEqual([francs.shown(15_000_000n).pieces, francs.shown(14_968_406n).pieces, francs.stays(14_968_406n).replace(/\s/g, " ")], [8665, 8647, "18 FCFA"]);
  // Never under nothing.
  assert.equal(dollars.stays(20_000_000n), "$0.00");
  assert.equal(leftAsShown(amountAsShown(1_000_000n, "EUR", rates), amountAsShown(2_000_000n, "EUR", rates)), "€0.00");
  // The fees a sentence names beside a face value in the currency the total is shown in: what the total is over it.
  // The price's own fee is the transfer's alone (0.352 dollars, €0.31): the rate the card was changed at is the rest.
  assert.equal(overFaceAsShown(euros.shown(12_052_000n), 10, "EUR"), "€0.61");
  assert.equal(overFaceAsShown(euros.shown(11_300_000n), 10, "EUR"), null, "nothing is over: no fee is said");
  assert.equal(overFaceAsShown(euros.shown(12_052_000n), 10, "USD"), undefined, "another currency: no sum crosses");
  assert.equal(overFaceAsShown(dollars.shown(10_352_000n), 10, "USD"), "$0.35");
  assert.match(kit, /const over = overFaceAsShown\(money\.shown\(priced\.ausdUnits\), Number\(priced\.localAmount\), priced\.localCurrency\);\n\s+if \(over !== undefined\) return over \?\? undefined;\n\s+return priced\.feeUnits > 0n \? money\.say\(priced\.feeUnits\) : undefined;/);
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
  assert.match(kit, /<p className=\{CARD_AMOUNT\}>\{money\.say\(price\.ausdUnits\)\}<\/p>/);
  assert.match(kit, /total\(price, money\.stays\(price\.ausdUnits\), feesOf\(price\)\)/);
  assert.match(kit, /\{faceValue\(Number\(one\.value\), currency\)\}/);
  // One button, and what did not happen under it. A price that ran out is asked again at once, the refusal kept.
  assert.match(kit, /<Button doing=\{paying \? words\.confirming : null\} waiting=\{!price \|\| asking\} failed=\{failed\} failedId="spend-refused"/);
  assert.match(kit, /if \(error instanceof ApiError && error\.code === "PRICE_EXPIRED" && chosen\) void priceOf\(chosen, true\);/);
  // Mobile money already asked its price by itself: it says what did not happen under its button too.
  assert.match(mobile, /<Button doing=\{busy \? doing : null\} failed=\{problem\} failedId="mobile-refused"/);
});
