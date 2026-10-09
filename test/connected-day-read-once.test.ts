// A day of a connected source is paid by its own page and by nothing else (the audit of 8 Oct 2026). The reading of
// Strava or Fitbit judges yesterday's page; the third daily contract credits through the day of the reading. Left to
// the contract's rule, the day a person connected was paid by what they had done the day before, and a press on
// "Count now" after the morning's reading paid the next open day with the same activity. No such gift existed on the
// third contract, so nothing was paid wrongly. Here: nothing is read the day of the connection, the next morning's
// reading goes, and a second reading the same day does not, whoever asks and whatever is still open.

delete process.env.DATABASE_URL;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import { newVaultKey, sealSecret } from "../src/connect-vault";
import { runConnectedCheckIn, verdictMetric, type ConnectedCheckInDeps } from "../src/connected-checkin";
import { configureConnectionStore, ensureConnectionSchema, saveConnection } from "../src/connection-store";
import { NO_CONTACT_HASH } from "../src/contact-hash";
import { noDayForYesterdaysPage, noDayToCredit } from "../src/daily-look";
import { FITBIT_DAILY, STRAVA_DAILY } from "../src/conditions";
import { contractRefusal, DAY_ONE_IS_READ_TOMORROW } from "../src/gift-api";
import type { GiftState } from "../src/gift-reader";
import { configureGiftStore, ensureGiftSchema, markBound, markClaimed, recordRelayed, saveGift } from "../src/gift-store";
import { GOAL_TYPE_STRAVA_DISTANCE } from "../src/gift-terms";
import { firstDayIsTheStart } from "../src/v2";
import type { SqlExecutor } from "../src/proof-session-store";

const ESCROW = "0x00000000000000000000000000000000000000D3" as Hex;
const FUNDER = "0x000000000000000000000000000000000000F0F0" as Hex;
const RECIPIENT = "0x000000000000000000000000000000000000b0b0" as Hex;
const DAY = 86_400;
/** The day the person connects Strava, at 18:00 UTC. */
const CONNECTED = 20_700;
const EVENING = CONNECTED * DAY + 18 * 3_600;
/** The pass of half past midnight, and a press at noon, of a given day. */
const morning = (day: number) => day * DAY + 40 * 60;
const noon = (day: number) => day * DAY + 12 * 3_600;

process.env.CONNECT_TOKEN_KEY = newVaultKey();

let db: PGlite;
before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(executor);
  configureConnectionStore(executor);
  await ensureGiftSchema();
  await ensureConnectionSchema();
  await saveGift({ giftId: "9", funder: FUNDER, contactHash: NO_CONTACT_HASH, claimToken: "a-link-key-0123456789abcdef", goalType: GOAL_TYPE_STRAVA_DISTANCE, dailyTarget: 3, durationDays: 7, amount: 7_000_000n, createdTx: `0x${"a9".repeat(32)}`, escrow: ESCROW });
  await markClaimed("9", RECIPIENT, null);
  await markBound("9", "4242");
  await saveConnection({ giftId: "9", source: "strava", externalId: "4242", accessToken: sealSecret("an access key"), refreshToken: sealSecret("a refresh key"), expiresAt: new Date((CONNECTED + 30) * DAY * 1_000), scope: "activity:read" });
});
beforeEach(async () => {
  await db.query("DELETE FROM viky_relayed");
});
after(async () => {
  configureGiftStore(undefined);
  configureConnectionStore(undefined);
  delete process.env.CONNECT_TOKEN_KEY;
  await db.close();
});

