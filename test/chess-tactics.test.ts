import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import type { AttestedReadDeps } from "../src/attested-read";
import { attestedSource, CHESS_PLAYER, CHESS_TACTICS_RATING, chessClimbSource, CHESS_RATINGS } from "../src/attested-sources";
import { CHESS_TACTICS, chessClimbOfGoal, chessClimbPattern, chessGoalType, chessProviderId, chessTacticsPattern, climbOfStats, tacticsOfStats } from "../src/chess-com";
import { attestChessRating, ChessReadError, readChessStanding, type PlainFetch } from "../src/chess-reading";
import type { ZkFetchProof } from "../src/duolingo-public";
import { CHESS_MILESTONE, CHESS_TACTICS_MILESTONE, milestoneOfClimb } from "../src/milestone-conditions";
import { milestoneGoal } from "../src/milestone-goals";
import { SHAPE_CLIMB } from "../src/milestone-protocol";

/**
 * The puzzle record on Chess.com: a climb read from the same page as the ratings, with no cadence to choose and no
 * RD to settle (the founder's line of 20 Sep 2026).
 *
 * Every shape below was measured the same day on api.chess.com, on sevyb, hikaru, magnuscarlsen and erik. What the
 * tests are really guarding is the one way this reading could pay the wrong number: the block carries two ratings,
 * the record and the lowest the account ever fell to, and a pattern that could match either would let the second
 * settle a gift made on the first.
 */

/** erik's stats page on 20 Sep 2026, the fragment this reading is about, with what surrounds it on the page. */
const ERIK =
  '{"chess_daily":{"last":{"rating":1502,"date":1789854578,"rd":63},"best":{"rating":2065,"date":1256228875}},' +
  '"chess_rapid":{"last":{"rating":1904,"date":1764957051,"rd":80}},' +
  '"tactics":{"highest":{"rating":2096,"date":1760495253},"lowest":{"rating":1795,"date":1757295673}},' +
  '"puzzle_rush":{"best":{"total_attempts":40,"score":32}}}';

const ATTESTOR = "0x244897572368eadf65bfbc5aec98d8e5443a9072";

function proofOf(url: string, matches: readonly { type: string; value: string }[], extracted: Record<string, string>, timestampS = 1_789_653_320, identifier = `0x${"d2".repeat(32)}`): ZkFetchProof {
  return {
    claimData: {
      provider: "http",
      parameters: JSON.stringify({ url, method: "GET", headers: { accept: "application/json" }, body: "", responseMatches: matches }),
      context: JSON.stringify({ extractedParameters: extracted, providerHash: "0xb78a" }),
      identifier,
      timestampS,
    },
    signatures: ["0x00"],
    witnesses: [{ id: ATTESTOR, url: "wss://attestor.reclaimprotocol.org:444/ws" }],
  };
}

function honest(record: Record<string, string> = { rating: "2096", date: "1760495253" }): AttestedReadDeps {
  return {
    zkFetch: async (source, account) => {
      if (source.id === CHESS_PLAYER.id) return proofOf(source.url(account), source.matches, { playerId: "41", username: "erik", status: "staff" });
      return proofOf(source.url(account), source.matches, record, 1_789_653_330, `0x${"5b".repeat(32)}`);
    },
    verify: async () => true,
    attestors: [ATTESTOR],
  };
}

test("the record is read from the block that holds it, and the lowest rating can never come out instead", () => {
  const pattern = new RegExp(chessTacticsPattern());
  const found = pattern.exec(ERIK);
  assert.equal(found?.groups?.rating, "2096", "the record erik held on 20 Sep 2026");
  assert.equal(found?.groups?.date, "1760495253");
  // The same page, with the two halves of the block the other way round: a reading anchored on `highest` finds
  // nothing rather than handing over the 1795 the account once fell to.
  const swapped = ERIK.replace('"tactics":{"highest":{"rating":2096,"date":1760495253},"lowest":{"rating":1795,"date":1757295673}}', '"tactics":{"lowest":{"rating":1795,"date":1757295673}}');
  assert.equal(pattern.exec(swapped), null, "no record, no reading");
  // And it is about that block: a rating in another block of the same page is not a puzzle record.
  assert.equal(new RegExp(chessTacticsPattern()).exec('{"chess_rapid":{"last":{"rating":1904,"date":1764957051,"rd":80}}}'), null);
  assert.equal(chessClimbPattern(CHESS_TACTICS), chessTacticsPattern());
  assert.notEqual(chessClimbPattern("rapid"), chessTacticsPattern());
});

