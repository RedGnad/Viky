import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseEther } from "viem";
import { COUNTING_PASS, dailyPass, passStopped, SETTLING_PASS, undoneAlert, type DailyPassDeps, type DailyPassLine } from "../src/daily-pass";
import type { GiftState } from "../src/gift-reader";
import { milestonePass, type MilestonePassDeps } from "../src/milestone-pass";
import type { MilestoneState } from "../src/milestone-reader";
import { RelayerError } from "../src/relayer";

/**
 * What the settling pass could not do is told (the final audit of 9 Oct 2026, A3).
 *
 * The pass of 07:00 UTC is what makes "what is not earned goes back by itself" true. A step the contract refused, or
 * that failed, was one line of the scheduled task's answer and nothing else: no log, no row, no email. Money a pass
 * could not send back stayed in the contract with nobody told. Each such step is now a line in the logs and one of
 * the lines of a single email when the pass ends; a pass that stops is told by the route that ran it.
 */
type Alert = { subject: string; text: string };
const ESCROW = "0x00000000000000000000000000000000000000d3" as const;
const NOW = 1_791_000_000;
const DAY = Math.floor(NOW / 86_400);
const refused = (reason: string) => new RelayerError("REVERTED", "the contract refused", reason);

/** A daily gift, as the chain holds it, running since three days. */
const running = (over: Partial<GiftState> = {}): GiftState =>
  ({
    giftId: "7",
    cancelled: false,
    finalised: false,
    startDay: DAY - 3,
    endDay: DAY + 3,
    settledThroughDay: DAY - 2,
    recipient: "0x000000000000000000000000000000000000b0b0",
    fundedAt: NOW - 5 * 86_400,
    claimedAt: NOW - 4 * 86_400,
    refundable: 0n,
    refundedToFunder: 0n,
    ...over,
  }) as GiftState;

function passDeps(gifts: Record<string, GiftState>, sent: Alert[], over: Partial<DailyPassDeps> = {}): DailyPassDeps {
  return {
    boundGifts: async () => [],
    allGifts: async () => Object.keys(gifts).map((giftId) => ({ giftId, escrow: ESCROW })) as never,
    read: async (_escrow, giftId) => gifts[giftId],
    count: async (giftId) => ({ kind: "already", giftId, reason: "counted_today" }),
    // An ordinary morning: no missed day, a gift that is not over, nothing freed.
    drain: async () => Promise.reject(refused("NothingToDrain")),
    finalise: async () => Promise.reject(refused("FinalisationTooEarly")),
    refund: async () => Promise.reject(refused("NothingToRefund")),
    start: async () => ({ address: "0xrelayer", balance: parseEther("40") }),
    paused: async () => false,
    nowSeconds: () => NOW,
    tell: async (alert) => void sent.push(alert),
    ...over,
  };
}

const undone = (lines: readonly DailyPassLine[]) => lines.filter((line) => line.undone).map((line) => `${line.giftId} ${line.step}: ${line.result}`);

test("an ordinary morning sends nothing: the three refusals of a gift that is running are what the contract answers", async () => {
  const sent: Alert[] = [];
  const report = await dailyPass(SETTLING_PASS, passDeps({ "7": running(), "8": running({ giftId: "8" }) }, sent));
  assert.deepEqual(report.lines.map((line) => `${line.step}: ${line.result}`).slice(0, 3), ["drain: refused: NothingToDrain", "finalise: refused: FinalisationTooEarly", "refund: refused: NothingToRefund"]);
  assert.deepEqual(undone(report.lines), []);
  assert.deepEqual(sent, []);
  assert.equal(undoneAlert("settling", report.lines, NOW), null);
  // The counting pass asks the same two steps of a running gift, and is as quiet.
  const counting = await dailyPass(COUNTING_PASS, passDeps({ "7": running() }, sent));
  assert.deepEqual(undone(counting.lines), []);
  assert.deepEqual(sent, []);
});

