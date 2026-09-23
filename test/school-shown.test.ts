process.env.IDENTITY_HMAC_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.EVIDENCE_SIGNER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex, type Hex } from "viem";
import { BUILDING, conditionById, FAMILIES, FRONTIERS } from "../src/conditions";
import { proofOfCondition } from "../src/condition-proof";
import { VerificationError } from "../src/duolingo-verification";
import { conditionAnswered, type GiftDraft } from "../src/gift-draft";
import { certificateById, ECOLEDIRECTE_MILESTONE } from "../src/milestone-conditions";
import { milestoneGoal } from "../src/milestone-goals";
import { SHAPE_HAVE_OR_NOT } from "../src/milestone-protocol";
import { ECOLEDIRECTE_GOAL_TYPE, ECOLEDIRECTE_NOT_REGISTERED, ECOLEDIRECTE_PROVIDER, ECOLEDIRECTE_SUBJECT, ecoleDirecteProviderId, isValidSchoolTarget, readSchoolAverage, SCHOOL_SCALE, schoolGradeInWords } from "../src/school-shown";
import { ECOLEDIRECTE_SHOWN, shownConditionById } from "../src/shown-conditions";
import { ShownProofError } from "../src/shown-proof";
import { verifyShownSession, type ShownVerificationDeps } from "../src/shown-verification";

/** An average at school shown from the pupil's own EcoleDirecte account (D179), and PRONOTE not offered. */

test("one goal, pinned by name, a constant subject, and the family School after Study", () => {
  assert.equal(ECOLEDIRECTE_GOAL_TYPE, 23);
  assert.equal(ecoleDirecteProviderId(), keccak256(stringToHex("viky:provider:ecoledirecte-grade-shown:v1")));
  assert.equal(ecoleDirecteProviderId(), "0x1ec1d1c1bce9830ac7610d6c9f0ff214b5f350dd51b111b14cbadc2dda89c4ed", "the id written in OPERATIONS for the owner to sign");
  assert.equal(ECOLEDIRECTE_SUBJECT, keccak256(stringToHex("viky:subject:ecoledirecte-grade-shown:v1")));
  assert.equal(milestoneGoal(23)?.providerId, ecoleDirecteProviderId());
  assert.equal(milestoneGoal(23)?.shape, SHAPE_HAVE_OR_NOT);
  assert.equal(ECOLEDIRECTE_MILESTONE.subject({ name: "" }), ECOLEDIRECTE_SUBJECT);
  assert.equal(ECOLEDIRECTE_SHOWN.subject, ECOLEDIRECTE_SUBJECT);
  assert.equal(ECOLEDIRECTE_SHOWN.condition.attestationProviderId, ecoleDirecteProviderId());
  assert.deepEqual(FAMILIES.map((family) => family.id).slice(-2), ["study", "school"]);
  const condition = conditionById("ecoledirecte-grade-shown");
  assert.equal(condition?.family, "school");
  assert.equal(condition?.nature, "shown");
  assert.equal(condition?.live, false);
  assert.ok(BUILDING.includes(condition as never));
  assert.ok(proofOfCondition("ecoledirecte-grade-shown"));
  // The frontier's line on school marks says which portal is on its way and why the other is not, in its publisher's words.
  const marks = FRONTIERS.find((frontier) => frontier.id === "school-marks");
  assert.match(String(marks?.building), /EcoleDirecte account.*SHOWN BY THEM.*not PRONOTE.*written authorisation\.$/);
  assert.equal(marks?.conditionId, undefined, "the line prints under School, once");
  for (const id of ["pronote-grade-shown", "pronote-average-shown"]) assert.equal(conditionById(id), undefined, `${id}: not offered, not built`);
});

