import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COUNTING_PASS, dailyPass, SETTLING_PASS, type DailyPassDeps } from "../src/daily-pass";
import { canExpire, milestonePhase, type MilestoneState } from "../src/milestone-reader";
import { milestonePass, type MilestonePassDeps } from "../src/milestone-pass";
import type { MilestoneOutcome } from "../src/milestone-reading";
import { MILESTONE_DORMANT_SECONDS, MILESTONE_PROOF_GRACE_SECONDS } from "../src/milestone-protocol";

const CONTRACT = "0x00000000000000000000000000000000000000c2" as const;
const ZERO = `0x${"0".repeat(64)}` as const;
const IDENTITY = `0x${"1d".repeat(32)}` as const;
const FUNDED = 1_789_000_000;
const STARTED = FUNDED + 3_600;
const DEADLINE = STARTED + 30 * 86_400;

const CLIMBING: MilestoneState = {
  giftId: "1000000",
  funder: "0x000000000000000000000000000000000000A11C",
  refundTo: "0x000000000000000000000000000000000000A11C",
  recipient: "0x000000000000000000000000000000000000B0B0",
  recipientContactHash: `0x${"51".repeat(32)}`,
  goalType: 1,
  shape: 0,
  target: 1500n,
  maximumStart: 1430n,
  durationDays: 30,
  amount: 25_000_000n,
  earned: 0n,
  withdrawnByRecipient: 0n,
  refundable: 0n,
  refundedToFunder: 0n,
  identityHash: IDENTITY,
  startingValue: 1420n,
  lastProofAt: STARTED,
  deadline: DEADLINE,
  fundedAt: FUNDED,
  claimedAt: FUNDED + 60,
  cancelled: false,
  settled: false,
  earnedBalance: 0n,
  withdrawNonce: 0n,
  proofPaused: false,
  proofResumedAt: 1_700_000_000,
};

/** A chain of one gift that moves as the pass acts on it, and the list of what the pass did. */
function world(initial: MilestoneState, outcome: MilestoneOutcome, nowSeconds: number) {
  let state = initial;
  const calls: string[] = [];
  const deps: MilestonePassDeps = {
    gifts: async () => [{ giftId: initial.giftId, escrow: CONTRACT }],
    read: async () => state,
    reach: async (giftId) => {
      calls.push(`reach:${giftId}`);
      if (outcome.kind === "reached") state = { ...state, settled: true, earned: state.amount, earnedBalance: state.amount };
      return outcome;
    },
    expire: async (giftId) => {
      calls.push(`expire:${giftId}`);
      state = { ...state, settled: true, refundable: state.amount };
      return { hash: "0xe" };
    },
    refund: async (giftId) => {
      calls.push(`refund:${giftId}`);
      state = { ...state, refundable: 0n, refundedToFunder: state.amount };
      return { hash: "0xr" };
    },
    now: () => nowSeconds,
  };
  return { calls, deps, state: () => state };
}

test("the first reading at or past the target releases the whole gift, and nothing goes back", async () => {
  const reached: MilestoneOutcome = { kind: "reached", giftId: "1000000", rating: 1503, hash: "0xabc" };
  const run = world(CLIMBING, reached, STARTED + 5 * 86_400);
  const lines = await milestonePass(true, run.deps);
  assert.deepEqual(run.calls, ["reach:1000000"]);
  assert.equal(run.state().earnedBalance, 25_000_000n, "all of it is theirs");
  assert.equal(run.state().refundedToFunder, 0n);
  assert.deepEqual(lines, [{ giftId: "1000000", step: "read", result: "reached at 1503", hash: "0xabc" }]);
});

test("short of the target nothing moves, on either pass", async () => {
  const notYet: MilestoneOutcome = { kind: "notYet", giftId: "1000000", rating: 1466, target: 1500, attested: false };
  for (const settle of [false, true]) {
    const run = world(CLIMBING, notYet, STARTED + 5 * 86_400);
    const lines = await milestonePass(settle, run.deps);
    assert.deepEqual(run.calls, ["reach:1000000"]);
    assert.equal(lines[0].result, "not yet: 1466 of 1500");
  }
});

