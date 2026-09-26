import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CODEFORCES_USER, CODEFORCES_USER_NAMED } from "../src/attested-sources";
import { climbIdentityLabel, climbOfGoal, climbProviderId, CODEFORCES_CLIMB, isClimbId } from "../src/climbs";
import { CODEFORCES_GOAL_TYPE, CODEFORCES_IDENTITY_LABEL, codeforcesProviderId, codeforcesUserUrl, isValidCodeforcesHandle } from "../src/codeforces";
import { CodeforcesReadError, codeforcesPlayerId, readCodeforcesStanding } from "../src/codeforces-reading";
import { privacyOf } from "../src/condition-privacy";
import { proofOfCondition } from "../src/condition-proof";
import { CONDITIONS, CODEFORCES_RATING as LINE, conditionById } from "../src/conditions";
import { cadenceOfGoal, CODEFORCES_MILESTONE, milestoneById, milestoneOfClimb } from "../src/milestone-conditions";
import { MILESTONE_GOALS } from "../src/milestone-goals";
import { SHAPE_CLIMB } from "../src/milestone-protocol";

/**
 * "Reach a Codeforces rating" (the founder, 27 Sep 2026): the chess rating's shape on Codeforces' public API. The
 * answer below is `user.info`'s own shape, measured on 26 Sep 2026, with an invented user.
 */
const USER = JSON.stringify({ status: "OK", result: [{ lastName: "Example", country: "France", lastOnlineTimeSeconds: 1_790_369_091, rating: 1_712, handle: "ada_ex", firstName: "Ada", contribution: 0, organization: "Viky", rank: "expert", maxRating: 1_803, registrationTimeSeconds: 1_265_987_288, maxRank: "expert" }] });
const UNRATED = JSON.stringify({ status: "OK", result: [{ handle: "fresh.one", contribution: 0, rank: "unrated", maxRank: "unrated", registrationTimeSeconds: 1_790_000_000 }] });
const NOBODY = JSON.stringify({ status: "FAILED", comment: "handles: User with handle nobody_zz not found" });
const fake = async (url: string) => {
  if (url.endsWith("handles=ada_ex")) return new Response(USER, { status: 200 });
  if (url.endsWith("handles=fresh.one")) return new Response(UNRATED, { status: 200 });
  if (url.endsWith("handles=nobody_zz")) return new Response(NOBODY, { status: 400 });
  return new Response("", { status: 503 });
};
const refused = (code: string) => (error: unknown) => error instanceof CodeforcesReadError && error.code === code;

test("the module: handles, the goal, the provider, the climb beside Chess.com's", () => {
  assert.ok(isValidCodeforcesHandle("tourist") && isValidCodeforcesHandle("Um_nik") && isValidCodeforcesHandle("-is-this-fft-") && isValidCodeforcesHandle("a.b.c"));
  assert.ok(!isValidCodeforcesHandle("ab") && !isValidCodeforcesHandle("with space") && !isValidCodeforcesHandle("x".repeat(25)));
  assert.equal(codeforcesUserUrl("tourist"), "https://codeforces.com/api/user.info?handles=tourist");
  assert.equal(CODEFORCES_GOAL_TYPE, 33);
  assert.equal(codeforcesProviderId(), "0x8c198ec8f6c22bb4aa6709c9849ccc0369b08d3346b6017f3f64b6a7e93f7a45");
  assert.equal(climbOfGoal(33), CODEFORCES_CLIMB);
  assert.equal(climbOfGoal(1), "rapid", "Chess.com's climbs are untouched");
  assert.equal(climbProviderId(CODEFORCES_CLIMB), codeforcesProviderId());
  assert.equal(climbIdentityLabel(CODEFORCES_CLIMB), CODEFORCES_IDENTITY_LABEL);
  assert.equal(climbIdentityLabel("rapid"), "chess.com");
  assert.ok(isClimbId("codeforces") && isClimbId("blitz") && !isClimbId("lichess"));
  assert.equal(codeforcesPlayerId(" Tourist "), "tourist");
});

