import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  attestedSource,
  attestedSourceIds,
  CHESS_PLAYER,
  CHESS_PROFILE,
  CHESS_RATINGS,
  COURSERA_CERTIFICATE,
  CREDLY_ASSERTION,
  CREDLY_BADGE_PAGE,
  headersFor,
} from "../src/attested-sources";
import { DUOLINGO_PROFILE } from "../src/attested-sources";
import { CHESS_USER_AGENT, chessStatusPattern } from "../src/chess-com";

test("only the listed sources exist, and an unknown name is refused", () => {
  assert.deepEqual([...attestedSourceIds()].sort(), [
    "chess-player",
    "chess-profile",
    "chess-ratings-blitz",
    "chess-ratings-bullet",
    "chess-ratings-daily",
    "chess-ratings-rapid",
    "chess-tactics",
    "coursera-certificate",
    "credly-assertion",
    "credly-badge-page",
    "det-certificate",
    "duolingo-profile", "google-health-active-minutes", "strava-day-activities"]);
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
  // Captured from the real pages, whole, so a change of shape breaks a test rather than a gift: the two profiles on
  // 18 Sep 2026 (with the `status` every profile carries), the ratings pages on 17 Sep 2026.
  const chessProfile =
    '{"avatar":"https://images.chesscomfiles.com/uploads/v1/user/41.5434c4ff.200x200o.5b102889d835.jpeg","player_id":41,"@id":"https://api.chess.com/pub/player/erik","url":"https://www.chess.com/member/erik","name":"Erik","username":"erik","followers":10299,"country":"https://api.chess.com/pub/country/US","location":"Bay Area, CA","last_online":1789681439,"joined":1178556600,"status":"staff","is_streamer":false,"verified":false,"league":"Silver","streaming_platforms":[]}';
  for (const m of CHESS_PROFILE.matches) assert.match(chessProfile, new RegExp(m.value), m.value);
  const noName =
    '{"player_id":347202211,"@id":"https://api.chess.com/pub/player/bar","url":"https://www.chess.com/member/bar","username":"bar","followers":16,"country":"https://api.chess.com/pub/country/AR","last_online":1789567621,"joined":1708776454,"status":"basic","is_streamer":false,"verified":false,"league":"Stone","streaming_platforms":[]}';
  for (const m of CHESS_PLAYER.matches) assert.match(noName, new RegExp(m.value), m.value);
  assert.equal(CHESS_PROFILE.matches.every((m) => new RegExp(m.value).test(noName)), false, "a binding needs a name to hold the code");

  // dubov, an account Chess.com has closed, read on 18 Sep 2026: the same shape, and the status says so (U1).
  const closed =
    '{"avatar":"https://images.chesscomfiles.com/uploads/v1/user/28129450.c9c9e6ad.200x200o.73fd0c088ca9.gif","player_id":28129450,"@id":"https://api.chess.com/pub/player/dubov","url":"https://www.chess.com/member/Dubov","username":"dubov","followers":0,"country":"https://api.chess.com/pub/country/NL","last_online":1620662445,"joined":1462908315,"status":"closed","is_streamer":false,"verified":false,"streaming_platforms":[]}';
  for (const m of CHESS_PLAYER.matches) assert.match(closed, new RegExp(m.value), m.value);
  assert.equal(new RegExp(chessStatusPattern()).exec(closed)?.groups?.status, "closed");
  assert.equal(new RegExp(chessStatusPattern()).exec(chessProfile)?.groups?.status, "staff");

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
  // The page's own shape, read on 19 Sep 2026 on two live certificates four years apart (one granted in 2020, one in
  // 2024): the same four objects, each matching exactly once, in 432 KB of HTML. The fixture this replaced was a
  // five field summary of those values rather than the page, so a pattern could match it and miss the real thing.
  const page = [
    '{"__typename":"AccomplishmentsSignatureTrackProfile","firstName":"Ada","lastName":"Lovelace","middleName":null}',
    '{"__typename":"Course_Course","id":"A4W_GyDjEeW5Rwo0txKkgQ","slug":"matlab","name":"Introduction to Programming with MATLAB"}',
    '{"__typename":"XdpV1","name":"Another course entirely","id":"COURSE~other","slug":"another-course"}',
    '{"__typename":"AccomplishmentsVCMembership","certificateCode":"3S3AANA8JQTN","grantedAt":1594224731127}',
  ].join(",");
  for (const m of COURSERA_CERTIFICATE.matches) assert.match(page, new RegExp(m.value), m.value);
  // The course read is the certificate's own, though the page carries another course with the same field names.
  assert.equal(new RegExp(COURSERA_CERTIFICATE.matches[1].value).exec(page)?.groups?.slug, "matlab");
  const granted = new RegExp(COURSERA_CERTIFICATE.matches[3].value).exec(page);
  assert.equal(granted?.groups?.grantedAt, "1594224731127", "the day it was granted, in milliseconds");
  // Seconds would be a date in 1970 once divided again, so the pattern must not accept them at all.
  const inSeconds = '{"grantedAt":1594224731}';
  assert.equal(new RegExp(COURSERA_CERTIFICATE.matches[3].value).test(inSeconds), false, "seconds are not milliseconds");

  assert.ok(COURSERA_CERTIFICATE.accepts("3S3AANA8JQTN"));
  assert.ok(COURSERA_CERTIFICATE.accepts("MQQRRYLUXB"));
  // The page after the redirect, so a proof is of the answer and not of the hop.
  assert.equal(
    COURSERA_CERTIFICATE.url("3s3aana8jqtn"),
    "https://www.coursera.org/account/accomplishments/verify/3S3AANA8JQTN",
  );
});

/**
 * What a request is made of is part of what is fetched, so it lives with the sources and is covered by the reading
 * fingerprint. It used to sit beside the verification, outside the number: a change of headers would have been
 * invisible to both the app and the worker, and one of them was wrong for a week of nothing.
 *
 * Measured on 20 Sep 2026: Credly's badge page varies on `Accept` and answers 500 to `application/json`, which is
 * what every source had always been read with. The attested reading of a badge could not be taken at all, and the
 * condition was live. A real proof of both halves was taken through the attestor once this was set.
 */
test("a source that answers only to its own Accept says so, and the reading asks for exactly that", () => {
  assert.equal(CREDLY_BADGE_PAGE.accept, "text/html");
  assert.deepEqual(headersFor(CREDLY_BADGE_PAGE), { accept: "text/html", "user-agent": CHESS_USER_AGENT });
  // Every other source answers with JSON and says nothing, so nothing changes for any of them.
  for (const source of [COURSERA_CERTIFICATE, CREDLY_ASSERTION, CHESS_PROFILE, DUOLINGO_PROFILE]) {
    assert.equal(source.accept, undefined, source.id);
    assert.equal(headersFor(source).accept, "application/json", source.id);
  }
  assert.equal(headersFor(DUOLINGO_PROFILE)["user-agent"], "Mozilla/5.0 (Viky)", "a source that asks for no agent gets ours");
  // And it stays in the file the fingerprint covers, which is the whole reason it moved.
  assert.match(readFileSync("src/attested-sources.ts", "utf8"), /export function headersFor/);
  assert.doesNotMatch(readFileSync("src/attested-read.ts", "utf8"), /function headersFor/);
});
