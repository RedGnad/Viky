import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { waitsForResults } from "../src/condition-proof";
import { GIFT_LIVE, SHOW_PROOF } from "../src/sentences";

/**
 * A gift on a year's results waits (the founder's mockup of 10 Oct 2026). The page offered "Show it" the day the gift
 * was opened, while the year's results did not exist yet: a student pressed, waited ten minutes, read a refusal, and
 * one of the month's proofs was spent on last year's page. Now the card says the wait, the one press says what it
 * takes for granted, and only the two results conditions change: enrolment can be shown the day the gift is opened.
 *
 * The screens are walked in a browser (test/browser/results-gift-waits.spec.ts). This holds the words, which
 * conditions wait, and that the page is wired as the mockup draws it, with the block itself unchanged.
 */

test("only the two results conditions wait, and the words are the mockup's", () => {
  assert.deepEqual(["university-year-passed-shown", "university-grade-shown"].map(waitsForResults), [true, true]);
  assert.deepEqual(["university-enrollment-shown", "toefl-mybest-shown", "duolingo-daily", "marathon-finish", "nothing"].map(waitsForResults), [false, false, false, false, false]);
  assert.equal(GIFT_LIVE.awaitingProof.resultsYours, "Waiting for your results.");
  assert.equal(GIFT_LIVE.awaitingProof.resultsTheirs, "Waiting for their results.");
  assert.equal(GIFT_LIVE.awaitingProof.resultsNextYours, "This gift is for the year under way. Your university publishes its results at the end of the year: show them here that day.");
  assert.equal(SHOW_PROOF.resultsOut, "My results are out");
  assert.equal(SHOW_PROOF.notYet, "Not yet");
});

test("the page says the wait before it offers to show anything, one press opens today's block unchanged, and nothing else moves", () => {
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  // Which gifts wait, and until when: a press by the person it is for, or something of a proof already standing.
  assert.match(page, /const resultsGift = Boolean\(milestone && waitsForResults\(milestone\.conditionId\)\);/);
  assert.match(page, /const \[resultsOut, setResultsOut\] = useState\(\(\) => Boolean\(openProof\) \|\| proofReview !== null\);/, "a session open when the page was read, or a proof under review or refused, is past the wait");
  assert.match(page, /const resultsWait = resultsGift && proofStands === null && \(!mine \|\| !resultsOut\);/, "the funder reads the wait as long as no proof stands");
  assert.match(page, /waitsForResults: resultsWait,/, "the card's headline follows");
  // The one press, in the secondary look, where the block stood; the block, with "Not yet" under it, once pressed.
  assert.match(page, /if \(showsProof && mine && resultsWait\) \{\n\s+return \(\n\s+<button type="button" onClick=\{\(\) => setResultsOut\(true\)\} className=\{SECONDARY_BUTTON\} data-results-out="">\n\s+\{SHOW_PROOF\.resultsOut\}/);
  assert.match(page, /<ShowProof giftId=\{giftId\} conditionId=\{milestone\.conditionId\} yours=\{mine\} review=\{proofReview\} reviewMessage=\{milestone\.review\?\.message \?\? null\} limitReached=\{emptyReserve === "proofs"\} openAtLoad=\{openProof\} onChecking=\{setProofSilent\} onShown=\{reloadAll\} \/>\n\s+\{resultsGift && mine && !checkingTheirOwn && !proofReview \? \(\n\s+<button type="button" onClick=\{\(\) => setResultsOut\(false\)\} className=\{`\$\{SMALL_BUTTON\} self-start`\} data-results-not-yet="">\n\s+\{SHOW_PROOF\.notYet\}/);
  // The block is today's, unchanged: it knows nothing of the wait.
  assert.doesNotMatch(readFileSync("app/kit/ShowProof.tsx", "utf8"), /resultsOut|notYet|waitsForResults/);
  // Nothing touches the creation, the terms or the settlement.
  for (const file of ["app/api/gift/certificate/create/route.ts", "src/milestone-protocol.ts", "src/shown-verification.ts", "src/milestone-pass.ts"]) assert.doesNotMatch(readFileSync(file, "utf8"), /waitsForResults|resultsOut/, file);
});
