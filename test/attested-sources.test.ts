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

test("only the listed sources exist, and an unknown name is refused", () => {
  assert.deepEqual([...attestedSourceIds()].sort(), [
    "chess-player",
    "chess-profile",
    "chess-ratings-blitz",
    "chess-ratings-bullet",
    "chess-ratings-daily",
    "chess-ratings-rapid",
    "coursera-certificate",
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
  assert.ok(CHESS_PROFILE.accepts("erik"));
});

test("each source reads the page it says it reads", () => {
  assert.equal(DUOLINGO_PROFILE.url("ama"), "https://www.duolingo.com/2017-06-30/users?username=ama");
  assert.equal(CHESS_PROFILE.url("Erik"), "https://api.chess.com/pub/player/erik", "Chess.com names are lower case");
  assert.equal(CHESS_PLAYER.url("Erik"), "https://api.chess.com/pub/player/erik");
  assert.equal(CHESS_RATINGS.rapid.url("Erik"), "https://api.chess.com/pub/player/erik/stats");
  for (const source of [DUOLINGO_PROFILE, CHESS_PROFILE, CHESS_PLAYER, ...Object.values(CHESS_RATINGS), COURSERA_CERTIFICATE]) {
    assert.match(source.url("someone"), /^https:\/\//, `${source.id} must be read over a secure connection`);
    assert.ok(source.matches.length > 0, `${source.id} must require something of the answer`);
  }
});

test("the patterns match what those pages actually answer", () => {
  // Captured from the real pages on 17 Sep 2026, so a change of shape breaks a test rather than a gift.
  const chessProfile =
    '{"avatar":"https://images.chesscomfiles.com/uploads/v1/user/41.5434c4ff.200x200o.5b102889d835.jpeg","player_id":41,"@id":"https://api.chess.com/pub/player/erik","url":"https://www.chess.com/member/erik","name":"Erik","username":"erik","followers":10297}';
  for (const m of CHESS_PROFILE.matches) assert.match(chessProfile, new RegExp(m.value), m.value);
  const noName = '{"player_id":347202211,"@id":"https://api.chess.com/pub/player/bar","url":"https://www.chess.com/member/bar","username":"bar","followers":16}';
  for (const m of CHESS_PLAYER.matches) assert.match(noName, new RegExp(m.value), m.value);
  assert.equal(CHESS_PROFILE.matches.every((m) => new RegExp(m.value).test(noName)), false, "a binding needs a name to hold the code");

  // hikaru's page lists daily first, then rapid, bullet and blitz. Each cadence must read its own block.
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
  const page = '{"firstName":"Anish","lastName":"Sachdeva","courseId":"A4W_GyDjEeW5Rwo0txKkgQ","certificateCode":"3S3AANA8JQTN","grantedAt":1594224731127}';
  for (const m of COURSERA_CERTIFICATE.matches) assert.match(page, new RegExp(m.value), m.value);
  const granted = new RegExp(COURSERA_CERTIFICATE.matches[4].value).exec(page);
  assert.equal(granted?.groups?.grantedAt, "1594224731127", "the day it was granted, in milliseconds");
  // Seconds would be a date in 1970 once divided again, so the pattern must not accept them at all.
  const inSeconds = '{"grantedAt":1594224731}';
  assert.equal(new RegExp(COURSERA_CERTIFICATE.matches[4].value).test(inSeconds), false, "seconds are not milliseconds");

  assert.ok(COURSERA_CERTIFICATE.accepts("3S3AANA8JQTN"));
  assert.ok(COURSERA_CERTIFICATE.accepts("MQQRRYLUXB"));
  // The page after the redirect, so a proof is of the answer and not of the hop.
  assert.equal(
    COURSERA_CERTIFICATE.url("3s3aana8jqtn"),
    "https://www.coursera.org/account/accomplishments/verify/3S3AANA8JQTN",
  );
});
