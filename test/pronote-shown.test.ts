import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import { privacyOf } from "../src/condition-privacy";
import { proofOfCondition } from "../src/condition-proof";
import { BUILDING, conditionById, PRONOTE_GRADE_SHOWN } from "../src/conditions";
import { certificateById, PRONOTE_MILESTONE } from "../src/milestone-conditions";
import { MILESTONE_GOALS } from "../src/milestone-goals";
import { isPronoteSpace, PRONOTE_GOAL_TYPE, pronoteLoginUrl, pronoteProviderId, pronoteSpaceOf, pronoteSubject } from "../src/pronote-shown";
import { PRONOTE_SHOWN, shownConditionById } from "../src/shown-conditions";

/** PRONOTE (D203): EcoleDirecte's line, with the establishment's space carried by the gift as a portal is. */

test("the line: shown by them, under School, goal 24, being built, and under the verdict rule", () => {
  assert.equal(PRONOTE_GRADE_SHOWN.family, "school");
  assert.equal(PRONOTE_GRADE_SHOWN.nature, "shown");
  assert.equal(PRONOTE_GRADE_SHOWN.live, false);
  assert.ok(BUILDING.includes(PRONOTE_GRADE_SHOWN));
  assert.ok(PRONOTE_GRADE_SHOWN.name.length <= 30);
  assert.equal(conditionById("pronote-grade-shown"), PRONOTE_GRADE_SHOWN);
  assert.equal(certificateById("pronote-grade-shown"), PRONOTE_MILESTONE);
  assert.equal(shownConditionById("pronote-grade-shown"), PRONOTE_SHOWN);
  assert.ok(proofOfCondition("pronote-grade-shown"));
  assert.equal(privacyOf(PRONOTE_GRADE_SHOWN).kept, "verdict");
  assert.equal(PRONOTE_GOAL_TYPE, 24);
  assert.equal(pronoteProviderId(), keccak256(stringToHex("viky:provider:pronote-grade-shown:v1")));
  assert.ok(MILESTONE_GOALS.some((goal) => goal.goalType === 24 && goal.providerId === pronoteProviderId()));
  assert.match(String(PRONOTE_MILESTONE.notOpen), /not registered yet/, "nobody can make a gift on it until the provider is pinned");
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