test("once the deadline and the grace have passed, the settling pass sends the whole amount back", async () => {
  const unused: MilestoneOutcome = { kind: "already", giftId: "1000000", reason: "deadline_passed" };
  // Past the deadline but inside the grace: a reading taken in time could still arrive, so nothing is closed.
  let run = world(CLIMBING, unused, DEADLINE + MILESTONE_PROOF_GRACE_SECONDS);
  await milestonePass(true, run.deps);
  assert.deepEqual(run.calls, [], "no reading after the deadline, and no expiry inside the grace");

  run = world(CLIMBING, unused, DEADLINE + MILESTONE_PROOF_GRACE_SECONDS + 1);
  const lines = await milestonePass(true, run.deps);
  assert.deepEqual(run.calls, ["expire:1000000", "refund:1000000"]);
  assert.equal(run.state().refundedToFunder, 25_000_000n, "all of it went back");
  assert.deepEqual(
    lines.map((line) => `${line.step}:${line.result}`),
    ["expire:sent", "refund:sent"],
  );

  // The counting pass never sends money back.
  run = world(CLIMBING, unused, DEADLINE + MILESTONE_PROOF_GRACE_SECONDS + 1);
  await milestonePass(false, run.deps);
  assert.deepEqual(run.calls, []);
});

test("a reading that fails on our side is reported and holds the gift, and the next gift is still read", async () => {
  const unavailable: MilestoneOutcome = { kind: "refused", giftId: "1000000", code: "FETCH_FAILED", message: "Chess.com could not be read just now." };
  const run = world(CLIMBING, unavailable, STARTED + 5 * 86_400);
  const other = { ...CLIMBING, giftId: "1000001" };
  let readOther = false;
  run.deps.gifts = async () => [
    { giftId: "1000000", escrow: CONTRACT },
    { giftId: "1000001", escrow: CONTRACT },
  ];
  const read = run.deps.read;
  run.deps.read = async (contract, giftId) => {
    if (giftId === "1000001") {
      readOther = true;
      throw new Error("the node did not answer");
    }
    return read(contract, giftId);
  };
  const lines = await milestonePass(true, run.deps);
  assert.ok(readOther, "the second gift was tried");
  assert.deepEqual(run.calls, ["reach:1000000"], "nothing expired or refunded against a reading that never happened");
  assert.deepEqual(
    lines.map((line) => `${line.giftId} ${line.step}: ${line.result}`),
    ["1000000 read: refused: FETCH_FAILED", "1000000 expire: held: today's reading failed on our side", "1000001 read: failed: the node did not answer"],
  );
  assert.equal(other.giftId, "1000001");
});

test("a gift nobody opened, or opened and never started, comes back after fourteen days and the grace", () => {
  const unopened = { ...CLIMBING, recipient: null, identityHash: ZERO, deadline: 0 };
  const unstarted = { ...CLIMBING, identityHash: ZERO, deadline: 0 };
  assert.equal(milestonePhase(unopened, FUNDED), "unopened");
  assert.equal(milestonePhase(unstarted, FUNDED), "opened");
  const wait = MILESTONE_DORMANT_SECONDS + MILESTONE_PROOF_GRACE_SECONDS;
  assert.equal(canExpire(unopened, FUNDED + wait - 1), false);
  assert.equal(canExpire(unopened, FUNDED + wait), true);
  // Measured from the opening, not the funding, so opening late never leaves the recipient no time at all.
  assert.equal(canExpire(unstarted, FUNDED + wait), false);
  assert.equal(canExpire(unstarted, FUNDED + 60 + wait), true);
});

test("the phases say what the contract would do", () => {
  assert.equal(milestonePhase(CLIMBING, DEADLINE), "climbing", "a reading taken at the deadline still counts");
  assert.equal(milestonePhase(CLIMBING, DEADLINE + 1), "overdue");
  assert.equal(milestonePhase({ ...CLIMBING, startingValue: 1431n }, STARTED), "startTooHigh", "1430 or under, and 1431 is not");
  assert.equal(milestonePhase({ ...CLIMBING, startingValue: 1430n }, STARTED), "climbing");
  assert.equal(milestonePhase({ ...CLIMBING, settled: true, earned: 25_000_000n }, STARTED), "reached");
  const returned: MilestoneState = { ...CLIMBING, settled: true, refundable: 25_000_000n };
  assert.equal(milestonePhase(returned, STARTED), "returned");
  assert.equal(milestonePhase({ ...CLIMBING, cancelled: true }, STARTED), "cancelled");
  assert.equal(canExpire({ ...CLIMBING, settled: true }, DEADLINE + 10 * 86_400), false, "a settled gift is never closed twice");
});

