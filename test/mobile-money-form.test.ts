import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localOfUnits, MOBILE_REFUSALS } from "../src/mobile-money";
import { MOBILE_OUT, USE_MONEY } from "../src/sentences";

/**
 * The mobile money form answers every press (the founder, 4 Oct 2026). Before, an operator not chosen, a number or a
 * name off Switch's rule and an amount out of bounds all left a button that was only grey, with no sentence; and a
 * balance under the country's minimum opened an empty field between two bounds the wrong way round.
 */
const form = readFileSync("app/components/MobileMoneyOut.tsx", "utf8");

test("a press says under each field what it is missing, in the sentences the route refuses with", () => {
  assert.equal(MOBILE_REFUSALS.chooseOperator, "Choose your operator from the list.");
  assert.equal(MOBILE_REFUSALS.numberNotTaken, "That number is not one this operator takes. Digits only, as your operator gives it.");
  assert.equal(MOBILE_REFUSALS.writeTheName, "Write the name on the account, as your operator has it.");
  // One place says them: the screen and the server never say two things.
  const server = readFileSync("src/mobile-money-server.ts", "utf8");
  for (const name of ["chooseOperator", "numberNotTaken", "writeTheName"]) {
    assert.ok(server.includes(`MOBILE_REFUSALS.${name}, 400)`), `the route refuses with ${name}`);
    assert.ok(form.includes(`MOBILE_REFUSALS.${name}`), `the form says ${name}`);
  }
  // A field left empty is asked for (the founder, 5 Oct 2026): "That number is not one this operator takes" spoke of
  // a number nobody had written. The route's sentences stay for a field filled in and refused.
  assert.equal(MOBILE_REFUSALS.enterNumber, "Enter your number.");
  assert.equal(MOBILE_REFUSALS.enterName, "Enter the name on the account.");
  assert.match(form, /number: pressed && !numberFits \? \(number\.trim\(\) === "" \? MOBILE_REFUSALS\.enterNumber : MOBILE_REFUSALS\.numberNotTaken\) : null,/);
  assert.match(form, /holder: pressed && !holderFits \? \(holder\.trim\(\) === "" \? MOBILE_REFUSALS\.enterName : MOBILE_REFUSALS\.writeTheName\) : null,/);
  // The amount, in the country's money: missing, under the least, over the most.
  assert.equal(MOBILE_OUT.amountMissing, "Write how much, in figures.");
  assert.equal(MOBILE_OUT.amountUnder("5 872 F"), "At least 5 872 F at a time.");
  assert.equal(MOBILE_OUT.amountOver("8 806 F"), "At most 8 806 F at a time.");
  // The button is pressable while nothing is under way, and a press with a field missing asks nothing of the passkey.
  // What did not happen is said under the button, as on the two other screens that spend the balance (10 Oct 2026).
  assert.match(form, /<Button doing=\{busy \? doing : null\} failed=\{problem\} failedId="mobile-refused" onPress=\{\(\) => void send\(\)\}>/);
  assert.doesNotMatch(form, /role="alert"/);
  assert.doesNotMatch(form, /disabled=\{!ready\}/);
  assert.match(form, /setPressed\(true\);\n\s*if \(!network \|\| !numberFits \|\| !holderFits \|\| \(!changed && \(!within \|\| local === null\)\)\) return;/);
  // A press with no price yet, or after one that failed, asks for the price and goes on (the founder, 5 Oct 2026):
  // it used to return, and the button did nothing under "It cannot be priced right now".
  assert.match(form, /if \(!changed && \(!priced \|\| "problem" in priced\) && local !== null\) \{\n\s*setStep\("pricing"\);\n\s*setPrice\(null\);\n\s*priced = await priceOf\(local, spend\);/);
  assert.doesNotMatch(form, /unpriced|cannot be priced/);
  assert.doesNotMatch(readFileSync("src/sentences.ts", "utf8"), /cannot be priced/);
  // Each refusal is the kit's, with its mark and the page's own ink: no red.
  assert.equal(form.match(/<FieldRefusal id="mobile-/g)?.length, 4);
  assert.doesNotMatch(form, /limit-refused|text-\[var\(--danger/);
});

test("a balance under the country's smallest payout is said in place of the form, and the card says the minimum first", () => {
  assert.equal(MOBILE_OUT.underMinimum("5 872 F", "293 F"), "Mobile money pays from 5 872 F at a time here, and you have 293 F.");
  assert.match(form, /if \(!changed && mostLocal < leastLocal\) \{\n\s*return \(\n\s*<section className=\{CARD\}>\n\s*<h2 className=\{TITLE\}>\{W\.title\}<\/h2>\n\s*<p className=\{BODY\} data-mobile-under-minimum>/);
  assert.ok(form.indexOf("if (dayReached && !changed) {") < form.indexOf("if (!changed && mostLocal < leastLocal) {"), "the day's ceiling is said first");
  // What the person has is what the balance sends, the cost of changing it included, never the balance at a rate.
  assert.match(form, /W\.underMinimum\(localInWords\(leastLocal, offer\.currency\), localInWords\(mostLocal, offer\.currency\)\)/);
  // A bound that must be reached is raised, and what the person has is cut down: neither says more than is true.
  assert.equal(localOfUnits(10_000_000n, 587.1333, "up"), 5872);
  assert.equal(localOfUnits(500_000n, 587.1333, "down"), 293);
  assert.equal(USE_MONEY.mobileFrom("5 872 F"), "From 5 872 F at a time.");
  // The card's minimum is the one the form opens on: both are the offer's, priced by a quote.
  assert.match(readFileSync("app/components/CashOut.tsx", "utf8"), /\{use === "mobile" && mobileOffered \? <p className=\{HELP\} data-mobile-from>\{U\.mobileFrom\(localInWords\(mobileOffered\.leastLocal, mobileOffered\.currency\)\)\}<\/p> : null\}/);
});

test("a number typed with the country's prefix: only the digits are kept, and they pass the rule Switch publishes", () => {
  // Read on 4 Oct 2026 from GET /beneficiary/requirement for Côte d'Ivoire, Senegal, Ghana and Kenya: the number's rule
  // is the same, nine to forty digits, with the example "08123456789" and the hint "Must be 9 to 40 digits long mobile
  // number". Switch's guides show a national number for Ghana ("0555927608") and one with the country's code for Kenya
  // ("254712345678"), and say nothing for Côte d'Ivoire: which form reaches a phone there is not published.
  const rule = /^[0-9]{9,40}$/;
  assert.equal(rule.test("+225 07 12 34 56 78".replace(/\D/g, "")), true);
  assert.equal(rule.test("0712345678"), true);
  assert.match(form, /const digits = number\.replace\(\/\\D\/g, ""\);/, "the plus and the spaces are taken off before the rule is tested");
});

test("the way out is said in the person's words: no exchange, no network, no Switch's rate, and no hour of a rate", () => {
  // Every sentence of the way out, with something in each of its blanks.
  const filled = (sentence: (...blanks: never[]) => unknown): string => {
    try {
      return String((sentence as (...blanks: string[]) => unknown)("8 800 F", "19 F", "5 to 10 minutes"));
    } catch {
      // The one that counts dollars already sent today takes them as an amount.
      return String((sentence as (used: bigint) => unknown)(450_000_000n));
    }
  };
  const said = (value: unknown): string[] => (typeof value === "string" ? [value] : typeof value === "function" ? [filled(value as never)] : value && typeof value === "object" ? Object.values(value).flatMap(said) : []);
  const sentences = [...said(MOBILE_OUT), ...said(MOBILE_REFUSALS), ...said(USE_MONEY.mobile), USE_MONEY.mobileLine("Orange or Wave", "5 to 10 minutes"), USE_MONEY.mobileFrom("5 904 F")];
  assert.ok(sentences.length > 30);
  for (const sentence of sentences) assert.doesNotMatch(sentence, /exchange|network|UTC|Switch/i, sentence);
  // The three refusals the founder named (5 Oct 2026), and the line of "How it works".
  assert.equal(MOBILE_REFUSALS.stillChanging, "Your money is still being changed. Try again in a moment.");
  assert.equal(MOBILE_REFUSALS.notChangedHere, "That is not money this account changed. Nothing was sent.");
  assert.equal(MOBILE_REFUSALS.askedForMore, "The mobile money service asked for more than was changed for it. Nothing was sent.");
  assert.equal(USE_MONEY.mobile.cost, "the rate shown before you send");
  // Under the figure that arrives (the founder, 10 Oct 2026). Read in the payout's own currency, what stays, alone:
  // the figure above is the one amount. Read in another, what leaves the balance first. The hour of the rate, which
  // stood in that sentence since 3 Oct, is said nowhere any more.
  assert.equal(MOBILE_OUT.staysWithYou("19 FCFA"), "19 FCFA stays with you.");
  assert.equal(MOBILE_OUT.fromBalance("€13.80", "€1.22"), "€13.80 from your balance. €1.22 stays with you.");
  for (const sentence of sentences) assert.doesNotMatch(sentence, /at the rate of|\d\d:\d\d/, sentence);
  assert.match(form, /props\.money\.shown\(price\.dollars\)\.code === price\.currency \? W\.staysWithYou\(props\.money\.stays\(price\.dollars\)\) : W\.fromBalance\(props\.money\.say\(price\.dollars\), props\.money\.stays\(price\.dollars\)\)/);
  assert.doesNotMatch(form, /dollarsOf|twoDecimalsDown|momentOf|useReaderZone/);
  assert.doesNotMatch(readFileSync("src/mobile-money.ts", "utf8"), /export function momentOf/);
  // The changing step's own silence is said in the way out's words, never in the exchange's.
  assert.match(readFileSync("src/client/mobile-money.ts", "utf8"), /error\.code === "QUOTE_UNAVAILABLE"\) return new ApiError\(\{ status: error\.status, code: error\.code, message: MOBILE_REFUSALS\.notNow \}\);/);
});

test("an amount over what can be sent is said under the field in the country's money, with what holds it", () => {
  assert.equal(MOBILE_OUT.amountOverHeld("8 806 F"), "At most 8 806 F with what you have.");
  assert.match(form, /: over\n\s*\? payable\.by === "balance"\n\s*\? W\.amountOverHeld\(localInWords\(mostLocal, offer\.currency\)\)\n\s*: W\.amountOver\(localInWords\(mostLocal, offer\.currency\)\)/);
  // The amount the field opens on is the most the account can send, read by the server with the cost included.
  assert.match(form, /useState\(\(\) => \(mostLocal >= leastLocal \? String\(mostLocal\) : ""\)\)/);
  assert.match(form, /const mostLocal = payable\.mostLocal;/);
  assert.doesNotMatch(form, /offer\.rate/, "no bound is worked out here from a published rate");
  // Dollars already changed: the card says them in place of the amount, and sends those.
  assert.equal(MOBILE_OUT.fromChanged("$11.20"), "From $11.20 already changed. Nothing more is changed.");
  assert.match(form, /const started = changed \? await sendChangedDollars\(\{ \.\.\.to, exitTx: changed\.exitTx \}\) : await sendToMobileMoney\(/);
});
