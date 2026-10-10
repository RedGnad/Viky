import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GOAL_TYPE_DUOLINGO_COURSE_XP, GOAL_TYPE_DUOLINGO_XP, GOAL_TYPE_STRAVA_DISTANCE } from "../src/gift-terms";
import { shownConditionOfGift } from "../src/shown-conditions";

/**
 * A guard on the university path (the audit of 8 Oct 2026, point 10).
 *
 * The session took its condition from the browser: a gift made on "the year passed" asked with the enrolment's name
 * opened a session on the enrolment's provider, and one of the month's proofs went on a proof the contract refuses,
 * since the subject the funder signed is the gift's own condition's. Its twin, a results page that could be pinned
 * with no year, is merged (test/audit-results-pin-needs-its-year.test.ts).
 */

test("the session's condition is read off the gift's record, never taken from the browser", () => {
  // A milestone gift: its milestone row says what it is on.
  const year = shownConditionOfGift({ giftId: "1000042", goalType: 15 }, { conditionId: "university-year-passed-shown" });
  assert.equal(year?.condition.conditionId, "university-year-passed-shown");
  assert.equal(year?.kind, "milestone");
  assert.equal(shownConditionOfGift({ giftId: "1000042", goalType: 14 }, { conditionId: "university-enrollment-shown" })?.condition.conditionId, "university-enrollment-shown");
  // A milestone gift with no row, or on a condition that is not shown from an account: no session.
  assert.equal(shownConditionOfGift({ giftId: "1000042", goalType: 14 }, null), undefined);
  assert.equal(shownConditionOfGift({ giftId: "1000042", goalType: 3 }, { conditionId: "chess-rating" }), undefined);
  // A daily gift: its goal says it, and only the daily lesson is shown from an account.
  assert.equal(shownConditionOfGift({ giftId: "7", goalType: GOAL_TYPE_DUOLINGO_XP }, null)?.condition.conditionId, "duolingo-daily");
  assert.equal(shownConditionOfGift({ giftId: "7", goalType: GOAL_TYPE_DUOLINGO_COURSE_XP }, null)?.condition.conditionId, "duolingo-daily");
  assert.equal(shownConditionOfGift({ giftId: "7", goalType: GOAL_TYPE_STRAVA_DISTANCE }, null), undefined, "a run is read from the connected source, never shown");
  // A milestone row never speaks for a daily gift.
  assert.equal(shownConditionOfGift({ giftId: "7", goalType: GOAL_TYPE_STRAVA_DISTANCE }, { conditionId: "university-enrollment-shown" }), undefined);

  const route = readFileSync("app/api/proof/session/route.ts", "utf8");
  assert.doesNotMatch(route, /body\.conditionId/, "what the browser names is not read at all");
  assert.match(route, /const entry = shownConditionOfGift\(gift, record\);\n\s*if \(!entry\) throw new SessionRefusal\("Unknown condition"\);/);
  // Read before the Reclaim application is used, and before the month's count is asked.
  assert.ok(route.indexOf("const entry = shownConditionOfGift(gift, record);") < route.indexOf("const appId = process.env.RECLAIM_APP_ID"));
  assert.ok(route.indexOf("const entry = shownConditionOfGift(gift, record);") < route.indexOf("await ReclaimProofRequest.init("));
  // What the request itself gets wrong is still refused before any lookup.
  assert.ok(route.indexOf('throw new SessionRefusal("A check-in needs a valid day");') < route.indexOf("const gift = await loadGift(giftId);"));
});