test("the keeper takes nothing back while readings are paused, and counts a window a pause ran across from its end", () => {
  const after = DEADLINE + MILESTONE_PROOF_GRACE_SECONDS + 1;
  assert.equal(canExpire({ ...CLIMBING, proofPaused: true }, after + 30 * 86_400), false, "never during a pause");
  // The fourth review's case: a pause from two hours before the deadline to seven after.
  const resumed = DEADLINE + 7 * 3_600;
  assert.equal(canExpire({ ...CLIMBING, proofResumedAt: resumed }, after), false);
  assert.equal(canExpire({ ...CLIMBING, proofResumedAt: resumed }, resumed + MILESTONE_PROOF_GRACE_SECONDS), false);
  assert.equal(canExpire({ ...CLIMBING, proofResumedAt: resumed }, resumed + MILESTONE_PROOF_GRACE_SECONDS + 1), true);
  // A pause that ended before the deadline changes nothing.
  assert.equal(canExpire({ ...CLIMBING, proofResumedAt: DEADLINE - 3 * 3_600 }, after), true);
  // The wait for a first reading, the same way.
  const unstarted = { ...CLIMBING, identityHash: ZERO, deadline: 0, proofResumedAt: FUNDED + 60 + 15 * 86_400 } as MilestoneState;
  assert.equal(canExpire(unstarted, FUNDED + 60 + MILESTONE_DORMANT_SECONDS + MILESTONE_PROOF_GRACE_SECONDS), false);
  assert.equal(canExpire(unstarted, FUNDED + 60 + 15 * 86_400 + MILESTONE_PROOF_GRACE_SECONDS), true);
});

test("the delays mirrored here are the contract's own", () => {
  const contract = readFileSync("contracts/MilestoneGift.sol", "utf8");
  assert.match(contract, /DORMANT_REFUND_DELAY = 14 days;/);
  assert.match(contract, /PROOF_GRACE = 6 hours;/);
  assert.match(contract, /return moment > proofResumedAt \? moment : proofResumedAt;/, "the contract counts from the end of a pause as canExpire does");
  assert.match(contract, /if \(block\.timestamp <= _afterPauses\(g\.deadline\) \+ PROOF_GRACE\) revert TooEarly\(\);/);
  assert.match(contract, /if \(block\.timestamp < _afterPauses\(uint256\(g\.claimedAt\) \+ DORMANT_REFUND_DELAY\) \+ PROOF_GRACE\)/);
  assert.equal(MILESTONE_DORMANT_SECONDS, 14 * 86_400);
  assert.equal(MILESTONE_PROOF_GRACE_SECONDS, 6 * 3_600);
});

test("the daily pass leaves milestone gifts to their own pass, on both schedules", async () => {
  const seen: string[] = [];
  const settles: boolean[] = [];
  const deps: DailyPassDeps = {
    boundGifts: async () => [{ giftId: "7" }, { giftId: "1000000" }],
    allGifts: async () => [
      { giftId: "7", escrow: CONTRACT },
      { giftId: "1000000", escrow: CONTRACT },
    ],
    read: async (_escrow, giftId) => {
      seen.push(`read:${giftId}`);
      return { cancelled: false, finalised: true, startDay: 1, recipient: null, fundedAt: FUNDED, claimedAt: 0 };
    },
    count: async (giftId) => {
      seen.push(`count:${giftId}`);
      return { kind: "already", giftId, reason: "counted_today" };
    },
    drain: async () => ({ hash: "0xd" }),
    finalise: async () => ({ hash: "0xf" }),
    refund: async () => ({ hash: "0xr" }),
    start: async () => ({ address: "0xrelayer", balance: 12n }),
    milestones: async (settle) => {
      settles.push(settle);
      return [{ giftId: "1000000", step: "read", result: "not yet: 1466 of 1500" }];
    },
  };
  const counting = await dailyPass(COUNTING_PASS, deps);
  await dailyPass(SETTLING_PASS, deps);
  assert.deepEqual(seen, ["count:7", "read:7", "read:7"], "the daily contract is never asked about a milestone gift");
  assert.deepEqual(settles, [false, true]);
  assert.ok(counting.lines.some((line) => line.giftId === "1000000" && line.step === "read"));
});