/** A gift of seven days as a daily contract holds it once the first reading is recorded. */
function gift(version: 2 | 3, over: Partial<GiftState> = {}): GiftState {
  // The third version's first day is the day of the connection; the second's, the day after.
  const startDay = version === 3 ? CONNECTED : CONNECTED + 1;
  return {
    giftId: "9",
    funder: FUNDER,
    refundTo: FUNDER,
    recipient: RECIPIENT,
    recipientContactHash: NO_CONTACT_HASH,
    goalType: GOAL_TYPE_STRAVA_DISTANCE,
    dailyTarget: 3,
    durationDays: 7,
    startDay,
    endDay: startDay + 6,
    creditedDays: 0,
    drainedDays: 0,
    settledThroughDay: startDay - 1,
    amount: 7_000_000n,
    perDay: 1_000_000n,
    withdrawnByRecipient: 0n,
    refundedToFunder: 0n,
    refundable: 0n,
    identityHash: `0x${"1d".repeat(32)}`,
    baselineValue: 0n,
    lastCheckInAt: EVENING,
    fundedAt: (CONNECTED - 2) * DAY,
    claimedAt: (CONNECTED - 1) * DAY,
    cancelled: false,
    finalised: false,
    earnedBalance: 0n,
    refundableBalance: 0n,
    withdrawNonce: 0n,
    version,
    openingKey: FUNDER,
    endedAt: 0,
    givenBackDays: 0,
    ...over,
  };
}

/** The dependencies of a reading that says when it reaches the attested fetch, and never reaches Reclaim. */
function reading(onChain: GiftState, now: number) {
  const calls: string[] = [];
  const deps: ConnectedCheckInDeps = {
    now: () => now,
    configured: () => true,
    gift: async () => onChain,
    refresh: async () => Promise.reject(new Error("the key was good for a month: nothing to refresh")),
    read: async () => {
      calls.push("proof");
      throw new Error("the attested fetch was reached");
    },
  };
  return { calls, deps };
}

const STARTS_TOMORROW = { kind: "refused", giftId: "9", code: "NOT_STARTED", message: "Your gift starts counting tomorrow.", looked: true };
/** The same refusal on a day that is the gift's first: it has started, and what it waits for is tomorrow morning's reading. */
const DAY_ONE = { kind: "refused", giftId: "9", code: "NOT_STARTED", message: "Today is day one. It is read tomorrow morning.", looked: true };
const ALL_COUNTED = { kind: "refused", giftId: "9", code: "NOTHING_TO_CREDIT", message: "Everything up to yesterday is already counted. Come back tomorrow.", looked: true };
const COUNTED_TODAY = { kind: "already", giftId: "9", reason: "counted_today" };

test("on the third contract, nothing is read the day of the connection: the day before it pays nothing", async () => {
  // The contract would credit that day: its own rule runs through the day of the reading.
  assert.equal(noDayToCredit(gift(3), EVENING), null, "the contract has a day open for a reading taken that evening");
  assert.equal(noDayForYesterdaysPage(gift(3), EVENING), "OutsideWindow", "and the page that reading would judge is the day before the connection");
  // A press that evening, and nothing leaves for Strava or for Reclaim.
  const pressed = reading(gift(3), EVENING);
  assert.deepEqual(await runConnectedCheckIn({ giftId: "9", purpose: "count", force: true }, pressed.deps), DAY_ONE);
  assert.deepEqual(pressed.calls, []);
});

