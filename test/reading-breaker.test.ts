// The breaker where every paid reading passes (the founder, 3 Oct 2026; src/attested-calls.ts). On 30 Sep one gift
// whose reading kept failing cost 57 proofs in five hours, of a month's hundred. So a UTC day has two ceilings, counted
// on the proofs given: four for a gift, twenty-five for all. At a ceiling nothing leaves for Reclaim, the refusal is ours,
// the operator is told with the gift and the reason, and the person reads when it resumes.

delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.RECLAIM_DAILY_PER_GIFT;
delete process.env.RECLAIM_DAILY_ALL;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import {
  ceilingAlert,
  ceilingNow,
  ceilingPassed,
  configureAttestedCalls,
  countedFetch,
  DAILY_CEILING,
  dailyCeilings,
  dayUse,
  nextDayAt,
  noteAttestedCall,
  readingFor,
  readingIs,
  ReclaimCeilingReached,
  roomToday,
  targetNotSettledAlert,
  tellOfTheCeiling,
} from "../src/attested-calls";
import { attestedRead, AttestedReadError, type AttestedReadDeps } from "../src/attested-read";
import { proveCertificate, fetchesOfGoal, type CertificateReadingDeps } from "../src/certificate-reading";
import { dayCeilingInWords, withTheLimitSaid } from "../src/client/limit";
import { CREDLY_GOAL_TYPE } from "../src/credly-badge";
import { DetReadError } from "../src/det-reading";
import { certificateSubject, DET_SOURCE } from "../src/duolingo-english-test";
import type { GiftRecord } from "../src/gift-store";
import { DET_MILESTONE } from "../src/milestone-conditions";
import { SHAPE_HAVE_OR_NOT, type MilestoneProofMessage } from "../src/milestone-protocol";
import type { MilestoneState } from "../src/milestone-reader";
import { MILESTONE_OURS_TO_FIX, refusalMessage } from "../src/milestone-reading";
import { configurePassGuard } from "../src/pass-guard";
import type { SqlExecutor } from "../src/proof-session-store";
import { RelayerError } from "../src/relayer";
import { CEILING } from "../src/sentences";

const DAY_MS = 86_400_000;
/** Noon UTC on a day, and the same moment the day before. */
const NOON = 20_700 * DAY_MS + 12 * 3_600_000;

let db: PGlite;
const executor: SqlExecutor = async (strings, ...values) => {
  const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
  return (await db.query<Record<string, unknown>>(text, values)).rows;
};
const quiet = async () => {};

before(async () => {
  db = new PGlite();
  configureAttestedCalls(executor);
  configurePassGuard(executor);
});
beforeEach(async () => {
  await noteAttestedCall({ kind: "fetch", source: "made-so-the-table-exists", ok: true }, quiet);
  await db.query("DELETE FROM viky_attested_calls");
  await db.query("CREATE TABLE IF NOT EXISTS viky_pass_guard (name text PRIMARY KEY, ran_at timestamptz NOT NULL)");
  await db.query("DELETE FROM viky_pass_guard");
});
after(async () => {
  configureAttestedCalls(undefined);
  configurePassGuard(undefined);
  await db.close();
});

/** Proofs already given at a moment, for a gift or for none. */
async function given(count: number, gift: string | null, atMs: number = NOON, ok = true): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await db.query("INSERT INTO viky_attested_calls (at, kind, source, ok, gift, reason) VALUES ($1, 'fetch', 'chess-player', $2, $3, 'a test')", [new Date(atMs).toISOString(), ok, gift]);
  }
}

/** The dependencies of a fetch that judges by the day's ceilings at noon, and writes what it takes at noon. */
const atNoon = {
  note: async (call: Parameters<typeof noteAttestedCall>[0]) => {
    if (call.kind === "fetch") await given(1, call.gift ?? null, NOON, call.ok);
  },
  limits: async () => ({ readings: false }),
  ceiling: (about: Parameters<typeof ceilingNow>[0], needs: number) => ceilingNow(about, needs, NOON),
};

