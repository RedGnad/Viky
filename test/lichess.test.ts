import assert from "node:assert/strict";
import test from "node:test";
import { BUILDING, LICHESS_RATING } from "../src/conditions";
import { LICHESS_CADENCES, LICHESS_PROVISIONAL_RD, LichessReadError, lichessGoalType, lichessProviderId, lichessRatingHasSettled, readLichessStanding, standingOfUser, type PlainLichessFetch } from "../src/lichess";
import { cadenceOfGoal, LICHESS_MILESTONE, milestoneById, milestoneOfClimb } from "../src/milestone-conditions";
import { milestoneGoal } from "../src/milestone-goals";
import { LICHESS_USER } from "../src/plain-readings";

/**
 * The Lichess line (D168): the register entry, the milestone half on goals 6 to 9, and the plain reading of where a
 * player stands. The answer below is Lichess's own about a public account, captured on 23 Sep 2026 from
 * `lichess.org/api/user/thibault`, cut to the fields a reading looks at.
 */

const THIBAULT = {
  id: "thibault",
  username: "thibault",
  perfs: {
    ultraBullet: { games: 3, rating: 1688, rd: 362, prog: 0, prov: true },
    bullet: { games: 7483, rating: 1774, rd: 99, prog: -22 },
    blitz: { games: 11856, rating: 1718, rd: 45, prog: 7 },
    rapid: { games: 915, rating: 1802, rd: 69, prog: -75 },
    classical: { games: 25, rating: 1858, rd: 248, prog: 48, prov: true },
    puzzle: { games: 1234, rating: 2100, rd: 60, prog: 0 },
  },
  createdAt: 1290415680000,
  profile: { bio: "I turn coffee into bugs.", realName: "Thibault Duplessis" },
};

function answering(status: number, body: unknown): PlainLichessFetch {
  return async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("the line is in the register beside the door, on goals 6 to 9, and cannot be made on yet", () => {
  assert.ok(BUILDING.includes(LICHESS_RATING));
  assert.equal(LICHESS_RATING.live, false);
  assert.equal(LICHESS_RATING.reading, LICHESS_USER.id, "read plainly today, and listed as such");
  assert.equal(milestoneById("lichess-rating"), LICHESS_MILESTONE);
  assert.ok(LICHESS_MILESTONE.unread, "the create route refuses a Lichess gift by this sentence until the keeper's reading is built");
  assert.match(String(LICHESS_MILESTONE.unread), /Nothing was taken\.$/);
  assert.deepEqual(
    LICHESS_MILESTONE.cadences.map((cadence) => [cadence.id, cadence.goalType]),
    [
      ["bullet", 6],
      ["blitz", 7],
      ["rapid", 8],
      ["classical", 9],
    ],
    "the cadences are Lichess's own four, on the goals registered for them",
  );
  for (const cadence of LICHESS_CADENCES) {
    const goal = milestoneGoal(lichessGoalType(cadence));
    assert.equal(goal?.providerId, lichessProviderId(cadence), `${cadence} carries the provider id the chain holds`);
    assert.equal(cadenceOfGoal(LICHESS_MILESTONE, lichessGoalType(cadence))?.id, cadence);
  }
  // A cadence's name is shared with Chess.com's, and the Chess.com line answers for it first, as its route expects.
  assert.equal(milestoneOfClimb("bullet")?.condition.id, "chess-rating");
  assert.equal(milestoneOfClimb("classical"), LICHESS_MILESTONE, "and classical is Lichess's alone");
  assert.ok(LICHESS_RATING.name.length <= 30);
});

test("a rating has settled when Lichess itself says so: the question mark is a deviation above 110", () => {
  assert.equal(LICHESS_PROVISIONAL_RD, 110);
  assert.equal(lichessRatingHasSettled(110), true);
  assert.equal(lichessRatingHasSettled(111), false);
  assert.equal(lichessRatingHasSettled(null), false);
  assert.equal(LICHESS_MILESTONE.settled, lichessRatingHasSettled);
});

test("where a player stands is read from the one answer, cadence by cadence, with Lichess's own verdict on each", () => {
  const blitz = standingOfUser(THIBAULT, "blitz");
  assert.deepEqual(blitz, { username: "thibault", playerId: "thibault", rating: 1718, rd: 45, provisional: false, games: 11856 });
  const classical = standingOfUser(THIBAULT, "classical");
  assert.equal(classical.rating, 1858);
  assert.equal(classical.provisional, true, "prov: true, and a deviation of 248");
  const never = standingOfUser({ ...THIBAULT, perfs: { ...THIBAULT.perfs, rapid: { games: 0, rating: 1500, rd: 500, prov: true } } }, "rapid");
  assert.equal(never.rating, null, "a cadence never played carries no rating, whatever number Lichess puts beside it");
  assert.equal(never.provisional, true);
  assert.throws(() => standingOfUser({ ...THIBAULT, disabled: true }, "blitz"), (error: unknown) => error instanceof LichessReadError && error.code === "ACCOUNT_CLOSED");
  assert.throws(() => standingOfUser({ ...THIBAULT, tosViolation: true }, "blitz"), (error: unknown) => error instanceof LichessReadError && error.code === "ACCOUNT_CLOSED");
  assert.throws(() => standingOfUser({ id: "x" }, "blitz"), (error: unknown) => error instanceof LichessReadError && error.code === "FETCH_FAILED");
});

test("the plain read types every failure: a name that is not one, a player that does not exist, Lichess not answering, another name", async () => {
  const code = (login: string, fetchImpl: PlainLichessFetch) => readLichessStanding(login, "blitz", fetchImpl).then(() => "ok", (error: unknown) => (error instanceof LichessReadError ? error.code : String(error)));
  assert.equal((await readLichessStanding("Thibault", "blitz", answering(200, THIBAULT))).rating, 1718, "the case of the name does not matter");
  assert.equal(await code("a", answering(200, THIBAULT)), "INVALID_USERNAME");
  assert.equal(await code("nobody-here", answering(404, { error: "Not found" })), "PROFILE_NOT_FOUND");
  assert.equal(await code("thibault", answering(429, "slow down")), "FETCH_FAILED");
  assert.equal(await code("thibault", answering(200, "not json")), "FETCH_FAILED");
  assert.equal(await code("someone", answering(200, THIBAULT)), "FETCH_FAILED", "an answer about another name is not a reading of this one");
  assert.equal(await code("thibault", async () => { throw new Error("offline"); }), "FETCH_FAILED");
});
