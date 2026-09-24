import assert from "node:assert/strict";
import test from "node:test";
import { CHSI_GOAL_TYPE, chsiProviderId, readChsiStatus } from "../src/chsi-shown";
import { privacyOf } from "../src/condition-privacy";
import { proofOfCondition } from "../src/condition-proof";
import { BUILDING, CHSI_ENROLMENT_SHOWN, conditionById } from "../src/conditions";
import { certificateById, CHSI_MILESTONE } from "../src/milestone-conditions";
import { MILESTONE_GOALS } from "../src/milestone-goals";
import { CHSI_SHOWN, shownConditionById } from "../src/shown-conditions";
import { ShownProofError } from "../src/shown-proof";

/** Enrolment in China, shown from the person's own CHSI report (D215). */
test("the status reads enrolled from 在籍, and refuses anything else by name", () => {
  assert.equal(readChsiStatus({ status: "在籍（注册学籍）" }).metricValue, 1n);
  assert.throws(() => readChsiStatus({ status: "毕业" }), (error: unknown) => error instanceof ShownProofError && error.code === "NOT_ENROLLED");
  assert.throws(() => readChsiStatus({}), (error: unknown) => error instanceof ShownProofError && error.code === "NO_STATUS");
});

test("the line: shown by them, Study, goal 27, being built, the verdict rule", () => {
  assert.equal(CHSI_ENROLMENT_SHOWN.nature, "shown");
  assert.equal(CHSI_ENROLMENT_SHOWN.family, "exam");
  assert.equal(CHSI_ENROLMENT_SHOWN.live, false);
  assert.ok(BUILDING.includes(CHSI_ENROLMENT_SHOWN));
  assert.ok(CHSI_ENROLMENT_SHOWN.name.length <= 30);
  assert.equal(conditionById("chsi-enrolment-shown"), CHSI_ENROLMENT_SHOWN);
  assert.equal(certificateById("chsi-enrolment-shown"), CHSI_MILESTONE);
  assert.equal(shownConditionById("chsi-enrolment-shown"), CHSI_SHOWN);
  assert.ok(proofOfCondition("chsi-enrolment-shown"));
  assert.equal(privacyOf(CHSI_ENROLMENT_SHOWN).kept, "verdict");
  assert.match(String(CHSI_MILESTONE.notOpen), /not registered yet/);
  assert.equal(CHSI_GOAL_TYPE, 27);
  assert.ok(MILESTONE_GOALS.some((goal) => goal.goalType === 27 && goal.providerId === chsiProviderId()));
});
