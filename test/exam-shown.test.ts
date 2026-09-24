process.env.IDENTITY_HMAC_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.EVIDENCE_SIGNER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex, type Hex } from "viem";
import { BUILDING, conditionById, FAMILIES, FRONTIERS, TOEFL_MYBEST_SHOWN } from "../src/conditions";
import { proofOfCondition } from "../src/condition-proof";
import { VerificationError } from "../src/duolingo-verification";
import {
  BAC_PASSED,
  CAMBRIDGE_LEVELS,
  cambridgeInWords,
  cambridgeLevelOf,
  cambridgeScoreOf,
  EXAM_GOAL_TYPES,
  EXAM_IDS,
  EXAM_LOGIN_URLS,
  EXAM_NOT_REGISTERED,
  EXAM_PROVIDERS,
  examProviderId,
  examSubject,
  ieltsBandOf,
  ieltsInWords,
  ieltsUnits,
  isValidCambridgeScore,
  isValidIeltsBand,
  readBacPassed,
  readCambridge,
  readIelts,
} from "../src/exam-shown";
import { CAMBRIDGE_MILESTONE, certificateById, EXAM_MILESTONES, IELTS_MILESTONE } from "../src/milestone-conditions";
import { milestoneGoal } from "../src/milestone-goals";
import { SHAPE_HAVE_OR_NOT } from "../src/milestone-protocol";
import { shownConditionById } from "../src/shown-conditions";
import { ShownProofError } from "../src/shown-proof";
import { verifyShownSession, type ShownVerificationDeps } from "../src/shown-verification";

/**
 * The examination results shown from the person's own account (D176): five lines beside the TOEFL, each with its own
 * goal and subject, each waiting for a provider of ours, and refused by name until it exists.
 */

/** Pinned 23 Sep 2026: what `registerGoal` writes on chain for goals 17 to 21. A change here is a new goal, never an edit. */
const PINNED: Readonly<Record<number, string>> = {
  17: "0xecfbafb73034a36285f283dce008adf4d74bffedcc340080300e237167e117c5",
  18: "0xc223d2ffcb46f2e2b235aa5a2629019ec53e5388200e9d2b2631e37f43327988",
  19: "0x0180f9bedf395e0a0b0174999ce1268c0c3c9705e2cc2110a9abfb9249d74d44",
  20: "0xfbe2ded9e4a8f17b37264a214589a09e1d75873fc65a9d56f5fd5683773901f3",
  21: "0xa7afea17b0c985d7e53416eacc72d8b95347b97b97875df6f44025badcb59cca",
};