test("a refund refused on a gift read as owed is told, in one email for the whole pass", async () => {
  const sent: Alert[] = [];
  const logged: string[] = [];
  const realError = console.error;
  console.error = (...parts: unknown[]) => void logged.push(parts.join(" "));
  try {
    const gifts = {
      // Over, and its last refund never left: the contract still owes its funder.
      "4": running({ giftId: "4", finalised: true, refundable: 2_857_148n, refundedToFunder: 0n }),
      // Running, an ordinary morning.
      "7": running(),
      // Running, and a step failed for a reason that is not the contract's.
      "9": running({ giftId: "9" }),
    };
    const report = await dailyPass(
      SETTLING_PASS,
      passDeps(gifts, sent, {
        refund: async (giftId) => Promise.reject(refused(giftId === "4" ? "NothingToRefund" : "NothingToRefund")),
        drain: async (giftId) => (giftId === "9" ? Promise.reject(Object.assign(new Error("the wait for finality ran out"), { code: "FINALITY_TIMEOUT" })) : Promise.reject(refused("NothingToDrain"))),
        finalise: async (giftId) => (giftId === "9" ? Promise.reject(refused("GiftNotFound")) : Promise.reject(refused("FinalisationTooEarly"))),
      }),
    );
    // The same refusal is ordinary where nothing is known to be owed, and a step undone where the gift was read as owed.
    assert.deepEqual(undone(report.lines), ["4 refund: refused: NothingToRefund", "9 drain: failed: FINALITY_TIMEOUT", "9 finalise: refused: GiftNotFound"]);
    assert.equal(sent.length, 1, "one email for the pass, not one for each step");
    assert.equal(sent[0].subject, "The settling pass left 3 steps undone");
    assert.deepEqual(sent[0].text.split("\n").slice(1, 4), ["- gift 4, refund: refused: NothingToRefund", "- gift 9, drain: failed: FINALITY_TIMEOUT", "- gift 9, finalise: refused: GiftNotFound"]);
    assert.match(sent[0].text, /^The settling pass of \d{4}-\d{2}-\d{2}T[\d:.]+Z left these steps undone:/);
    // And each is a line in the logs, where nothing was written before.
    assert.deepEqual(logged.filter((line) => line.startsWith("settling pass, undone:")), ["settling pass, undone: gift 4, refund: refused: NothingToRefund", "settling pass, undone: gift 9, drain: failed: FINALITY_TIMEOUT", "settling pass, undone: gift 9, finalise: refused: GiftNotFound"]);
    // One step alone is said in the singular.
    assert.equal(undoneAlert("settling", [{ giftId: "4", step: "refund", result: "refused: NothingToRefund", undone: true }], NOW)?.subject, "The settling pass left 1 step undone");
  } finally {
    console.error = realError;
  }
});

test("a gift the chain could not be read for, and a creation that waits for an operator, are told too", async () => {
  const sent: Alert[] = [];
  const realError = console.error;
  console.error = () => undefined;
  try {
    const report = await dailyPass(
      SETTLING_PASS,
      passDeps({ "7": running() }, sent, {
        read: async () => Promise.reject(Object.assign(new Error("the endpoint did not answer"), { code: "RPC_UNAVAILABLE" })),
        completeCreations: async () => [
          { nonce: `0x${"ab".repeat(32)}`, giftId: null, result: "needs an operator: the money moved and no transaction is recorded" },
          { nonce: `0x${"cd".repeat(32)}`, giftId: "12", result: "completed" },
        ] as never,
      }),
    );
    assert.deepEqual(undone(report.lines), ["creation 0xabababab create: needs an operator: the money moved and no transaction is recorded", "7 read: failed: RPC_UNAVAILABLE"]);
    assert.equal(sent[0]?.subject, "The settling pass left 2 steps undone");
    // An email that does not leave never fails the pass.
    const quiet = await dailyPass(SETTLING_PASS, passDeps({ "4": running({ giftId: "4", finalised: true, refundable: 5n }) }, sent, { tell: async () => Promise.reject(new Error("the sender refused")) }));
    assert.deepEqual(undone(quiet.lines), ["4 refund: refused: NothingToRefund"]);
  } finally {
    console.error = realError;
  }
});

/** A gift had or not, past the time the contract takes a proof for it: the pass is to expire it and send it back. */
const OVERDUE = { giftId: "1000007", shape: 1, recipient: null, settled: false, cancelled: false, refundable: 0n, refundedToFunder: 0n, amount: 3_110_000n, deadline: NOW - 30 * 86_400, fundedAt: NOW - 60 * 86_400, claimedAt: 0, startingValue: 0n, lastProofAt: 0, proofPaused: false, proofResumedAt: 0, proofPauseBegan: 0, version: 2, endedAt: 0 } as unknown as MilestoneState;

