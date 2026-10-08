// The journal of what Viky asks of Reclaim, the count of the month's allowance and the limit Viky holds itself to
// (3 Oct 2026): every fetch that leaves is written down, proof or not; the cycle's use is counted from it; past the
// limit nothing is sent and the refusal is LIMIT_REACHED; the operator is told once when fifteen, ten, five and none
// are left, the last with the days then waiting for a reading; and each morning of the judging, what the day before
// spent.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  allowanceAlert,
  allowanceAlertsDue,
  BEFORE_THE_JOURNAL,
  configureAttestedCalls,
  countedFetch,
  cycleInWords,
  cycleOf,
  RECLAIM_CYCLE_DAY,
  cycleUse,
  inJudging,
  isReclaimQuotaRefusal,
  JUDGING,
  leftMarkReached,
  leftOf,
  limitsNow,
  limitsOf,
  LOST_ON_30_SEP_2026,
  morningSummary,
  morningSummaryDue,
  neverLeftForReclaim,
  noteAttestedCall,
  RECLAIM_ALERT_LEFT,
  RECLAIM_ALLOWANCE,
  reclaimAllowance,
  ReclaimLimitReached,
  SEPTEMBER_2026,
  spentOn,
  startsAgainInWords,
  type AttestedCall,
  type CycleUse,
} from "../src/attested-calls";
import { attestedRead, AttestedReadError } from "../src/attested-read";
import { CHESS_PLAYER } from "../src/attested-sources";
import { countableUntil, daysWaiting, daysWaitingOf } from "../src/days-waiting";
import { fetchPublicProfile, PublicProfileError } from "../src/duolingo-public";
import { giftLimitFor } from "../src/gift-limit";
import { emptyReserveOf, reserveOf } from "../src/reserves";
import { MILESTONE_OURS_TO_FIX, PROOF_EVERY_SECONDS, refusalMessage } from "../src/milestone-reading";
import type { SqlExecutor } from "../src/proof-session-store";
import { momentInWords } from "../src/moments";
import { LIMIT } from "../src/sentences";

let db: PGlite;
const quiet = async () => {};
const executor: SqlExecutor = async (strings, ...values) => {
  const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
  return (await db.query<Record<string, unknown>>(text, values)).rows;
};

before(async () => {
  db = new PGlite();
  configureAttestedCalls(executor);
});

beforeEach(async () => {
  await noteAttestedCall({ kind: "fetch", source: "made-so-the-table-exists", ok: true }, quiet);
  await db.query("DELETE FROM viky_attested_calls");
});

after(async () => {
  configureAttestedCalls(undefined);
  await db.close();
});

function use(proved: number, shown = 0, more: { started?: number; asked?: number; verified?: number; fetchesAllowed?: number } = {}): CycleUse {
  return {
    from: "2026-11-01T00:00:00.000Z",
    until: "2026-12-01T00:00:00.000Z",
    fetches: { started: more.started ?? proved, proved, allowed: more.fetchesAllowed ?? 100 },
    verifications: { asked: more.asked ?? shown, shown, verified: more.verified ?? 0, allowed: 25 },
  };
}

test("a cycle runs from the 1st of a month at midnight UTC to the 1st of the next, as Reclaim's dashboard shows it", () => {
  // The dashboard of the account that holds the two applications: "01/10 - 01/11/2026".
  assert.equal(RECLAIM_CYCLE_DAY, 1);
  const at = (iso: string) => {
    const { from, until } = cycleOf(Date.parse(iso));
    return `${from.toISOString().slice(0, 10)} to ${until.toISOString().slice(0, 10)}`;
  };
  assert.equal(at("2026-10-03T13:00:00Z"), "2026-10-01 to 2026-11-01");
  assert.equal(at("2026-10-01T00:00:00Z"), "2026-10-01 to 2026-11-01", "from its first second");
  assert.equal(at("2026-10-31T23:59:59Z"), "2026-10-01 to 2026-11-01", "to its last");
  assert.equal(at("2026-11-01T00:00:00Z"), "2026-11-01 to 2026-12-01");
  assert.equal(at("2026-09-30T15:00:00Z"), "2026-09-01 to 2026-10-01", "the fault of 30 Sep is September's");
  assert.equal(at("2026-12-30T08:00:00Z"), "2026-12-01 to 2027-01-01", "over a new year");
});

test("the allowance is the free tier's unless Reclaim granted more, and the operator is told when fifteen, ten, five and none are left", () => {
  assert.deepEqual(RECLAIM_ALLOWANCE, { fetches: 100, verifications: 25 });
  assert.deepEqual(reclaimAllowance({}), { fetches: 100, verifications: 25 });
  assert.deepEqual(reclaimAllowance({ RECLAIM_FETCH_ALLOWANCE: "250", RECLAIM_VERIFICATION_ALLOWANCE: " 40 " }), { fetches: 250, verifications: 40 });
  // A setting that is not a whole number changes nothing: the limit is never lifted by a typing mistake.
  assert.deepEqual(reclaimAllowance({ RECLAIM_FETCH_ALLOWANCE: "unlimited", RECLAIM_VERIFICATION_ALLOWANCE: "-1" }), { fetches: 100, verifications: 25 });
  // By what is left, not by a share of the whole (the founder, 3 Oct 2026, with thirty left for three weeks).
  assert.deepEqual(RECLAIM_ALERT_LEFT, [15, 10, 5, 0]);
  const fetches = (used: number) => leftMarkReached(used, RECLAIM_ALLOWANCE.fetches);
  assert.deepEqual([70, 84, 85, 89, 90, 94, 95, 99, 100, 128].map(fetches), [null, null, 15, 15, 10, 10, 5, 5, 0, 0]);
  const proofs = (used: number) => leftMarkReached(used, RECLAIM_ALLOWANCE.verifications);
  assert.deepEqual([9, 10, 14, 15, 20, 24, 25].map(proofs), [null, 15, 15, 10, 5, 5, 0]);
  // The same marks on a larger allowance: they follow what is left, wherever the whole stands.
  assert.deepEqual([184, 185, 200].map((used) => leftMarkReached(used, 200)), [null, 15, 0]);
  assert.deepEqual([leftOf(70, 100), leftOf(100, 100), leftOf(128, 100)], [30, 0, 0], "never less than nothing");
});

