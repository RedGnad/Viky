import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { foreseenRefusal, LAST_RESORT_WITHIN_SECONDS, lastResortDue, lookBeforeCount, lookForCode, noDayToCredit } from "../src/daily-look";
import { COUNTING_PASS, dailyPass, type DailyPassDeps } from "../src/daily-pass";
import { DuolingoProfileError, type PublicDuolingoProfile } from "../src/duolingo-profile";
import { contractRefusal } from "../src/gift-api";
import type { NewPass } from "../src/pass-log";

/**
 * The look before a proof (3 Oct 2026). An attested reading is one of a month's hundred: the morning pass took one for
 * every gift every morning, lesson or not, and a connection by code took one at each try. Both look plainly first.
 */

const DAY = 86_400;
/** The day a gift was connected, so its first day is the next one and its last the seventh after. */
const CONNECTED = 20_700;
const GIFT = { startDay: CONNECTED + 1, endDay: CONNECTED + 7, settledThroughDay: CONNECTED, baselineValue: 1_000n, dailyTarget: 10 };
/** Half past midnight UTC on a day: when the counting pass runs. */
const morning = (day: number) => day * DAY + 30 * 60;

function profile(over: Partial<PublicDuolingoProfile> = {}): PublicDuolingoProfile {
  return { id: "7", username: "Ama", courses: [], currentCourseId: null, totalXp: 1_000, name: "Ama", ...over };
}

test("a morning with no day a reading could credit is foreseen, by the contract's own rule on its own figures", () => {
  // The morning after the connection: the first day is not over, so the contract answers OutsideWindow.
  assert.equal(noDayToCredit(GIFT, morning(CONNECTED + 1)), "OutsideWindow");
  // The morning after the first day: that day can be credited.
  assert.equal(noDayToCredit(GIFT, morning(CONNECTED + 2)), null);
  // Once it is credited, a second reading the same day has nothing left.
  assert.equal(noDayToCredit({ ...GIFT, settledThroughDay: CONNECTED + 1 }, morning(CONNECTED + 2) + 3_600), "NothingToCredit");
  // The morning after the last day, that day is still to credit; once it is settled, no morning has anything.
  assert.equal(noDayToCredit({ ...GIFT, settledThroughDay: CONNECTED + 6 }, morning(CONNECTED + 8)), null);
  assert.equal(noDayToCredit({ ...GIFT, settledThroughDay: CONNECTED + 7 }, morning(CONNECTED + 8)), "NothingToCredit");
  assert.equal(noDayToCredit({ ...GIFT, settledThroughDay: CONNECTED + 7 }, morning(CONNECTED + 9)), "NothingToCredit");
  // A gift whose first reading is not recorded is not judged: that reading is the start, and it is taken.
  assert.equal(noDayToCredit({ startDay: 0, endDay: 0, settledThroughDay: 0 }, morning(CONNECTED + 3)), null);
});

test("a figure that earns no day is foreseen in the order the contract refuses, and a day earned never is", () => {
  const open = morning(CONNECTED + 2);
  assert.equal(foreseenRefusal(GIFT, 1_000, open), "InsufficientProgress", "no lesson since the last reading");
  assert.equal(foreseenRefusal(GIFT, 1_009, open), "InsufficientProgress", "one short of a full target");
  assert.equal(foreseenRefusal(GIFT, 1_010, open), null, "one full target: the proof is taken");
  assert.equal(foreseenRefusal(GIFT, 5_000, open), null);
  // A figure below the last one is the contract's first refusal, before the days are looked at.
  assert.equal(foreseenRefusal(GIFT, 999, open), "MetricDecreased");
  assert.equal(foreseenRefusal(GIFT, 999, morning(CONNECTED + 1)), "MetricDecreased");
  // Progress with no day to credit is refused for the day, as the contract does.
  assert.equal(foreseenRefusal(GIFT, 5_000, morning(CONNECTED + 1)), "OutsideWindow");
  assert.equal(foreseenRefusal({ ...GIFT, settledThroughDay: CONNECTED + 7 }, 5_000, morning(CONNECTED + 9)), "NothingToCredit");
  // Nothing is foreseen of a gift that has not started.
  assert.equal(foreseenRefusal({ ...GIFT, startDay: 0 }, 1_000, open), null);
  // And each of them has the sentence the contract's refusal already had: the person reads what they read before.
  for (const name of ["MetricDecreased", "OutsideWindow", "NothingToCredit", "InsufficientProgress"]) assert.notEqual(contractRefusal(name)?.code, "REFUSED");
});