test("four proofs a day for a gift and twenty-five for all, each moved by a setting with no new code", () => {
  // The founder, 3 Oct 2026: eight for all until the month was found to hold ninety-five readings, then twenty-five.
  assert.deepEqual(DAILY_CEILING, { perGift: 4, all: 25 });
  assert.deepEqual(dailyCeilings({}), { perGift: 4, all: 25 });
  assert.deepEqual(dailyCeilings({ RECLAIM_DAILY_PER_GIFT: "6", RECLAIM_DAILY_ALL: "20" }), { perGift: 6, all: 20 });
  // Zero is a number: it stops every paid reading until the setting is changed. Anything that is not a whole number is not a setting.
  assert.deepEqual(dailyCeilings({ RECLAIM_DAILY_PER_GIFT: "0", RECLAIM_DAILY_ALL: " 0 " }), { perGift: 0, all: 0 });
  assert.deepEqual(dailyCeilings({ RECLAIM_DAILY_PER_GIFT: "four", RECLAIM_DAILY_ALL: "-1" }), { perGift: 4, all: 25 });
  // Which ceiling a reading would pass: the gift's own first, then everybody's.
  const ceilings = { perGift: 4, all: 25 };
  assert.equal(ceilingPassed({ gift: 3, all: 3 }, "7", 1, ceilings), null);
  assert.equal(ceilingPassed({ gift: 4, all: 4 }, "7", 1, ceilings), "gift");
  assert.equal(ceilingPassed({ gift: 3, all: 3 }, "7", 2, ceilings), "gift", "a reading of two fetches is admitted whole or not at all");
  assert.equal(ceilingPassed({ gift: 0, all: 25 }, "7", 1, ceilings), "all");
  assert.equal(ceilingPassed({ gift: 0, all: 24 }, null, 2, ceilings), "all");
  assert.equal(ceilingPassed({ gift: 0, all: 23 }, null, 2, ceilings), null, "a reading that names no gift is held to everybody's ceiling alone");
  assert.equal(nextDayAt(NOON), 20_701 * 86_400);
});

test("the day's count is the proofs given that UTC day: for the gift, and for all", async () => {
  await given(2, "7");
  await given(1, "8");
  await given(1, null);
  await given(3, "7", NOON, false);
  await given(5, "7", NOON - DAY_MS);
  assert.deepEqual(await dayUse("7", NOON), { gift: 2, all: 4 });
  assert.deepEqual(await dayUse("8", NOON), { gift: 1, all: 4 });
  assert.deepEqual(await dayUse(null, NOON), { gift: 0, all: 4 });
  // The next UTC day starts from nothing.
  assert.deepEqual(await dayUse("7", NOON + DAY_MS), { gift: 0, all: 0 });
});

test("at a gift's ceiling nothing leaves for Reclaim, and other gifts are still read", async () => {
  const fetched: string[] = [];
  const fetchFor = (gift: string) => readingFor({ giftId: gift, reason: "a climb at its target" }, () => countedFetch("codeforces-user", async () => void fetched.push(gift), atNoon));
  for (let turn = 0; turn < 4; turn += 1) await fetchFor("7");
  assert.equal(fetched.length, 4);
  await assert.rejects(fetchFor("7"), (error: unknown) => error instanceof ReclaimCeilingReached && error.code === "CEILING_REACHED" && error.scope === "gift" && error.resumesAt === 20_701 * 86_400);
  assert.equal(fetched.length, 4, "the fifth was not fetched");
  // Another gift is read, and the journal holds the gift and the reason of every proof.
  await fetchFor("8");
  assert.equal(fetched.length, 5);
  const rows = (await db.query<{ gift: string; reason: string }>("SELECT gift, reason FROM viky_attested_calls ORDER BY id")).rows;
  assert.deepEqual(rows.map((row) => row.gift), ["7", "7", "7", "7", "8"]);
  assert.ok(rows.every((row) => row.reason === "a test"), "written by the harness here; the live note writes the reading's own reason");
});

