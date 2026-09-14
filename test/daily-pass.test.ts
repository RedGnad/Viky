import assert from "node:assert/strict";
import test from "node:test";
import { COUNTING_PASS, dailyPass, SETTLING_PASS, type DailyPassDeps } from "../src/daily-pass";

const ESCROW = "0x00000000000000000000000000000000000000e1" as const;
const LIVE = { cancelled: false, finalised: false, startDay: 20_708 };

function spy(gifts: ReadonlyArray<{ giftId: string; escrow: `0x${string}` | null }>, state = LIVE) {
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

test("a gift that is over, taken back or not yet started is left alone", async () => {
  for (const state of [
    { cancelled: true, finalised: false, startDay: 20_708 },
    { cancelled: false, finalised: true, startDay: 20_708 },
    { cancelled: false, finalised: false, startDay: 0 },
  ]) {
    const { calls, deps } = spy([{ giftId: "1", escrow: ESCROW }], state);
    await dailyPass(SETTLING_PASS, deps);
    assert.deepEqual(calls, [], JSON.stringify(state));
  }
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