function milestoneDeps(over: Partial<MilestonePassDeps>): MilestonePassDeps {
  return {
    gifts: async () => [{ giftId: "1000007", escrow: "0x00000000000000000000000000000000000000c2" }],
    read: async () => OVERDUE,
    reach: async (giftId) => ({ kind: "refused", giftId, code: "NOT_YET" }) as never,
    expire: async () => ({ hash: "0xe" }),
    refund: async () => ({ hash: "0xr" }),
    now: () => NOW,
    tell: async () => undefined,
    ...over,
  };
}

test("an expire that failed is named as an expire, and the pass that carries it tells it", async () => {
  // It used to be written "read: failed", the step of a gift that could not be read.
  const failed = await milestonePass(true, milestoneDeps({ expire: async () => Promise.reject(new Error("the wait for finality ran out")) }));
  assert.deepEqual(failed.map((line) => `${line.step}: ${line.result}`), ["expire: failed: the wait for finality ran out"]);
  const refusedLine = await milestonePass(true, milestoneDeps({ expire: async () => Promise.reject(refused("TooEarly")) }));
  assert.deepEqual(refusedLine.map((line) => `${line.step}: ${line.result}`), ["expire: refused: TooEarly"]);
  // A gift that cannot be read at all is still "read".
  const unread = await milestonePass(true, milestoneDeps({ read: async () => Promise.reject(new Error("no answer")) }));
  assert.deepEqual(unread.map((line) => `${line.step}: ${line.result}`), ["read: failed: no answer"]);

  const sent: Alert[] = [];
  const realError = console.error;
  console.error = () => undefined;
  try {
    const report = await dailyPass(
      SETTLING_PASS,
      passDeps({}, sent, {
        milestones: async () => [
          ...failed,
          { giftId: "1000008", step: "refund", result: "refused: NothingToRefund" },
          // A reading the source refused, a proof held for review, a step that left: none of them is a step undone.
          { giftId: "1000009", step: "read", result: "refused: NOT_YET" },
          { giftId: "1000010", step: "review", result: "held: a first proof waits for review, the contract can pay it for 3 more days" },
          { giftId: "1000011", step: "expire", result: "sent", hash: "0xe" },
        ],
      }),
    );
    assert.deepEqual(undone(report.lines), ["1000007 expire: failed: the wait for finality ran out", "1000008 refund: refused: NothingToRefund"]);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].subject, "The settling pass left 2 steps undone");
  } finally {
    console.error = realError;
  }
});

test("a pass that throws is told by the route that ran it, and its answer is still an error", async () => {
  const sent: Alert[] = [];
  const logged: string[] = [];
  const realError = console.error;
  console.error = (...parts: unknown[]) => void logged.push(parts.join(" "));
  try {
    await passStopped("settling", new Error("The relayer holds 9 MON, below the 10 MON reserve plus margin"), async (alert) => void sent.push(alert));
    assert.equal(sent[0].subject, "The settling pass stopped");
    assert.match(sent[0].text, /stopped before its end: The relayer holds 9 MON, below the 10 MON reserve plus margin\nWhat it did before that stands\./);
    assert.deepEqual(logged, ["the settling pass stopped: The relayer holds 9 MON, below the 10 MON reserve plus margin"]);
    // An email that does not leave is a second line in the logs, never a throw.
    await passStopped("recount", "no journal", async () => Promise.reject(new Error("the sender refused")));
    assert.deepEqual(logged.slice(1), ["the recount pass stopped: no journal", "the recount pass could not say that it stopped: the sender refused"]);
  } finally {
    console.error = realError;
  }
  for (const [route, pass] of [["settle", "settling"], ["daily", "counting"], ["recount", "recount"]] as const) {
    const source = readFileSync(`app/api/cron/${route}/route.ts`, "utf8");
    assert.match(source, new RegExp(`\\} catch \\(error\\) \\{\\n[^\\n]*\\n    await passStopped\\("${pass}", error\\);\\n    return NextResponse\\.json\\(\\{ error: `), route);
    assert.match(source, /\{ status: 500, headers: NO_STORE \}/);
  }
});
