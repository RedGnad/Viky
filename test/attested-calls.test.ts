// The journal of what Viky asks of Reclaim and the count of the month's allowance (3 Oct 2026): every fetch that
// leaves is written down, proof or not, the cycle's use is counted from it, and the operator is told once at half,
// at four fifths and when the allowance is used up.

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
  cycleOf,
  cycleUse,
  neverLeftForReclaim,
  noteAttestedCall,
  RECLAIM_ALERT_AT,
  RECLAIM_ALLOWANCE,
  shareReached,
  type AttestedCall,
  type CycleUse,
} from "../src/attested-calls";
import { AttestedReadError } from "../src/attested-read";
import { configureProofSessionStore, ensureProofSessionSchema, type SqlExecutor } from "../src/proof-session-store";

let db: PGlite;
const quiet = async () => {};

before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureAttestedCalls(executor);
  configureProofSessionStore(executor);
  await ensureProofSessionSchema();
});

beforeEach(async () => {
  await noteAttestedCall({ kind: "fetch", source: "made-so-the-table-exists", ok: true }, quiet);
  await db.query("DELETE FROM viky_attested_calls");
  await db.query("DELETE FROM viky_proof_sessions");
});

after(async () => {
  configureAttestedCalls(undefined);
  configureProofSessionStore(undefined);
  await db.close();
});

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

test("the allowance is the free tier's, and the operator is told at half, at four fifths and when it is used up", () => {
  assert.deepEqual(RECLAIM_ALLOWANCE, { fetches: 100, verifications: 25 });
  assert.deepEqual(RECLAIM_ALERT_AT, [0.5, 0.8, 1]);
  const fetches = (used: number) => shareReached(used, RECLAIM_ALLOWANCE.fetches);
  assert.deepEqual([49, 50, 79, 80, 99, 100, 128].map(fetches), [null, 0.5, 0.5, 0.8, 0.8, 1, 1]);
  const proofs = (used: number) => shareReached(used, RECLAIM_ALLOWANCE.verifications);
  assert.deepEqual([12, 13, 19, 20, 24, 25].map(proofs), [null, 0.5, 0.5, 0.8, 0.8, 1]);
});

test("the cycle's use is what the journal holds: fetches started, those that gave a proof, proofs asked of people and those verified", async () => {
  const now = Date.parse("2026-11-02T10:00:00Z");
  for (const call of [
    { kind: "fetch", source: "chess-player", ok: true },
    { kind: "fetch", source: "chess-ratings-bullet", ok: false, code: "NOT_FOUND" },
    { kind: "fetch", source: "duolingo-profile", ok: true },
    { kind: "verification", source: "toefl-mybest-shown", ok: true },
    { kind: "verification", source: "university-shown", ok: true },
  ] satisfies AttestedCall[]) {
    await noteAttestedCall(call, quiet);
  }
  await db.query("UPDATE viky_attested_calls SET at = '2026-11-01T09:00:00Z'");
  // A fetch of the cycle before, and one of the cycle after, are not this cycle's.
  await db.query("INSERT INTO viky_attested_calls (at, kind, source, ok) VALUES ('2026-10-22T23:59:59Z', 'fetch', 'chess-player', true), ('2026-11-23T00:00:00Z', 'fetch', 'chess-player', true)");
  // One person's proof came back and was verified in the cycle; the server's own sessions are not people's proofs.
  await db.query(`INSERT INTO viky_proof_sessions (session_id, account, gift_id, phase, consumed_at) VALUES
    ('a1b2c3d4e5', '0xa', '1000007', 'reach', '2026-11-01T09:05:00Z'),
    ('f6a7b8c9d0', '0xa', '1000008', 'reach', NULL),
    ('public:7:count:20758:abcd', '0xa', '7', 'check-in', '2026-11-01T00:40:00Z'),
    ('connected:8:count:20758:abcd', '0xa', '8', 'check-in', '2026-11-01T00:41:00Z')`);
  assert.deepEqual(await cycleUse(now), {
    from: "2026-10-23T00:00:00.000Z",
    until: "2026-11-23T00:00:00.000Z",
    fetches: { started: 3, proved: 2, allowed: 100 },
    verifications: { asked: 2, verified: 1, allowed: 25 },
  });
});

