import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chessGoalType, chessProviderId, CHESS_MODES } from "../src/chess-com";
import { detProviderId } from "../src/duolingo-english-test";
import { LICHESS_CADENCES, lichessCadenceOfGoal, lichessGoalType, lichessProviderId } from "../src/lichess";
import { DET_GOAL_TYPE, milestoneGoal, MILESTONE_GOALS, planFor } from "../src/milestone-goals";
import { SHAPE_CLIMB, SHAPE_HAVE_OR_NOT } from "../src/milestone-protocol";

/**
 * The goals of the milestone contract. A goal is a number a live gift keys on, so the thing these tests defend is
 * that no number and no provider id ever moves under a gift that is already running.
 */

const EMPTY = `0x${"0".repeat(64)}`;

/**
 * Pinned on 18 Sep 2026. These are what `registerGoal` writes on chain: change the string a provider id is built
 * from and a gift already funded stops settling, with nothing on any screen able to say why. A test that fails here
 * is telling you to register a new goal, not to edit an old one.
 */
const PINNED: Readonly<Record<number, string>> = {
  1: "0x56c9a42f353c58f8ef74b979c6a74fa6144562aed8f7fe5cf93c9cbeeef93b40",
  2: "0xc57bd1392946f1743380ebedbe6561e03e5a6e8bdaa6af8879b89caa5dc3fd36",
  3: "0x2b19a55b3e63943851b302dd0601451792be3cb97fadfa8047cb876900084330",
  4: "0xb55b5e37e9fa879c5bc5adbffa5ca98372cc00d8fe21279e827cf9c94d3706e3",
  5: "0x40571f8a16381ad3ae74621e5f08a72449af281bd1bd4edc251bc5f4fe0914e9",
  6: "0xc5352935f86d6c61779eb944d628fcaf492580c96b9bbfb1b1bfa5225c05554e",
  7: "0x8188eca2f6e4d66aebcf562dd719762acfc0648f8f46e922b529dd56a5f5f565",
  8: "0x8e6313da9dfe60c26972ecd2d17f6665b69e7b18d3ee50bb44ab9b7b0fb5b576",
  9: "0x77bafaec0915f482b7065034b60237003234c67ee837bbd8163f03ca0dfdce32",
  10: "0xcd1e3323e174f3cfd7359500d0e2e0befdb34f9998a874e5cf2e2f1d1aa2a75d",
  11: "0xb51fb65622628e49e636bc88791f4d118dcc3ef91063975223e529556628ad62",
  12: "0x5d3b3df90a426ae46f38985fb35c2c55511d811a8f6a091278f3b6964c5c36fe",
  14: "0xa95adf80ba13395dcc23c8048874f1ddfba5321a9eb5e1f90711c6a81c3d64df",
  13: "0xa07cae8e7502221e9a33445deb8f4f5e12d9ccdfd35b5e53d9eb38f32d75db7d",
  15: "0x6af90272bdbe3555ea1b6b91294da5d557c27b72a1cca333864412784dab1551",
  16: "0xf05dcc4db7fc72177e9c9c0ebcc05438600e18b4fb66496bc10a2bdd29291ff2",
  17: "0xecfbafb73034a36285f283dce008adf4d74bffedcc340080300e237167e117c5",
  18: "0xc223d2ffcb46f2e2b235aa5a2629019ec53e5388200e9d2b2631e37f43327988",
  19: "0x0180f9bedf395e0a0b0174999ce1268c0c3c9705e2cc2110a9abfb9249d74d44",
  20: "0xfbe2ded9e4a8f17b37264a214589a09e1d75873fc65a9d56f5fd5683773901f3",
  21: "0xa7afea17b0c985d7e53416eacc72d8b95347b97b97875df6f44025badcb59cca",
  22: "0xf0da5b726f28cf4bc8bef5c1a8d7976a7d5a208e258b3ee9897e7ddd534e5fdd",
  23: "0x1ec1d1c1bce9830ac7610d6c9f0ff214b5f350dd51b111b14cbadc2dda89c4ed",
  // PRONOTE, an average shown (D203).
  24: "0x168e16e58443ee012319e416a53f7bf5ecbcf660707e35917bad5a5abf7835f8",
  // edX, a verified certificate (D212).
  25: "0x1b7dcd631d332fd55c35e820ce05cc6817023b8eda487a830d1370222d6fa08f",
  // Accredible, a credential (D213).
  26: "0xf16cfb8a8ef6a10146f6b2dd98da114d61509c04646cd3ccf93cf4cb0caaa9d8",
  // CHSI, enrolment in China, shown (D215).
  27: "0xe6bb6add0b9555f1d7cc0b063d21b12d2777bb4eaaa94c93bb19251d860b13b4",
};

