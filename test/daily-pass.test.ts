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