test("what was spent before the journal began counts for the cycle of 23 Sep 2026, and for no other", async () => {
  assert.deepEqual(BEFORE_THE_JOURNAL, { cycleFrom: "2026-09-23T00:00:00.000Z", started: 128, proved: 70, asked: 1 });
  await noteAttestedCall({ kind: "fetch", source: "duolingo-profile", ok: true }, quiet);
  await db.query("UPDATE viky_attested_calls SET at = '2026-10-04T00:40:00Z'");
  const first = await cycleUse(Date.parse("2026-10-04T08:00:00Z"));
  assert.deepEqual(first.fetches, { started: 129, proved: 71, allowed: 100 });
  assert.deepEqual(first.verifications, { asked: 1, verified: 0, allowed: 25 });
  const next = await cycleUse(Date.parse("2026-10-24T08:00:00Z"));
  assert.deepEqual(next.fetches, { started: 0, proved: 0, allowed: 100 });
  assert.equal(next.verifications.asked, 0);
});

test("a fetch is written down whether it gave a proof or not, and what it answered passes through untouched", async () => {
  const noted: AttestedCall[] = [];
  const note = async (call: AttestedCall) => {
    noted.push(call);
  };
  assert.equal(await countedFetch("chess-player", async () => "the proof", note), "the proof");
  const missing = new AttestedReadError("NOT_FOUND", "Nothing answers to that name");
  await assert.rejects(countedFetch("chess-ratings-bullet", async () => Promise.reject(missing), note), (thrown) => thrown === missing);
  await assert.rejects(countedFetch("duolingo-profile", async () => Promise.reject(new Error("worker 502: no proof")), note), /worker 502/);
  assert.deepEqual(noted, [
    { kind: "fetch", source: "chess-player", ok: true },
    { kind: "fetch", source: "chess-ratings-bullet", ok: false, code: "NOT_FOUND" },
    { kind: "fetch", source: "duolingo-profile", ok: false, code: "FAILED" },
  ]);
});

