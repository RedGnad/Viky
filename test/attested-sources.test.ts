import assert from "node:assert/strict";
import test from "node:test";
import {
  attestedSource,
  attestedSourceIds,
  CHESS_PROFILE,
  CHESS_RATINGS,
  COURSERA_CERTIFICATE,
  DUOLINGO_PROFILE,
} from "../src/attested-sources";

test("only the listed sources exist, and an unknown name is refused", () => {
  assert.deepEqual([...attestedSourceIds()].sort(), ["chess-profile", "chess-ratings", "coursera-certificate", "duolingo-profile"]);
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
  assert.equal(CHESS_RATINGS.url("Erik"), "https://api.chess.com/pub/player/erik/stats");
  for (const source of [DUOLINGO_PROFILE, CHESS_PROFILE, CHESS_RATINGS, COURSERA_CERTIFICATE]) {
    assert.match(source.url("someone"), /^https:\/\//, `${source.id} must be read over a secure connection`);
    assert.ok(source.matches.length > 0, `${source.id} must require something of the answer`);
  }
});

test("the patterns match what those pages actually answer", () => {
  // Captured from the real pages on 12 Sep 2026, so a change of shape breaks a test rather than a gift.
  const chessProfile = '{"player_id":41,"url":"https://www.chess.com/member/erik","name":"Erik","username":"erik"}';
  for (const m of CHESS_PROFILE.matches) assert.match(chessProfile, new RegExp(m.value), m.value);

  const chessStats = '{"chess_daily":{"last":{"rating":1493,"date":1789213782,"rd":63}},"chess_rapid":{"last":{"rating":1904,"date":1764957051,"rd":80}}}';
  const rating = new RegExp(CHESS_RATINGS.matches[0].value).exec(chessStats);
  assert.equal(rating?.groups?.mode, "daily");
  assert.equal(rating?.groups?.rating, "1493");

  const duolingo = '{"users":[{"id":12345,"totalXp":8401,"username":"ama","name":"Ama","streak":3}]}';
  for (const m of DUOLINGO_PROFILE.matches) assert.match(duolingo, new RegExp(m.value), m.value);
});

test("a Coursera certificate page answers with everything the proof needs", () => {
  // Captured on 13 Sep 2026 from a real page; the same shape held on six certificates from 2014 to 2023.
  const page = '{"firstName":"Anish","lastName":"Sachdeva","courseId":"A4W_GyDjEeW5Rwo0txKkgQ","certificateCode":"3S3AANA8JQTN","grantedAt":1594224731127}';
  for (const m of COURSERA_CERTIFICATE.matches) assert.match(page, new RegExp(m.value), m.value);
  const granted = new RegExp(COURSERA_CERTIFICATE.matches[4].value).exec(page);
  assert.equal(granted?.groups?.grantedAt, "1594224731127", "the day it was granted, in milliseconds");

  assert.ok(COURSERA_CERTIFICATE.accepts("3S3AANA8JQTN"));
  assert.ok(COURSERA_CERTIFICATE.accepts("MQQRRYLUXB"));
  // The page after the redirect, so a proof is of the answer and not of the hop.
  assert.equal(
    COURSERA_CERTIFICATE.url("3s3aana8jqtn"),
    "https://www.coursera.org/account/accomplishments/verify/3S3AANA8JQTN",
  );
});
