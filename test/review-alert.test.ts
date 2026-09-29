import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verdictOnly } from "../src/condition-privacy";
import { ALERT_TO, reviewAlert, sendReviewAlert } from "../src/provider-alert";
import { SHOW_PROOF, UNIVERSITY_CHOICE } from "../src/sentences";
import { SHOWN_CONDITIONS } from "../src/shown-conditions";

/**
 * A first proof held for review is checked within an hour (the founder, 29 Sep 2026): the person reads it, and the
 * operator is told by email the moment the proof is held. And the show-it block says what is kept, per condition.
 */

const REVIEW = { sessionId: "session_12345678", portalId: "utoulouse-fr", sense: "enrolment" as const, giftId: "1000042" };

test("a first proof held for review is said to be checked within an hour, and the operator is emailed at once", async () => {
  assert.equal(SHOW_PROOF.held, "First proof from this university: checked within an hour.");
  assert.equal(UNIVERSITY_CHOICE.allLine, "Set up on the first gift, within two days.", "setting a university up still waits on a student");
  const mail = reviewAlert(REVIEW, "Université de Toulouse");
  assert.equal(ALERT_TO, "founder@viky.cash");
  assert.equal(mail.subject, "First proof to review within the hour: Université de Toulouse (utoulouse-fr), enrolment");
  assert.match(mail.text, /gift 1000042/);
  assert.match(mail.text, /pnpm portal:pin session_12345678/);
  assert.doesNotMatch(mail.text, /Inscrit|Enrolled/, "what the page carried stays in the database, for portal:pin alone");
  assert.equal(await sendReviewAlert(REVIEW, null, {}), "not configured", "without the key nothing is sent, and the proof is held all the same");
  // The live route sends it only when the proof was newly held.
  assert.match(readFileSync("app/api/proof/verify/route.ts", "utf8"), /const held = await holdForReview\(review\);\n\s*if \(held\) await sendReviewAlert\(review,/);
});

test("the show-it block says what Viky keeps, by condition, and never a score it does not keep", () => {
  assert.equal(SHOW_PROOF.kept["university-enrollment-shown"], "Viky keeps only whether you are enrolled.");
  assert.equal(SHOW_PROOF.kept["university-year-passed-shown"], "Viky keeps only whether the year is passed.");
  assert.doesNotMatch(SHOW_PROOF.whatHappens("your university"), /keeps/);
  // Every shown condition kept under the verdict rule says whether, never the number.
  for (const entry of SHOWN_CONDITIONS) {
    const id = entry.condition.conditionId;
    const said = SHOW_PROOF.kept[id] ?? (verdictOnly(id) ? SHOW_PROOF.keptVerdict : SHOW_PROOF.keptNumber);
    if (verdictOnly(id)) assert.match(said, /^Viky keeps only whether /, id);
  }
  assert.match(readFileSync("app/kit/ShowProof.tsx", "utf8"), /W\.kept\[conditionId\] \?\? \(verdictOnly\(conditionId\) \? W\.keptVerdict : W\.keptNumber\)/);
});
