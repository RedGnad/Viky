import assert from "node:assert/strict";
import test from "node:test";
import {
  attestedSource,
  attestedSourceIds,
  CHESS_PLAYER,
  CHESS_PROFILE,
  CHESS_RATINGS,
  COURSERA_CERTIFICATE,
  DUOLINGO_PROFILE,
} from "../src/attested-sources";
import { chessStatusPattern } from "../src/chess-com";

test("only the listed sources exist, and an unknown name is refused", () => {
  assert.deepEqual([...attestedSourceIds()].sort(), [
    "chess-player",
    "chess-profile",
    "chess-ratings-blitz",
    "chess-ratings-bullet",
    "chess-ratings-daily",
    "chess-ratings-rapid",
    "coursera-certificate",
    "det-certificate",
    "duolingo-profile",
  ]);
  assert.equal(attestedSource("duolingo-profile"), DUOLINGO_PROFILE);
  assert.equal(attestedSource("anything-else"), undefined);
  assert.equal(attestedSource(""), undefined);
});

test("a caller cannot steer the reading anywhere else", () => {
  // The whole point of the list: an account name is a name, never a path or a host.
  for (const account of ["../../secret", "a/b", "http://elsewhere.test", "name?x=1", "a b", "", "#", "a".repeat(40)]) {
    assert.equal(DUOLINGO_PROFILE.accepts(account), false, `duolingo accepted ${JSON.stringify(account)}`);
    assert.equal(CHESS_PROFILE.accepts(account), false, `chess accepted ${JSON.stringify(account)}`);
  }
  assert.ok(DUOLINGO_PROFILE.accepts("ama_learns"));
  assert.ok(CHESS_PROFILE.accepts("yan_plays"));
});