test("a reading of two fetches is admitted whole or not at all, so a ceiling never leaves half of one paid for", async () => {
  const fetched: string[] = [];
  const chess = () =>
    readingFor({ giftId: "7", reason: "a climb, read", fetches: 2 }, async () => {
      await countedFetch("chess-player", async () => void fetched.push("player"), atNoon);
      await countedFetch("chess-ratings-bullet", async () => void fetched.push("ratings"), atNoon);
    });
  await chess();
  await given(1, "7");
  // Three given: one more would fit, a whole reading would not. The profile is not fetched.
  await assert.rejects(chess(), (error: unknown) => error instanceof ReclaimCeilingReached && error.scope === "gift");
  assert.deepEqual(fetched, ["player", "ratings"]);
  // The number of fetches can be said once the reading knows it.
  await db.query("DELETE FROM viky_attested_calls");
  await given(3, "9");
  await assert.rejects(
    readingFor({ giftId: "9", reason: "a certificate's link, pasted" }, async () => {
      readingIs({ fetches: 2 });
      await countedFetch("credly-assertion", async () => void fetched.push("credly"), atNoon);
    }),
    (error: unknown) => error instanceof ReclaimCeilingReached,
  );
  assert.ok(!fetched.includes("credly"));
});

test("at everybody's ceiling no gift is read, and a fetch that names no gift counts towards it", async () => {
  await given(10, "1");
  await given(10, "2");
  await given(4, null);
  const fetched: string[] = [];
  // Twenty-four given: one more is read, and it is the day's last.
  await readingFor({ giftId: "3", reason: "a daily gift, by the counting pass" }, () => countedFetch("duolingo-profile", async () => void fetched.push("the twenty-fifth"), atNoon));
  assert.deepEqual(fetched, ["the twenty-fifth"]);
  fetched.length = 0;
  await assert.rejects(
    readingFor({ giftId: "3", reason: "a daily gift, by the counting pass" }, () => countedFetch("duolingo-profile", async () => void fetched.push("3"), atNoon)),
    (error: unknown) => error instanceof ReclaimCeilingReached && error.scope === "all",
  );
  await assert.rejects(countedFetch("duolingo-profile", async () => void fetched.push("none"), atNoon), (error: unknown) => error instanceof ReclaimCeilingReached && error.scope === "all");
  assert.deepEqual(fetched, []);
  // Room, asked without telling anybody: a reading that is optional never takes what a reading that pays will need.
  await db.query("DELETE FROM viky_attested_calls");
  assert.equal(await roomToday("7", 4, NOON), true);
  await given(1, "7");
  assert.equal(await roomToday("7", 4, NOON), false);
  assert.equal(await roomToday("7", 3, NOON), true);
  // A count that cannot be read stops nothing, as for the month's limit.
  assert.equal(await roomToday("7", 99, NOON, async () => Promise.reject(new Error("the database did not answer"))), true);
});

