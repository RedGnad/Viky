import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { COUNTING_PASS, dailyPass, SETTLING_PASS, UNCLAIMED_REFUND_DELAY_SECONDS, unstartedAndOverdue, type DailyPassDeps } from "../src/daily-pass";
import { COUNTING_PASS_UTC, cronOf, SETTLING_PASS_UTC, settlingTimeInWords } from "../src/pass-schedule";

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