test("each source reads the page it says it reads", () => {
  assert.equal(DUOLINGO_PROFILE.url("ama"), "https://www.duolingo.com/2017-06-30/users?username=ama");
  assert.equal(CHESS_PROFILE.url("Yan_plays"), "https://api.chess.com/pub/player/yan_plays", "Chess.com names are lower case");
  assert.equal(CHESS_PLAYER.url("Yan_plays"), "https://api.chess.com/pub/player/yan_plays");
  assert.equal(CHESS_RATINGS.rapid.url("Yan_plays"), "https://api.chess.com/pub/player/yan_plays/stats");
  for (const source of [DUOLINGO_PROFILE, CHESS_PROFILE, CHESS_PLAYER, ...Object.values(CHESS_RATINGS), COURSERA_CERTIFICATE]) {
    assert.match(source.url("someone"), /^https:\/\//, `${source.id} must be read over a secure connection`);
    assert.ok(source.matches.length > 0, `${source.id} must require something of the answer`);
  }
});

test("the patterns match what those pages actually answer", () => {
  // Captured from the real pages, whole, so a change of shape breaks a test rather than a gift: the two profiles on
  // 18 Sep 2026 (with the `status` every profile carries), the ratings pages on 17 Sep 2026.
  const chessProfile =
    '{"avatar":"https://images.chesscomfiles.com/uploads/v1/user/0.00000000.200x200o.000000000000.jpeg","player_id":41,"@id":"https://api.chess.com/pub/player/yan_plays","url":"https://www.chess.com/member/yan_plays","name":"Yan","username":"yan_plays","followers":10299,"country":"https://api.chess.com/pub/country/US","location":"Somewhere","last_online":1789681439,"joined":1178556600,"status":"staff","is_streamer":false,"verified":false,"league":"Silver","streaming_platforms":[]}';
  for (const m of CHESS_PROFILE.matches) assert.match(chessProfile, new RegExp(m.value), m.value);
  const noName =
    '{"player_id":990000000003,"@id":"https://api.chess.com/pub/player/uma_plays","url":"https://www.chess.com/member/uma_plays","username":"uma_plays","followers":16,"country":"https://api.chess.com/pub/country/AR","last_online":1789567621,"joined":1708776454,"status":"basic","is_streamer":false,"verified":false,"league":"Stone","streaming_platforms":[]}';
  for (const m of CHESS_PLAYER.matches) assert.match(noName, new RegExp(m.value), m.value);
  assert.equal(CHESS_PROFILE.matches.every((m) => new RegExp(m.value).test(noName)), false, "a binding needs a name to hold the code");

  // ivo_plays, an account Chess.com has closed, read on 18 Sep 2026: the same shape, and the status says so (U1).
  const closed =
    '{"avatar":"https://images.chesscomfiles.com/uploads/v1/user/0.00000000.200x200o.000000000000.gif","player_id":990000000002,"@id":"https://api.chess.com/pub/player/ivo_plays","url":"https://www.chess.com/member/Ivo_plays","username":"ivo_plays","followers":0,"country":"https://api.chess.com/pub/country/NL","last_online":1620662445,"joined":1462908315,"status":"closed","is_streamer":false,"verified":false,"streaming_platforms":[]}';
  for (const m of CHESS_PLAYER.matches) assert.match(closed, new RegExp(m.value), m.value);
  assert.equal(new RegExp(chessStatusPattern()).exec(closed)?.groups?.status, "closed");
  assert.equal(new RegExp(chessStatusPattern()).exec(chessProfile)?.groups?.status, "staff");

  // ama_plays's page lists daily first, then rapid, bullet and blitz. Each cadence must read its own block.
  const chessStats =
    '{"chess_daily":{"last":{"rating":2239,"date":1770563021,"rd":103}},"chess960_daily":{"last":{"rating":1231,"date":1444458214,"rd":230}},"chess_rapid":{"last":{"rating":2838,"date":1786796329,"rd":44}},"chess_bullet":{"last":{"rating":3403,"date":1789235988,"rd":30}},"chess_blitz":{"last":{"rating":3410,"date":1789613471,"rd":31}}}';
  const read = (mode: keyof typeof CHESS_RATINGS) => new RegExp(CHESS_RATINGS[mode].matches[0].value).exec(chessStats)?.groups;
  assert.deepEqual({ ...read("rapid") }, { rating: "2838", date: "1786796329", rd: "44" });
  assert.deepEqual({ ...read("blitz") }, { rating: "3410", date: "1789613471", rd: "31" });
  assert.deepEqual({ ...read("bullet") }, { rating: "3403", date: "1789235988", rd: "30" });
  assert.deepEqual({ ...read("daily") }, { rating: "2239", date: "1770563021", rd: "103" }, "chess960_daily is another game");
  const neverPlayedBlitz = '{"chess_rapid":{"last":{"rating":1705,"date":1775022187,"rd":197}},"fide":0}';
  assert.equal(new RegExp(CHESS_RATINGS.blitz.matches[0].value).test(neverPlayedBlitz), false, "a cadence never played has no rating");
  // The one block of 275 read on 17 Sep 2026 that carried no RD: no RD, no reading (D90).
  const noRd = '{"chess_blitz":{"last":{"rating":800,"date":1741705144}}}';
  assert.equal(new RegExp(CHESS_RATINGS.blitz.matches[0].value).test(noRd), false, "a rating without its RD is not read");

  const duolingo = '{"users":[{"id":12345,"totalXp":8401,"username":"ama","name":"Ama","streak":3}]}';
  for (const m of DUOLINGO_PROFILE.matches) assert.match(duolingo, new RegExp(m.value), m.value);
});

test("a Coursera certificate page answers with everything the proof needs", () => {
  // Captured on 13 Sep 2026 from a real page; the same shape held on six certificates from 2014 to 2023.
  const page = '{"firstName":"Ada","lastName":"Lovelace","courseId":"A4W_GyDjEeW5Rwo0txKkgQ","certificateCode":"ADA1EXAMPLE1","grantedAt":1594224731127}';
  for (const m of COURSERA_CERTIFICATE.matches) assert.match(page, new RegExp(m.value), m.value);
  const granted = new RegExp(COURSERA_CERTIFICATE.matches[4].value).exec(page);
  assert.equal(granted?.groups?.grantedAt, "1594224731127", "the day it was granted, in milliseconds");
  // Seconds would be a date in 1970 once divided again, so the pattern must not accept them at all.
  const inSeconds = '{"grantedAt":1594224731}';
  assert.equal(new RegExp(COURSERA_CERTIFICATE.matches[4].value).test(inSeconds), false, "seconds are not milliseconds");

  assert.ok(COURSERA_CERTIFICATE.accepts("ADA1EXAMPLE1"));
  assert.ok(COURSERA_CERTIFICATE.accepts("MQQRRYLUXB"));
  // The page after the redirect, so a proof is of the answer and not of the hop.
  assert.equal(
    COURSERA_CERTIFICATE.url("ada1example1"),
    "https://www.coursera.org/account/accomplishments/verify/ADA1EXAMPLE1",
  );
});
