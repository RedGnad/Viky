import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { COUNTING_PASS, dailyPass, heldDaysOf, recountPass, SETTLING_PASS, UNCLAIMED_REFUND_DELAY_SECONDS, unstartedAndOverdue, type DailyPassDeps } from "../src/daily-pass";
import { expiredDayOpen } from "../src/gift-relay";
import type { NewPass } from "../src/pass-log";
import { COUNTING_PASS_UTC, cronOf, RECOUNT_PASS_UTC, SETTLING_PASS_UTC, settlingTimeInWords } from "../src/pass-schedule";

const ESCROW = "0x00000000000000000000000000000000000000e1" as const;
const FUNDED = 1_789_000_000;
const LIVE = {
  cancelled: false,
  finalised: false,
  startDay: 20_708,
  recipient: "0x000000000000000000000000000000000000b0b0" as `0x${string}` | null,
  fundedAt: FUNDED,
  claimedAt: FUNDED + 60,
  refundable: 0n as bigint | undefined,
  refundedToFunder: 0n as bigint | undefined,
};

function spy(gifts: ReadonlyArray<{ giftId: string; escrow: `0x${string}` | null }>, state: typeof LIVE = LIVE, nowSeconds?: number) {
  const calls: string[] = [];
  const deps: DailyPassDeps = {
    boundGifts: async () => gifts.map(({ giftId }) => ({ giftId })),
    allGifts: async () => gifts,
    read: async () => state,
    count: async (giftId) => {
      calls.push(`count:${giftId}`);
      return { kind: "already", giftId, reason: "counted_today" };
    },
    drain: async (giftId) => {
      calls.push(`drain:${giftId}`);
      return { hash: "0xd" };
    },
    finalise: async (giftId) => {
      calls.push(`finalise:${giftId}`);
      return { hash: "0xf" };
    },
    refund: async (giftId) => {
      calls.push(`refund:${giftId}`);
      return { hash: "0xr" };
    },
    start: async () => ({ address: "0xrelayer", balance: 12n }),
    nowSeconds: nowSeconds === undefined ? undefined : () => nowSeconds,
  };
  return { calls, deps };
}

test("the settling pass sends a missed day back, it does not park it", async () => {
  // The defect this pins (D38): draining only moves a missed day out of the gift. For a while nothing
  // ever sent it, so "a piece comes back to you" was true only if a human ran a command.
  const { calls, deps } = spy([{ giftId: "1", escrow: ESCROW }]);
  await dailyPass(SETTLING_PASS, deps);
  assert.deepEqual(calls, ["drain:1", "finalise:1", "refund:1"]);
  assert.ok(calls.includes("refund:1"), "a settling pass that never refunds breaks the promise");
});

test("the counting pass reads and credits, and settles nothing", async () => {
  const { calls, deps } = spy([{ giftId: "1", escrow: ESCROW }]);
  await dailyPass(COUNTING_PASS, deps);
  // Counting happens first; settling a day at midnight would be six hours too early (D30, D35).
  assert.deepEqual(calls, ["count:1", "drain:1", "finalise:1"]);
  assert.ok(!calls.includes("refund:1"));
});

test("a closed gift that still owes its funder is refunded by the settling pass, and only what it owes (D186)", async () => {
  // Gift 1, read on 23 Sep 2026: finalised, 2.857148 AUSD refundable and never sent, because the pass skipped it.
  const owing = { ...LIVE, finalised: true, refundable: 2_857_148n, refundedToFunder: 0n };
  let run = spy([{ giftId: "1", escrow: ESCROW }], owing);
  await dailyPass(SETTLING_PASS, run.deps);
  assert.deepEqual(run.calls, ["refund:1"], "nothing to drain or finalise, only what is owed");
  run = spy([{ giftId: "1", escrow: ESCROW }], owing);
  await dailyPass(COUNTING_PASS, run.deps);
  assert.ok(!run.calls.includes("refund:1"), "money goes back on the settling pass only");
  run = spy([{ giftId: "1", escrow: ESCROW }], { ...owing, refundedToFunder: 2_857_148n });
  await dailyPass(SETTLING_PASS, run.deps);
  assert.deepEqual(run.calls, [], "paid back already: nothing is sent twice");
});

