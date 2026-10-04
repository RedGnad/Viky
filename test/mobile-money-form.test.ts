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
  // The amount, in the country's money: missing, under the least, over the most.
  assert.equal(MOBILE_OUT.amountMissing, "Write how much, in figures.");
  assert.equal(MOBILE_OUT.amountUnder("5 872 F"), "At least 5 872 F at a time.");
  assert.equal(MOBILE_OUT.amountOver("8 806 F"), "At most 8 806 F at a time.");
  // The button is pressable while nothing is under way, and a press with a field missing asks nothing of the passkey.
  assert.match(form, /<button type="button" onClick=\{\(\) => void send\(\)\} disabled=\{busy\} className=\{PRIMARY_BUTTON\}>/);
  assert.doesNotMatch(form, /disabled=\{!ready\}/);
  assert.match(form, /setPressed\(true\);\n\s*if \(!network \|\| !numberFits \|\| !holderFits \|\| !within\) return;\n\s*if \(!price \|\| price === "unpriced"\) return;\n\s*let account: LocalAccount;/);
  // Each refusal is the kit's, with its mark and the page's own ink: no red.
  assert.equal(form.match(/<FieldRefusal id="mobile-/g)?.length, 4);
  assert.doesNotMatch(form, /limit-refused|text-\[var\(--danger/);
});

test("a balance under the country's smallest payout is said in place of the form, and the card says the minimum first", () => {
  assert.equal(MOBILE_OUT.underMinimum("5 872 F", "293 F"), "Mobile money pays from 5 872 F at a time here, and you have 293 F.");
  assert.match(form, /if \(mostLocal < leastLocal\) \{\n\s*return \(\n\s*<section className=\{CARD\}>\n\s*<h2 className=\{TITLE\}>\{W\.title\}<\/h2>\n\s*<p className=\{BODY\} data-mobile-under-minimum>/);
  assert.ok(form.indexOf("if (dayReached) {") < form.indexOf("if (mostLocal < leastLocal) {"), "the day's ceiling is said first");
  // A bound that must be reached is raised, and what the person has is cut down: neither says more than is true.
  assert.equal(localOfUnits(10_000_000n, 587.1333, "up"), 5872);
  assert.equal(localOfUnits(500_000n, 587.1333, "down"), 293);
  assert.equal(USE_MONEY.mobileFrom("5 872 F"), "From 5 872 F at a time.");
  assert.match(readFileSync("app/components/CashOut.tsx", "utf8"), /\{use === "mobile" && mobileOffered \? <p className=\{HELP\} data-mobile-from>\{U\.mobileFrom\(localInWords\(localOfUnits\(BigInt\(mobileOffered\.minimumUnits\), mobileOffered\.rate, "up"\), mobileOffered\.currency\)\)\}<\/p> : null\}/);
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