test("what is said of the first day is true of the contract the gift is on (the audit of 9 Oct 2026)", async () => {
  // The third contract's first day is the day counting starts: "From tomorrow" was said of a day already running, and
  // a person who did not move that day lost it without a word. The first two start the day after, and keep theirs.
  assert.equal(firstDayIsTheStart(3), true);
  assert.equal(firstDayIsTheStart(2), false);
  assert.equal(firstDayIsTheStart(1), false);
  assert.equal(firstDayIsTheStart(undefined), false);
  for (const [condition, unit] of [[STRAVA_DAILY, "kilometres"], [FITBIT_DAILY, "minutes"]] as const) {
    assert.equal(condition.link.kind, "connect");
    if (condition.link.kind !== "connect") continue;
    const { connected, connectedDayOne, notReached, start } = condition.link.consent;
    assert.equal(connected, `${condition.source} is connected. From tomorrow, every day with your ${unit} is yours, counted each morning.`);
    assert.equal(connectedDayOne, `${condition.source} is connected. Start counting: today is day one, and its ${unit} are read tomorrow morning.`);
    assert.ok(connectedDayOne.includes(start), "it names the press by the button's own words");
    assert.equal(notReached, `Yesterday's ${unit} did not reach your target. Nothing was counted.`);
  }
  // The screen takes the sentence of the gift's own contract, on the way back from the source and afterwards.
  const screen = readFileSync("app/kit/ConnectTheAccount.tsx", "utf8");
  assert.match(screen, /get\("connect"\) === "done" \? \(dayOneIsTheStart \? link\.consent\.connectedDayOne : link\.consent\.connected\) : null/);
  assert.match(screen, /\{said \?\? \(dayOneIsTheStart \? words\.connectedDayOne : words\.connected\)\}/);
  assert.match(readFileSync("app/components/GiftPage.tsx", "utf8"), /<ConnectTheAccount giftId=\{giftId\} conditionId=\{condition\.id\} yours=\{mine\} dayOneIsTheStart=\{firstDayIsTheStart\(status\.version\)\} onChanged=\{reloadAll\} \/>/);

  // A press on "Count now": before the first day the gift starts tomorrow; on it, the gift has started.
  assert.equal(contractRefusal("OutsideWindow")?.message, "Your gift starts counting tomorrow.");
  assert.equal(DAY_ONE_IS_READ_TOMORROW, "Today is day one. It is read tomorrow morning.");
  const second = reading(gift(2), EVENING);
  assert.deepEqual(await runConnectedCheckIn({ giftId: "9", purpose: "count", force: true }, second.deps), STARTS_TOMORROW, "the second contract, the evening of the connection");
  const secondDayOne = reading(gift(2), noon(CONNECTED + 1));
  assert.deepEqual(await runConnectedCheckIn({ giftId: "9", purpose: "count", force: true }, secondDayOne.deps), DAY_ONE, "and on its own first day, the day after");
  assert.deepEqual([...second.calls, ...secondDayOne.calls], [], "nothing is read either time");
});