test("the cycle's use is what the journal holds: fetches started and proved, proofs asked of people, come back and verified", async () => {
  const now = Date.parse("2026-11-02T10:00:00Z");
  for (const call of [
    { kind: "fetch", source: "chess-player", ok: true },
    { kind: "fetch", source: "chess-ratings-bullet", ok: false, code: "NOT_FOUND" },
    { kind: "fetch", source: "duolingo-profile", ok: true },
    { kind: "asked", source: "toefl-mybest-shown", ok: true, ref: "a1b2c3d4e5" },
    { kind: "asked", source: "university-shown", ok: true, ref: "f6a7b8c9d0" },
    // The first of the two came back and was refused, then looked at again and verified: one proof, counted once.
    { kind: "verification", source: "toefl-mybest-shown", ok: false, ref: "a1b2c3d4e5" },
    { kind: "verification", source: "toefl-mybest-shown", ok: true, ref: "a1b2c3d4e5" },
  ] satisfies AttestedCall[]) {
    await noteAttestedCall(call, quiet);
  }
  await db.query("UPDATE viky_attested_calls SET at = '2026-11-01T09:00:00Z'");
  // A fetch of the cycle before, and one of the cycle after, are not this cycle's.
  await db.query("INSERT INTO viky_attested_calls (at, kind, source, ok) VALUES ('2026-10-31T23:59:59Z', 'fetch', 'chess-player', true), ('2026-12-01T00:00:00Z', 'fetch', 'chess-player', true)");
  assert.deepEqual(await cycleUse(now, {}), {
    from: "2026-11-01T00:00:00.000Z",
    until: "2026-12-01T00:00:00.000Z",
    fetches: { started: 3, proved: 2, allowed: 100 },
    verifications: { asked: 2, shown: 1, verified: 1, allowed: 25 },
  });
  assert.equal((await cycleUse(now, { RECLAIM_FETCH_ALLOWANCE: "300" })).fetches.allowed, 300, "counted against what Reclaim granted");
});

test("what was spent before the journal began counts for October 2026's cycle, and for no other", async () => {
  // Five fetches since 1 Oct at midnight UTC, each a proof, read in the reading service's logs: two on 1 Oct, two on
  // 2 Oct, one on 3 Oct. Nothing was asked of a person.
  assert.deepEqual(BEFORE_THE_JOURNAL, { cycleFrom: "2026-10-01T00:00:00.000Z", started: 5, proved: 5, asked: 0, shown: 0 });
  await noteAttestedCall({ kind: "fetch", source: "duolingo-profile", ok: true }, quiet);
  await db.query("UPDATE viky_attested_calls SET at = '2026-10-04T00:40:00Z'");
  const first = await cycleUse(Date.parse("2026-10-04T08:00:00Z"), {});
  assert.deepEqual(first.fetches, { started: 6, proved: 6, allowed: 100 });
  assert.deepEqual(first.verifications, { asked: 0, shown: 0, verified: 0, allowed: 25 });
  assert.deepEqual(limitsOf(first), { readings: false, proofs: false });
  assert.equal(leftOf(first.fetches.proved, first.fetches.allowed), 94);
  const next = await cycleUse(Date.parse("2026-11-01T08:00:00Z"), {});
  assert.deepEqual(next.fetches, { started: 0, proved: 0, allowed: 100 });
  assert.equal(next.verifications.asked, 0);
  // September's cycle, as far as it is known: 98 proofs for at least 156 fetches started, and the fault of 30 Sep in it.
  assert.deepEqual(SEPTEMBER_2026, { proofs: 98, started: 156 });
  assert.deepEqual(LOST_ON_30_SEP_2026, { fetches: 114, proofs: 57 });
  assert.equal(35 + 6 + LOST_ON_30_SEP_2026.proofs, SEPTEMBER_2026.proofs, "the daily readings kept, the proofs of 28 Sep, and those of 30 Sep");
  assert.equal(SEPTEMBER_2026.proofs + 1 + (LOST_ON_30_SEP_2026.fetches - LOST_ON_30_SEP_2026.proofs), SEPTEMBER_2026.started, "and the fetches that gave none: one on 28 Sep, 57 on 30 Sep");
});

test("the limit goes by the readings that gave a proof and by the proofs that came back", async () => {
  assert.deepEqual(limitsOf(use(99, 24, { started: 180, asked: 60 })), { readings: false, proofs: false });
  assert.deepEqual(limitsOf(use(100, 24)), { readings: true, proofs: false });
  assert.deepEqual(limitsOf(use(40, 25)), { readings: false, proofs: true });
  assert.deepEqual(limitsOf(use(100, 0, { fetchesAllowed: 150 })), { readings: false, proofs: false }, "more was granted");
  // A count that cannot be read stops nothing, and says so in the logs.
  const logged: string[] = [];
  const consoleError = console.error;
  console.error = (line: string) => void logged.push(line);
  try {
    assert.deepEqual(await limitsNow(0, async () => Promise.reject(new Error("the database did not answer"))), { readings: false, proofs: false });
  } finally {
    console.error = consoleError;
  }
  assert.deepEqual(logged, ["reclaim limit not read: the database did not answer"]);
});

const open = { note: async () => {}, limits: async () => ({ readings: false }) };

test("a fetch is written down whether it gave a proof or not, and what it answered passes through untouched", async () => {
  const noted: AttestedCall[] = [];
  const deps = { ...open, note: async (call: AttestedCall) => void noted.push(call) };
  assert.equal(await countedFetch("chess-player", async () => "the proof", deps), "the proof");
  const missing = new AttestedReadError("NOT_FOUND", "Nothing answers to that name");
  await assert.rejects(countedFetch("chess-ratings-bullet", async () => Promise.reject(missing), deps), (thrown) => thrown === missing);
  await assert.rejects(countedFetch("duolingo-profile", async () => Promise.reject(new Error("worker 502: no proof")), deps), /worker 502/);
  // With no reading around it, a fetch names no gift and no reason (src/attested-calls.ts, `readingFor`).
  const unnamed = { gift: null, reason: null };
  assert.deepEqual(noted, [
    { kind: "fetch", source: "chess-player", ok: true, ...unnamed },
    { kind: "fetch", source: "chess-ratings-bullet", ok: false, code: "NOT_FOUND", ...unnamed },
    { kind: "fetch", source: "duolingo-profile", ok: false, code: "FAILED", ...unnamed },
  ]);
});