test("the average is out of 20 in hundredths, typed with decimals and signed the same on both sides", () => {
  assert.deepEqual(SCHOOL_SCALE, { kind: "numeric", max: 20, step: 0.01 });
  for (const good of [12.5, 14, 0.01, 20]) assert.ok(isValidSchoolTarget(good), String(good));
  for (const bad of [0, 20.5, 12.555, -1, Number.NaN]) assert.equal(isValidSchoolTarget(bad), false, String(bad));
  assert.ok(ECOLEDIRECTE_MILESTONE.validTarget(12.5) && !ECOLEDIRECTE_MILESTONE.validTarget(21));
  assert.equal(ECOLEDIRECTE_MILESTONE.targetUnits?.(12.5), 1250);
  assert.equal(ECOLEDIRECTE_MILESTONE.target.step, 0.01, "under one, so the draft takes 12.5");
  assert.equal(schoolGradeInWords(12.5), "12.50 / 20");
  assert.match(ECOLEDIRECTE_MILESTONE.words.goal(12.5), /12\.50 \/ 20/);
  assert.equal(ECOLEDIRECTE_MILESTONE.words.refusals.below(1250, 1175), "That average is 11.75 / 20. This gift is for 12.50 / 20.");
  const draft = { recipientName: "Ama", funderName: "", conditionId: "ecoledirecte-grade-shown", subject: "", target: "12.5", dollars: "20", days: "120" } as unknown as GiftDraft;
  assert.ok(conditionAnswered(draft));
  assert.ok(!conditionAnswered({ ...draft, target: "12,5" } as GiftDraft));
});

test("the reading is the overall average on the page, in the words the person reads back, or NO_GRADE", () => {
  assert.deepEqual(readSchoolAverage({ average: "14,50" }), { kind: "read", metricValue: 1450, inWords: "14.50 / 20" });
  assert.deepEqual(readSchoolAverage({ average: "9" }), { kind: "read", metricValue: 900, inWords: "9.00 / 20" });
  const refused: readonly Readonly<Record<string, string>>[] = [{ average: "21" }, { average: "A" }, { period: "T1" }, {}];
  for (const fields of refused) {
    const verdict = readSchoolAverage(fields);
    assert.equal(verdict.kind === "refused" && verdict.code, "NO_GRADE", JSON.stringify(fields));
  }
  assert.deepEqual(shownConditionById("ecoledirecte-grade-shown")?.condition.read({ average: "12.75" }), { metricValue: 1275n, eventAt: null, accountKey: null, inWords: "12.75 / 20" });
  assert.throws(() => shownConditionById("ecoledirecte-grade-shown")?.condition.read({}), (error: unknown) => error instanceof ShownProofError && error.code === "NO_GRADE");
});

test("no provider is registered tonight, and the line says so by name before anything is fetched", async () => {
  assert.equal(ECOLEDIRECTE_PROVIDER, null);
  assert.equal(ECOLEDIRECTE_SHOWN.notRegistered, ECOLEDIRECTE_NOT_REGISTERED);
  assert.equal(certificateById("ecoledirecte-grade-shown")?.notOpen, ECOLEDIRECTE_NOT_REGISTERED);
  let fetched = false;
  const deps = {
    loadSession: async () => ({ sessionId: "session_12345678", account: "0x000000000000000000000000000000000000a11c", giftId: "1000023", goalType: 23, conditionId: "ecoledirecte-grade-shown", phase: "reach" as const, dayIndex: 0 }),
    loadLatestEvidence: async () => null,
    consumeAndSaveVerification: async () => true,
    consumeShownSession: async () => true,
    fetchStatus: async () => {
      fetched = true;
      return { session: undefined } as never;
    },
    verifyProofs: async () => ({ isVerified: true, isTeeAttestationVerified: true, data: [] }),
    signCheckIn: async () => "0x" as Hex,
    prove: async () => ({ hash: `0x${"ab".repeat(32)}` as Hex, happened: "reached" as const }),
    record: async () => undefined,
    milestoneRecordOf: async () => null,
    milestoneOf: async () => null,
    appId: "0x15678cD04e54ccc2bC1c24cb455be3C60Eb11ADf",
    escrowAddress: "0x00000000000000000000000000000000000000E5" as Hex,
    now: () => 1_784_000_100,
  } as unknown as ShownVerificationDeps;
  await assert.rejects(
    verifyShownSession(deps, { sessionId: "session_12345678", account: "0x000000000000000000000000000000000000a11c" }),
    (error: unknown) => error instanceof VerificationError && error.code === "NOT_CONFIGURED" && error.message === ECOLEDIRECTE_NOT_REGISTERED,
  );
  assert.equal(fetched, false);
});
