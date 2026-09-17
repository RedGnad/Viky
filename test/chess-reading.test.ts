import assert from "node:assert/strict";
import test from "node:test";
import { classifyFetchFailure, type AttestedReadDeps } from "../src/attested-read";
import { CHESS_PLAYER, CHESS_PROFILE, CHESS_RATINGS, type AttestedSource } from "../src/attested-sources";
import { CHESS_MODES, CHESS_SETTLED_RD_BELOW, chessRatingPattern, isValidChessUsername, playerOfProfile, ratingHasSettled, ratingOfStats } from "../src/chess-com";
import { attestChessRating, ChessReadError, readChessStanding, type PlainFetch } from "../src/chess-reading";
import { CHESS_RATING } from "../src/conditions";
import type { ZkFetchProof } from "../src/duolingo-public";
import { CHESS_MILESTONE } from "../src/milestone-conditions";

const ATTESTOR = "0x244897572368eadf65bfbc5aec98d8e5443a9072";

/** A proof shaped like the ones measured on 17 Sep 2026, about the page and the patterns given. */
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

function honest(overrides: Partial<Record<string, (source: AttestedSource, account: string) => ZkFetchProof>> = {}): AttestedReadDeps {
  return {
    zkFetch: async (source, account) => {
      const custom = overrides[source.id];
      if (custom) return custom(source, account);
      if (source.id === CHESS_PROFILE.id) return proofOf(source.url(account), source.matches, { playerId: "41", username: "erik", name: "Erik KXQPRT" });
      if (source.id === CHESS_PLAYER.id) return proofOf(source.url(account), source.matches, { playerId: "41", username: "erik" });
      return proofOf(source.url(account), source.matches, { rating: "1904", date: "1764957051", rd: "80" }, 1_789_653_330, `0x${"5b".repeat(32)}`);
    },
    verify: async () => true,
    attestors: [ATTESTOR],
  };
}

test("an attested reading is two proofs, the player and the cadence's rating, and the rating's proof is the nullifier", async () => {
  const reading = await attestChessRating({ username: "Erik", mode: "rapid", withName: true }, honest());
  assert.equal(reading.playerId, "41");
  assert.equal(reading.name, "Erik KXQPRT");
  assert.equal(reading.rating, 1904);
  assert.equal(reading.observedAt, 1_789_653_330, "the contract judges the time the rating was read");
  assert.equal(reading.rd, 80, "the RD is read with the rating, attested");
  assert.equal(reading.proofs.length, 2);
  const without = await attestChessRating({ username: "erik", mode: "rapid", withName: false }, honest());
  assert.equal(without.name, null);
});

test("a proof of the right page read with a looser pattern is refused, so one cadence can never pass for another", async () => {
  // The pattern that existed before 17 Sep: whichever cadence comes first on the page.
  const loose = [{ type: "regex", value: '"chess_(?<mode>rapid|blitz|bullet|daily)":\\{"last":\\{"rating":(?<rating>\\d+)' }];
  const deps = honest({ [CHESS_RATINGS.rapid.id]: (source, account) => proofOf(source.url(account), loose, { mode: "daily", rating: "2239" }) });
  await assert.rejects(attestChessRating({ username: "erik", mode: "rapid", withName: false }, deps), (error: unknown) => error instanceof ChessReadError && error.code === "PROOF_MISMATCH");
});

test("a proof about another page, another name, or taken far from its other half is refused", async () => {
  const otherPage = honest({ [CHESS_PLAYER.id]: (source) => proofOf(source.url("hikaru"), source.matches, { playerId: "15448422", username: "hikaru" }) });
  await assert.rejects(attestChessRating({ username: "erik", mode: "rapid", withName: false }, otherPage), (error: unknown) => error instanceof ChessReadError && error.code === "PROOF_MISMATCH");

  const otherName = honest({ [CHESS_PLAYER.id]: (source, account) => proofOf(source.url(account), source.matches, { playerId: "15448422", username: "hikaru" }) });
  await assert.rejects(attestChessRating({ username: "erik", mode: "rapid", withName: false }, otherName), (error: unknown) => error instanceof ChessReadError && error.code === "PROOF_MISMATCH");

  const apart = honest({ [CHESS_PLAYER.id]: (source, account) => proofOf(source.url(account), source.matches, { playerId: "41", username: "erik" }, 1_789_653_330 - 3_600) });
  await assert.rejects(attestChessRating({ username: "erik", mode: "rapid", withName: false }, apart), (error: unknown) => error instanceof ChessReadError && error.code === "PROOF_MISMATCH");

  const unsigned: AttestedReadDeps = { ...honest(), verify: async () => false };
  await assert.rejects(attestChessRating({ username: "erik", mode: "rapid", withName: false }, unsigned), (error: unknown) => error instanceof ChessReadError && error.code === "PROOF_INVALID");

  const otherAttestor: AttestedReadDeps = { ...honest(), attestors: ["0x0000000000000000000000000000000000000001"] };
  await assert.rejects(attestChessRating({ username: "erik", mode: "rapid", withName: false }, otherAttestor), (error: unknown) => error instanceof ChessReadError && error.code === "PROOF_INVALID");
});

