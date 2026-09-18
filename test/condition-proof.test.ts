import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONDITION_PROOFS, conditionsWithProof, proofOfCondition } from "../src/condition-proof";
import { CONDITIONS, liveConditions } from "../src/conditions";

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
  const fund = readFileSync("app/components/FundGift.tsx", "utf8");
  assert.doesNotMatch(fund, /note: proofOfCondition/, "nothing repeats the register's line beside it");
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
  // Exactly one condition is watched today, and a second one appearing silently is what this catches.
  assert.deepEqual(
    CONDITION_PROOFS.filter((proof) => proof.supervised).map((proof) => proof.conditionId),
    ["duolingo-english-test"],
  );
});