test("a gift that is over, taken back or not yet started is left alone", async () => {
  for (const state of [
    { ...LIVE, cancelled: true },
    { ...LIVE, finalised: true },
    // Not started, and not yet fourteen days old: nothing to settle and nothing to send back.
    { ...LIVE, startDay: 0, recipient: null },
    { ...LIVE, startDay: 0 },
  ]) {
    const { calls, deps } = spy([{ giftId: "1", escrow: ESCROW }], state, FUNDED + 13 * 86_400);
    await dailyPass(SETTLING_PASS, deps);
    assert.deepEqual(calls, [], JSON.stringify(state, (_key, value) => (typeof value === "bigint" ? value.toString() : value)));
  }
});

/**
 * Decision 5 of the drawn flows: the check screen says "If nobody opens it within 14 days, it all comes back to you,
 * and the same if it is opened and never connected". The contract allowed it; until 17 Sep nothing called it.
 */
test("a gift nobody opened, or nobody connected, goes back whole after fourteen days, and only on the settling pass", async () => {
  const unopened = { ...LIVE, startDay: 0, recipient: null };
  const unconnected = { ...LIVE, startDay: 0 };
  const day14 = FUNDED + UNCLAIMED_REFUND_DELAY_SECONDS;

  let run = spy([{ giftId: "1", escrow: ESCROW }], unopened, day14);
  await dailyPass(SETTLING_PASS, run.deps);
  assert.deepEqual(run.calls, ["refund:1"], "no drain or finalise before a first reading, only the refund");

  run = spy([{ giftId: "1", escrow: ESCROW }], unopened, day14);
  await dailyPass(COUNTING_PASS, run.deps);
  assert.ok(!run.calls.includes("refund:1"), "the counting pass never sends money back");

  // Opened a minute after funding: its fourteen days run from the opening, as the contract counts them.
  run = spy([{ giftId: "1", escrow: ESCROW }], unconnected, day14);
  await dailyPass(SETTLING_PASS, run.deps);
  assert.deepEqual(run.calls, [], "fourteen days after funding is not yet fourteen days after opening");
  run = spy([{ giftId: "1", escrow: ESCROW }], unconnected, day14 + 60);
  await dailyPass(SETTLING_PASS, run.deps);
  assert.deepEqual(run.calls, ["refund:1"]);

  assert.equal(unstartedAndOverdue({ ...unopened, fundedAt: 0 }, day14), false, "an unreadable funding time sends nothing");
  assert.equal(unstartedAndOverdue({ ...unopened, cancelled: true }, day14), false);
});

test("the settling pass retires the exit terms whose deadline has passed, and the counting one does not", async () => {
  // Nothing here moves money: the contract already refuses a deadline that has passed. It is the row catching up
  // with that fact, so no set of terms says `signed` of a signature nothing can use (the audit of 18 Sep, gap e).
  let retired = 0;
  const deps: DailyPassDeps = { ...spy([]).deps, retireExits: async () => { retired += 1; return 2; } };

  const counting = await dailyPass(COUNTING_PASS, deps);
  assert.equal(retired, 0, "the counting pass settles nothing and retires nothing");
  assert.equal(counting.lines.some((line) => line.step === "retire"), false);

  const settling = await dailyPass(SETTLING_PASS, deps);
  assert.equal(retired, 1);
  const line = settling.lines.find((entry) => entry.step === "retire");
  assert.equal(line?.result, "2 set(s) of terms past their deadline");

  // A pass that found none says nothing at all rather than "0 retired".
  const none = await dailyPass(SETTLING_PASS, { ...spy([]).deps, retireExits: async () => 0 });
  assert.equal(none.lines.some((entry) => entry.step === "retire"), false);
});