test("zkFetch's refusals, as measured, become the right typed refusal", async () => {
  // The three messages read on 17 Sep 2026 against bar, an unknown name, and bar's blitz.
  const notFound = "protocol terminated with error: HTTP response status 404 is not a success status: received HTTP 404, expected 2xx";
  const noName = `attestor submission failed: failed to submit TEE bundle: failed to send request: RPC request failed: Invalid receipt. Regex "${CHESS_PROFILE.matches[2].value}" didn't match (code: 1)`;
  const noBlitz = `attestor submission failed: failed to submit TEE bundle: failed to send request: RPC request failed: Invalid receipt. Regex "${chessRatingPattern("blitz")}" didn't match (code: 1)`;
  assert.equal(classifyFetchFailure(notFound, CHESS_PLAYER).code, "NOT_FOUND");
  assert.equal(classifyFetchFailure(noName, CHESS_PROFILE).pattern, CHESS_PROFILE.matches[2].value);
  assert.equal(classifyFetchFailure("socket hang up", CHESS_PLAYER).code, "FETCH_FAILED");

  const failing = (message: string, sourceId: string): AttestedReadDeps => ({
    ...honest(),
    zkFetch: async (source, account) => {
      if (source.id === sourceId) throw new Error(message);
      return honest().zkFetch(source, account);
    },
  });
  const code = async (deps: AttestedReadDeps, withName: boolean, mode: "rapid" | "blitz" = "rapid") => {
    try {
      await attestChessRating({ username: "bar", mode, withName }, deps);
      return "none";
    } catch (error) {
      return error instanceof ChessReadError ? error.code : "untyped";
    }
  };
  assert.equal(await code(failing(notFound, CHESS_PLAYER.id), false), "PROFILE_NOT_FOUND");
  assert.equal(await code(failing(noName, CHESS_PROFILE.id), true), "NO_NAME");
  assert.equal(await code(failing(noBlitz, CHESS_RATINGS.blitz.id), false, "blitz"), "NO_RATING");
  assert.equal(await code(failing("socket hang up", CHESS_RATINGS.rapid.id), false), "FETCH_FAILED");
  // The ratings page answering 404 for a player whose profile answered: Chess.com's own failure, measured 17 Sep 2026.
  assert.equal(await code(failing(notFound, CHESS_RATINGS.rapid.id), false), "FETCH_FAILED", "never 'no such player'");
});

