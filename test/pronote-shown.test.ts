import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import { privacyOf } from "../src/condition-privacy";
import { proofOfCondition } from "../src/condition-proof";
import { BUILDING, conditionById, PRONOTE_GRADE_SHOWN } from "../src/conditions";
import { CONDITIONS } from "../src/conditions";
import { certificateById, PRONOTE_MILESTONE } from "../src/milestone-conditions";
import { MILESTONE_GOALS } from "../src/milestone-goals";
import { isPronoteSpace, PRONOTE_GOAL_TYPE, pronoteLoginUrl, pronoteProviderId, pronoteSpaceOf, pronoteSubject } from "../src/pronote-shown";
import { PRONOTE_SHOWN, shownConditionById } from "../src/shown-conditions";

/** PRONOTE (D203): EcoleDirecte's line, with the establishment's space carried by the gift as a portal is. */

test("parked: off every list, offered to nobody, the reason said, goal 24 kept waiting", () => {
  assert.equal(PRONOTE_GRADE_SHOWN.live, false);
  assert.ok(!BUILDING.includes(PRONOTE_GRADE_SHOWN) && !CONDITIONS.includes(PRONOTE_GRADE_SHOWN), "not on the public page");
  assert.equal(conditionById("pronote-grade-shown"), undefined);
  assert.equal(certificateById("pronote-grade-shown"), undefined, "no route can make a gift on it");
  assert.equal(shownConditionById("pronote-grade-shown"), undefined, "no proof session can open on it");
  assert.equal(proofOfCondition("pronote-grade-shown"), undefined);
  assert.throws(() => privacyOf(PRONOTE_GRADE_SHOWN));
  assert.match(String(PRONOTE_MILESTONE.notOpen), /encrypts what its pages and its bulletins send/);
  assert.equal(PRONOTE_GOAL_TYPE, 24);
  assert.equal(pronoteProviderId(), keccak256(stringToHex("viky:provider:pronote-grade-shown:v1")));
  assert.ok(MILESTONE_GOALS.some((goal) => goal.goalType === 24 && goal.providerId === pronoteProviderId()), "goal 24 waits, as the founder asked");
  assert.equal(PRONOTE_SHOWN.condition.conditionId, "pronote-grade-shown", "the code is kept for the day a readable answer exists");
});

test("the space is taken from its address, and bound into what the funder signs", () => {
  assert.equal(pronoteSpaceOf("https://0123456a.index-education.net/pronote/parent.html"), "0123456a");
  assert.equal(pronoteSpaceOf("0123456A.index-education.net/pronote/eleve.html?login=true"), "0123456a");
  assert.equal(pronoteSpaceOf("0123456a"), "0123456a");
  assert.equal(pronoteSpaceOf("https://demo.index-education.net/pronote/parent.html"), undefined, "the demonstration space is nobody's");
  assert.equal(pronoteSpaceOf("https://pronote.example.fr/pronote/"), undefined, "only index-education.net spaces");
  assert.equal(pronoteSpaceOf(""), undefined);
  assert.ok(isPronoteSpace("0123456a") && !isPronoteSpace("-a") && !isPronoteSpace("a b"));
  assert.equal(pronoteLoginUrl("0123456a"), "https://0123456a.index-education.net/pronote/parent.html");
  assert.equal(PRONOTE_MILESTONE.subject({ name: "", course: "0123456a" }), pronoteSubject("0123456a"));
  assert.notEqual(pronoteSubject("0123456a"), pronoteSubject("0987654b"), "another establishment is another subject");
  assert.equal(PRONOTE_SHOWN.subjectOf?.({ giftId: "1", conditionId: "pronote-grade-shown", mode: "certificate", course: "0123456a" } as never), pronoteSubject("0123456a"));
});