test("a fetch that never left for Reclaim is not counted: nothing configured, a service out of date, a reading put off for a platform's pace", async () => {
  const noted: AttestedCall[] = [];
  const note = async (call: AttestedCall) => {
    noted.push(call);
  };
  const never = [
    new AttestedReadError("NOT_CONFIGURED", "The attested fetch worker is not configured"),
    new AttestedReadError("WORKER_OUT_OF_DATE", "The attested fetch worker runs other sources than this build"),
    new AttestedReadError("FETCH_FAILED", "THROTTLED retry-after=840: THROTTLED daily: race result is read again in 14 minutes"),
  ];
  for (const error of never) {
    assert.equal(neverLeftForReclaim(error), true, error.message);
    await assert.rejects(countedFetch("race-result", async () => Promise.reject(error), note));
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

test("a count that cannot be written never costs the reading: it is a line in the logs", async () => {
  const errors: string[] = [];
  const consoleError = console.error;
  console.error = (line: string) => {
    errors.push(line);
  };
  configureAttestedCalls(async () => Promise.reject(new Error("the database did not answer")));
  try {
    assert.equal(await countedFetch("chess-player", async () => "the proof"), "the proof");
  } finally {
    console.error = consoleError;
    const executor: SqlExecutor = async (strings, ...values) => {
      const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
      return (await db.query<Record<string, unknown>>(text, values)).rows;
    };
    configureAttestedCalls(executor);
  }
  assert.deepEqual(errors, ["attested call not counted (fetch chess-player): the database did not answer"]);
});

function use(started: number, asked = 0): CycleUse {
  return { from: "2026-10-23T00:00:00.000Z", until: "2026-11-23T00:00:00.000Z", fetches: { started, proved: started, allowed: 100 }, verifications: { asked, verified: 0, allowed: 25 } };
}

test("each share of an allowance is told once in its cycle, and only the highest one reached", async () => {
  const claimed = new Set<string>();
  let now = use(49);
  const deps = {
    use: async () => now,
    claim: async (name: string) => {
      if (claimed.has(name)) return false;
      claimed.add(name);
      return true;
    },
  };
  const subjects = async () => (await allowanceAlertsDue(0, deps)).map((alert) => alert.subject);
  assert.deepEqual(await subjects(), [], "under half, nothing");
  now = use(50);
  assert.deepEqual(await subjects(), ["Reclaim: 50 attested fetches this cycle, of 100"]);
  now = use(63);
  assert.deepEqual(await subjects(), [], "told once");
  now = use(81);
  assert.deepEqual(await subjects(), ["Reclaim: 81 attested fetches this cycle, of 100"]);
  now = use(100, 13);
  assert.deepEqual(await subjects(), ["Reclaim: 100 attested fetches this cycle, of 100", "Reclaim: 13 proofs asked of people this cycle, of 25"]);
  now = use(140, 14);
  assert.deepEqual(await subjects(), []);
  assert.deepEqual([...claimed], ["reclaim:fetches:2026-10-23:0.5", "reclaim:fetches:2026-10-23:0.8", "reclaim:fetches:2026-10-23:1", "reclaim:verifications:2026-10-23:0.5"]);
  // Already past everything when first looked at, as on the day this was written: one email, not three.
  claimed.clear();
  now = use(128);
  assert.deepEqual(await subjects(), ["Reclaim: 128 attested fetches this cycle, of 100"]);
  assert.deepEqual([...claimed], ["reclaim:fetches:2026-10-23:1"]);
});

test("the alert says the cycle, both counts, and that more is given on request only", () => {
  const alert = allowanceAlert({ ...use(81, 3), fetches: { started: 81, proved: 44, allowed: 100 } }, "fetches");
  assert.equal(alert.subject, "Reclaim: 81 attested fetches this cycle, of 100");
  assert.deepEqual(alert.text.split("\n"), [
    "Cycle from 2026-10-23 to 2026-11-23 (UTC).",
    "Attested fetches: 81 started, 44 of them gave a proof, for an allowance of 100.",
    "Proofs asked of people: 3 asked, 0 came back verified, for an allowance of 25.",
    "",
    "Reclaim gives more on request only, and does not publish what it does past the allowance: ask before it is used up.",
    "The count is on /api/health, under reclaim.",
  ]);
});

test("the operator is told the moment a row crosses a share, by the row itself", async () => {
  let told = 0;
  await noteAttestedCall({ kind: "fetch", source: "chess-player", ok: true }, async () => {
    told += 1;
  });
  assert.equal(told, 1);
  assert.match(readFileSync("src/attested-calls.ts", "utf8"), /export async function noteAttestedCall\(call: AttestedCall, after: \(\) => Promise<void> = tellWhenFilling\)/);
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

test("a proof asked of a person is written down when its session is opened", () => {
  const route = readFileSync("app/api/proof/session/route.ts", "utf8");
  assert.match(route, /await saveProofSession\(\{[\s\S]*?\}\);\n[\s\S]*?await noteAttestedCall\(\{ kind: "verification", source: entry\.condition\.conditionId, ok: true \}\);/);
});

test("the judges page says the cycle's count from the journal, and what a proof is held to from the constants", async () => {
  const { cycleInWords } = await import("../src/attested-calls");
  assert.equal(cycleInWords(null), "The cycle's count could not be read right now.");
  assert.equal(
    cycleInWords({ ...use(31, 2), fetches: { started: 31, proved: 29, allowed: 100 }, verifications: { asked: 2, verified: 1, allowed: 25 } }),
    "In the cycle that began on 23 Oct 2026, Viky has started 31 attested fetches, of which 29 gave a proof, and has asked 2 proofs of a person, of which 1 came back verified. That is inside the allowance.",
  );
  assert.equal(
    cycleInWords({ from: "2026-09-23T00:00:00.000Z", until: "2026-10-23T00:00:00.000Z", fetches: { started: 128, proved: 70, allowed: 100 }, verifications: { asked: 1, verified: 0, allowed: 25 } }),
    "In the cycle that began on 23 Sep 2026, Viky has started 128 attested fetches, of which 70 gave a proof, and has asked 1 proof of a person, of which 0 came back verified. That is past the allowance. Readings have gone on since, and what Reclaim does past it is not published.",
  );
  const page = readFileSync("app/judges/page.tsx", "utf8").replace(/\s+/g, " ");
  assert.match(page, /const reclaimUse = await cycleUse\(\)\.catch\(\(\) => null\);/);
  assert.match(page, /allows up to \{RECLAIM_ALLOWANCE\.fetches\} attested fetches and \{RECLAIM_ALLOWANCE\.verifications\} verifications a month, and gives more on request only\. \{cycleInWords\(reclaimUse\)\}/);
  assert.match(page, /once in \{PROOF_EVERY_SECONDS\.unseen \/ 3_600\} hours after a look that failed or showed no rating, once an hour in the gift&apos;s last day, and every \{PROOF_EVERY_SECONDS\.atTheTarget \/ 60\} minutes at the target/);
  const { PROOF_EVERY_SECONDS } = await import("../src/milestone-reading");
  assert.equal(PROOF_EVERY_SECONDS.unseenInTheLastDay, 3_600, "once an hour, as the page says in words");
  // The floor and the day it was counted are said only for the cycle they are about.
  assert.match(page, /\{reclaimUse\?\.from === BEFORE_THE_JOURNAL\.cycleFrom \? ` Of those fetches, \$\{BEFORE_THE_JOURNAL\.started\} were counted on 3 Oct 2026/);
});
