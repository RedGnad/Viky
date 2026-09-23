import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import { SHOWN_CONDITIONS, shownConditionById, TOEFL_SHOWN } from "../src/shown-conditions";
import { ShownProofError } from "../src/shown-proof";
import { TOEFL_GOAL_TYPE, TOEFL_RECLAIM_PROVIDER, TOEFL_SHOWN_SUBJECT, toeflScoreOf, toeflShownProviderId } from "../src/toefl-shown";
import { milestoneGoal } from "../src/milestone-goals";
import { SHAPE_HAVE_OR_NOT } from "../src/milestone-protocol";

/** The TOEFL score shown from the person's own ETS account, as the register describes it (D164). */

test("the TOEFL condition is pinned to the provider read on 22 Sep 2026, one request, one proof", () => {
  assert.equal(TOEFL_SHOWN.kind, "milestone");
  assert.equal(TOEFL_SHOWN.condition.providerId, "67ec1b13-b206-4fac-a78c-fbd5a2af55b3");
  assert.equal(TOEFL_SHOWN.condition.providerVersion, "1.0.0");
  assert.deepEqual(TOEFL_SHOWN.condition.requestHashes, ["0x881b7539dce87f232902946fa97c9410805b7587bb45d3f8fb5041193f3dee21"]);
  assert.equal(TOEFL_SHOWN.condition.proofCount, 1);
  assert.deepEqual(TOEFL_SHOWN.condition.phases, ["reach"]);
  assert.equal(TOEFL_RECLAIM_PROVIDER.loginUrl, "https://v2.ereg.ets.org/ereg/public/jump?_p=TEL");
  assert.equal(shownConditionById("toefl-mybest-shown"), TOEFL_SHOWN);
  assert.equal(SHOWN_CONDITIONS.length, 11, "the daily lesson, the TOEFL score, a Udemy course (D178), the five examination results (D176), enrolment (D165), the year passed and a grade (D174), and nothing added by default");
});

test("the subject is constant per condition and the provider id is the registered goal's", () => {
  assert.equal(TOEFL_SHOWN.subject, keccak256(stringToHex("viky:subject:toefl-mybest-shown:v1")));
  assert.equal(TOEFL_SHOWN.subject, TOEFL_SHOWN_SUBJECT);
  assert.equal(TOEFL_SHOWN.condition.attestationProviderId, toeflShownProviderId());
  assert.equal(toeflShownProviderId(), "0xa07cae8e7502221e9a33445deb8f4f5e12d9ccdfd35b5e53d9eb38f32d75db7d");
  const goal = milestoneGoal(TOEFL_GOAL_TYPE);
  assert.equal(TOEFL_GOAL_TYPE, 13);
  assert.equal(goal?.providerId, toeflShownProviderId());
  assert.equal(goal?.shape, SHAPE_HAVE_OR_NOT, "had or not: the show sense, never a climb");
});

test("the score is read on the test's own scale, the booking is the key of the account, and no date is claimed", () => {
  const reading = TOEFL_SHOWN.condition.read({ scoreValue: "97", bookingId: "123456" });
  assert.equal(reading.metricValue, 97n);
  assert.equal(reading.accountKey, "123456");
  assert.equal(reading.eventAt, null, "the page gives no date, so the day it is shown is the event, and the words say so");
  assert.equal(toeflScoreOf("120"), 120);
  assert.equal(toeflScoreOf("121"), undefined);
  assert.equal(toeflScoreOf("9.5"), undefined);
  assert.throws(() => TOEFL_SHOWN.condition.read({ bookingId: "1" }), (error: unknown) => error instanceof ShownProofError && error.code === "INVALID_SCORE");
});