test("five lines, five goals, five subjects, each pinned by name and none sharing another's", () => {
  assert.deepEqual(EXAM_IDS, ["cambridge-english-shown", "ielts-shown", "bac-morocco-shown", "bac-cameroon-shown", "bac-france-shown"]);
  assert.deepEqual(Object.values(EXAM_GOAL_TYPES), [17, 18, 19, 20, 21]);
  for (const id of EXAM_IDS) {
    const goalType = EXAM_GOAL_TYPES[id];
    assert.equal(examProviderId(id), keccak256(stringToHex(`viky:provider:${id}:v1`)));
    assert.equal(examProviderId(id), PINNED[goalType], `${id}: the id written in OPERATIONS for the owner to sign`);
    assert.equal(examSubject(id), keccak256(stringToHex(`viky:subject:${id}:v1`)));
    const goal = milestoneGoal(goalType);
    assert.equal(goal?.providerId, examProviderId(id));
    assert.equal(goal?.shape, SHAPE_HAVE_OR_NOT, `${id}: had or not, the score or the band compared with the target`);
    const entry = shownConditionById(id);
    assert.equal(entry?.condition.attestationProviderId, examProviderId(id));
    assert.equal(entry?.subject, examSubject(id));
    assert.deepEqual(entry?.condition.phases, ["reach"]);
    const shape = certificateById(id);
    assert.equal(shape?.goalType, goalType);
    assert.equal(shape?.asksName, false, "the proof carries no name the funder could sign");
    assert.equal(shape?.subject({ name: "" }), examSubject(id));
    const condition = conditionById(id);
    assert.equal(condition?.nature, "shown");
    assert.equal(condition?.family, "exam");
    assert.equal(condition?.live, false);
    assert.ok(condition?.beforeItOpens);
    assert.ok(BUILDING.includes(condition as never), `${id} is beside the register, offered to an operator alone`);
    assert.ok(proofOfCondition(id), `${id} answers the four questions`);
    assert.match(EXAM_LOGIN_URLS[id], /^https:\/\//);
  }
  assert.equal(new Set(EXAM_IDS.map(examSubject)).size, 5);
  assert.equal(new Set(EXAM_IDS.map(examProviderId)).size, 5);
});

test("the TOEFL is beside them: one family, Exams & school, after Learn", () => {
  assert.equal(TOEFL_MYBEST_SHOWN.family, "exam");
  assert.deepEqual(FAMILIES.map((family) => family.id).slice(0, 2), ["learn", "exam"]);
  // The frontier line about the exams says which lines are on their way, and names the one it prints for (D169).
  const exams = FRONTIERS.find((frontier) => frontier.id === "supervised-exams");
  assert.match(String(exams?.building), /a Cambridge English result and an IELTS band/);
  assert.equal(exams?.conditionId, undefined, "the TOEFL score is open and prints in the register; the two others under their family");
  assert.equal(TOEFL_MYBEST_SHOWN.live, true);
  assert.equal(TOEFL_MYBEST_SHOWN.state, "open");
  const diplomas = FRONTIERS.find((frontier) => frontier.id === "state-diplomas");
  assert.match(String(diplomas?.building), /baccalauréat passed.*Morocco, Cameroon and France/);
  assert.equal(diplomas?.conditionId, undefined, "the three bac lines print under their family, once");
});

test("no provider is registered tonight, and every line says so by name before anything is fetched", async () => {
  for (const id of EXAM_IDS) {
    assert.equal(EXAM_PROVIDERS[id], null, `${id}: a provider of ours, from a real candidate's session, and nothing before`);
    assert.equal(shownConditionById(id)?.condition.providerId, "");
    assert.equal(shownConditionById(id)?.notRegistered, EXAM_NOT_REGISTERED);
    assert.equal(certificateById(id)?.notOpen, EXAM_NOT_REGISTERED, `${id}: the create route refuses NOT_CONFIGURED`);
  }
  let fetched = false;
  const deps = {
    loadSession: async () => ({ sessionId: "session_12345678", account: "0x000000000000000000000000000000000000a11c", giftId: "1000012", goalType: 18, conditionId: "ielts-shown", phase: "reach" as const, dayIndex: 0 }),
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
    (error: unknown) => error instanceof VerificationError && error.code === "NOT_CONFIGURED" && error.message === EXAM_NOT_REGISTERED,
  );
  assert.equal(fetched, false);
});

test("a Cambridge English result is the overall score on the one scale, and the words say its level", () => {
  assert.deepEqual(
    CAMBRIDGE_LEVELS.map(({ level, from }) => `${level}:${from}`),
    ["B1:140", "B2:160", "C1:180", "C2:200"],
    "the floors read on Cambridge English's results pages, 23 Sep 2026",
  );
  assert.equal(cambridgeLevelOf(139), null);
  assert.equal(cambridgeLevelOf(140), "B1");
  assert.equal(cambridgeLevelOf(172), "B2");
  assert.equal(cambridgeLevelOf(199), "C1");
  assert.equal(cambridgeLevelOf(230), "C2");
  assert.equal(cambridgeInWords(172), "172 on the Cambridge English Scale, B2");
  assert.equal(cambridgeInWords(120), "120 on the Cambridge English Scale");
  assert.equal(cambridgeScoreOf(" 172 "), 172);
  for (const bad of ["79", "231", "17.2", "B2", "", undefined]) assert.equal(cambridgeScoreOf(bad), undefined, String(bad));
  assert.ok(isValidCambridgeScore(80) && isValidCambridgeScore(230) && !isValidCambridgeScore(79) && !isValidCambridgeScore(160.5));
  assert.deepEqual(readCambridge({ overallScore: "172" }), { kind: "read", metricValue: 172, inWords: "172 on the Cambridge English Scale, B2" });
  assert.equal(readCambridge({ grade: "B" }).kind, "refused");
  assert.equal(CAMBRIDGE_MILESTONE.target.suggested, 160, "B2, the level most often asked");
  assert.match(CAMBRIDGE_MILESTONE.words.goal(180), /180 on the Cambridge English Scale, C1/);
  assert.ok(CAMBRIDGE_MILESTONE.validTarget(160) && !CAMBRIDGE_MILESTONE.validTarget(0));
  assert.equal(CAMBRIDGE_MILESTONE.targetUnits, undefined, "the score is the integer itself");
  // What the person reads back, through the shown register.
  assert.deepEqual(shownConditionById("cambridge-english-shown")?.condition.read({ overallScore: "160" }), { metricValue: 160n, eventAt: null, accountKey: null, inWords: "160 on the Cambridge English Scale, B2" });
  assert.throws(() => shownConditionById("cambridge-english-shown")?.condition.read({}), (error: unknown) => error instanceof ShownProofError && error.code === "INVALID_SCORE");
});

test("an IELTS band is typed in halves and carried in tenths, on both sides", () => {
  for (const good of [1, 6.5, 9, 7]) assert.ok(isValidIeltsBand(good), String(good));
  for (const bad of [0, 0.5, 6.25, 9.5, Number.NaN]) assert.equal(isValidIeltsBand(bad), false, String(bad));
  assert.equal(ieltsUnits(6.5), 65);
  assert.equal(IELTS_MILESTONE.targetUnits?.(6.5), 65);
  assert.ok(IELTS_MILESTONE.validTarget(6.5) && !IELTS_MILESTONE.validTarget(6.25));
  assert.equal(IELTS_MILESTONE.target.step, 0.5, "under one, so the draft takes 6.5");
  assert.equal(ieltsBandOf("6.5"), 6.5);
  assert.equal(ieltsBandOf("6,5"), 6.5);
  assert.equal(ieltsBandOf("7"), 7);
  for (const bad of ["6.25", "10", "0", "", undefined]) assert.equal(ieltsBandOf(bad), undefined, String(bad));
  assert.equal(ieltsInWords(65), "Band 6.5");
  assert.deepEqual(readIelts({ overallBand: "6.5" }), { kind: "read", metricValue: 65, inWords: "Band 6.5" });
  assert.equal(readIelts({}).kind, "refused");
  assert.deepEqual(shownConditionById("ielts-shown")?.condition.read({ overallBand: "7" }), { metricValue: 70n, eventAt: null, accountKey: null, inWords: "Band 7.0" });
  assert.match(IELTS_MILESTONE.words.mustShow("", 6.5), /overall band of 6\.5 or more/);
});

test("the baccalauréat is passed or not, by the decision field, in the three countries alike", () => {
  assert.deepEqual(readBacPassed({ decision: "Admis" }), { kind: "read", metricValue: BAC_PASSED, inWords: "Passed" });
  assert.deepEqual(readBacPassed({ decision: "ADMISE" }), { kind: "read", metricValue: 1, inWords: "Passed" }, "case and gender do not matter");
  const failed: readonly Readonly<Record<string, string>>[] = [{ decision: "Ajourné" }, { decision: "Refusé" }, { mention: "Bien" }, {}];
  for (const fields of failed) {
    const verdict = readBacPassed(fields);
    assert.equal(verdict.kind === "refused" && verdict.code, "NOT_PASSED", JSON.stringify(fields));
  }
  for (const id of ["bac-morocco-shown", "bac-cameroon-shown", "bac-france-shown"] as const) {
    const shape = certificateById(id);
    assert.ok(shape?.validTarget(1) && !shape.validTarget(2));
    assert.equal(shape?.target.min, shape?.target.max, "nothing to choose");
    assert.deepEqual(shownConditionById(id)?.condition.read({ decision: "Admis" }), { metricValue: 1n, eventAt: null, accountKey: null, inWords: "Passed" });
    assert.throws(() => shownConditionById(id)?.condition.read({ decision: "Ajourné" }), (error: unknown) => error instanceof ShownProofError && error.code === "NOT_PASSED");
  }
  assert.equal(EXAM_MILESTONES.length, 5);
});