test("past the limit nothing is fetched: the refusal is LIMIT_REACHED, and so is Reclaim's own when it says the quota is used up", async () => {
  const noted: AttestedCall[] = [];
  const note = async (call: AttestedCall) => void noted.push(call);
  let fetched = 0;
  const refusal = await countedFetch(
    "chess-player",
    async () => {
      fetched += 1;
      return "the proof";
    },
    { note, limits: async () => ({ readings: true }) },
  ).then(() => null, (thrown: unknown) => thrown);
  assert.ok(refusal instanceof ReclaimLimitReached);
  assert.equal(refusal.code, "LIMIT_REACHED");
  assert.equal(refusal.what, "readings");
  assert.equal(fetched, 0, "nothing left for Reclaim");
  assert.deepEqual(noted, [], "and nothing is counted");

  // Reclaim's own refusal, in the two shapes known on 3 Oct 2026, and in a sentence of its backend.
  const builder = Object.assign(new Error("Builder zkFetch quota exceeded (HTTP 429)"), { name: "BuilderQuotaExceededError" });
  for (const theirs of [builder, new Error("Builder zkFetch quota exceeded (HTTP 402)"), new Error("Monthly verification limit reached for this application"), new Error("Payment required")]) {
    assert.equal(isReclaimQuotaRefusal(theirs), true, theirs.message);
    const said = await countedFetch("chess-player", async () => Promise.reject(theirs), { note, limits: async () => ({ readings: false }) }).then(() => null, (thrown: unknown) => thrown);
    assert.ok(said instanceof ReclaimLimitReached, theirs.message);
    assert.equal(said.cause, theirs, "what Reclaim said is kept beside it");
  }
  // The narrowing of the assertion above is undone: these are the rows written since.
  const written = noted as AttestedCall[];
  assert.equal(written.length, 4);
  assert.ok(written.every((call) => call.kind === "fetch" && !call.ok && call.code === "LIMIT_REACHED"), "a fetch Reclaim refused did leave, and is written down as that");
  // A platform that asks to slow down is not Reclaim's month, and neither is a page that is not there.
  for (const other of ["HTTP response status 429 is not a success status", "Rate Limit Exceeded", "Too Many Requests", "HTTP response status 404 is not a success status", "the network did not answer"]) {
    assert.equal(isReclaimQuotaRefusal(new Error(other)), false, other);
  }
});

test("the limit is its own refusal all the way to a reading: never a page that could not be read", async () => {
  const limited = { zkFetch: async () => Promise.reject(new ReclaimLimitReached("readings")), verify: async () => true };
  const chess = await attestedRead(CHESS_PLAYER.id, "erik", limited).then(() => null, (thrown: unknown) => thrown);
  assert.ok(chess instanceof AttestedReadError);
  assert.equal(chess.code, "LIMIT_REACHED");
  const duolingo = await fetchPublicProfile("boo_learns", limited).then(() => null, (thrown: unknown) => thrown);
  assert.ok(duolingo instanceof PublicProfileError);
  assert.equal(duolingo.code, "LIMIT_REACHED");
  // Every reading passes an attested read's own refusal on by its code: the code is one each of them can carry.
  for (const file of ["chess-reading", "codeforces-reading", "duolingo-course-reading", "coursera-reading", "credly-reading", "det-reading", "edx-reading", "accredible-reading", "mitx-online-reading", "marathon-reading", "wca-reading", "duolingo-public"]) {
    const source = readFileSync(`src/${file}.ts`, "utf8");
    const codes = source.slice(source.indexOf("ErrorCode ="), source.indexOf(";", source.indexOf("ErrorCode =")));
    assert.match(codes, /"LIMIT_REACHED"/, file);
  }
  // It is ours to fix: nothing is settled against a reading that was not taken, by either pass.
  assert.ok(MILESTONE_OURS_TO_FIX.has("LIMIT_REACHED"));
  const dailyPass = readFileSync("src/daily-pass.ts", "utf8");
  assert.match(dailyPass.slice(dailyPass.indexOf("const OURS_TO_FIX"), dailyPass.indexOf("]);", dailyPass.indexOf("const OURS_TO_FIX"))), /"LIMIT_REACHED",/);
});

test("a fetch that never left for Reclaim is not counted: nothing configured, a service out of date, a reading put off for a platform's pace", async () => {
  const noted: AttestedCall[] = [];
  const deps = { ...open, note: async (call: AttestedCall) => void noted.push(call) };
  const never = [
    new AttestedReadError("NOT_CONFIGURED", "The attested fetch worker is not configured"),
    new AttestedReadError("WORKER_OUT_OF_DATE", "The attested fetch worker runs other sources than this build"),
    new AttestedReadError("FETCH_FAILED", "THROTTLED retry-after=840: THROTTLED daily: race result is read again in 14 minutes"),
  ];
  for (const error of never) {
    assert.equal(neverLeftForReclaim(error), true, error.message);
    await assert.rejects(countedFetch("race-result", async () => Promise.reject(error), deps));
  }
  assert.deepEqual(noted, []);
  // A platform that itself asked to slow down was fetched. So was whatever a silent service may have fetched.
  const left = [
    new AttestedReadError("FETCH_FAILED", "THROTTLED retry-after=900: THROTTLED 429: the platform asked to slow down; read again in 15 minutes"),
    new AttestedReadError("FETCH_FAILED", "The attested fetch worker did not answer"),
    new AttestedReadError("NO_MATCH", "The page does not carry what this reading needs"),
  ];
  for (const error of left) assert.equal(neverLeftForReclaim(error), false, error.message);
  // The two sentences are the reading service's own: were it to say them otherwise, this is where it shows.
  const worker = readFileSync("scripts/zkfetch-worker.ts", "utf8");
  assert.match(worker, /message: `THROTTLED \$\{answer\.reason\}: \$\{answer\.platform\} is read again in \$\{Math\.ceil\(answer\.retryAfterMs \/ 60_000\)\} minutes`/);
  assert.match(worker, /message: `THROTTLED \$\{throttle\}: the platform asked to slow down; read again in \$\{pausedMs \/ 60_000\} minutes`/);
  assert.match(worker, /if \(!booked\.go\) return putOff\(booked\);\n\s*if \(booked\.waitMs > 0\) await wait\(booked\.waitMs\);/, "put off before anything is fetched");
});

test("a count that cannot be written or read never costs the reading: it is a line in the logs", async () => {
  const errors: string[] = [];
  const consoleError = console.error;
  console.error = (line: string) => void errors.push(line);
  configureAttestedCalls(async () => Promise.reject(new Error("the database did not answer")));
  try {
    assert.equal(await countedFetch("chess-player", async () => "the proof"), "the proof");
  } finally {
    console.error = consoleError;
    configureAttestedCalls(executor);
  }
  assert.deepEqual(errors, ["reclaim limit not read: the database did not answer", "day's ceiling not read: the database did not answer", "attested call not counted (fetch chess-player): the database did not answer"]);
});