test("the operator is told once in the day, with the gift, the reason, the count and how to move the ceiling", async () => {
  const about = { giftId: "1000003", reason: "a climb at its target", fetches: 2 };
  const alert = ceilingAlert({ scope: "gift", about, use: { gift: 4, all: 5 }, ceilings: { perGift: 4, all: 25 }, resumesAt: nextDayAt(NOON) });
  assert.equal(alert.subject, "Reclaim: gift 1000003 reached its ceiling of 4 proofs for the day");
  assert.match(alert.text, /^Stopped: gift 1000003, a climb at its target\. Nothing was sent to Reclaim for it\./);
  assert.match(alert.text, /Today \(UTC\): 4 proofs for this gift, of 4 a day\. 5 proofs for all gifts, of 25 a day\./);
  assert.match(alert.text, /Other gifts are still read\. This one is read again from the next UTC day\./);
  assert.match(alert.text, /Readings resume at 2026-09-\d\d 00:00 UTC|Readings resume at \d{4}-\d\d-\d\d 00:00 UTC/);
  assert.match(alert.text, /set RECLAIM_DAILY_PER_GIFT or RECLAIM_DAILY_ALL: no new code is needed\./);
  const all = ceilingAlert({ scope: "all", about: null, use: { gift: 0, all: 25 }, ceilings: { perGift: 4, all: 25 }, resumesAt: nextDayAt(NOON) });
  assert.equal(all.subject, "Reclaim: the ceiling of 25 proofs for the day is reached");
  assert.match(all.text, /Stopped: a reading that names no gift, no reason given\./);
  assert.match(all.text, /No gift is read attested until the next UTC day\./);
  // Claimed once for a gift in a day, and once for all: a loop meets the ceiling at every turn and is told of once.
  await tellOfTheCeiling("gift", about, { gift: 4, all: 5 }, NOON);
  await tellOfTheCeiling("gift", about, { gift: 4, all: 5 }, NOON + 60_000);
  await tellOfTheCeiling("all", null, { gift: 0, all: 25 }, NOON);
  await tellOfTheCeiling("gift", about, { gift: 4, all: 5 }, NOON + DAY_MS);
  const claimed = (await db.query<{ name: string }>("SELECT name FROM viky_pass_guard ORDER BY name")).rows.map((row) => row.name);
  assert.deepEqual(claimed, ["reclaim-ceiling:all:20700", "reclaim-ceiling:gift:1000003:20700", "reclaim-ceiling:gift:1000003:20701"]);
  // The three tries at the target have their own alert, with the day's real count or the word that it could not be read.
  const spent = targetNotSettledAlert("1000003", 3, { gift: 3, all: 4 }, nextDayAt(NOON));
  assert.equal(spent.subject, "Gift 1000003: at its target, and 3 proofs today did not settle it");
  assert.match(spent.text, /Today \(UTC\): 3 proofs were given for this gift, 4 for all gifts\./);
  assert.match(targetNotSettledAlert("1000003", 3, null, nextDayAt(NOON)).text, /The day's count could not be read\./);
});

test("the refusal is ours in every reading: nothing is settled against it, and the person reads when it resumes", async () => {
  // The fetch's refusal becomes the reading's, by its own code.
  const deps: AttestedReadDeps = { zkFetch: async () => Promise.reject(new ReclaimCeilingReached("gift", nextDayAt(NOON))), verify: async () => true };
  await assert.rejects(attestedRead("codeforces-user", "tourist", deps), (error: unknown) => error instanceof AttestedReadError && error.code === "CEILING_REACHED");
  assert.match(readFileSync("src/duolingo-public.ts", "utf8"), /if \(error instanceof ReclaimCeilingReached\) throw new PublicProfileError\("CEILING_REACHED", error\.message, \{ cause: error \}\);/);
  // Ours to fix: the pass holds the gift, daily or milestone.
  assert.ok(MILESTONE_OURS_TO_FIX.has("CEILING_REACHED"));
  assert.match(readFileSync("src/daily-pass.ts", "utf8"), /"LIMIT_REACHED",\n[^\n]*\n[^\n]*\n\s*"CEILING_REACHED",/);
  // The sentence, and the hour in the reader's own clock, which only the browser knows.
  assert.equal(refusalMessage("CEILING_REACHED"), "Viky has read this as often as it does in one day. It resumes tomorrow.");
  assert.equal(CEILING.reading("tomorrow, 4 Oct, at 02:00"), "Viky has read this as often as it does in one day. It resumes tomorrow, 4 Oct, at 02:00.");
  assert.match(dayCeilingInWords(NOON), /^Viky has read this as often as it does in one day\. It resumes (today|tomorrow), \d{1,2} [A-Z][a-z]{2}, at \d{1,2}:\d{2}\.$/);
  const answered = withTheLimitSaid({ kind: "refused", giftId: "7", code: "CEILING_REACHED", message: "said without a clock" });
  assert.match(answered.message, /It resumes (today|tomorrow), \d{1,2} [A-Z][a-z]{2}, at \d{1,2}:\d{2}\./);
  assert.deepEqual(withTheLimitSaid({ kind: "refused", giftId: "7", code: "FETCH_FAILED", message: "left as it is" }).message, "left as it is");
  // The ceiling holds no day (the audit of 8 Oct 2026): it said "Nothing is lost." of a day that goes back to the
  // funder once its window closes. It says when reading resumes, and until when the open day can still be counted.
  assert.doesNotMatch(CEILING.reading(null), /lost/i);
  const withADayOpen = withTheLimitSaid({ kind: "refused", giftId: "7", code: "CEILING_REACHED", message: "said without a clock", countableUntil: Math.floor(NOON / 1_000) + 18 * 3_600 });
  assert.match(withADayOpen.message, /^Viky has read this as often as it does in one day\. It resumes (today|tomorrow), \d{1,2} [A-Z][a-z]{2}, at \d{1,2}:\d{2}\. Your day can still be counted until [^.]+\.$/);
  // With no day open there is no hour to give: the first two sentences alone.
  assert.doesNotMatch(withTheLimitSaid({ kind: "refused", giftId: "7", code: "CEILING_REACHED", message: "x", countableUntil: null }).message, /can still be counted/);
  // The server sends that hour with the ceiling's refusal as it does with the month's limit.
  assert.match(readFileSync("src/daily-count.ts", "utf8"), /\(outcome\.code === "LIMIT_REACHED" \|\| outcome\.code === "CEILING_REACHED"\) && record\) return \{ \.\.\.outcome, countableUntil: await untilOf\(record\) \}/);
  // Every reading that can be refused for the month's limit can be for the day's ceiling.
  for (const file of ["attested-read", "duolingo-public", "duolingo-course-reading", "chess-reading", "codeforces-reading", "coursera-reading", "credly-reading", "det-reading", "edx-reading", "accredible-reading", "mitx-online-reading", "marathon-reading", "wca-reading", "certificate-reading"]) {
    assert.ok(readFileSync(`src/${file}.ts`, "utf8").includes('"CEILING_REACHED"'), file);
  }
});

