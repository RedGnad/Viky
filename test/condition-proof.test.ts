import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONDITION_PROOFS, conditionsWithProof, proofOfCondition, RESULTS_WAIT_FOR_THE_YEAR } from "../src/condition-proof";
import { CONDITIONS, liveConditions } from "../src/conditions";
import { resultsYearProblem } from "../src/university-shown";

/**
 * What each condition proves is part of the register, not a page's decoration: a condition offered to a funder without
 * those four answers would be a condition nobody can judge. These tests fail the day a fifth condition is added and
 * left unanswered, which is the point of them.
 */

test("every condition in the register says what it proves, and nothing says it twice", () => {
  for (const condition of CONDITIONS) {
    const proof = proofOfCondition(condition.id);
    assert.ok(proof, `${condition.id} has no answers`);
    for (const [question, answer] of Object.entries(proof)) {
      // `conditionId` names the condition and `supervised` is a fact, not an answer; the rest are sentences a judge reads.
      if (question === "conditionId" || typeof answer !== "string") continue;
      assert.ok(answer.length > 40, `${condition.id} answers "${question}" in ${answer.length} characters`);
    }
  }
  assert.equal(new Set(CONDITION_PROOFS.map((entry) => entry.conditionId)).size, CONDITION_PROOFS.length);
  assert.equal(conditionsWithProof().length, CONDITIONS.length, "the judges page would silently drop a condition");
});

test("a condition a funder can choose today says, in one line, what is read and what that is worth", () => {
  // Two lines used to sit under each option, the register's and this file's, and they said the same thing twice
  // (founder, 18 Sep 2026). The register's line carries both halves now, and the chooser shows only it.
  for (const condition of liveConditions()) {
    const proof = proofOfCondition(condition.id);
    assert.ok(proof?.inShort, `${condition.id} is offered with no line saying what it proves`);
    assert.ok(proof.inShort.length <= 120, `${condition.id}'s line is too long to read beside an option`);
    assert.ok(condition.help.length <= 160, `${condition.id}'s line is too long to read under an option`);
    assert.match(condition.help, /:/, `${condition.id} must say what is read and what it proves, in one sentence`);
  }
  const sheet = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  assert.doesNotMatch(sheet, /note: proofOfCondition/, "nothing repeats the register's line beside it");
});

test("no answer claims more than the code does, and supervision is claimed only where the source describes it", () => {
  for (const proof of CONDITION_PROOFS) {
    // The rule this file was written with: a reading proves what an account did, never who did it. It held for every
    // condition until one whose source watches the act itself, so the claim now follows the source rather than a
    // blanket sentence, and a condition that says it is watched has to name what the source actually describes (U3).
    if (proof.supervised) {
      assert.doesNotMatch(proof.whoActed, /Unknown/i, `${proof.conditionId} says it is supervised and then says nobody knows`);
      assert.match(proof.whoActed, /identity document|examiner/i, `${proof.conditionId} must name what the source describes`);
      assert.match(proof.sourcePolicing, /invalidate|review/i, `${proof.conditionId} must say what happens when the source finds a cheat`);
    } else {
      assert.match(proof.whoActed, /Unknown/i, `${proof.conditionId} claims to know who acted`);
    }
    assert.doesNotMatch(`${proof.data} ${proof.account} ${proof.inShort}`, /proves who|proves that the person|guarantees/i);
  }
  // Two conditions are watched today: the Duolingo English Test by its proctors, and a WCA competition by its judges,
  // who time and check every attempt in the venue (the founder, 27 Sep 2026). A third one appearing silently is what this catches.
  assert.deepEqual(
    CONDITION_PROOFS.filter((proof) => proof.supervised).map((proof) => proof.conditionId),
    ["duolingo-english-test", "wca-time"],
  );
});

test("the two conditions read on a results page say what they wait for, and no other condition does (the founder, 10 Oct 2026)", () => {
  const sentence = "A year's results are published at its end: a gift made during the year waits for them, and a page of an earlier year does not count.";
  assert.equal(RESULTS_WAIT_FOR_THE_YEAR, sentence);
  const waiting = CONDITION_PROOFS.filter((entry) => entry.waits !== undefined).map((entry) => entry.conditionId).sort();
  assert.deepEqual(waiting, ["university-grade-shown", "university-year-passed-shown"]);
  for (const id of waiting) assert.equal(proofOfCondition(id)?.waits, sentence);
  // The judges page prints it under the condition's name, and writes no such sentence itself.
  const page = readFileSync("app/judges/JudgesConditions.tsx", "utf8");
  assert.match(page, /\{proof\.waits \? \(\s*<p className=\{HELP\} data-condition-waits="">\s*\{proof\.waits\}/);
  assert.doesNotMatch(page, /published at its end/);
  // What makes it true. A page of another year than the provider's row names pays nothing, and a results page is
  // never pinned without its year. The operator's rule, written where the review is described, keeps a pin on the
  // year under way: until that year's results are out there is no pin, and every proof is held and read by hand.
  assert.match(readFileSync("src/university-shown.ts", "utf8"), /function wrongTerm\(results: ResultsExtract, fields: Readonly<Record<string, string>>\): ResultsVerdict \| undefined \{\n  if \(!results\.year\) return undefined;/);
  assert.notEqual(resultsYearProblem(undefined, false), null);
  assert.equal(resultsYearProblem("^2026/2027$", false), null);
  assert.match(readFileSync("docs/VERIFICATION.md", "utf8"), /A results page is pinned\s+on the academic year under way and on no other/);
});
