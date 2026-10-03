// A look that failed takes no proof (the founder, 3 Oct 2026). One reading goes without a look, the reading of last
// resort: by the second reading of the morning, once for a gift in a day, and only when the window of its oldest open
// day closes that morning. On 30 Sep a look that kept failing cost 57 proofs in five hours; the month allows 100.

delete process.env.DATABASE_URL;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import { NO_CONTACT_HASH } from "../src/contact-hash";
import { COUNTING_PASS, dailyPass, recountPass, type DailyPassDeps } from "../src/daily-pass";
import { DuolingoProfileError, type PublicDuolingoProfile } from "../src/duolingo-profile";
import { runPublicCheckIn, type PublicCheckInDeps } from "../src/duolingo-public-checkin";
import type { GiftState } from "../src/gift-reader";
import { configureGiftStore, ensureGiftSchema, markBound, markClaimed, saveGift } from "../src/gift-store";
import { GOAL_TYPE_DUOLINGO_XP } from "../src/gift-terms";
import type { NewPass } from "../src/pass-log";
import type { SqlExecutor } from "../src/proof-session-store";

const ESCROW = "0x00000000000000000000000000000000000000D2" as Hex;
const FUNDER = "0x000000000000000000000000000000000000F0F0" as Hex;
const RECIPIENT = "0x000000000000000000000000000000000000b0b0" as Hex;
const DAY = 86_400;
const TODAY = 20_700;
/** The pass of half past midnight, and the second reading of the morning. */
const COUNTING = TODAY * DAY + 40 * 60;
const RECOUNT = TODAY * DAY + 3 * 3_600 + 40 * 60;

let db: PGlite;
before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(executor);
  await ensureGiftSchema();
  await saveGift({ giftId: "7", funder: FUNDER, contactHash: NO_CONTACT_HASH, claimToken: "a-link-key-0123456789abcdef", goalType: GOAL_TYPE_DUOLINGO_XP, dailyTarget: 10, durationDays: 7, amount: 7_000_000n, createdTx: `0x${"a7".repeat(32)}`, escrow: ESCROW, goalUsername: "Ama" });
  await markClaimed("7", RECIPIENT, null);
  await markBound("7", "7");
});
after(async () => {
  configureGiftStore(undefined);
  await db.close();
});

/** A gift whose day before yesterday is still unsettled: its window closes at 06:00 UTC this morning. */
function closingThisMorning(over: Partial<GiftState> = {}): GiftState {
  return {
    giftId: "7",
    funder: FUNDER,
    refundTo: FUNDER,
    recipient: RECIPIENT,
    recipientContactHash: NO_CONTACT_HASH,
    goalType: GOAL_TYPE_DUOLINGO_XP,
    dailyTarget: 10,
    durationDays: 7,
    startDay: TODAY - 2,
    endDay: TODAY + 4,
    creditedDays: 0,
    drainedDays: 0,
    settledThroughDay: TODAY - 3,
    amount: 7_000_000n,
    perDay: 1_000_000n,
    withdrawnByRecipient: 0n,
    refundedToFunder: 0n,
    refundable: 0n,
    identityHash: `0x${"1d".repeat(32)}`,
    baselineValue: 1_000n,
    lastCheckInAt: (TODAY - 3) * DAY,
    fundedAt: (TODAY - 5) * DAY,
    claimedAt: (TODAY - 4) * DAY,
    cancelled: false,
    finalised: false,
    earnedBalance: 0n,
    refundableBalance: 0n,
    withdrawNonce: 0n,
    version: 2,
    openingKey: FUNDER,
    endedAt: 0,
    givenBackDays: 0,
    ...over,
  };
}
/** The same gift with that day settled: its oldest open day is yesterday, which closes tomorrow morning. */
const closingTomorrow = () => closingThisMorning({ settledThroughDay: TODAY - 2, creditedDays: 1 });

const DOWN = async (): Promise<PublicDuolingoProfile> => Promise.reject(new DuolingoProfileError("SOURCE_UNAVAILABLE", "down"));
const seen = (totalXp: number): PublicDuolingoProfile => ({ id: "7", username: "Ama", courses: [], currentCourseId: null, totalXp, name: "Ama" });

/** The dependencies of a reading that says each thing it asks for, and never reaches Reclaim: the attested fetch throws. */
function reading(gift: GiftState, now: number, look: NonNullable<PublicCheckInDeps["look"]>, claim: boolean = true) {
  const calls: string[] = [];
  const paid = async (): Promise<never> => {
    calls.push("proof");
    throw new Error("the attested fetch was reached");
  };
  const deps: PublicCheckInDeps = {
    profile: paid,
    course: paid,
    now: () => now,
    gift: async () => gift,
    look: async (username) => {
      calls.push("look");
      return look(username);
    },
    claimLastResort: async (giftId, day) => {
      calls.push(`claim:${giftId}:${day}`);
      return claim;
    },
  };
  return { calls, deps };
}