test("each mark of what is left is told once in its cycle, only the lowest one reached, and the limit with what is waiting", async () => {
  const claimed = new Set<string>();
  let now = use(84);
  let asked = 0;
  const deps = {
    use: async () => now,
    claim: async (name: string) => {
      if (claimed.has(name)) return false;
      claimed.add(name);
      return true;
    },
    waiting: async () => {
      asked += 1;
      return { days: 3, gifts: 2, nearestEndsAt: Date.UTC(2026, 9, 25, 6, 0, 0) / 1_000 };
    },
  };
  const subjects = async () => (await allowanceAlertsDue(0, deps)).map((alert) => alert.subject);
  assert.deepEqual(await subjects(), [], "more than fifteen left, nothing");
  now = use(85, 0, { started: 99 });
  assert.deepEqual(await subjects(), ["Reclaim: 15 readings left until 1 Dec 2026, 85 of 100 used"], "by the proofs given, not by the fetches started");
  now = use(88);
  assert.deepEqual(await subjects(), [], "told once");
  now = use(91);
  assert.deepEqual(await subjects(), ["Reclaim: 9 readings left until 1 Dec 2026, 91 of 100 used"]);
  now = use(95);
  assert.deepEqual(await subjects(), ["Reclaim: 5 readings left until 1 Dec 2026, 95 of 100 used"]);
  assert.equal(asked, 0, "what is waiting is counted at the limit only");
  now = use(100, 10);
  const atTheLimit = await allowanceAlertsDue(0, deps);
  assert.deepEqual(atTheLimit.map((alert) => alert.subject), ["Reclaim: the limit is reached, 100 readings this cycle, of 100", "Reclaim: 15 proofs of people left until 1 Dec 2026, 10 of 25 used"]);
  assert.equal(asked, 1);
  assert.match(atTheLimit[0].text, /From now Viky sends no attested reading to Reclaim, and each person whose gift waits for one reads why on its page\./);
  assert.match(atTheLimit[0].text, /3 days of 2 daily gifts wait for a reading\. The first of them goes back to its funder at 2026-10-25 06:00 UTC unless it is read before\./);
  now = use(140, 14);
  assert.deepEqual(await subjects(), []);
  assert.deepEqual([...claimed], [
    "reclaim:fetches:2026-11-01:left-15",
    "reclaim:fetches:2026-11-01:left-10",
    "reclaim:fetches:2026-11-01:left-5",
    "reclaim:fetches:2026-11-01:left-0",
    "reclaim:verifications:2026-11-01:left-15",
  ]);
  // Already under a mark when first looked at: one email, for the lowest mark reached, not one for each above it.
  claimed.clear();
  now = use(92);
  assert.deepEqual(await subjects(), ["Reclaim: 8 readings left until 1 Dec 2026, 92 of 100 used"]);
  assert.deepEqual([...claimed], ["reclaim:fetches:2026-11-01:left-10"]);
});

test("the alert says the cycle, both counts, what stops at the limit, and how to lift it", () => {
  const filling = allowanceAlert(use(85, 3, { started: 96, asked: 5, verified: 2 }), "fetches");
  assert.equal(filling.subject, "Reclaim: 15 readings left until 1 Dec 2026, 85 of 100 used");
  assert.deepEqual(filling.text.split("\n"), [
    "Cycle from 1 Nov 2026 to 1 Dec 2026 (UTC).",
    "Readings: 85 attested fetches gave a proof, of 96 started, for an allowance of 100: 15 left.",
    "Proofs of people: 3 came back from Reclaim, of 5 asked, 2 verified, for an allowance of 25: 22 left.",
    "",
    "Reclaim gives more on request only: ask, then set RECLAIM_FETCH_ALLOWANCE or RECLAIM_VERIFICATION_ALLOWANCE to what it grants.",
    "The count is on /api/health, under reclaim.",
  ]);
  const limit = allowanceAlert(use(100), "fetches", { days: 1, gifts: 1, nearestEndsAt: Date.UTC(2026, 9, 24, 6, 0, 0) / 1_000 });
  assert.match(limit.text, /1 day of 1 daily gift waits for a reading\. The first of them goes back to its funder at 2026-10-24 06:00 UTC unless it is read before\./);
  assert.match(allowanceAlert(use(100), "fetches", { days: 0, gifts: 0, nearestEndsAt: null }).text, /No day of a daily gift is waiting for a reading right now\./);
  assert.match(allowanceAlert(use(100), "fetches", null).text, /The days waiting for a reading could not be counted\./);
  const proofs = allowanceAlert(use(10, 25), "verifications");
  assert.equal(proofs.subject, "Reclaim: the limit is reached, 25 proofs shown by people this cycle, of 25");
  assert.match(proofs.text, /From now Viky opens no new proof at Reclaim, and a person reads why before starting one\./);
});

test("each morning of the judging the operator reads what the day before spent, by gift and by reason, what is left and when it starts again", async () => {
  assert.deepEqual(JUDGING, { from: "2026-10-14", until: "2026-11-03" });
  const judging = (iso: string) => inJudging(Date.parse(iso));
  assert.deepEqual(["2026-10-13T23:59:59Z", "2026-10-14T00:00:00Z", "2026-11-03T23:59:59Z", "2026-11-04T00:00:00Z"].map(judging), [false, true, true, false]);

  // The journal of 15 Oct: a gift's count, a milestone that failed once and then read, a fetch nobody named.
  await db.query(`INSERT INTO viky_attested_calls (at, kind, source, ok, gift, reason) VALUES
    ('2026-10-15T00:31:00Z', 'fetch', 'duolingo-profile', true, '7', 'the morning count'),
    ('2026-10-15T09:10:00Z', 'fetch', 'duolingo-profile', true, '7', 'Count now'),
    ('2026-10-15T11:00:00Z', 'fetch', 'chess-player', false, '9', 'the milestone pass'),
    ('2026-10-15T11:04:00Z', 'fetch', 'chess-player', true, '9', 'the milestone pass'),
    ('2026-10-15T11:04:30Z', 'fetch', 'chess-ratings-blitz', true, '9', 'the milestone pass'),
    ('2026-10-15T14:00:00Z', 'fetch', 'chess-player', true, NULL, NULL),
    ('2026-10-15T15:00:00Z', 'asked', 'university-shown', true, '11', NULL),
    ('2026-10-14T23:59:59Z', 'fetch', 'duolingo-profile', true, '7', 'the morning count'),
    ('2026-10-16T00:00:00Z', 'fetch', 'duolingo-profile', true, '7', 'the morning count')`);
  const spent = await spentOn(Date.parse("2026-10-15T00:00:00Z"));
  assert.deepEqual(spent, [
    { gift: "9", reason: "the milestone pass", proved: 2, failed: 1 },
    { gift: "7", reason: "Count now", proved: 1, failed: 0 },
    { gift: "7", reason: "the morning count", proved: 1, failed: 0 },
    { gift: null, reason: null, proved: 1, failed: 0 },
  ]);

  const cycle: CycleUse = { from: "2026-10-01T00:00:00.000Z", until: "2026-11-01T00:00:00.000Z", fetches: { started: 140, proved: 81, allowed: 100 }, verifications: { asked: 4, shown: 3, verified: 3, allowed: 25 } };
  const summary = morningSummary(Date.parse("2026-10-15T00:00:00Z"), spent, cycle);
  assert.equal(summary.subject, "Reclaim, 15 Oct 2026: 5 proofs spent, 19 left until 1 Nov 2026");
  assert.deepEqual(summary.text.split("\n"), [
    "On 15 Oct 2026 (UTC), 5 attested fetches gave a proof and 1 did not.",
    "By gift and by reason:",
    "- gift 9, the milestone pass: 2 proofs, 1 without",
    "- gift 7, Count now: 1 proof",
    "- gift 7, the morning count: 1 proof",
    "- no gift named, no reason given: 1 proof",
    "",
    "Readings left: 19 of 100 (81 gave a proof this cycle, of 140 started).",
    "Proofs of people left: 22 of 25 (3 came back this cycle).",
    "Both reserves start again on 1 Nov 2026 (UTC).",
  ]);
  const idle = morningSummary(Date.parse("2026-10-15T00:00:00Z"), [], cycle);
  assert.equal(idle.subject, "Reclaim, 15 Oct 2026: 0 proofs spent, 19 left until 1 Nov 2026");
  assert.match(idle.text, /^On 15 Oct 2026 \(UTC\), 0 attested fetches gave a proof\.\nNothing was asked of Reclaim that day\.\n/);
});