test("the plain read answers who and where, and says which failure it met", async () => {
  const pages: Record<string, { status: number; body: unknown }> = {
    "https://api.chess.com/pub/player/erik": { status: 200, body: { player_id: 41, username: "erik", name: "Erik" } },
    "https://api.chess.com/pub/player/erik/stats": {
      status: 200,
      body: {
        chess_daily: { last: { rating: 1502, date: 1789650995, rd: 63 } },
        // A best of its own beside the last reading, and a cadence without one: both measured on 17 Sep 2026.
        chess_rapid: { last: { rating: 1904, date: 1764957051, rd: 80 }, best: { rating: 1904, date: 1647475349 } },
        chess_bullet: { last: { rating: 1712, date: 1782332751, rd: 42 }, best: { rating: 2071, date: 1298134178 } },
      },
    },
    "https://api.chess.com/pub/player/bar": { status: 200, body: { player_id: 347202211, username: "bar" } },
    "https://api.chess.com/pub/player/bar/stats": { status: 200, body: { chess_rapid: { last: { rating: 1705, date: 1775022187 } }, fide: 0 } },
    "https://api.chess.com/pub/player/nobody-zz9": { status: 404, body: { code: 0, message: "User not found." } },
    "https://api.chess.com/pub/player/flaky": { status: 200, body: { player_id: 7, username: "flaky" } },
    "https://api.chess.com/pub/player/flaky/stats": { status: 404, body: { code: 0, message: "An internal error has occurred. Please contact Chess.com Developer's Forum for further help" } },
  };
  const seen: string[] = [];
  const fetcher: PlainFetch = async (url, init) => {
    seen.push(String((init.headers as Record<string, string>)["user-agent"]));
    const page = pages[url] ?? { status: 503, body: null };
    return new Response(JSON.stringify(page.body), { status: page.status });
  };
  assert.deepEqual(await readChessStanding("Erik", "rapid", fetcher), { username: "erik", playerId: "41", rating: 1904, ratedAt: 1764957051, rd: 80, best: 1904 });
  assert.deepEqual(await readChessStanding("Erik", "bullet", fetcher), { username: "erik", playerId: "41", rating: 1712, ratedAt: 1782332751, rd: 42, best: 2071 });
  assert.deepEqual(await readChessStanding("bar", "blitz", fetcher), { username: "bar", playerId: "347202211", rating: null, ratedAt: null, rd: null, best: null });
  await assert.rejects(readChessStanding("nobody-zz9", "rapid", fetcher), (error: unknown) => error instanceof ChessReadError && error.code === "PROFILE_NOT_FOUND");
  await assert.rejects(readChessStanding("down", "rapid", fetcher), (error: unknown) => error instanceof ChessReadError && error.code === "FETCH_FAILED");
  await assert.rejects(readChessStanding("flaky", "rapid", fetcher), (error: unknown) => error instanceof ChessReadError && error.code === "FETCH_FAILED", "a ratings page failing is not a player missing");
  await assert.rejects(readChessStanding("a b", "rapid", fetcher), (error: unknown) => error instanceof ChessReadError && error.code === "INVALID_USERNAME");
  assert.ok(seen.every((agent) => agent.startsWith("Viky/")), "Chess.com answers a request without a user agent with a challenge page");
});

test("the page parsers read what the pages hold, and nothing else", () => {
  assert.equal(playerOfProfile({ player_id: "41", username: "erik" }), null, "an id that is not a number is no player");
  assert.equal(ratingOfStats({ chess960_daily: { last: { rating: 1231 } } }, "daily"), null, "chess960 is another game");
  assert.equal(ratingOfStats(null, "rapid"), null);
});

test("the register's name check is Chess.com's own rule, and the milestone half agrees with the register", () => {
  const check = CHESS_RATING.link.kind === "username" ? CHESS_RATING.link.check : undefined;
  assert.ok(check);
  for (const name of ["erik", "Hikaru", "a_b-c", "ab", "a".repeat(25), "a".repeat(26), "a b", "x/y", "../../secret", ""]) {
    assert.equal(check?.valid(name), isValidChessUsername(name), name);
    assert.equal(CHESS_MILESTONE.validName(name), isValidChessUsername(name), name);
  }
  assert.equal(check?.path, CHESS_MILESTONE.standingPath);
  assert.deepEqual(CHESS_MILESTONE.cadences.map((cadence) => cadence.id), [...CHESS_MODES]);
  assert.equal(CHESS_MILESTONE.words.refusals.nameShape, check?.refusals.shape);
  assert.equal(CHESS_MILESTONE.words.refusals.notFound, check?.refusals.notFound);
});

test("a rating has settled below the RD measured on 17 Sep 2026, and not at it, nor without an RD (D90)", () => {
  assert.equal(CHESS_SETTLED_RD_BELOW, 60);
  // Low: hikaru's blitz, 31. High: a new account, 350 as Chess.com starts one; bar's rapid, 197. None: never played.
  assert.equal(ratingHasSettled(31), true);
  assert.equal(ratingHasSettled(59), true);
  assert.equal(ratingHasSettled(60), false);
  assert.equal(ratingHasSettled(197), false);
  assert.equal(ratingHasSettled(350), false);
  assert.equal(ratingHasSettled(null), false);
  assert.equal(CHESS_MILESTONE.settled, ratingHasSettled, "the register refuses what the reading says has not settled");
  assert.deepEqual(ratingOfStats({ chess_blitz: { last: { rating: 800, date: 1741705144 } } }, "blitz"), { rating: 800, ratedAt: 1741705144, rd: null, best: null }, "a block without an RD, or without a best, has neither");
  // SevyB, the founder's own account on 17 Sep 2026: a rapid rating, no best block at all.
  assert.deepEqual(ratingOfStats({ chess_rapid: { last: { rating: 383, date: 1789673410, rd: 156 } } }, "rapid"), { rating: 383, ratedAt: 1789673410, rd: 156, best: null });
});