const NOT_READ = { kind: "refused", giftId: "7", code: "FETCH_FAILED", message: "Duolingo could not be read just now. Try again in a minute.", looked: true };

beforeEach(() => undefined);

test("a look that failed takes no proof: not at half past midnight, not under a press, whatever is about to close", async () => {
  // The pass of 00:30, with a day that closes at 06:00 this very morning: nothing leaves. The second reading comes first.
  const counting = reading(closingThisMorning(), COUNTING, DOWN);
  assert.deepEqual(await runPublicCheckIn({ giftId: "7", purpose: "count", pass: "counting" }, counting.deps), NOT_READ);
  assert.deepEqual(counting.calls, ["look"], "no proof, and no claim asked for");
  // A count the person asks for: they are told, and try again in a minute.
  const pressed = reading(closingThisMorning(), RECOUNT, DOWN);
  assert.deepEqual(await runPublicCheckIn({ giftId: "7", purpose: "count", force: true }, pressed.deps), NOT_READ);
  assert.deepEqual(pressed.calls, ["look"]);
  // An answer that carries no figure is a look that could not say, the same.
  const blank = reading(closingThisMorning(), COUNTING, async () => ({ ...seen(0), totalXp: null }));
  assert.deepEqual(await runPublicCheckIn({ giftId: "7", purpose: "count", pass: "counting" }, blank.deps), NOT_READ);
  assert.deepEqual(blank.calls, ["look"]);
});

test("the second reading of the morning takes the reading of last resort, and only for a day that closes that morning", async () => {
  // The oldest open day closes at 06:00 today: the last chance, taken once it is claimed.
  const last = reading(closingThisMorning(), RECOUNT, DOWN);
  await assert.rejects(runPublicCheckIn({ giftId: "7", purpose: "count", pass: "recount" }, last.deps), /the attested fetch was reached/);
  assert.deepEqual(last.calls, ["look", `claim:7:${TODAY}`, "proof"]);
  // It closes tomorrow: tomorrow's passes look again before that. Nothing leaves, and nothing is claimed.
  const early = reading(closingTomorrow(), RECOUNT, DOWN);
  assert.deepEqual(await runPublicCheckIn({ giftId: "7", purpose: "count", pass: "recount" }, early.deps), NOT_READ);
  assert.deepEqual(early.calls, ["look"]);
});

test("once for a gift in a day: a last resort already taken is not taken again", async () => {
  const again = reading(closingThisMorning(), RECOUNT, DOWN, false);
  assert.deepEqual(await runPublicCheckIn({ giftId: "7", purpose: "count", pass: "recount" }, again.deps), NOT_READ);
  assert.deepEqual(again.calls, ["look", `claim:7:${TODAY}`], "claimed, refused, and no proof");
  // The live claim is the guard's, under a name that carries the gift and the day.
  const source = readFileSync("src/duolingo-public-checkin.ts", "utf8");
  assert.match(source, /claimLastResort: \(giftId, day\) => claimPass\(`daily-last-resort:\$\{giftId\}:\$\{day\}`, LAST_RESORT_CLAIMED_FOR_SECONDS\),/);
  // And the reading asks it only for the second reading, only when the last resort is due.
  assert.match(source, /const within = input\.pass === "recount" \? LAST_RESORT_WITHIN_SECONDS\.recount : null;/);
});

test("a profile the source no longer has is said as such, with no proof, even at the last chance", async () => {
  const gone = reading(closingThisMorning(), RECOUNT, async () => Promise.reject(new DuolingoProfileError("NO_SUCH_PROFILE", "none")));
  const outcome = await runPublicCheckIn({ giftId: "7", purpose: "count", pass: "recount" }, gone.deps);
  assert.deepEqual(outcome, { kind: "refused", giftId: "7", code: "PROFILE_NOT_FOUND", message: "No public Duolingo profile has that username. Check the spelling, and that the profile is public.", looked: true });
  assert.deepEqual(gone.calls, ["look"]);
});