// --- a certificate's link: a plain look before the proof -------------------------------------------------------------

const NAME = "Vantar, Elio Sam Noor";
const SUBJECT = certificateSubject(DET_SOURCE, NAME);
const DAY = 86_400;
const TEST_DAY = 20_709 * DAY;
const RECORD = { giftId: "1000001", recipient: "0x000000000000000000000000000000000000B0B0", escrow: "0x00000000000000000000000000000000000000e1" } as unknown as GiftRecord;

function state(over: Partial<MilestoneState> = {}): MilestoneState {
  return { giftId: "1000001", recipient: RECORD.recipient, shape: SHAPE_HAVE_OR_NOT, goalType: DET_MILESTONE.goalType, subject: SUBJECT, target: 120n, maximumStart: 0n, fundedAt: 20_700 * DAY, deadline: 20_790 * DAY, settled: false, cancelled: false, earned: 0n, amount: 25_000_000n, startingValue: 0n, durationDays: 90, proofPaused: false, ...over } as unknown as MilestoneState;
}

function pasted(over: Partial<CertificateReadingDeps> = {}) {
  const calls: string[] = [];
  const sent: MilestoneProofMessage[] = [];
  const deps: CertificateReadingDeps = {
    loadGift: async () => RECORD,
    readState: async () => state(),
    look: async () => {
      calls.push("look");
      return { subject: SUBJECT, score: 135, testDay: TEST_DAY };
    },
    attest: async () => {
      calls.push("proof");
      return { score: 135, testDay: TEST_DAY, subject: SUBJECT, observedAt: TEST_DAY + 3 * DAY, nullifier: `0x${"d2".repeat(32)}` as Hex, providerId: `0x${"e3".repeat(32)}` as Hex };
    },
    prove: async ({ message }) => {
      sent.push(message);
      return { hash: `0x${"ab".repeat(32)}` };
    },
    record: async () => undefined,
    now: () => TEST_DAY + 3 * DAY,
    ...over,
  };
  return { calls, sent, deps };
}