test("the fourteen days are the contract's own, and the two pass hours are the platform's schedule", () => {
  const contract = readFileSync("contracts/GiftEscrow.sol", "utf8");
  assert.match(contract, /UNCLAIMED_REFUND_DELAY = 14 days;/);
  assert.equal(UNCLAIMED_REFUND_DELAY_SECONDS, 14 * 86_400);

  const crons = (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> }).crons;
  assert.equal(crons.find((cron) => cron.path === "/api/cron/daily")?.schedule, cronOf(COUNTING_PASS_UTC));
  assert.equal(crons.find((cron) => cron.path === "/api/cron/settle")?.schedule, cronOf(SETTLING_PASS_UTC));
  // The second reading runs before 06:00 UTC, when the catch-up window of the day before yesterday closes: started
  // anywhere inside its hour, it is over by then.
  assert.equal(crons.find((cron) => cron.path === "/api/cron/recount")?.schedule, cronOf(RECOUNT_PASS_UTC));
  assert.ok(RECOUNT_PASS_UTC.hour + 1 < 6 && RECOUNT_PASS_UTC.hour > COUNTING_PASS_UTC.hour);
  // The screen says the settling hour in the reader's clock, never in UTC.
  const inParis = settlingTimeInWords(Date.UTC(2026, 8, 17, 12));
  assert.match(inParis, /^\d{1,2}:\d{2}/);
});

test("one gift with no contract recorded never stops the others", async () => {
  const { calls, deps } = spy([
    { giftId: "1", escrow: null },
    { giftId: "2", escrow: ESCROW },
  ]);
  const report = await dailyPass(SETTLING_PASS, deps);
  assert.deepEqual(calls, ["drain:2", "finalise:2", "refund:2"]);
  assert.equal(report.lines.some((line) => line.giftId === "1" && /not served/.test(line.result)), true, "the skipped gift is reported, not hidden");
});

test("every gift is settled, not just the first", async () => {
  const { calls, deps } = spy([
    { giftId: "1", escrow: ESCROW },
    { giftId: "2", escrow: ESCROW },
  ]);
  await dailyPass(SETTLING_PASS, deps);
  assert.deepEqual(calls, ["drain:1", "finalise:1", "refund:1", "drain:2", "finalise:2", "refund:2"]);
});

test("a gift whose reading failed on our side is not settled that day", async () => {
  // The defect this pins (D57): the pass drained on the clock alone, so a worker outage, a source outage or
  // an attestor outage took a day from someone who had done the work.
  const calls: string[] = [];
  const deps = {
    boundGifts: async () => [{ giftId: "1" }, { giftId: "2" }],
    allGifts: async () => [
      { giftId: "1", escrow: ESCROW },
      { giftId: "2", escrow: ESCROW },
    ],
    read: async () => LIVE,
    count: async (giftId: string) => {
      calls.push(`count:${giftId}`);
      return giftId === "1"
        ? ({ kind: "refused", giftId, code: "FETCH_FAILED", message: "the source could not be read" } as const)
        : ({ kind: "already", giftId, reason: "counted_today" } as const);
    },
    drain: async (giftId: string) => {
      calls.push(`drain:${giftId}`);
      return { hash: "0xd" };
    },
    finalise: async (giftId: string) => {
      calls.push(`finalise:${giftId}`);
      return { hash: "0xf" };
    },
    refund: async (giftId: string) => {
      calls.push(`refund:${giftId}`);
      return { hash: "0xr" };
    },
    start: async () => ({ address: "0xrelayer", balance: 12n }),
  } as never;

  const report = await dailyPass(COUNTING_PASS, deps);
  assert.ok(!calls.some((c) => c.endsWith(":1")) || calls.filter((c) => c.startsWith("drain:1")).length === 0, "nothing settled against a reading that failed");
  assert.deepEqual(calls, ["count:1", "count:2", "drain:2", "finalise:2"]);
  assert.ok(report.lines.some((l) => l.giftId === "1" && /reading failed/.test(l.result)), "and the report says why");
});