test("the morning's summary leaves once a day, from six o'clock UTC, and only during the judging", async () => {
  const claimed: string[] = [];
  const asked: number[] = [];
  const cycle = use(12);
  const deps = {
    claim: async (name: string) => {
      if (claimed.includes(name)) return false;
      claimed.push(name);
      return true;
    },
    spent: async (dayStartMs: number) => {
      asked.push(dayStartMs);
      return [{ gift: "7", reason: "the morning count", proved: 1, failed: 0 }];
    },
    use: async () => cycle,
  };
  const due = async (iso: string) => (await morningSummaryDue(Date.parse(iso), deps))?.subject ?? null;
  assert.equal(await due("2026-10-13T06:05:00Z"), null, "the day before the judging");
  assert.equal(await due("2026-10-14T05:59:00Z"), null, "before six");
  assert.deepEqual(claimed, [], "nothing is claimed before it is due");
  assert.equal(await due("2026-10-14T06:01:00Z"), "Reclaim, 13 Oct 2026: 1 proof spent, 88 left until 1 Dec 2026");
  assert.deepEqual(asked, [Date.parse("2026-10-13T00:00:00Z")], "the day before, whole");
  assert.equal(await due("2026-10-14T06:06:00Z"), null, "once");
  assert.equal(await due("2026-10-14T23:55:00Z"), null);
  // A morning the five-minute call missed is still told, later that day.
  assert.equal(await due("2026-10-15T13:20:00Z"), "Reclaim, 14 Oct 2026: 1 proof spent, 88 left until 1 Dec 2026");
  assert.equal(await due("2026-11-03T06:00:00Z"), "Reclaim, 2 Nov 2026: 1 proof spent, 88 left until 1 Dec 2026", "the last morning");
  assert.equal(await due("2026-11-04T06:00:00Z"), null, "the judging is over");
  assert.equal(claimed.length, 3);
  // It rides the call that already arrives every five minutes, and leaves through the operator's alerts.
  const route = readFileSync("app/api/cron/milestones/route.ts", "utf8");
  assert.match(route, /const summary = await morningSummaryDue\(\);\n\s+if \(summary\) await sendAlert\(summary\);/);
});

test("the operator is told the moment a row crosses a mark, by the row itself", async () => {
  let told = 0;
  await noteAttestedCall({ kind: "fetch", source: "chess-player", ok: true }, async () => {
    told += 1;
  });
  assert.equal(told, 1);
  const journal = readFileSync("src/attested-calls.ts", "utf8");
  assert.match(journal, /export async function noteAttestedCall\(call: AttestedCall, after: \(\) => Promise<void> = tellWhenFilling\)/);
  assert.match(journal, /const due = await allowanceAlertsDue\(Date\.now\(\), \{ use: cycleUse, claim: claimPass, waiting: daysWaiting \}\);/);
  assert.match(readFileSync("src/watch.ts", "utf8"), /allowanceDue: \(nowMs\) => allowanceAlertsDue\(nowMs, \{ use: cycleUse, claim: claimPass, waiting: daysWaiting \}\),/);
});

