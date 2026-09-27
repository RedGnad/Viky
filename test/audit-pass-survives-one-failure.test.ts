// One failed relay is a line of the settling pass, never its end (the money path audit of 27 Sep 2026): a finality
// wait that ran out on one gift used to stop the pass, so no later gift was drained, finalised or refunded, and the
// milestone pass never ran.

import assert from "node:assert/strict";
import test from "node:test";
import { FinalityTimeout } from "../src/monad/chain";
import { dailyPass, SETTLING_PASS, type DailyPassDeps } from "../src/daily-pass";
import { RelayerError } from "../src/relayer";

const ESCROW = "0x00000000000000000000000000000000000000e1" as const;
const LIVE = { cancelled: false, finalised: false, startDay: 20_708, recipient: "0x000000000000000000000000000000000000b0b0" as `0x${string}` | null, fundedAt: 1_789_000_000, claimedAt: 1_789_000_060, refundable: 0n as bigint | undefined, refundedToFunder: 0n as bigint | undefined };

function run(failOn: (giftId: string, step: string) => unknown) {
  const done: string[] = [];
  let milestones = false;
  const step = (name: string) => async (giftId: string) => {
    const failure = failOn(giftId, name);
    if (failure) throw failure;
    done.push(`${name}:${giftId}`);
    return { hash: "0x1" };
  };
  const deps: DailyPassDeps = {
    boundGifts: async () => [],
    allGifts: async () => [{ giftId: "1", escrow: ESCROW }, { giftId: "2", escrow: ESCROW }],
    read: async (_escrow, giftId) => {
      if (failOn(giftId, "read")) throw new Error("the endpoint did not answer");
      return LIVE;
    },
    count: async (giftId) => ({ kind: "already", giftId, reason: "counted_today" }),
    drain: step("drain"),
    finalise: step("finalise"),
    refund: step("refund"),
    start: async () => ({ address: "0xrelayer", balance: 20n }),
    milestones: async () => {
      milestones = true;
      return [];
    },
  };
  return { deps, done, ran: () => milestones };
}

test("a finality wait that runs out on one gift is a line, and every other gift and the milestones are settled", async () => {
  const r = run((giftId, name) => (giftId === "1" && name === "drain" ? new FinalityTimeout("0xabc") : undefined));
  const report = await dailyPass(SETTLING_PASS, r.deps);
  assert.ok(report.lines.some((line) => line.giftId === "1" && line.result.startsWith("failed:")));
  assert.ok(r.done.includes("drain:2") && r.done.includes("finalise:2") && r.done.includes("refund:2"));
  assert.ok(r.ran(), "the milestone pass still runs");
});

test("a gift the chain could not be read for is a line, and the next gift is settled", async () => {
  const r = run((giftId, name) => (giftId === "1" && name === "read" ? true : undefined));
  await dailyPass(SETTLING_PASS, r.deps);
  assert.ok(r.done.includes("drain:2"));
});

test("a relayer below its reserve still stops the pass: every later relay would fail the same way", async () => {
  const r = run((_giftId, name) => (name === "drain" ? new RelayerError("RESERVE_TOO_LOW", "below the reserve") : undefined));
  await assert.rejects(dailyPass(SETTLING_PASS, r.deps));
});