test("a refusal about the person's own account is not an excuse to hold the gift open", async () => {
  // Otherwise anyone could stop the clock by making their profile private.
  const calls: string[] = [];
  const deps = {
    boundGifts: async () => [{ giftId: "1" }],
    allGifts: async () => [{ giftId: "1", escrow: ESCROW }],
    read: async () => LIVE,
    count: async (giftId: string) => ({ kind: "refused", giftId, code: "PROFILE_NOT_FOUND", message: "no public profile" }) as const,
    drain: async (giftId: string) => {
      calls.push(`drain:${giftId}`);
      return { hash: "0xd" };
    },
    finalise: async () => ({ hash: "0xf" }),
    refund: async () => ({ hash: "0xr" }),
    start: async () => ({ address: "0xrelayer", balance: 12n }),
  } as never;

  await dailyPass(COUNTING_PASS, deps);
  assert.deepEqual(calls, ["drain:1"], "the day is settled as any other");
});

// ---------------------------------------------------------------------------------------------------------------
// The audit of 1 Oct 2026, F-06 and F-23: a hold names the days it is about, a pause holds every day, one reading that
// throws stops nothing else, and the held gifts are read a second time before the catch-up window closes.
// ---------------------------------------------------------------------------------------------------------------

const DAY = 86_400;
/** 00:40 UTC on day 20,720: just after the counting pass's minute. */
const MORNING = 20_720 * DAY + 40 * 60;

test("a hold names every day a reading could still have paid, and the day before yesterday is one of them", () => {
  const window = { startDay: 20_710, endDay: 20_730, settledThroughDay: 20_717 };
  // Just after midnight on day 20,720: day 20,718 is still inside its catch-up window until 06:00, and it is the day
  // the settling pass sends back at 07:00. Yesterday alone looked at the wrong day.
  assert.deepEqual(heldDaysOf(window, MORNING), [20_718, 20_719]);
  // After 06:00 the day before yesterday can no longer be paid by anything: it is not a day a hold can save.
  assert.deepEqual(heldDaysOf(window, 20_720 * DAY + 7 * 3_600), [20_719]);
  // A day already settled is not held again.
  assert.deepEqual(heldDaysOf({ ...window, settledThroughDay: 20_718 }, MORNING), [20_719]);
  // The gift's own window bounds it: a gift that ended the day before yesterday holds that day only.
  assert.deepEqual(heldDaysOf({ ...window, endDay: 20_718 }, MORNING), [20_718]);
  // The earliest contract gives a day one day, not thirty hours: just after midnight only yesterday is still open.
  assert.deepEqual(heldDaysOf(window, MORNING, DAY), [20_719]);
  // A gift whose days could not be read is held for yesterday, as before.
  assert.deepEqual(heldDaysOf(null, MORNING), [20_719]);
  assert.deepEqual(heldDaysOf({ startDay: 0, endDay: 0, settledThroughDay: 0 }, MORNING), [20_719]);
});