test("every fetch the app asks for goes through the count, and the reading service's own does not count twice", () => {
  const read = readFileSync("src/attested-read.ts", "utf8");
  assert.match(read, /return \(source, account, bearer\) => countedFetch\(source\.id, \(\) => fetch\(source, account, bearer\)\);/);
  assert.match(read, /return \{ zkFetch: counted\(workerZkFetch\), verify:/);
  assert.match(read, /return \{ zkFetch: counted\(localZkFetch\), verify:/);
  assert.match(read, /export const localAttestedFetch = localZkFetch;/, "what the reading service runs is the bare fetch");
  const duolingo = readFileSync("src/duolingo-public.ts", "utf8");
  assert.match(duolingo, /zkFetch: \(url\) => countedFetch\(DUOLINGO_PROFILE_FETCH, \(\) => workerZkFetch\(url\)\),/);
  assert.match(duolingo, /return \{ \.\.\.own, zkFetch: \(url, matches\) => countedFetch\(DUOLINGO_PROFILE_FETCH, \(\) => own\.zkFetch\(url, matches\)\) \};/);
  const worker = readFileSync("scripts/zkfetch-worker.ts", "utf8");
  assert.match(worker, /await localAttestedFetch\(source, account, bearer\)/);
  assert.match(worker, /await fetchPublicProfile\(username, await reclaimLocalProfileDeps\(\)\)/);
  // No other place makes a Reclaim client.
  for (const file of ["src/attested-read.ts", "src/duolingo-public.ts"]) assert.equal(readFileSync(file, "utf8").match(/new ReclaimClient\(/g)?.length, 1, file);
});

test("a person's proof: the limit is looked at before Reclaim is asked, the session is written down when it opens and the proof when it comes back", () => {
  const session = readFileSync("app/api/proof/session/route.ts", "utf8");
  const limit = session.indexOf("if ((await limitsNow()).proofs) throw new ReclaimLimitReached(\"proofs\");");
  const init = session.indexOf("await ReclaimProofRequest.init(");
  assert.ok(limit > 0 && init > limit, "the limit before the session is opened at Reclaim");
  assert.match(session, /if \(isReclaimQuotaRefusal\(error\)\) throw new ReclaimLimitReached\("proofs", \{ cause: error \}\);/, "and Reclaim's own refusal is the same one");
  // The refusal names the source of the condition that was asked for, and the day the proofs start again.
  assert.match(session, /source = conditionById\(entry\.condition\.conditionId\)\?\.source \?\? source;/);
  assert.match(session, /if \(error instanceof ReclaimLimitReached\) \{\n\s*return NextResponse\.json\(\{ code: error\.code, error: LIMIT\.said\(source, "proofs", startsAgainInWords\(\), true\) \}, \{ status: 409,/);
  assert.match(session, /await noteAttestedCall\(\{ kind: "asked", source: entry\.condition\.conditionId, ok: true, ref: sessionId \}\);/);
  const verify = readFileSync("app/api/proof/verify/route.ts", "utf8");
  assert.match(verify, /const cameBack = async \(ok: boolean\) => \{\n\s+counted = true;\n\s+await noteAttestedCall\(\{ kind: "verification", source: session\?\.conditionId \?\? "unknown", ok, ref: sessionId \}\);/);
  assert.match(verify, /await cameBack\(\(verified as \{ isVerified\?: unknown \}\)\.isVerified === true\);/);
});

// --- the two sentences, and where a person reads them ----------------------------------------------------------------

test("one sentence in the open names the service by the gift's own source and the day it starts again, and the rest is folded", () => {
  // The founder's own words of 3 Oct 2026, for a reading and for a proof.
  assert.equal(LIMIT.said("Duolingo", "readings", "1 Nov"), "Viky can't check Duolingo right now: this month's readings are used up. It starts again on 1 Nov.");
  // A source named from the funder's side is said to its own person as theirs; a proper name is said as it is.
  assert.equal(LIMIT.said("their university", "proofs", "1 Nov"), "Viky can't check their university right now: this month's proofs are used up. It starts again on 1 Nov.");
  assert.equal(LIMIT.said("their university", "proofs", "1 Nov", true), "Viky can't check your university right now: this month's proofs are used up. It starts again on 1 Nov.");
  assert.equal(LIMIT.said("Duolingo", "readings", "1 Nov", true), LIMIT.said("Duolingo", "readings", "1 Nov"));
  assert.ok(LIMIT.isSaid(LIMIT.said("their university", "proofs", "1 Nov", true)));
  assert.equal(LIMIT.said("their university", "proofs", "1 Nov"), "Viky can't check their university right now: this month's proofs are used up. It starts again on 1 Nov.");
  // Under a press that was refused, the hour until which the open day can still be counted is a sentence.
  assert.equal(LIMIT.can, "What you can do");
  assert.equal(LIMIT.dayYours("tomorrow, 5 Oct, at 08:00"), "Your day can still be counted until tomorrow, 5 Oct, at 08:00.");
  assert.equal(LIMIT.dayTheirs("Boo", "tomorrow, 5 Oct, at 08:00"), "Boo's day can still be counted until tomorrow, 5 Oct, at 08:00.");
  assert.equal(LIMIT.dayTheirs(null, "tomorrow, 5 Oct, at 08:00"), "Their day can still be counted until tomorrow, 5 Oct, at 08:00.");
  // What is folded under "What you can do": lines, a label and its value, four at most (the founder, 4 Oct 2026).
  assert.deepEqual(LIMIT.lines.dayYours("tomorrow, 5 Oct, at 08:00"), ["Your day counts until", "tomorrow, 5 Oct, at 08:00"]);
  assert.deepEqual(LIMIT.lines.dayTheirs("Boo", "tomorrow, 5 Oct, at 08:00"), ["Boo's day counts until", "tomorrow, 5 Oct, at 08:00"]);
  assert.deepEqual(LIMIT.lines.dayTheirs(null, "tomorrow, 5 Oct, at 08:00"), ["Their day counts until", "tomorrow, 5 Oct, at 08:00"]);
  assert.deepEqual(LIMIT.lines.takeYours, ["What is already yours", "taken out as usual"]);
  assert.deepEqual(LIMIT.lines.takeTheirs, ["What is already theirs", "taken out as usual"]);
  assert.deepEqual(LIMIT.lines.untouched.readings, ["Gifts proved by a document", "not touched"]);
  assert.deepEqual(LIMIT.lines.untouched.proofs, ["Gifts Viky reads by itself", "not touched"]);
  assert.deepEqual(LIMIT.lines.write("hello@viky.cash"), ["To reopen it sooner", "hello@viky.cash"]);
  // Beside a condition in a list: four words.
  assert.equal(LIMIT.backOn("1 Nov"), "Back on 1 Nov");
  assert.ok(LIMIT.backOn("1 Nov").split(" ").length <= 4);
  // The sentence in the open is known for what it is wherever a screen prints an answer, and nothing else is taken for it.
  assert.equal(LIMIT.isSaid(LIMIT.said("Chess.com", "readings", "1 Nov")), true);
  assert.equal(LIMIT.isSaid(`${LIMIT.said("Duolingo", "readings", "1 Nov")} ${LIMIT.dayYours("today, 4 Oct, at 9:00")}`), true, "with the hour after it, under a press");
  assert.equal(LIMIT.isSaid(LIMIT.said("ETS", "proofs", "1 Nov")), true);
  for (const other of ["Duolingo could not be read just now. Try again in a minute.", "Viky has read this as often as it does in one day. It resumes tomorrow.", "", null, undefined]) assert.equal(LIMIT.isSaid(other), false);
  // The day it starts again is the cycle's own first day, in UTC, written the same on the server and in every browser.
  assert.equal(startsAgainInWords(Date.UTC(2026, 9, 3, 18, 0)), "1 Nov");
  assert.equal(startsAgainInWords(Date.UTC(2026, 9, 31, 23, 59)), "1 Nov");
  assert.equal(startsAgainInWords(Date.UTC(2026, 10, 1, 0, 0)), "1 Dec");
  assert.equal(startsAgainInWords(Date.UTC(2026, 11, 30, 12, 0)), "1 Jan");
  // A climb's refusal names its own source, and "this" where a caller has none to name.
  assert.equal(refusalMessage("LIMIT_REACHED", "Chess.com"), LIMIT.said("Chess.com", "readings", startsAgainInWords()));
  assert.equal(refusalMessage("LIMIT_REACHED"), LIMIT.said("this", "readings", startsAgainInWords()));
  // Which reserve a condition draws on, and which conditions say so when one is used up.
  assert.deepEqual([reserveOf("read"), reserveOf("connected"), reserveOf("shown")], ["readings", "readings", "proofs"]);
  const readingsEmpty = { readings: true, proofs: false, again: "1 Nov" };
  assert.equal(emptyReserveOf("read", readingsEmpty), "readings");
  assert.equal(emptyReserveOf("connected", readingsEmpty), "readings");
  assert.equal(emptyReserveOf("shown", readingsEmpty), null, "a document shown draws on the other reserve: it stays as it was");
  assert.equal(emptyReserveOf("shown", { readings: false, proofs: true, again: "1 Nov" }), "proofs");
  assert.equal(emptyReserveOf("read", null), null);
  assert.equal(emptyReserveOf(undefined, readingsEmpty), null);
});

const DAY = 86_400;
const day = (number: number, hours = 0) => number * DAY + hours * 3_600;

test("until when a day can still be counted is the real end of its window: the day after it, and six hours", () => {
  // A seven-day gift from day 100 to 106, the first two days settled.
  const gift = { startDay: 100, endDay: 106, settledThroughDay: 101, finalised: false, cancelled: false };
  // On day 103 at noon the oldest open day is 102, whose window closes on day 104 at 06:00.
  assert.equal(countableUntil(gift, day(103, 12)), day(104, 6));
  // An hour after that it is day 103's, until day 105 at 06:00.
  assert.equal(countableUntil(gift, day(104, 7)), day(105, 6));
  // Today already counted: the day still to count is tomorrow's, and its window is said.
  assert.equal(countableUntil({ ...gift, settledThroughDay: 103 }, day(103, 12)), day(106, 6));
  // The first contract keeps a day one day only: day 102 can be counted until the end of day 103.
  assert.equal(countableUntil(gift, day(103, 12), DAY), day(104, 0));
  assert.equal(countableUntil(gift, day(104, 1), DAY), day(105, 0), "and an hour into day 104 it is day 103's turn");
  // Nothing to say for a gift never connected, over, taken back, or past its last window.
  assert.equal(countableUntil({ ...gift, startDay: 0 }, day(103)), null);
  assert.equal(countableUntil({ ...gift, finalised: true }, day(103)), null);
  assert.equal(countableUntil({ ...gift, cancelled: true }, day(103)), null);
  assert.equal(countableUntil(gift, day(108, 6)), null);

  // The days waiting are those begun, not settled and still inside their window.
  assert.deepEqual(daysWaitingOf(gift, day(103, 12)), { days: 2, nearestEndsAt: day(104, 6) });
  assert.deepEqual(daysWaitingOf(gift, day(104, 7)), { days: 2, nearestEndsAt: day(105, 6) }, "day 102 has gone back, days 103 and 104 wait");
  assert.deepEqual(daysWaitingOf({ ...gift, settledThroughDay: 103 }, day(103, 12)), { days: 0, nearestEndsAt: null }, "tomorrow has not begun");
});

test("the alert's count walks every connected daily gift, and one that cannot be read does not hold it", async () => {
  const gifts = [{ giftId: "4", escrow: null }, { giftId: "5", escrow: null }, { giftId: "6", escrow: null }];
  const waiting = await daysWaiting(day(103, 12) * 1_000, {
    gifts: async () => gifts,
    read: async (giftId) => {
      if (giftId === "5") throw new Error("the network did not answer");
      return { gift: { startDay: 100, endDay: 106, settledThroughDay: giftId === "4" ? 101 : 102, finalised: false, cancelled: false }, catchUpSeconds: DAY + 6 * 3_600 };
    },
  });
  assert.deepEqual(waiting, { days: 3, gifts: 2, nearestEndsAt: day(104, 6) });
});

test("a gift's page is told of the limit only while the gift runs, with the hour for its day", async () => {
  const until = () => day(104, 6);
  assert.equal(await giftLimitFor(true, until, async () => ({ readings: false, proofs: false })), null);
  const cycle = Date.UTC(2026, 9, 3, 18, 0);
  assert.deepEqual(await giftLimitFor(true, until, async () => ({ readings: true, proofs: false }), cycle), { readings: true, proofs: false, countableUntil: day(104, 6), again: "1 Nov" });
  assert.deepEqual(await giftLimitFor(true, until, async () => ({ readings: false, proofs: true }), cycle), { readings: false, proofs: true, countableUntil: null, again: "1 Nov" }, "the proofs' limit has no day");
  assert.equal(await giftLimitFor(false, until, async () => ({ readings: true, proofs: true })), null, "a gift that is over waits for nothing");
  assert.match(readFileSync("src/gift-status.ts", "utf8"), /limit: await giftLimitFor\(!gift\.finalised && !gift\.cancelled, \(\) => countableUntil\(gift, now, catchUpSecondsOf\(escrow\)\)\),/);
  assert.match(readFileSync("src/milestone-status.ts", "utf8"), /limit: await giftLimitFor\(!state\.settled && !state\.cancelled, \(\) => null\)/);
  // A daily reading refused for the limit carries the hour; the browser says it in the reader's clock.
  const count = readFileSync("src/daily-count.ts", "utf8");
  assert.match(count, /if \(outcome\.kind === "refused" && \(outcome\.code === "LIMIT_REACHED" \|\| outcome\.code === "CEILING_REACHED"\) && record\) return \{ \.\.\.outcome, countableUntil: await untilOf\(record\) \};/);
});

test("the browser adds the hour of the open day in the reader's own clock, and leaves every other answer as it is", async () => {
  const { openDayInWords, withTheLimitSaid } = await import("../src/client/limit");
  const now = new Date(2026, 9, 4, 10, 0).getTime();
  const until = new Date(2026, 9, 5, 8, 0).getTime() / 1_000;
  // The hour is written by the reader's own machine (src/moments.ts): "tomorrow, 5 Oct, at" and its eight o'clock.
  assert.equal(openDayInWords(until, true, null, now), LIMIT.dayYours(momentInWords(until * 1_000, now)));
  assert.match(openDayInWords(until, true, null, now), /^Your day can still be counted until tomorrow, 5 Oct, at 0?8:00\.$/);
  assert.match(openDayInWords(until, false, "Boo", now), /^Boo's day can still be counted until tomorrow, 5 Oct, at 0?8:00\.$/);
  // Under a press there is no fold: the server's own sentence, then until when the day can still be counted.
  const said = LIMIT.said("Duolingo", "readings", "1 Nov");
  const refused = { kind: "refused", giftId: "4", code: "LIMIT_REACHED", message: said, countableUntil: Math.floor(Date.now() / 1_000) + 3_600 };
  assert.match(withTheLimitSaid(refused).message, /^Viky can't check Duolingo right now: this month's readings are used up\. It starts again on 1 Nov\. Your day can still be counted until /);
  assert.equal(LIMIT.isSaid(withTheLimitSaid(refused).message), true, "and it is still set in the red");
  // A gift not counted by days has no hour: the server's sentence is left as it is.
  const climb = { kind: "refused", giftId: "1000004", code: "LIMIT_REACHED", message: said };
  assert.equal(withTheLimitSaid(climb), climb);
  const other = { kind: "refused", giftId: "4", code: "FETCH_FAILED", message: "Duolingo could not be read just now." };
  assert.equal(withTheLimitSaid(other), other);
  const counted = { kind: "counted", giftId: "4", creditedDays: 1 };
  assert.equal(withTheLimitSaid(counted), counted);
  assert.equal(withTheLimitSaid(null), null);
  assert.match(readFileSync("src/client/api.ts", "utf8"), /return withTheLimitSaid\(data as T\);/, "every answer of Viky's own routes passes through it");
});

test("the gift's page says the limit where it says where the gift stands, folds what can be done, and asks for no reading meanwhile", () => {
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  // The reserve this gift draws on, when it is the one used up: the other one being empty changes nothing for it.
  assert.match(page, /const emptyReserve = limit && status\.opened && condition \? \(limit\[reserveOf\(condition\.nature\)\] \? reserveOf\(condition\.nature\) : null\) : null;/);
  assert.match(page, /const readingsStopped = emptyReserve === "readings";/);
  assert.match(page, /&& \(voice === "recipient" \|\| voice === "funder"\) && !readingsStopped\);/, "no live reading while the limit stands");
  assert.match(page, /const nextReading = nowMs === 0 \|\| gift\.finished \|\| gift\.cancelled \|\| readingsStopped \|\| asItGoes \? null :/, "and no next reading is announced");
  // In the open: the source and the day. Folded: the open day's hour, what is theirs, what is not touched, where to write.
  assert.match(page, /said: LIMIT\.said\(source, emptyReserve, limit\.again, mine\),/);
  assert.match(page, /openDayLine\(limit\.countableUntil, mine, recipientName, nowMs\)/, "the hour in the reader's own clock, to each of the two people");
  assert.match(page, /mine \? LIMIT\.lines\.takeYours : LIMIT\.lines\.takeTheirs,\n\s*LIMIT\.lines\.untouched\[emptyReserve\],\n\s*contactEmail\(\) \? LIMIT\.lines\.write\(contactEmail\(\) as string\) : null,/);
  assert.match(page, /limit=\{limitSaid\}/, "in the card, where the state is said");
  const card = readFileSync("app/kit/GiftLive.tsx", "utf8");
  assert.match(card, /\{limit \? \(\n\s*<p className="limit-said" role="status" data-limit-said>\n\s*\{limit\.said\}/, "one sentence, in the quiet colour of the labels");
  assert.match(card, /<details className="gift-fold" data-limit-can>\n\s*<summary className="gift-fold-name">\n\s*\{LIMIT\.can\}/, "the rest folded under its own name");
  assert.match(card, /<div className="gift-fold-body">\n\s*<Lines quiet rows=\{limit\.can\} \/>/, "as lines, a label and its value, never paragraphs (the founder, 4 Oct 2026)");
  assert.ok(card.indexOf("data-limit-can") < card.indexOf("{L.agreed}"), "before what was agreed: it is what the person came to ask");
  assert.match(page, /&& !gift\.sourceClosed && !readingsStopped && !asItGoes \? \(/, "and no count is offered");
  assert.match(page, /const readsTheDay = Boolean\(asItGoes && \(mine \|\| readerIsFunder\) && !readingsStopped && lessonWouldPay\(today\)\);/, "nor does a habit read as its page opens look");
  // A proof a person shows: the card says it too, and nothing is offered to start one.
  assert.match(page, /limitReached=\{emptyReserve === "proofs"\}/);
  assert.match(readFileSync("app/kit/ShowProof.tsx", "utf8"), /if \(limitReached && state\.at !== "waiting" && state\.at !== "checking"\) return null;/);
  // Under a press it reads the same: the one refusal that takes a colour, where every other carries a mark.
  assert.match(readFileSync("app/kit/FieldRefusal.tsx", "utf8"), /if \(LIMIT\.isSaid\(children\)\) \{\n\s*return \(\n\s*<p id=\{id\} role="alert" className="limit-refused">/);
  // Before a gift is paid for: the route says which reserves are used up, and the card and the chooser say it.
  const route = readFileSync("app/api/conditions/route.ts", "utf8");
  assert.match(route, /const reserves: Reserves = \{ readings: limits\.readings, proofs: limits\.proofs, again: startsAgainInWords\(\) \};/);
  const offer = readFileSync("app/kit/offer/OfferCard.tsx", "utf8");
  assert.match(offer, /const emptyReserve = emptyReserveOf\(condition\?\.nature, reserves\);/);
  assert.match(offer, /\{LIMIT\.said\(condition\.source, emptyReserve, reserves\.again\)\}/);
  assert.ok(!/disabled=\{[^}]*emptyReserve/.test(offer), "the gift can still be made: nothing is shut for an empty reserve");
  const chooser = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  assert.match(chooser, /\{LIMIT\.backOn\(reserves\.again\)\}/, "beside the condition in its list");
  assert.match(chooser, /\{LIMIT\.said\(condition\.source, emptyReserveOf\(condition\.nature, reserves\)!, reserves\.again\)\}/, "and in full over its questions");
});

test("the judges page says the cycle's count from the journal, the limit when it is reached, and what a proof is held to", () => {
  assert.equal(cycleInWords(null), "The cycle's count could not be read right now.");
  assert.equal(
    cycleInWords(use(29, 1, { started: 31, asked: 2, verified: 1 })),
    "Cycle from 1 Nov 2026 to 1 Dec 2026. Readings: 29 of 100 (attested fetches that gave a proof; 31 were started). Proofs shown by people: 1 of 25 (2 asked, 1 verified).",
  );
  const page = readFileSync("app/judges/page.tsx", "utf8").replace(/\s+/g, " ");
  assert.match(page, /const reclaimUse = await cycleUse\(\)\.catch\(\(\) => null\); const reclaimLimits = reclaimUse \? limitsOf\(reclaimUse\) : null;/);
  assert.match(page, /allows up to \{RECLAIM_ALLOWANCE\.fetches\} attested fetches and \{RECLAIM_ALLOWANCE\.verifications\} verifications a month, and gives more on request only\. \{cycleInWords\(reclaimUse\)\}/);
  assert.match(page, /\{reclaimLimits\?\.readings \? ` The limit of readings is reached: [^`]*"\$\{LIMIT\.said\("Duolingo", "readings", startsAgainInWords\(\)\)\}"` : ""\}/, "the same sentence a person reads");
  assert.match(page, /\{reclaimLimits\?\.proofs \? ` The limit of proofs is reached: [^`]*"\$\{LIMIT\.said\("their university", "proofs", startsAgainInWords\(\)\)\}"` : ""\}/);
  assert.match(page, /once in \{PROOF_EVERY_SECONDS\.unseen \/ 3_600\} hours after a look that failed or showed no rating, once an hour in the gift&apos;s last day, and every \{PROOF_EVERY_SECONDS\.atTheTarget \/ 60\} minutes at the target/);
  assert.equal(PROOF_EVERY_SECONDS.unseenInTheLastDay, 3_600, "once an hour, as the page says in words");
  // What was counted before the journal began is said only for the cycle it is about.
  assert.match(page, /\{reclaimUse\?\.from === BEFORE_THE_JOURNAL\.cycleFrom \? ` Of this cycle's fetches, \$\{BEFORE_THE_JOURNAL\.started\} were started before the journal began and each gave a proof, counted on 3 Oct 2026 from the reading service's logs: two on 1 Oct, two on 2 Oct, one on 3 Oct\.` : ""\}/);
  assert.equal(BEFORE_THE_JOURNAL.started, BEFORE_THE_JOURNAL.proved, "each gave a proof");
  assert.equal(BEFORE_THE_JOURNAL.started, 2 + 2 + 1);
  // The cycle is said as the dashboard shows it, and the dashboard read by mistake is gone from the page.
  assert.ok(page.includes("A cycle runs from the 1st of a month to the 1st of the next, as Reclaim&apos;s dashboard shows it for the account that holds Viky&apos;s two applications."));
  assert.ok(!page.includes("23/09"), "the other account's cycle is said nowhere");
});