test("every goal has its own number and its own provider id", () => {
  const numbers = MILESTONE_GOALS.map((goal) => goal.goalType);
  const providers = MILESTONE_GOALS.map((goal) => goal.providerId.toLowerCase());
  assert.equal(new Set(numbers).size, numbers.length, "two goals share a number");
  assert.equal(new Set(providers).size, providers.length, "two goals share a provider id");
  for (const goal of MILESTONE_GOALS) {
    assert.ok(goal.goalType > 0 && goal.goalType < 256, `${goal.goalType} is not a goal type the contract takes`);
    assert.notEqual(goal.providerId, EMPTY, "the contract refuses an empty provider id");
    assert.ok(goal.shape === SHAPE_CLIMB || goal.shape === SHAPE_HAVE_OR_NOT);
  }
});

test("no provider id moves under a gift that is already running", () => {
  for (const goal of MILESTONE_GOALS) assert.equal(goal.providerId, PINNED[goal.goalType], `${goal.source} ${goal.detail}`);
});

test("the four Chess.com cadences keep the numbers they were deployed with", () => {
  for (const mode of CHESS_MODES) {
    const goal = milestoneGoal(chessGoalType(mode));
    assert.ok(goal, mode);
    assert.equal(goal.providerId, chessProviderId(mode));
    assert.equal(goal.shape, SHAPE_CLIMB, "a rating moves, so it is proved as a climb and nothing else");
  }
  assert.deepEqual(CHESS_MODES.map(chessGoalType), [1, 2, 3, 4]);
});

test("the supervised result is one goal, judged as having it or not", () => {
  const goal = milestoneGoal(DET_GOAL_TYPE);
  assert.ok(goal);
  assert.equal(goal.goalType, 5, "five, because one to four are Chess.com's");
  assert.equal(goal.shape, SHAPE_HAVE_OR_NOT);
  assert.equal(goal.providerId, detProviderId());
});

test("the Lichess cadences sit above the others, each a climb of its own", () => {
  for (const cadence of LICHESS_CADENCES) {
    const goal = milestoneGoal(lichessGoalType(cadence));
    assert.ok(goal, cadence);
    assert.equal(goal.shape, SHAPE_CLIMB);
    assert.equal(goal.providerId, lichessProviderId(cadence));
    assert.equal(lichessCadenceOfGoal(goal.goalType), cadence);
    assert.ok(goal.goalType > 4, "one to four belong to Chess.com");
  }
  // One house's proof can never settle the other's gift, even for the same cadence.
  assert.notEqual(lichessProviderId("blitz"), chessProviderId("blitz"));
});

test("the session adds and never overwrites", () => {
  const goal = MILESTONE_GOALS[0];
  assert.equal(planFor(goal, { provider: goal.providerId, shape: goal.shape }), "registered");
  assert.equal(planFor(goal, { provider: EMPTY, shape: 0 }), "missing");
  // A number registered to another provider, or to the same provider under another shape, stops the run.
  assert.equal(planFor(goal, { provider: `0x${"11".repeat(32)}`, shape: goal.shape }), "taken");
  assert.equal(planFor(goal, { provider: goal.providerId, shape: SHAPE_HAVE_OR_NOT }), "taken");
  // Case is not a difference: the chain answers lowercase.
  assert.equal(planFor(goal, { provider: goal.providerId.toUpperCase().replace("0X", "0x"), shape: goal.shape }), "registered");
});

test("the session reads back every goal, not only the ones it sent", () => {
  const script = readFileSync("scripts/register-milestone-goals.ts", "utf8");
  assert.match(script, /for \(const \[index, goal\] of MILESTONE_GOALS\.entries\(\)\)/, "the read back walks the whole list");
  assert.match(script, /Refusing to run: goal .* is registered to something else/);
  assert.match(script, /this key is .* and the owner is/, "it checks the key is the owner before sending");
  assert.match(script, /DRY_RUN/, "it can be run empty first");
});
