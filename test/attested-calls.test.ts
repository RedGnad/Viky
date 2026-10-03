// The journal of what Viky asks of Reclaim, the count of the month's allowance and the limit Viky holds itself to
// (3 Oct 2026): every fetch that leaves is written down, proof or not; the cycle's use is counted from it; past the
// limit nothing is sent and the refusal is LIMIT_REACHED; the operator is told once at half, at four fifths and at
// the limit, with the days then waiting for a reading.

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
  cycleUse,
  isReclaimQuotaRefusal,
  limitsNow,
  limitsOf,
  neverLeftForReclaim,
  noteAttestedCall,
  RECLAIM_ALERT_AT,
  RECLAIM_ALLOWANCE,
  reclaimAllowance,
  ReclaimLimitReached,
  shareReached,
  type AttestedCall,
  type CycleUse,
} from "../src/attested-calls";
import { attestedRead, AttestedReadError } from "../src/attested-read";
import { CHESS_PLAYER } from "../src/attested-sources";
import { countableUntil, daysWaiting, daysWaitingOf } from "../src/days-waiting";
import { fetchPublicProfile, PublicProfileError } from "../src/duolingo-public";
import { giftLimitFor } from "../src/gift-limit";
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
    from: "2026-10-23T00:00:00.000Z",
    until: "2026-11-23T00:00:00.000Z",
    fetches: { started: more.started ?? proved, proved, allowed: more.fetchesAllowed ?? 100 },
    verifications: { asked: more.asked ?? shown, shown, verified: more.verified ?? 0, allowed: 25 },
  };
}

test("a cycle runs from the 23rd at midnight UTC to the next 23rd", () => {
  const at = (iso: string) => {
    const { from, until } = cycleOf(Date.parse(iso));
    return `${from.toISOString().slice(0, 10)} to ${until.toISOString().slice(0, 10)}`;
  };
  assert.equal(at("2026-10-03T13:00:00Z"), "2026-09-23 to 2026-10-23");
  assert.equal(at("2026-09-23T00:00:00Z"), "2026-09-23 to 2026-10-23", "from its first second");
  assert.equal(at("2026-10-22T23:59:59Z"), "2026-09-23 to 2026-10-23", "to its last");
  assert.equal(at("2026-10-23T00:00:00Z"), "2026-10-23 to 2026-11-23");
  assert.equal(at("2027-01-05T08:00:00Z"), "2026-12-23 to 2027-01-23", "over a new year");
});

test("the allowance is the free tier's unless Reclaim granted more, and the operator is told at half, at four fifths and at the limit", () => {
  assert.deepEqual(RECLAIM_ALLOWANCE, { fetches: 100, verifications: 25 });
  assert.deepEqual(reclaimAllowance({}), { fetches: 100, verifications: 25 });
  assert.deepEqual(reclaimAllowance({ RECLAIM_FETCH_ALLOWANCE: "250", RECLAIM_VERIFICATION_ALLOWANCE: " 40 " }), { fetches: 250, verifications: 40 });
  // A setting that is not a whole number changes nothing: the limit is never lifted by a typing mistake.
  assert.deepEqual(reclaimAllowance({ RECLAIM_FETCH_ALLOWANCE: "unlimited", RECLAIM_VERIFICATION_ALLOWANCE: "-1" }), { fetches: 100, verifications: 25 });
  assert.deepEqual(RECLAIM_ALERT_AT, [0.5, 0.8, 1]);
  const fetches = (used: number) => shareReached(used, RECLAIM_ALLOWANCE.fetches);
  assert.deepEqual([49, 50, 79, 80, 99, 100, 128].map(fetches), [null, 0.5, 0.5, 0.8, 0.8, 1, 1]);
  const proofs = (used: number) => shareReached(used, RECLAIM_ALLOWANCE.verifications);
  assert.deepEqual([12, 13, 19, 20, 24, 25].map(proofs), [null, 0.5, 0.5, 0.8, 0.8, 1]);
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
  await db.query("INSERT INTO viky_attested_calls (at, kind, source, ok) VALUES ('2026-10-22T23:59:59Z', 'fetch', 'chess-player', true), ('2026-11-23T00:00:00Z', 'fetch', 'chess-player', true)");
  assert.deepEqual(await cycleUse(now, {}), {
    from: "2026-10-23T00:00:00.000Z",
    until: "2026-11-23T00:00:00.000Z",
    fetches: { started: 3, proved: 2, allowed: 100 },
    verifications: { asked: 2, shown: 1, verified: 1, allowed: 25 },
  });
  assert.equal((await cycleUse(now, { RECLAIM_FETCH_ALLOWANCE: "300" })).fetches.allowed, 300, "counted against what Reclaim granted");
});