test("on the third contract a reading pays its own day: the look opens today, and the day of the connection is the first", () => {
  // Connected on a day, that day is the first: a lesson later that day can be paid by a reading that same day.
  const third = { ...GIFT, version: 3 as const, startDay: CONNECTED, endDay: CONNECTED + 6, settledThroughDay: CONNECTED - 1 };
  const noon = (day: number) => day * DAY + 12 * 3_600;
  assert.equal(noDayToCredit(third, noon(CONNECTED)), null, "the day of the connection is open to a reading that day");
  assert.equal(noDayToCredit({ ...GIFT, version: 2, startDay: CONNECTED + 1 }, noon(CONNECTED + 1)), "OutsideWindow", "on the second, its own day is never open to it");
  // Today paid: nothing more today, and tomorrow's reading opens tomorrow.
  assert.equal(noDayToCredit({ ...third, settledThroughDay: CONNECTED }, noon(CONNECTED)), "NothingToCredit");
  assert.equal(noDayToCredit({ ...third, settledThroughDay: CONNECTED }, noon(CONNECTED + 1)), null);
  // The last day is paid on the last day, and after it only a day still unsettled is open.
  assert.equal(noDayToCredit({ ...third, settledThroughDay: CONNECTED + 5 }, noon(CONNECTED + 6)), null);
  assert.equal(noDayToCredit({ ...third, settledThroughDay: CONNECTED + 6 }, noon(CONNECTED + 7)), "NothingToCredit");
  // The figure is judged as before: one full target since the last reading, or nothing is taken.
  assert.equal(foreseenRefusal(third, 1_009, noon(CONNECTED)), "InsufficientProgress");
  assert.equal(foreseenRefusal(third, 1_010, noon(CONNECTED)), null);
  // And it is the third contract's own rule, in its own words.
  const source = readFileSync("contracts/GiftEscrowV3.sol", "utf8");
  let from = 0;
  for (const line of [
    // The first day is the day of the block that carries the first reading (the re-read of 3 Oct 2026, C1).
    "uint32 startDay = _dayOf(block.timestamp);",
    "if (a.metricValue < g.baselineValue) revert MetricDecreased();",
    "uint32 readDay = _readDay(a.observedAt);",
    "uint32 upper = readDay > g.endDay ? g.endDay : readDay;",
    "if (upper <= g.settledThroughDay) revert NothingToCredit();",
    "uint256 possible = uint256(a.metricValue - g.baselineValue) / g.dailyTarget;",
    "if (credit == 0) revert InsufficientProgress();",
  ]) {
    const at = source.indexOf(line, from);
    assert.ok(at >= 0, line);
    from = at;
  }
  assert.ok(!source.includes("OutsideWindow"), "the third contract has no such refusal");
});

test("the rule the look mirrors is the one both contracts in service write, in the order they write it", () => {
  const rule = [
    "if (a.metricValue < g.baselineValue) revert MetricDecreased();",
    "uint32 lastCompleteDay = _dayOf(a.observedAt) - 1;",
    "if (lastCompleteDay < g.startDay) revert OutsideWindow();",
    "uint32 upper = lastCompleteDay > g.endDay ? g.endDay : lastCompleteDay;",
    "if (upper <= g.settledThroughDay) revert NothingToCredit();",
    "uint256 possible = uint256(a.metricValue - g.baselineValue) / g.dailyTarget;",
    "if (credit == 0) revert InsufficientProgress();",
  ];
  for (const file of ["contracts/GiftEscrow.sol", "contracts/GiftEscrowV2.sol"]) {
    const source = readFileSync(file, "utf8");
    let from = 0;
    for (const line of rule) {
      const at = source.indexOf(line, from);
      assert.ok(at >= 0, `${file}: ${line}`);
      from = at;
    }
  }
});