function journalled(over: Partial<DailyPassDeps> & { counts?: Record<string, "ours" | "theirs" | "counted" | "throws"> }) {
  const calls: string[] = [];
  const rows: NewPass[] = [];
  const gifts = Object.keys(over.counts ?? { "1": "counted" });
  const deps: DailyPassDeps = {
    boundGifts: async () => gifts.map((giftId) => ({ giftId })),
    allGifts: async () => gifts.map((giftId) => ({ giftId, escrow: ESCROW })),
    read: async () => ({ ...LIVE, startDay: 20_710, endDay: 20_730, settledThroughDay: 20_717 }),
    count: async (giftId) => {
      calls.push(`count:${giftId}`);
      const what = over.counts?.[giftId] ?? "counted";
      if (what === "throws") throw new Error("the source's client threw");
      if (what === "ours") return { kind: "refused", giftId, code: "WORKER_OUT_OF_DATE", message: "The reading service is being updated." };
      if (what === "theirs") return { kind: "refused", giftId, code: "PROFILE_NOT_FOUND", message: "no public profile" };
      return { kind: "counted", giftId, xp: 320, creditedDays: 1, hash: "0xc" };
    },
    drain: async (giftId) => {
      calls.push(`drain:${giftId}`);
      return { hash: "0xd" };
    },
    finalise: async (giftId) => {
      calls.push(`finalise:${giftId}`);
      return { hash: "0xf" };
    },
    refund: async (giftId) => {
      calls.push(`refund:${giftId}`);
      return { hash: "0xr" };
    },
    start: async () => ({ address: "0xrelayer", balance: 12n }),
    nowSeconds: () => MORNING,
    journal: async (pass) => {
      rows.push(pass);
    },
    ...over,
  };
  return { calls, rows, deps };
}

test("a worker that runs other sources is ours to fix: the gift is held, for each open day", async () => {
  const run = journalled({ counts: { "1": "ours", "2": "counted" } });
  const report = await dailyPass(COUNTING_PASS, run.deps);
  assert.deepEqual(run.calls, ["count:1", "count:2", "drain:2", "finalise:2"], "nothing is settled against a reading we could not take");
  assert.deepEqual(run.rows[0].holds, [{ giftId: "1", day: 20_718 }, { giftId: "1", day: 20_719 }]);
  assert.deepEqual(run.rows[0].failures, { WORKER_OUT_OF_DATE: 1 });
  assert.ok(report.lines.some((line) => line.giftId === "1" && /reading failed on our side/.test(line.result)));
});

test("a reading that throws is one gift's refusal, held like any other of ours, and the next gifts are still read", async () => {
  const run = journalled({ counts: { "1": "throws", "2": "counted", "3": "counted" } });
  const report = await dailyPass(COUNTING_PASS, run.deps);
  assert.deepEqual(run.calls, ["count:1", "count:2", "count:3", "drain:2", "finalise:2", "drain:3", "finalise:3"]);
  assert.equal(run.rows[0].readingsAttempted, 3);
  assert.equal(run.rows[0].readingsSucceeded, 2);
  assert.deepEqual(run.rows[0].failures, { READING_FAILED: 1 });
  assert.deepEqual(run.rows[0].holds.map((hold) => hold.giftId), ["1", "1"]);
  assert.ok(report.lines.some((line) => line.giftId === "1" && line.result === "refused: READING_FAILED"));
});

test("while check-ins are paused on a contract nothing is drained or finalised there, and what was already freed is still sent", async () => {
  // On the first version of the contract the clock runs through a pause: draining then takes days nobody could earn.
  let run = journalled({ counts: { "1": "counted" }, paused: async () => true });
  let report = await dailyPass(SETTLING_PASS, run.deps);
  assert.deepEqual(run.calls, [], "no drain, no finalise, and nothing owed to send");
  assert.ok(report.lines.some((line) => line.giftId === "1" && /check-ins are paused/.test(line.result)));

  run = journalled({ counts: { "1": "counted" }, paused: async () => true, read: async () => ({ ...LIVE, refundable: 3_000_000n, refundedToFunder: 1_000_000n }) });
  await dailyPass(SETTLING_PASS, run.deps);
  assert.deepEqual(run.calls, ["refund:1"], "a day an earlier pass freed is the funder's already");

  // A pause that cannot be read is treated as one: holding a day costs nothing, draining it cannot be undone.
  run = journalled({ counts: { "1": "counted" }, paused: async () => Promise.reject(new Error("the node did not answer")) });
  report = await dailyPass(SETTLING_PASS, run.deps);
  assert.deepEqual(run.calls, []);

  // Not paused: the pass is the one it always was, and the contract is asked once for all its gifts.
  let asked = 0;
  run = journalled({ counts: { "1": "counted", "2": "counted" }, paused: async () => ((asked += 1), false) });
  await dailyPass(SETTLING_PASS, run.deps);
  assert.deepEqual(run.calls, ["drain:1", "finalise:1", "refund:1", "drain:2", "finalise:2", "refund:2"]);
  assert.equal(asked, 1);
});