test("what was spent before the journal began counts for the cycle of 23 Sep 2026, and for no other", async () => {
  assert.deepEqual(BEFORE_THE_JOURNAL, { cycleFrom: "2026-09-23T00:00:00.000Z", started: 128, proved: 70, asked: 1, shown: 0 });
  await noteAttestedCall({ kind: "fetch", source: "duolingo-profile", ok: true }, quiet);
  await db.query("UPDATE viky_attested_calls SET at = '2026-10-04T00:40:00Z'");
  const first = await cycleUse(Date.parse("2026-10-04T08:00:00Z"), {});
  assert.deepEqual(first.fetches, { started: 129, proved: 71, allowed: 100 });
  assert.deepEqual(first.verifications, { asked: 1, shown: 0, verified: 0, allowed: 25 });
  // By the fetches started the allowance was passed that day, and readings went on: the limit goes by the proofs.
  assert.deepEqual(limitsOf(first), { readings: false, proofs: false });
  const next = await cycleUse(Date.parse("2026-10-24T08:00:00Z"), {});
  assert.deepEqual(next.fetches, { started: 0, proved: 0, allowed: 100 });
  assert.equal(next.verifications.asked, 0);
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
  assert.deepEqual(noted, [
    { kind: "fetch", source: "chess-player", ok: true },
    { kind: "fetch", source: "chess-ratings-bullet", ok: false, code: "NOT_FOUND" },
    { kind: "fetch", source: "duolingo-profile", ok: false, code: "FAILED" },
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
  assert.deepEqual(errors, ["reclaim limit not read: the database did not answer", "attested call not counted (fetch chess-player): the database did not answer"]);
});

test("each share of an allowance is told once in its cycle, only the highest one reached, and the limit with what is waiting", async () => {
  const claimed = new Set<string>();
  let now = use(49);
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
  assert.deepEqual(await subjects(), [], "under half, nothing");
  now = use(50, 0, { started: 90 });
  assert.deepEqual(await subjects(), ["Reclaim: 50 readings this cycle, of 100"], "by the proofs given, not by the fetches started");
  now = use(63);
  assert.deepEqual(await subjects(), [], "told once");
  now = use(81);
  assert.deepEqual(await subjects(), ["Reclaim: 81 readings this cycle, of 100"]);
  assert.equal(asked, 0, "what is waiting is counted at the limit only");
  now = use(100, 13);
  const atTheLimit = await allowanceAlertsDue(0, deps);
  assert.deepEqual(atTheLimit.map((alert) => alert.subject), ["Reclaim: the limit is reached, 100 readings this cycle, of 100", "Reclaim: 13 proofs shown by people this cycle, of 25"]);
  assert.equal(asked, 1);
  assert.match(atTheLimit[0].text, /From now Viky sends no attested reading to Reclaim, and each person whose gift waits for one reads why on its page\./);
  assert.match(atTheLimit[0].text, /3 days of 2 daily gifts wait for a reading\. The first of them goes back to its funder at 2026-10-25 06:00 UTC unless it is read before\./);
  now = use(140, 14);
  assert.deepEqual(await subjects(), []);
  assert.deepEqual([...claimed], ["reclaim:fetches:2026-10-23:0.5", "reclaim:fetches:2026-10-23:0.8", "reclaim:fetches:2026-10-23:1", "reclaim:verifications:2026-10-23:0.5"]);
  // Already past a share when first looked at, as on the day this was written: one email, not two.
  claimed.clear();
  now = use(85);
  assert.deepEqual(await subjects(), ["Reclaim: 85 readings this cycle, of 100"]);
  assert.deepEqual([...claimed], ["reclaim:fetches:2026-10-23:0.8"]);
});

test("the alert says the cycle, both counts, what stops at the limit, and how to lift it", () => {
  const half = allowanceAlert(use(50, 3, { started: 81, asked: 5, verified: 2 }), "fetches");
  assert.equal(half.subject, "Reclaim: 50 readings this cycle, of 100");
  assert.deepEqual(half.text.split("\n"), [
    "Cycle from 23 Oct 2026 to 23 Nov 2026 (UTC).",
    "Readings: 50 attested fetches gave a proof, of 81 started, for an allowance of 100.",
    "Proofs of people: 3 came back from Reclaim, of 5 asked, 2 verified, for an allowance of 25.",
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

test("the operator is told the moment a row crosses a share, by the row itself", async () => {
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
  assert.match(session, /if \(error instanceof ReclaimLimitReached\) \{\n\s*return NextResponse\.json\(\{ code: error\.code, error: LIMIT\.proof\(contactEmail\(\)\) \}, \{ status: 409,/);
  assert.match(session, /await noteAttestedCall\(\{ kind: "asked", source: entry\.condition\.conditionId, ok: true, ref: sessionId \}\);/);
  const verify = readFileSync("app/api/proof/verify/route.ts", "utf8");
  assert.match(verify, /const cameBack = \(ok: boolean\) => noteAttestedCall\(\{ kind: "verification", source: session\?\.conditionId \?\? "unknown", ok, ref: sessionId \}\);/);
  assert.match(verify, /await cameBack\(\(verified as \{ isVerified\?: unknown \}\)\.isVerified === true\);/);
});

// --- the two sentences, and where a person reads them ----------------------------------------------------------------

test("the two sentences are short, the hour is the day's own window, and no address is named where none is set", () => {
  // Shortened on the founder's word of 3 Oct 2026: what happened, what it means for the day, where to write.
  assert.equal(LIMIT.reading("tomorrow, 5 Oct, at 08:00", "hello@viky.cash"), "Monthly reading limit reached. Your day can still be counted until tomorrow, 5 Oct, at 08:00. Write to hello@viky.cash.");
  assert.equal(LIMIT.reading(null, "hello@viky.cash"), "Monthly reading limit reached. Nothing is lost. Write to hello@viky.cash.", "a gift not counted by days has no hour");
  assert.equal(LIMIT.reading(null, null), "Monthly reading limit reached. Nothing is lost.");
  assert.equal(LIMIT.proof("hello@viky.cash"), "Monthly proof limit reached. Nothing was taken. Write to hello@viky.cash.");
  assert.equal(LIMIT.proof(null), "Monthly proof limit reached. Nothing was taken.");
  // Each is known for what it is wherever a screen prints an answer, and nothing else is taken for one.
  assert.equal(LIMIT.isSaid(LIMIT.reading("today, 4 Oct, at 9:00", null)), true);
  assert.equal(LIMIT.isSaid(LIMIT.proof("hello@viky.cash")), true);
  for (const other of ["Duolingo could not be read just now. Try again in a minute.", "", null, undefined]) assert.equal(LIMIT.isSaid(other), false);
  // A climb's refusal is the same sentence, without a day.
  const before = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  process.env.NEXT_PUBLIC_CONTACT_EMAIL = "hello@viky.cash";
  try {
    assert.equal(refusalMessage("LIMIT_REACHED"), LIMIT.reading(null, "hello@viky.cash"));
    process.env.NEXT_PUBLIC_CONTACT_EMAIL = "not an address";
    assert.equal(refusalMessage("LIMIT_REACHED"), LIMIT.reading(null, null), "a setting that is no address is not printed");
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_CONTACT_EMAIL;
    else process.env.NEXT_PUBLIC_CONTACT_EMAIL = before;
  }
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
  assert.deepEqual(await giftLimitFor(true, until, async () => ({ readings: true, proofs: false })), { readings: true, proofs: false, countableUntil: day(104, 6) });
  assert.deepEqual(await giftLimitFor(true, until, async () => ({ readings: false, proofs: true })), { readings: false, proofs: true, countableUntil: null }, "the proofs' limit has no day");
  assert.equal(await giftLimitFor(false, until, async () => ({ readings: true, proofs: true })), null, "a gift that is over waits for nothing");
  assert.match(readFileSync("src/gift-status.ts", "utf8"), /limit: await giftLimitFor\(!gift\.finalised && !gift\.cancelled, \(\) => countableUntil\(gift, now, catchUpSecondsOf\(escrow\)\)\),/);
  assert.match(readFileSync("src/milestone-status.ts", "utf8"), /limit: await giftLimitFor\(!state\.settled && !state\.cancelled, \(\) => null\)/);
  // A daily reading refused for the limit carries the hour; the browser says it in the reader's clock.
  const count = readFileSync("src/daily-count.ts", "utf8");
  assert.match(count, /if \(outcome\.kind === "refused" && outcome\.code === "LIMIT_REACHED" && record\) return \{ \.\.\.outcome, countableUntil: await untilOf\(record\) \};/);
});

test("the browser says the sentence in the reader's own clock, and leaves every other answer as it is", async () => {
  const { readingLimitInWords, withTheLimitSaid } = await import("../src/client/limit");
  const before = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  process.env.NEXT_PUBLIC_CONTACT_EMAIL = "hello@viky.cash";
  try {
    const now = new Date(2026, 9, 4, 10, 0).getTime();
    const until = new Date(2026, 9, 5, 8, 0).getTime() / 1_000;
    // The hour is written by the reader's own machine (src/moments.ts): "tomorrow, 5 Oct, at" and its eight o'clock.
    assert.equal(readingLimitInWords(until, now), LIMIT.reading(momentInWords(until * 1_000, now), "hello@viky.cash"));
    assert.match(readingLimitInWords(until, now), /^Monthly reading limit reached\. Your day can still be counted until tomorrow, 5 Oct, at 0?8:00\. Write to hello@viky\.cash\.$/);
    assert.equal(readingLimitInWords(null, now), LIMIT.reading(null, "hello@viky.cash"));
    const refused = { kind: "refused", giftId: "4", code: "LIMIT_REACHED", message: "the server's own words", countableUntil: until };
    assert.match(withTheLimitSaid(refused).message, /^Monthly reading limit reached\. Your day can still be counted until /);
    const other = { kind: "refused", giftId: "4", code: "FETCH_FAILED", message: "Duolingo could not be read just now." };
    assert.equal(withTheLimitSaid(other), other);
    const counted = { kind: "counted", giftId: "4", creditedDays: 1 };
    assert.equal(withTheLimitSaid(counted), counted);
    assert.equal(withTheLimitSaid(null), null);
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_CONTACT_EMAIL;
    else process.env.NEXT_PUBLIC_CONTACT_EMAIL = before;
  }
  assert.match(readFileSync("src/client/api.ts", "utf8"), /return withTheLimitSaid\(data as T\);/, "every answer of Viky's own routes passes through it");
});

test("the gift's page says the limit where it says where the gift stands, and asks for no reading meanwhile", () => {
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /const readingsStopped = Boolean\(limit\?\.readings && status\.opened && condition\?\.nature !== "shown"\);/);
  assert.match(page, /&& \(voice === "recipient" \|\| voice === "funder"\) && !readingsStopped\);/, "no live reading while the limit stands");
  assert.match(page, /const nextReading = nowMs === 0 \|\| gift\.finished \|\| gift\.cancelled \|\| readingsStopped \|\| asItGoes \? null :/, "and no next reading is announced");
  assert.match(page, /readingLimitInWords\(mine \? \(limit\?\.countableUntil \?\? null\) : null, nowMs\)/, "the hour is said to the person whose day it is");
  assert.match(page, /limit=\{limitLine\}/, "in the card, where the state is said");
  assert.match(readFileSync("app/kit/GiftLive.tsx", "utf8"), /\{limit \? \(\n\s*<p className="limit-said" role="status" data-reading-limit>/, "short and in the red");
  assert.match(page, /&& !gift\.sourceClosed && !readingsStopped && !asItGoes \? \(/, "and no count is offered");
  assert.match(page, /const readsTheDay = Boolean\(asItGoes && \(mine \|\| readerIsFunder\) && !readingsStopped && lessonWouldPay\(today\)\);/, "nor does a habit read as its page opens look");
  assert.match(page, /limitReached=\{Boolean\(limit\?\.proofs\)\}/);
  const proof = readFileSync("app/kit/ShowProof.tsx", "utf8");
  assert.match(proof, /if \(limitReached && state\.at !== "waiting"\) \{/);
  assert.match(proof, /<p className="limit-said">\{LIMIT\.proof\(contactEmail\(\)\)\}<\/p>/, "said before the person starts, in the button's place");
  // Under a press it reads the same: the one refusal that takes a colour, where every other carries a mark.
  assert.match(readFileSync("app/kit/FieldRefusal.tsx", "utf8"), /if \(LIMIT\.isSaid\(children\)\) \{\n\s*return \(\n\s*<p id=\{id\} role="alert" className="limit-said">/);
});

test("the judges page says the cycle's count from the journal, the limit when it is reached, and what a proof is held to", () => {
  assert.equal(cycleInWords(null), "The cycle's count could not be read right now.");
  assert.equal(
    cycleInWords(use(29, 1, { started: 31, asked: 2, verified: 1 })),
    "Cycle from 23 Oct 2026 to 23 Nov 2026. Readings: 29 of 100 (attested fetches that gave a proof; 31 were started). Proofs shown by people: 1 of 25 (2 asked, 1 verified).",
  );
  const page = readFileSync("app/judges/page.tsx", "utf8").replace(/\s+/g, " ");
  assert.match(page, /const reclaimUse = await cycleUse\(\)\.catch\(\(\) => null\); const reclaimLimits = reclaimUse \? limitsOf\(reclaimUse\) : null;/);
  assert.match(page, /allows up to \{RECLAIM_ALLOWANCE\.fetches\} attested fetches and \{RECLAIM_ALLOWANCE\.verifications\} verifications a month, and gives more on request only\. \{cycleInWords\(reclaimUse\)\}/);
  assert.match(page, /\{reclaimLimits\?\.readings \? ` The limit of readings is reached: [^`]*"\$\{LIMIT\.reading\(null, contactEmail\(\)\)\}"` : ""\}/, "the same sentence a person reads");
  assert.match(page, /\{reclaimLimits\?\.proofs \? ` The limit of proofs is reached: [^`]*"\$\{LIMIT\.proof\(contactEmail\(\)\)\}"` : ""\}/);
  assert.match(page, /once in \{PROOF_EVERY_SECONDS\.unseen \/ 3_600\} hours after a look that failed or showed no rating, once an hour in the gift&apos;s last day, and every \{PROOF_EVERY_SECONDS\.atTheTarget \/ 60\} minutes at the target/);
  assert.equal(PROOF_EVERY_SECONDS.unseenInTheLastDay, 3_600, "once an hour, as the page says in words");
  // The floor and the day it was counted are said only for the cycle they are about.
  assert.match(page, /\{reclaimUse\?\.from === BEFORE_THE_JOURNAL\.cycleFrom \? ` Of this cycle's fetches, \$\{BEFORE_THE_JOURNAL\.started\} started and \$\{BEFORE_THE_JOURNAL\.proved\} proofs were counted on 3 Oct 2026/);
});