const paste = (run: ReturnType<typeof pasted>) => proveCertificate({ giftId: "1000001", link: "https://certs.duolingo.com/abcd1234efgh5678" }, run.deps);

test("a pasted link is looked at plainly first: a page that cannot pay is refused with no proof, in the same words", async () => {
  const cases: Array<[string, Partial<CertificateReadingDeps>, string]> = [
    ["another name", { look: async () => ({ subject: certificateSubject(DET_SOURCE, "Lea Martin"), score: 135, testDay: TEST_DAY }) }, "ANOTHER_NAME"],
    ["a score short of the target", { look: async () => ({ subject: SUBJECT, score: 110, testDay: TEST_DAY }) }, "BELOW_THE_TARGET"],
    ["a day before the gift", { look: async () => ({ subject: SUBJECT, score: 135, testDay: 20_600 * DAY }) }, "BEFORE_THE_GIFT"],
    ["a day after its last", { look: async () => ({ subject: SUBJECT, score: 135, testDay: 20_800 * DAY }) }, "AFTER_THE_DEADLINE"],
    ["a page taken private", { look: async () => Promise.reject(new DetReadError("CERTIFICATE_PRIVATE", "private")) }, "CERTIFICATE_PRIVATE"],
    ["a link that is not one", { look: async () => Promise.reject(new DetReadError("INVALID_LINK", "not a link")) }, "INVALID_LINK"],
    // The look itself failed: no proof either, and the person tries again.
    ["a page that cannot be read just now", { look: async () => Promise.reject(new DetReadError("FETCH_FAILED", "down")) }, "SOURCE_UNAVAILABLE"],
    ["anything else that went wrong while looking", { look: async () => Promise.reject(new Error("a socket closed")) }, "SOURCE_UNAVAILABLE"],
  ];
  for (const [what, over, code] of cases) {
    const run = pasted(over);
    const outcome = await paste(run);
    assert.equal(outcome.kind === "refused" && outcome.code, code, what);
    assert.deepEqual(run.calls.filter((call) => call === "proof"), [], `${what}: no proof is paid for`);
    assert.deepEqual(run.sent, []);
  }
  // The words are the ones the proof's own refusal had: a score short says both figures.
  const short = await paste(pasted({ look: async () => ({ subject: SUBJECT, score: 110, testDay: TEST_DAY }) }));
  assert.equal(short.kind === "refused" && short.message, DET_MILESTONE.words.refusals.below(120, 110));
});

test("a page the look says can pay is proved, and judged again on what was attested", async () => {
  const run = pasted();
  const outcome = await paste(run);
  assert.equal(outcome.kind, "reached");
  assert.deepEqual(run.calls, ["look", "proof"]);
  assert.equal(run.sent.length, 1);
  // The look is never the judge: an attested reading that says otherwise is refused, and nothing is sent.
  const changed = pasted({ attest: async () => ({ score: 110, testDay: TEST_DAY, subject: SUBJECT, observedAt: TEST_DAY + 3 * DAY, nullifier: `0x${"d2".repeat(32)}` as Hex, providerId: `0x${"e3".repeat(32)}` as Hex }) });
  const refused = await paste(changed);
  assert.equal(refused.kind === "refused" && refused.code, "BELOW_THE_TARGET");
  assert.deepEqual(changed.sent, []);
  // A day's ceiling met by the proof is said as such.
  const stopped = pasted({ attest: async () => Promise.reject(new DetReadError("CEILING_REACHED", "the day's ceiling")) });
  const ceiling = await paste(stopped);
  assert.deepEqual(ceiling, { kind: "refused", giftId: "1000001", code: "CEILING_REACHED", message: "Viky has read this as often as it does in one day. It resumes tomorrow.", score: undefined });
});

