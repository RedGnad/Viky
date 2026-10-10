// A call that fails once a card payment is waited for, or has just arrived (the founder, 5 Oct 2026). A tester paid,
// read "something went wrong", left the page, and found the payment again from Home. Ours could have been the
// sentence: "Something went wrong. Nothing was changed." is what any call answers when it has nothing better, and
// after a payment "Nothing was changed" may be false. These hold what the screens do and say instead.

import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import test from "node:test";
import { accountError } from "../src/account/errors";
import { afterPaying, refusalAfterPaying, unansweredAfterPaying } from "../src/after-paying";
import { ApiError } from "../src/client/api";
import { GENERIC_FAILURE } from "../src/generic-failure";
import { forgetsAttempt } from "../src/gift-attempt";
import { FUND, PAY } from "../src/sentences";

const api = (status: number, code: string, message: string) => new ApiError({ status, code, message });
const NOT_ANSWERED = FUND.arrived.notAnswered;

test("the generic sentence has one home, and both sides that say it take it from there", () => {
  assert.equal(GENERIC_FAILURE, "Something went wrong. Nothing was changed.");
  const written = globSync(["src/**/*.ts", "src/**/*.tsx", "app/**/*.ts", "app/**/*.tsx"]).filter((file) => readFileSync(file, "utf8").includes(`"${GENERIC_FAILURE}"`));
  assert.deepEqual(written, ["src/generic-failure.ts"]);
  assert.match(readFileSync("src/client/api.ts", "utf8"), /message: failure\.error \?\? GENERIC_FAILURE,/);
  assert.match(readFileSync("src/gift-api.ts", "utf8"), /NextResponse\.json\(\{ error: GENERIC_FAILURE, code: "FAILED" \}, \{ status: 500/);
});

test("unanswered: the server's own error, an answer with no sentence, a creation not final yet, the network", () => {
  for (const failure of [
    api(500, "FAILED", GENERIC_FAILURE),
    // A platform's own page for a route that ran out of time carries no sentence and no code.
    api(504, "FAILED", GENERIC_FAILURE),
    // A route's sentence with no code is still an answer that names nothing.
    api(502, "FAILED", "The price is not answering"),
    // A code with nothing said: the browser put the generic sentence in its place.
    api(401, "SIGN_IN_REQUIRED", GENERIC_FAILURE),
    api(504, "NOT_FINAL_YET", "This is taking longer than usual. Give it a minute, then look again before you try once more."),
    new TypeError("Failed to fetch"),
    new TypeError("Load failed"),
    new TypeError("NetworkError when attempting to fetch resource."),
  ]) {
    assert.equal(unansweredAfterPaying(failure), true, String(failure));
    assert.deepEqual(afterPaying(failure, NOT_ANSWERED), { keep: true, says: NOT_ANSWERED });
  }
  // A refusal answered. So did the passkey, a guard of the page, and a mistake of ours, which is no network's.
  for (const answered of [api(409, "STANDING_MOVED", "Their rating moved."), api(429, "RATE_LIMITED", "Too many."), accountError("PASSKEY_CANCELLED"), new Error("anything"), new TypeError("x is not a function"), null, undefined, "text"]) {
    assert.equal(unansweredAfterPaying(answered), false, String(answered));
  }
});

test("a gift being made keeps the screen too, with the server's own sentence; a gift already made does not", () => {
  const beingMade = api(409, "IN_PROGRESS", "This gift is being made. Give it a minute, then look in your gifts.");
  assert.deepEqual(afterPaying(beingMade, NOT_ANSWERED), { keep: true, says: beingMade.message });
  const recorded = api(409, "BEING_RECORDED", "The money for this gift has moved and the gift is being recorded. It will be in your gifts shortly.");
  assert.deepEqual(afterPaying(recorded, NOT_ANSWERED), { keep: true, says: recorded.message });
  for (const refusal of [api(409, "ALREADY_MADE", "This gift is already made. It is in your gifts."), api(409, "STANDING_MOVED", "Their rating moved."), accountError("PASSKEY_CANCELLED"), new Error("a guard")]) {
    assert.deepEqual(afterPaying(refusal, NOT_ANSWERED), { keep: false }, String(refusal));
  }
});

test("a refusal says the route's sentence, the passkey's, or one true of money in the account; never the generic one", () => {
  const otherwise = FUND.failures.notMade;
  assert.equal(refusalAfterPaying(api(409, "STANDING_MOVED", "Their rating moved."), otherwise), "Their rating moved.");
  assert.equal(refusalAfterPaying(accountError("PASSKEY_CANCELLED"), otherwise), accountError("PASSKEY_CANCELLED").guidance);
  assert.equal(refusalAfterPaying(new Error("a library's own words"), otherwise), otherwise);
  for (const failure of [api(500, "FAILED", GENERIC_FAILURE), api(401, "SIGN_IN_REQUIRED", GENERIC_FAILURE)]) assert.notEqual(refusalAfterPaying(failure, otherwise), GENERIC_FAILURE);
  // "Nothing was taken" is not said of somebody whose card was.
  assert.equal(otherwise, "The gift was not made. Your money is in your account.");
  assert.doesNotMatch(otherwise, /nothing was (taken|changed)/i);
});

test("what is said is what is known: the check did not answer, the payment is not lost, the wait goes on", () => {
  assert.equal(NOT_ANSWERED, "The check did not answer. Your payment is not lost, and the wait goes on.");
  assert.ok(NOT_ANSWERED.length <= 90);
  assert.doesNotMatch(NOT_ANSWERED, /nothing was (taken|changed)|went wrong|try again/i);
  assert.equal(PAY.rampnow.foundAgain, "If this window shows an error, your payment is found again from Home.");
  assert.ok(PAY.rampnow.foundAgain.length <= 90);
});

test("a creation whose answer says nothing of what it did keeps its signed request: sent again, never signed anew", () => {
  for (const code of ["FAILED", "NOT_FINAL_YET", "IN_PROGRESS", "BEING_RECORDED"]) assert.equal(forgetsAttempt(code), false, code);
  // A request the server answered about is ended by a refusal of its terms, and by the gift it already made.
  for (const code of ["ALREADY_MADE", "TERMS_MISMATCH", "INVALID_AMOUNT"]) assert.equal(forgetsAttempt(code), true, code);
});

test("the screen that waits: a call that fails after the money arrived keeps the screen and asks again", () => {
  const screen = readFileSync("app/components/PayGift.tsx", "utf8");
  // Never the route's sentence as it comes: every failure of the watch goes through the rule.
  assert.doesNotMatch(screen, /error\.message/);
  assert.match(screen, /function readable\(error: unknown\): string \{\n\s*return refusalAfterPaying\(error, W\.failures\.notMade\);\n\}/);
  // The creation: kept and asked again when it did not answer, after a pause; a refusal is said once.
  assert.match(screen, /const after = afterPaying\(error, W\.arrived\.notAnswered\);\n\s*if \(after\.keep\) \{[\s\S]{0,400}awaitingCreation\.current = true;\n\s*unansweredAtMs\.current = Date\.now\(\);\n\s*setAsksAgain\(after\.says\);/);
  assert.match(screen, /if \(awaitingCreation\.current\) \{\n\s*if \(!pausedAfterFailure\(unansweredAtMs\.current, Date\.now\(\)\)\) await make\(\);\n\s*return;\n\s*\}\n(\s*\/\/[^\n]*\n)+\s*if \(!sentKept\.current\) \{[\s\S]{0,220}?\n\s*\}\n\s*const read = await refresh\(\);/, "asked again before the account is read: the money may have gone into the gift");
  // The two changes: the screen stays on the change, and never goes back to the one that offers to pay.
  const watch = screen.slice(screen.indexOf('if (next.do === "convertUsdc")'), screen.indexOf("void look();"));
  assert.doesNotMatch(watch, /setPhase\("waiting"\)/);
  assert.equal(watch.match(/const after = afterPaying\(error, W\.arrived\.notAnswered\);/g)?.length, 2);
  // What is known is said under the ring.
  assert.match(screen, /\{asksAgain \? \(\n\s*<p className=\{`\$\{BODY\} text-center`\} role="status" data-asks-again="">/);
  // A gift already made leads to the gifts, never to making it again.
  assert.match(screen, /\{problemCode === "ALREADY_MADE" \? \([\s\S]{0,400}<Link\n\s*href="\/gifts"/);
});

test("under the frame, from the moment a payment was started: where it is found again, whatever the frame shows", () => {
  const frame = readFileSync("app/kit/offer/RampnowSheet.tsx", "utf8");
  assert.match(frame, /\{started \? \(\n\s*<p className=\{HELP\} data-rampnow-found-again="">\n\s*\{W\.rampnow\.foundAgain\}/);
  assert.match(readFileSync("app/components/PayGift.tsx", "utf8"), /started=\{rampnowPending !== null\}/);
  // The judge's code, asked on these same screens, says its own sentence for a call that did not answer.
  assert.match(readFileSync("app/kit/offer/JudgeCode.tsx", "utf8"), /refusalAfterPaying\(error, W\.code\.failed\)/);
});