test("a look that answers decides as before: a proof for a day to credit, none for a day without a lesson", async () => {
  for (const pass of ["counting", "recount", undefined] as const) {
    const lesson = reading(closingThisMorning(), RECOUNT, async () => seen(1_010));
    await assert.rejects(runPublicCheckIn({ giftId: "7", purpose: "count", force: true, pass }, lesson.deps), /the attested fetch was reached/);
    assert.deepEqual(lesson.calls, ["look", "proof"], "no last resort is claimed for a reading the look asked for");
    const none = reading(closingThisMorning(), RECOUNT, async () => seen(1_004));
    const outcome = await runPublicCheckIn({ giftId: "7", purpose: "count", force: true, pass }, none.deps);
    assert.equal(outcome.kind === "refused" && outcome.code, "NOT_ENOUGH_PROGRESS");
    assert.deepEqual(none.calls, ["look"]);
  }
});

test("while check-ins are paused nothing is looked at and nothing is paid for: the refusal is the contract's own", async () => {
  const paused = reading(closingThisMorning(), RECOUNT, async () => seen(1_010));
  const outcome = await runPublicCheckIn({ giftId: "7", purpose: "count", pass: "recount" }, { ...paused.deps, paused: async () => true });
  assert.deepEqual(outcome, { kind: "refused", giftId: "7", code: "PAUSED", message: "Check-ins are paused for a moment. Try again later.", xp: undefined });
  assert.deepEqual(paused.calls, []);
  // A pause that cannot be read is taken as none: the reading goes on, and the relay would refuse it.
  const unread = reading(closingThisMorning(), RECOUNT, async () => seen(1_004));
  const went = await runPublicCheckIn({ giftId: "7", purpose: "count", pass: "recount" }, { ...unread.deps, paused: async () => Promise.reject(new Error("the endpoint did not answer")) });
  assert.equal(went.kind === "refused" && went.code, "NOT_ENOUGH_PROGRESS");
  // The live reading asks the gift's own contract, and answers a first reading that already waits rather than read again.
  const source = readFileSync("src/duolingo-public-checkin.ts", "utf8");
  assert.match(source, /paused: \(escrow\) => giftPublicClient\(\)\.readContract\(\{ address: escrow, abi: dailyAbiOf\(escrow\), functionName: "checkInPaused" \}\) as Promise<boolean>,/);
  assert.match(source, /const waiting = purpose === "bind" && deps\.heldStart \? await deps\.heldStart\(giftId, record\.recipient, now\) : null;\n\s*if \(waiting\) return waiting;/);
});

test("the passes say which of them is reading, and a gift whose look failed is held for the second reading", async () => {
  const asked: string[] = [];
  const rows: NewPass[] = [];
  const settled: string[] = [];
  const deps: DailyPassDeps = {
    boundGifts: async () => [{ giftId: "7" }],
    allGifts: async () => [{ giftId: "7", escrow: ESCROW }],
    read: async () => ({ cancelled: false, finalised: false, startDay: TODAY - 2, endDay: TODAY + 4, settledThroughDay: TODAY - 3, recipient: RECIPIENT, fundedAt: 1, claimedAt: 2 }),
    count: async (giftId, pass) => {
      asked.push(`${giftId}:${pass}`);
      return { kind: "refused", giftId, code: "FETCH_FAILED", message: "Duolingo could not be read just now. Try again in a minute.", looked: true };
    },
    drain: async (giftId) => (settled.push(`drain:${giftId}`), { hash: "0xd" }),
    finalise: async (giftId) => (settled.push(`finalise:${giftId}`), { hash: "0xf" }),
    refund: async (giftId) => (settled.push(`refund:${giftId}`), { hash: "0xr" }),
    start: async () => ({ address: "0xrelayer", balance: 12n }),
    journal: async (pass) => void rows.push(pass),
    nowSeconds: () => RECOUNT,
    countingSince: async () => ({ stopped: false, held: ["7"] }),
  };
  const report = await dailyPass(COUNTING_PASS, deps);
  assert.equal(report.lines[0].result, "refused: FETCH_FAILED, by a look, no proof taken");
  // Ours to fix: nothing is settled against a look that failed, and the journal holds the gift for the second reading.
  assert.deepEqual(settled, []);
  assert.deepEqual(rows[0].failures, { FETCH_FAILED: 1 });
  assert.ok(rows[0].holds.some((hold) => hold.giftId === "7" && hold.day === TODAY - 2), "held for the day that closes this morning");
  await recountPass(deps);
  assert.deepEqual(asked, ["7:counting", "7:recount"]);
  // The live pass hands the name on to the reading.
  assert.match(readFileSync("src/daily-pass.ts", "utf8"), /count: \(giftId, pass\) => readDailyGift\(\{ giftId, purpose: "count", pass \}\),/);
  // And a count a person asks for names no pass: after a look that failed it takes no proof.
  assert.match(readFileSync("app/api/gift/[id]/count/route.ts", "utf8"), /readDailyGift\(\{ giftId: id, purpose: "count", force: true \}\)/);
});