test("while proofs are paused nothing is looked at and nothing is paid for: the refusal is the contract's own", async () => {
  const run = pasted({ readState: async () => state({ proofPaused: true }) });
  await assert.rejects(paste(run), (error: unknown) => error instanceof RelayerError && error.contractError === "ProofIsPaused");
  assert.deepEqual(run.calls, []);
  // And a Credly badge is two fetches, admitted together.
  assert.equal(fetchesOfGoal(CREDLY_GOAL_TYPE), 2);
  assert.equal(fetchesOfGoal(DET_MILESTONE.goalType), 1);
  const source = readFileSync("src/certificate-reading.ts", "utf8");
  assert.match(source, /look: lookByGoal,/);
  assert.match(source, /return readingFor\(\{ giftId: input\.giftId, reason: "a certificate's link, pasted" \}, \(\) => provePasted\(input, deps\)\);/);
});

test("a developer's machine takes no real reading: with the switch nothing leaves, by the service or straight from here, and no proof is opened", async () => {
  const { realReadingsOff, REAL_READINGS_OFF, neverLeftForReclaim } = await import("../src/attested-calls");
  assert.equal(realReadingsOff({}), false, "no deployment sets it");
  assert.equal(realReadingsOff({ VIKY_NO_REAL_READING: "1" }), true);
  assert.equal(realReadingsOff({ VIKY_NO_REAL_READING: "on" }), false, "one value, and no other");
  // Refused as not configured, which the journal reads as never having left for Reclaim: nothing is counted.
  assert.equal(neverLeftForReclaim(new AttestedReadError("NOT_CONFIGURED", REAL_READINGS_OFF)), true);
  // The four places a reading leaves from, each refusing before anything else, and the one that opens a proof.
  const read = readFileSync("src/attested-read.ts", "utf8");
  assert.match(read, /async function workerZkFetch\([^)]*\): Promise<ZkFetchProof> \{\n  if \(realReadingsOff\(\)\) throw new AttestedReadError\("NOT_CONFIGURED", REAL_READINGS_OFF\);/);
  assert.match(read, /async function localZkFetch\([^)]*\): Promise<ZkFetchProof> \{\n  if \(realReadingsOff\(\)\) throw new AttestedReadError\("NOT_CONFIGURED", REAL_READINGS_OFF\);/);
  const duolingo = readFileSync("src/duolingo-public.ts", "utf8");
  assert.match(duolingo, /async function workerZkFetch\(url: string\): Promise<ZkFetchProof> \{\n  if \(realReadingsOff\(\)\) throw new PublicProfileError\("NOT_CONFIGURED", REAL_READINGS_OFF\);/);
  assert.match(duolingo, /export async function reclaimLocalProfileDeps\(\): Promise<PublicProfileDeps> \{\n  if \(realReadingsOff\(\)\) throw new PublicProfileError\("NOT_CONFIGURED", REAL_READINGS_OFF\);/);
  const session = readFileSync("app/api/proof/session/route.ts", "utf8");
  assert.ok(session.indexOf("if (realReadingsOff()) throw new Error(REAL_READINGS_OFF);") < session.indexOf("await ReclaimProofRequest.init("), "before the proof is opened at Reclaim");
  // Every other way to Reclaim goes through one of those: no other file makes a client or calls the service.
  for (const file of ["src/attested-read.ts", "src/duolingo-public.ts"]) assert.equal(readFileSync(file, "utf8").match(/new ReclaimClient\(/g)?.length, 1, file);
});