test("before a count, the look answers the refusal and its figure, or nothing: and nothing whenever it cannot say", async () => {
  const input = { username: "Ama", courseId: null, gift: GIFT, nowSeconds: morning(CONNECTED + 2) };
  assert.deepEqual(await lookBeforeCount(input, async () => profile({ totalXp: 1_004 })), { kind: "refused", refusal: "InsufficientProgress", xp: 1_004 });
  assert.deepEqual(await lookBeforeCount(input, async () => profile({ totalXp: 1_010 })), { kind: "seen", xp: 1_010 }, "a day to credit: the proof is taken");
  // No day to credit whatever the profile shows: refused without asking the source, even one that is not answering.
  const never = async () => Promise.reject(new Error("never asked"));
  assert.deepEqual(await lookBeforeCount({ ...input, nowSeconds: morning(CONNECTED + 1) }, never), { kind: "refused", refusal: "OutsideWindow" });
  assert.deepEqual(await lookBeforeCount({ ...input, gift: { ...GIFT, settledThroughDay: CONNECTED + 7 }, nowSeconds: morning(CONNECTED + 9) }, never), { kind: "refused", refusal: "NothingToCredit" });
  // The source did not answer, or its answer carries no figure: the look could not say, and says so.
  assert.deepEqual(await lookBeforeCount(input, async () => Promise.reject(new DuolingoProfileError("SOURCE_UNAVAILABLE", "down"))), { kind: "unseen" });
  assert.deepEqual(await lookBeforeCount(input, async () => profile({ totalXp: null })), { kind: "unseen" });
  // No profile by that name is the source's answer about the account, not a failure to read it.
  assert.deepEqual(await lookBeforeCount(input, async () => Promise.reject(new DuolingoProfileError("NO_SUCH_PROFILE", "none"))), { kind: "gone" });
  assert.deepEqual(await lookBeforeCount(input, async () => Promise.reject(new DuolingoProfileError("INVALID_USERNAME", "odd"))), { kind: "gone" });
  // A gift on one course is judged on that course's experience, never on the whole profile's.
  const courses = [{ id: "DUOLINGO_ES_EN", title: "Spanish", xp: 1_003 }];
  const onCourse = { ...input, courseId: "DUOLINGO_ES_EN" };
  assert.deepEqual(await lookBeforeCount(onCourse, async () => profile({ totalXp: 9_000, courses })), { kind: "refused", refusal: "InsufficientProgress", xp: 1_003 });
  assert.deepEqual(await lookBeforeCount({ ...input, courseId: "DUOLINGO_IT_EN" }, async () => profile({ totalXp: 1_000, courses })), { kind: "unseen" }, "a course the look does not show");
});

test("the reading of last resort is due only when the oldest open day closes before the next pass that could read it", () => {
  const CATCH_UP = 30 * 3_600;
  const within = LAST_RESORT_WITHIN_SECONDS.recount;
  const open = { ...GIFT, finalised: false, cancelled: false };
  /** The second reading of the morning, at 03:30 UTC, started anywhere inside its hour. */
  const recount = (day: number, minute = 30) => day * DAY + 3 * 3_600 + minute * 60;
  // Day 1 (CONNECTED + 1) is unsettled. Its window closes at 06:00 UTC two days after it.
  // The morning after it: it closes tomorrow at 06:00, and tomorrow's passes come before that. Not the last chance.
  assert.equal(lastResortDue(open, recount(CONNECTED + 2), CATCH_UP, within), false);
  assert.equal(lastResortDue(open, recount(CONNECTED + 2, 59), CATCH_UP, within), false);
  // Two mornings after it: it closes at 06:00 this morning. The last chance.
  assert.equal(lastResortDue(open, recount(CONNECTED + 3), CATCH_UP, within), true);
  assert.equal(lastResortDue(open, recount(CONNECTED + 3, 59), CATCH_UP, within), true);
  // Past 06:00 that day is gone, and the next open day closes the morning after: not due any more.
  assert.equal(lastResortDue(open, (CONNECTED + 3) * DAY + 6 * 3_600 + 1, CATCH_UP, within), false);
  // With that day settled, the oldest open one is the next, which closes a day later.
  assert.equal(lastResortDue({ ...open, settledThroughDay: CONNECTED + 1 }, recount(CONNECTED + 3), CATCH_UP, within), false);
  assert.equal(lastResortDue({ ...open, settledThroughDay: CONNECTED + 1 }, recount(CONNECTED + 4), CATCH_UP, within), true);
  // The last day of the gift, two mornings after it: its last chance too.
  assert.equal(lastResortDue({ ...open, settledThroughDay: CONNECTED + 6 }, recount(CONNECTED + 9), CATCH_UP, within), true);
  // No day open, a gift not started, a gift that is over: never.
  assert.equal(lastResortDue({ ...open, settledThroughDay: CONNECTED + 7 }, recount(CONNECTED + 9), CATCH_UP, within), false);
  assert.equal(lastResortDue({ ...open, startDay: 0 }, recount(CONNECTED + 3), CATCH_UP, within), false);
  assert.equal(lastResortDue({ ...open, finalised: true }, recount(CONNECTED + 3), CATCH_UP, within), false);
  // Twenty hours: past 06:00 of the same morning from the latest start of the pass, and short of 06:00 the morning after.
  assert.equal(within, 20 * 3_600);
  assert.ok(recount(0, 59) + within > 6 * 3_600 && recount(0) + within < DAY + 6 * 3_600);
});