test("a day that did not reach its target is said in the source's own unit, not as a lesson to take", () => {
  // The contract's refusal is Duolingo's sentence, "One more lesson and it counts": yesterday's page of Strava or
  // Fitbit is not something a lesson changes.
  assert.equal(contractRefusal("InsufficientProgress")?.message, "Not enough yet for a full day. One more lesson and it counts.");
  const reader = readFileSync("src/connected-checkin.ts", "utf8");
  assert.match(reader, /const inItsWords = mapped\?\.code === "NOT_ENOUGH_PROGRESS" && link\?\.kind === "connect" \? link\.consent\.notReached : null;/);
  assert.match(reader, /return refusal\(giftId, mapped\?\.code \?\? error\.contractError \?\? "REFUSED", inItsWords \?\? mapped\?\.message \?\? "The contract refused this reading\."\);/);
  // The code is unchanged, so the page that reads by itself stays quiet on it (app/kit/DayReading.tsx).
  assert.match(readFileSync("app/kit/DayReading.tsx", "utf8"), /NOTHING_NEW: ReadonlySet<string> = new Set\(\["NOT_ENOUGH_PROGRESS", "NOTHING_TO_CREDIT", "NOT_STARTED"/);
});

test("the next morning's reading goes, judges the day of the connection, and its verdict is one target: the first day", async () => {
  const first = reading(gift(3), morning(CONNECTED + 1));
  await assert.rejects(runConnectedCheckIn({ giftId: "9", purpose: "count" }, first.deps), /the attested fetch was reached/);
  assert.deepEqual(first.calls, ["proof"]);
  // The day judged is yesterday, and a day won is the contract's baseline plus one target, never more: one day
  // credited, the oldest open one (test/GiftEscrowV3Rule.t.sol, `test_oldestOpenDayIsPaidFirst`), which is day 1.
  assert.match(readFileSync("src/connected-checkin.ts", "utf8"), /const day = purpose === "bind" \? utcDayOf\(now\) : utcDayOf\(now\) - 1;/);
  assert.equal(verdictMetric({ baselineValue: 0n, dailyTarget: 3 }, "count", true), 3n);
  assert.equal(verdictMetric({ baselineValue: 0n, dailyTarget: 3 }, "count", false), 0n);
});

test("one counted reading for a gift in a day: a press after it reads nothing, even with an older day still open", async () => {
  // Two mornings after the connection, with nothing counted yet: the first day and the second are both open.
  const today = CONNECTED + 2;
  const open = gift(3);
  assert.equal(noDayForYesterdaysPage(open, noon(today)), null, "the rule on days alone would let a second reading go");
  // The morning's reading was counted: the contract paid the first day with yesterday's activity.
  await recordRelayed({ giftId: "9", kind: "check-in", sessionId: `connected:9:count:${today}:0123456789abcdef`, txHash: `0x${"c1".repeat(32)}` });
  const afterIt = gift(3, { settledThroughDay: CONNECTED, creditedDays: 1, baselineValue: 3n });
  assert.equal(noDayForYesterdaysPage(afterIt, noon(today)), null, "yesterday is still open: the same page read again would pay it with the same activity");
  for (const input of [{ giftId: "9", purpose: "count", force: true }, { giftId: "9", purpose: "count" }] as const) {
    const again = reading(afterIt, noon(today));
    assert.deepEqual(await runConnectedCheckIn(input, again.deps), COUNTED_TODAY, input.force ? "a press on Count now" : "a pass");
    assert.deepEqual(again.calls, []);
  }
  // The next day it is read again: one reading a day, not one reading ever.
  const tomorrow = reading(afterIt, morning(today + 1));
  await assert.rejects(runConnectedCheckIn({ giftId: "9", purpose: "count" }, tomorrow.deps), /the attested fetch was reached/);
});

test("a reading that was refused is not a counted one: the day can be read again, as before", async () => {
  // The morning's reading found the day not won, and the contract kept nothing of it: no row says it was relayed. An
  // activity that reaches Strava late is read by the second pass of the morning, or by a press.
  const late = reading(gift(3), noon(CONNECTED + 1));
  await assert.rejects(runConnectedCheckIn({ giftId: "9", purpose: "count", force: true }, late.deps), /the attested fetch was reached/);
});

test("once yesterday is settled nothing is read, where the third contract would have paid today with yesterday's page", async () => {
  const today = CONNECTED + 1;
  const paid = gift(3, { settledThroughDay: CONNECTED, creditedDays: 1, baselineValue: 3n });
  assert.equal(noDayToCredit(paid, noon(today)), null, "the contract still holds today open");
  assert.equal(noDayForYesterdaysPage(paid, noon(today)), "NothingToCredit");
  const pressed = reading(paid, noon(today));
  assert.deepEqual(await runConnectedCheckIn({ giftId: "9", purpose: "count", force: true }, pressed.deps), ALL_COUNTED);
  assert.deepEqual(pressed.calls, []);
});

test("the last day is read the morning after it, and nothing once it is settled", () => {
  const last = gift(3).endDay;
  assert.equal(noDayForYesterdaysPage(gift(3, { settledThroughDay: last - 1 }), morning(last + 1)), null, "the last day's page is read the next morning");
  assert.equal(noDayForYesterdaysPage(gift(3, { settledThroughDay: last }), morning(last + 1)), "NothingToCredit");
  assert.equal(noDayForYesterdaysPage(gift(3, { settledThroughDay: last }), morning(last + 5)), "NothingToCredit");
  // Nothing is said of a gift whose first reading is not recorded.
  assert.equal(noDayForYesterdaysPage(gift(3, { startDay: 0, endDay: 0, settledThroughDay: 0 }), EVENING), null);
});

test("on the first two versions nothing changes: the rule is the one their contracts already had", () => {
  for (let day = CONNECTED; day <= CONNECTED + 12; day += 1) {
    for (let settled = CONNECTED; settled <= CONNECTED + 7; settled += 1) {
      for (const at of [morning(day), noon(day)]) {
        const held = gift(2, { settledThroughDay: settled });
        assert.equal(noDayForYesterdaysPage(held, at), noDayToCredit(held, at), `day ${day - CONNECTED}, settled through ${settled - CONNECTED}`);
        assert.equal(noDayForYesterdaysPage({ ...held, version: 1 }, at), noDayToCredit({ ...held, version: 1 }, at));
      }
    }
  }
  // The morning after the connection, on the second version, as before.
  assert.equal(noDayForYesterdaysPage(gift(2), morning(CONNECTED + 1)), "OutsideWindow");
});