test("an expired day is not drained ahead of a check-in while check-ins are paused", () => {
  const open = { startDay: 20_710, endDay: 20_730, settledThroughDay: 20_716, cancelled: false, finalised: false, lastDrainableDay: 20_717 };
  assert.equal(expiredDayOpen(open), true);
  assert.equal(expiredDayOpen({ ...open, paused: true }), false);
  assert.equal(expiredDayOpen({ ...open, paused: false }), true);
});

test("the second reading reads again only what the counting pass held, under its own name", async () => {
  const run = journalled({
    counts: { "1": "counted", "2": "counted", "3": "theirs" },
    countingSince: async (since) => {
      assert.equal(since.getTime(), 20_720 * DAY * 1_000, "asked from midnight UTC of today");
      return { held: ["2"], stopped: false };
    },
    completeCreations: async () => {
      throw new Error("the second reading of held gifts completes no creation");
    },
    milestones: async () => {
      throw new Error("nor runs the milestones' pass");
    },
  });
  const report = await recountPass(run.deps);
  assert.deepEqual(run.calls, ["count:2", "drain:2", "finalise:2"], "gift 3's refusal was the person's own account: it is not asked twice");
  assert.equal(run.rows.length, 1);
  assert.equal(run.rows[0].plan, "recount");
  assert.equal(run.rows[0].readingsAttempted, 1);
  assert.equal(run.rows[0].readingsSucceeded, 1);
  assert.deepEqual(run.rows[0].holds, []);
  assert.ok(!report.lines.some((line) => line.step === "refund"), "it never sends anything back");
});

test("the second reading holds again a gift that still cannot be read, and reads nothing when nothing was held", async () => {
  let run = journalled({ counts: { "1": "ours" }, countingSince: async () => ({ held: ["1"], stopped: false }) });
  await recountPass(run.deps);
  assert.deepEqual(run.calls, ["count:1"]);
  assert.deepEqual(run.rows[0].holds, [{ giftId: "1", day: 20_718 }, { giftId: "1", day: 20_719 }]);

  run = journalled({ counts: { "1": "counted" }, countingSince: async () => ({ held: [], stopped: false }) });
  await recountPass(run.deps);
  assert.deepEqual(run.calls, []);
  assert.equal(run.rows[0].plan, "recount", "it still leaves its row: it ran, and found nothing to read again");
  assert.equal(run.rows[0].readingsAttempted, 0);
});

test("with no counting pass today, or one that stopped part way, the second reading is the whole reading pass", async () => {
  for (const left of [null, { held: ["1"], stopped: true }]) {
    let milestones = 0;
    const run = journalled({ counts: { "1": "counted", "2": "counted" }, countingSince: async () => left, milestones: async () => ((milestones += 1), []) });
    await recountPass(run.deps);
    assert.deepEqual(run.calls, ["count:1", "count:2", "drain:1", "finalise:1", "drain:2", "finalise:2"], JSON.stringify(left));
    assert.equal(run.rows[0].plan, "recount");
    assert.equal(milestones, 1, "the milestones' pass runs too, as in the pass that did not happen");
  }
  // A journal that cannot be read is treated as an empty one.
  const run = journalled({ counts: { "1": "counted" }, countingSince: async () => Promise.reject(new Error("the database did not answer")) });
  await recountPass(run.deps);
  assert.deepEqual(run.calls, ["count:1", "drain:1", "finalise:1"]);
});