test("before a connection by code, the look stops a try the code is not in, and a look that failed takes no proof", async () => {
  const input = { username: "Ama", code: "K7Q2MX" };
  assert.equal(await lookForCode(input, async () => profile({ name: "Ama k7q-2mx" })), null, "case and dashes aside, as the attested name is read");
  assert.deepEqual(await lookForCode(input, async () => profile({ name: "Ama" })), { code: "CODE_NOT_IN_NAME", shown: "Ama" });
  assert.deepEqual(await lookForCode(input, async () => profile({ name: null })), { code: "CODE_NOT_IN_NAME", shown: "" });
  assert.deepEqual(await lookForCode(input, async () => Promise.reject(new DuolingoProfileError("SOURCE_UNAVAILABLE", "down"))), { code: "FETCH_FAILED" });
  assert.deepEqual(await lookForCode(input, async () => Promise.reject(new DuolingoProfileError("NO_SUCH_PROFILE", "none"))), { code: "PROFILE_NOT_FOUND" });
  await assert.rejects(lookForCode(input, async () => Promise.reject(new Error("a bug"))), /a bug/);
});

test("the two readings look before they pay, and the live look is the plain profile", () => {
  const checkIn = readFileSync("src/duolingo-public-checkin.ts", "utf8");
  assert.match(checkIn, /look: resolvePublicDuolingoProfile,/);
  const paid = checkIn.indexOf("await fetchPublicProfile(");
  assert.ok(checkIn.indexOf("await lookBeforeCount(") > 0 && checkIn.indexOf("await lookBeforeCount(") < paid, "a count looks before the attested profile is fetched");
  assert.ok(checkIn.indexOf("await lookForCode(") > 0 && checkIn.indexOf("await lookForCode(") < paid, "a connection by code looks before it too");
  assert.ok(checkIn.indexOf("await lookBeforeCount(") < checkIn.indexOf("await deps.course("), "and before the attested course");
  // The attested name still decides: the look only keeps a proof from being wasted.
  assert.match(checkIn, /!displayNameHasCode\(read\.displayName, record\.bindingCode \?\? ""\)\) return codeNotInName\(read\.displayName\)/);
  // A connected source has no plain look yet: it is spared the mornings that have no day to credit.
  const connected = readFileSync("src/connected-checkin.ts", "utf8");
  assert.ok(connected.indexOf("noDayToCredit(onChain, now)") > 0 && connected.indexOf("noDayToCredit(onChain, now)") < connected.indexOf("await attestedRead("));
});

test("a refusal the look foresaw is in the pass's report as such, counted by its code, and the gift is settled as before", async () => {
  const calls: string[] = [];
  const rows: NewPass[] = [];
  const deps: DailyPassDeps = {
    boundGifts: async () => [{ giftId: "4" }],
    allGifts: async () => [{ giftId: "4", escrow: "0x00000000000000000000000000000000000000e1" }],
    read: async () => ({ cancelled: false, finalised: false, startDay: CONNECTED + 1, recipient: "0x000000000000000000000000000000000000b0b0", fundedAt: 1, claimedAt: 2 }),
    count: async (giftId) => ({ kind: "refused", giftId, code: "NOT_ENOUGH_PROGRESS", message: "Not enough yet for a full day. One more lesson and it counts.", xp: 1_004, looked: true }),
    drain: async (giftId) => (calls.push(`drain:${giftId}`), { hash: "0xd" }),
    finalise: async (giftId) => (calls.push(`finalise:${giftId}`), { hash: "0xf" }),
    refund: async (giftId) => (calls.push(`refund:${giftId}`), { hash: "0xr" }),
    start: async () => ({ address: "0xrelayer", balance: 12n }),
    journal: async (pass) => void rows.push(pass),
  };
  const report = await dailyPass(COUNTING_PASS, deps);
  assert.equal(report.lines[0].result, "refused: NOT_ENOUGH_PROGRESS (1004 XP), by a look, no proof taken");
  assert.deepEqual(rows[0].refusals, { NOT_ENOUGH_PROGRESS: 1 });
  assert.deepEqual(rows[0].holds, [], "a day not earned is the person's, not a failure of ours: nothing is held");
  assert.deepEqual(calls, ["drain:4", "finalise:4"]);
});