test("the sources: the handle, the rating and the best ever; the last name only on the binding reading", () => {
  const values = (source: typeof CODEFORCES_USER) => Object.fromEntries(source.matches.map((match) => [match.value, new RegExp(match.value).exec(USER)?.groups]));
  assert.deepEqual(Object.values(values(CODEFORCES_USER)).map((group) => ({ ...group })), [{ handle: "ada_ex" }, { rating: "1712" }, { maxRating: "1803" }]);
  assert.deepEqual(Object.values(values(CODEFORCES_USER_NAMED)).map((group) => ({ ...group })), [{ handle: "ada_ex" }, { rating: "1712" }, { maxRating: "1803" }, { lastName: "Example" }]);
  assert.equal(new RegExp(CODEFORCES_USER.matches[1].value).exec(UNRATED), null, "no rating on an account with no rated round");
  assert.ok(CODEFORCES_USER.accepts("tourist") && !CODEFORCES_USER.accepts("no spaces here"));
  assert.equal(CODEFORCES_USER.url("Um_nik"), "https://codeforces.com/api/user.info?handles=Um_nik");
  assert.equal(CODEFORCES_USER_NAMED.url("Um_nik"), CODEFORCES_USER.url("Um_nik"), "the same page, one more pattern");
});

test("the plain read: the standing, an unrated account, a handle nobody has", async () => {
  const standing = await readCodeforcesStanding("ada_ex", fake);
  assert.deepEqual({ ...standing, ratedAt: 0 }, { username: "ada_ex", playerId: "ada_ex", status: "ok", rating: 1_712, ratedAt: 0, rd: null, best: 1_803 });
  assert.equal((await readCodeforcesStanding("fresh.one", fake)).rating, null);
  await assert.rejects(readCodeforcesStanding("nobody_zz", fake), refused("PROFILE_NOT_FOUND"));
  await assert.rejects(readCodeforcesStanding("bad handle", fake), refused("INVALID_USERNAME"));
  await assert.rejects(readCodeforcesStanding("down_site", fake), refused("FETCH_FAILED"));
});

test("the line: read for them, Learn, a climb in the chess rating's shape, goal 33, open", () => {
  assert.equal(LINE.family, "learn");
  assert.equal(LINE.nature, "read");
  assert.equal(LINE.kind, "milestone");
  assert.equal(LINE.live, true);
  assert.ok(CONDITIONS.includes(LINE));
  assert.ok(LINE.name.length <= 30, `${LINE.name.length} characters`);
  assert.equal(LINE.link.kind, "username");
  if (LINE.link.kind === "username") {
    assert.equal(LINE.link.check?.path, "/api/codeforces/standing");
    assert.equal(LINE.link.check?.valid("tourist"), true);
    assert.equal(LINE.link.check?.valid("no way"), false);
  }
  assert.equal(conditionById("codeforces-rating"), LINE);
  assert.equal(milestoneById("codeforces-rating"), CODEFORCES_MILESTONE);
  assert.equal(milestoneOfClimb("codeforces"), CODEFORCES_MILESTONE);
  assert.equal(CODEFORCES_MILESTONE.cadences.length, 1);
  assert.equal(cadenceOfGoal(CODEFORCES_MILESTONE, 33)?.id, "codeforces");
  assert.equal(CODEFORCES_MILESTONE.settled(null), true, "no deviation is published: nothing settles");
  assert.equal(privacyOf(LINE).kept, "number");
  assert.ok(proofOfCondition("codeforces-rating"));
  const goal = MILESTONE_GOALS.find((one) => one.goalType === 33);
  assert.equal(goal?.providerId, codeforcesProviderId());
  assert.equal(goal?.shape, SHAPE_CLIMB, "a climb, like the chess rating");
  // The keeper, the create route and the rename flow read every climb through one door, whatever the house.
  for (const file of ["src/milestone-reading.ts", "src/milestone-routes.ts", "app/api/gift/milestone/create/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /attestChessRating|readChessStanding|chessClimbOfGoal|chessProviderId\(/, `${file} names Chess.com's reading itself`);
  }
  assert.match(readFileSync("src/milestone-reading.ts", "utf8"), /providerId: climbProviderId\(mode\)/);
  assert.match(readFileSync("src/milestone-reading.ts", "utf8"), /identityHash: deps\.identity\(reading\.playerId, mode\)/);
});