test("an account that never solved a puzzle has no record to beat, and is refused rather than read as nothing", () => {
  assert.deepEqual(tacticsOfStats(JSON.parse(ERIK)), { rating: 2096, ratedAt: 1_760_495_253, rd: null, best: null });
  assert.equal(tacticsOfStats(JSON.parse('{"chess_rapid":{"last":{"rating":1904,"date":1,"rd":80}}}')), null, "no tactics block at all");
  assert.equal(tacticsOfStats(JSON.parse('{"tactics":{}}')), null, "a block with no record in it");
  assert.equal(tacticsOfStats(JSON.parse('{"tactics":{"lowest":{"rating":1795,"date":1}}}')), null, "the lowest is not a record");
  assert.equal(tacticsOfStats(JSON.parse('{"tactics":{"highest":{"rating":0,"date":1}}}')), null);
  assert.equal(tacticsOfStats(null), null);
  // Which is what the climb reads, beside the cadences that go on reading their own blocks.
  assert.equal(climbOfStats(JSON.parse(ERIK), CHESS_TACTICS)?.rating, 2096);
  assert.equal(climbOfStats(JSON.parse(ERIK), "rapid")?.rating, 1904);
});

test("the record is a climb of its own on the contract, on the number the owner registered", () => {
  assert.equal(chessGoalType(CHESS_TACTICS), 12);
  assert.equal(chessClimbOfGoal(12), CHESS_TACTICS);
  assert.equal(chessProviderId(CHESS_TACTICS), keccak256(stringToHex("viky:provider:chess-com-tactics-zkfetch:v1")));
  assert.notEqual(chessProviderId(CHESS_TACTICS), chessProviderId("rapid"), "a rapid proof can never settle a puzzle gift");
  const goal = milestoneGoal(12);
  assert.equal(goal?.providerId, chessProviderId(CHESS_TACTICS));
  assert.equal(goal?.shape, SHAPE_CLIMB, "a record moves, so it is proved as a climb");
  assert.equal(chessClimbSource(CHESS_TACTICS), CHESS_TACTICS_RATING);
  assert.equal(chessClimbSource("rapid"), CHESS_RATINGS.rapid);
  assert.equal(attestedSource("chess-tactics"), CHESS_TACTICS_RATING);
  assert.equal(CHESS_TACTICS_RATING.url("Erik"), "https://api.chess.com/pub/player/erik/stats", "the same page as the ratings");
});

test("a plain reading gives the record and no RD, and an attested one is accepted without one", async () => {
  const fetchImpl: PlainFetch = async (url) =>
    new Response(url.endsWith("/stats") ? ERIK : '{"player_id":41,"username":"erik","status":"staff","name":"Erik"}', { status: 200, headers: { "content-type": "application/json" } });
  const standing = await readChessStanding("erik", CHESS_TACTICS, fetchImpl);
  assert.equal(standing.rating, 2096);
  assert.equal(standing.rd, null, "the page publishes none for a puzzle record");
  assert.equal(standing.best, null, "the number being read is already the best ever");

  const reading = await attestChessRating({ username: "erik", mode: CHESS_TACTICS, withName: false }, honest());
  assert.equal(reading.rating, 2096);
  assert.equal(reading.rd, null);
  assert.equal(reading.mode, CHESS_TACTICS);
  assert.equal(reading.proofs.length, 2, "the player, then the record");
  // A cadence is still refused without one, because its own pattern would not have matched without an RD.
  await assert.rejects(
    attestChessRating({ username: "erik", mode: "rapid", withName: false }, honest({ rating: "1904", date: "1764957051" })),
    (error: unknown) => error instanceof ChessReadError && error.code === "PROOF_INVALID",
  );
});

test("nothing holds a record back for settling, and the funder is asked no cadence", () => {
  assert.equal(CHESS_TACTICS_MILESTONE.settled(null), true, "there is no RD to wait for");
  assert.equal(CHESS_MILESTONE.settled(null), false, "a cadence without an RD has not settled");
  assert.equal(CHESS_TACTICS_MILESTONE.cadences.length, 1, "one page, one puzzle rating, nothing to choose");
  assert.equal(CHESS_TACTICS_MILESTONE.cadences[0].id, CHESS_TACTICS);
  assert.equal(CHESS_TACTICS_MILESTONE.cadences[0].goalType, 12);
  // The two Chess.com conditions are read from the same route and refused in different words, so what answers about
  // a climb is the condition that owns it.
  assert.equal(milestoneOfClimb(CHESS_TACTICS), CHESS_TACTICS_MILESTONE);
  assert.equal(milestoneOfClimb("rapid"), CHESS_MILESTONE);
  assert.equal(milestoneOfClimb("nothing"), undefined);
  assert.notEqual(CHESS_TACTICS_MILESTONE.words.refusals.noRating(""), CHESS_MILESTONE.words.refusals.noRating(""));
  assert.match(CHESS_TACTICS_MILESTONE.words.refusals.noRating(""), /never solved a puzzle/);
});
