import { ZERO_SUBJECT } from "../src/milestone-protocol";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Hex } from "viem";
import { chessProviderId } from "../src/chess-com";
import { ChessReadError, nameHasChessCode, newChessCode, CHESS_CODE_ALPHABET, CHESS_CODE_LENGTH, type AttestedChessReading } from "../src/chess-reading";
import type { GiftRecord } from "../src/gift-store";
import type { MilestoneState } from "../src/milestone-reader";
import { MILESTONE_OURS_TO_FIX, runMilestoneReading, type MilestoneReadingDeps } from "../src/milestone-reading";
import type { MilestoneProofMessage } from "../src/milestone-protocol";
import { milestoneStatusOf } from "../src/milestone-status";
import type { MilestoneReading } from "../src/milestone-store";
import { CHESS_MILESTONE } from "../src/milestone-conditions";
import { RelayerError } from "../src/relayer";

const NOW = 1_789_650_000;
const CONTRACT = "0x00000000000000000000000000000000000000c2" as const;
const ZERO = `0x${"0".repeat(64)}` as const;
const IDENTITY = `0x${"1d".repeat(32)}` as const;

const RECORD: GiftRecord = {
  giftId: "1000000",
  funder: "0x000000000000000000000000000000000000a11c",
  contactHash: `0x${"51".repeat(32)}`,
  goalType: 1,
  dailyTarget: 0,
  durationDays: 30,
  amount: 25_000_000n,
  recipient: "0x000000000000000000000000000000000000b0b0",
  createdTx: `0x${"aa".repeat(32)}`,
  claimedTx: `0x${"bb".repeat(32)}`,
  escrow: CONTRACT,
  goalUsername: "erik",
  goalCourse: null,
  goalCourseTitle: null,
  usernameSource: "funder",
  bindingCode: "KXQPRT",
  bindingCodeExpiresAt: new Date((NOW + 1_800) * 1_000),
  boundAt: null,
  goalProfileId: null,
  recipientName: "Erik",
  funderName: "Sam",
  claimTokenHash: "00",
};

const OPENED: MilestoneState = {
  giftId: "1000000",
  funder: "0x000000000000000000000000000000000000A11C",
  refundTo: "0x000000000000000000000000000000000000A11C",
  recipient: "0x000000000000000000000000000000000000B0B0",
  recipientContactHash: `0x${"51".repeat(32)}`,
  goalType: 1,
  shape: 0,
  target: 1954n,
  subject: ZERO_SUBJECT,
  maximumStart: 1914n,
  durationDays: 30,
  amount: 25_000_000n,
  earned: 0n,
  withdrawnByRecipient: 0n,
  refundable: 0n,
  refundedToFunder: 0n,
  identityHash: ZERO,
  startingValue: 0n,
  lastProofAt: 0,
  deadline: 0,
  fundedAt: NOW - 86_400,
  claimedAt: NOW - 3_600,
  cancelled: false,
  settled: false,
  earnedBalance: 0n,
  withdrawNonce: 0n,
  proofPaused: false,
  proofResumedAt: 1_700_000_000,
};

const CLIMBING: MilestoneState = { ...OPENED, identityHash: IDENTITY, startingValue: 1904n, lastProofAt: NOW - 86_400, deadline: NOW + 29 * 86_400 };
/** The other half of D27: a gift whose recipient named their own account, which is the only case a code is for. */
const THEIR_OWN: GiftRecord = { ...RECORD, usernameSource: "recipient" };

const BOUND: GiftRecord = { ...RECORD, boundAt: new Date((NOW - 86_400) * 1_000), goalProfileId: "41", bindingCode: null, bindingCodeExpiresAt: null };

function attested(rating: number, extra: Partial<AttestedChessReading> = {}): AttestedChessReading {
  return {
    username: "erik",
    playerId: "41",
    status: "staff",
    name: null,
    mode: "rapid",
    rating,
    ratedAt: NOW - 7_200,
    rd: 42,
    observedAt: NOW - 5,
    nullifier: `0x${"ee".repeat(32)}`,
    proofs: [],
    ...extra,
  };
}

function harness(record: GiftRecord, state: MilestoneState, overrides: Partial<MilestoneReadingDeps> = {}) {
  const calls: string[] = [];
  const proved: MilestoneProofMessage[] = [];
  const recorded: string[] = [];
  const deps: MilestoneReadingDeps = {
    loadGift: async () => record,
    readState: async () => state,
    plain: async () => {
      calls.push("plain");
      return { username: "erik", playerId: "41", status: "basic", rating: 1904, ratedAt: NOW - 7_200, rd: 42, best: 1950 };
    },
    attest: async (input) => {
      calls.push(`attest:${input.withName ? "withName" : "rating"}`);
      return attested(1904, { name: input.withName ? "Erik KXQPRT" : null });
    },
    identity: () => IDENTITY,
    prove: async (input) => {
      calls.push("prove");
      proved.push(input.message);
      return state.identityHash === ZERO ? { hash: "0x51" as Hex, happened: "started", deadline: NOW + 30 * 86_400 } : { hash: "0x52" as Hex, happened: "reached" };
    },
    markBound: async () => {
      calls.push("bind");
      return true;
    },
    record: async (reading) => {
      recorded.push(`${reading.purpose}:${reading.attested ? "attested" : "plain"}:${reading.outcome}`);
    },
    readRecently: async () => false,
    now: () => NOW,
    ...overrides,
  };
  return { calls, proved, recorded, deps };
}

test("the funder named the account, so the first reading binds it with no code and no name (D27)", async () => {
  // The rule the daily path already followed: a code proves control only where the recipient named the account. The
  // milestone path asked for one in both cases, which made a recipient edit their own profile for nothing, and blocked
  // the rehearsal of 18 Sep. The reading is taken without the name, so a profile that has none works.
  const run = harness(RECORD, OPENED, { attest: async () => attested(1904, { name: null }) });
  const outcome = await runMilestoneReading({ giftId: "1000000", purpose: "start" }, run.deps);
  assert.equal(outcome.kind, "started");
  assert.deepEqual(run.calls, ["prove", "bind"], "read without the name, then proved");

  // A code sitting on that record changes nothing: it is not what binds this gift.
  const withCode = harness({ ...RECORD, bindingCode: "KXQPRT" }, OPENED, { attest: async () => attested(1904, { name: null }) });
  assert.equal((await runMilestoneReading({ giftId: "1000000", purpose: "start" }, withCode.deps)).kind, "started");

  // Even a code that expired an hour ago: nothing here is waiting on it.
  const stale = harness({ ...RECORD, bindingCodeExpiresAt: new Date((NOW - 3_600) * 1_000) }, OPENED, { attest: async () => attested(1904, { name: null }) });
  assert.equal((await runMilestoneReading({ giftId: "1000000", purpose: "start" }, stale.deps)).kind, "started");
});

test("the recipient named their own account, so the code in the name is what binds it, and the start is recorded whatever it says", async () => {
  const run = harness(THEIR_OWN, OPENED);
  const outcome = await runMilestoneReading({ giftId: "1000000", purpose: "start" }, run.deps);
  assert.equal(outcome.kind, "started");
  assert.deepEqual(run.calls, ["attest:withName", "prove", "bind"]);
  const message = run.proved[0];
  assert.equal(message.metricValue, 1904n);
  assert.equal(message.eventAt, 0n, "a climb never carries a granting day");
  assert.equal(message.providerId, chessProviderId("rapid"), "the goal type's cadence, and no other");
  assert.equal(message.identityHash, IDENTITY);
  assert.equal(message.expiresAt - message.issuedAt, 600n);
  assert.deepEqual(run.recorded, ["start:attested:started"]);

  // A start above what the funder accepted is still the start: the screen says so, and the gift comes back at the end.
  const high = harness(THEIR_OWN, OPENED, { attest: async () => attested(1990, { name: "KXQPRT" }) });
  const above = await runMilestoneReading({ giftId: "1000000", purpose: "start" }, high.deps);
  assert.equal(above.kind === "started" && above.aboveAccepted, true);
});

test("an account the recipient named needs its code: without it nothing is sent, and a stale one is refused first", async () => {
  const run = harness(THEIR_OWN, OPENED, { attest: async () => attested(1904, { name: "Erik" }) });
  const outcome = await runMilestoneReading({ giftId: "1000000", purpose: "start" }, run.deps);
  assert.equal(outcome.kind === "refused" && outcome.code, "CODE_NOT_IN_NAME");
  assert.deepEqual(run.proved, []);

  const expired = harness({ ...THEIR_OWN, bindingCodeExpiresAt: new Date((NOW - 1) * 1_000) }, OPENED);
  const late = await runMilestoneReading({ giftId: "1000000", purpose: "start" }, expired.deps);
  assert.equal(late.kind === "refused" && late.code, "CODE_EXPIRED");
  assert.deepEqual(expired.calls, [], "no reading is paid for");

  const noName = harness(THEIR_OWN, OPENED, { attest: async () => Promise.reject(new ChessReadError("NO_NAME", "That profile has no name")) });
  const empty = await runMilestoneReading({ giftId: "1000000", purpose: "start" }, noName.deps);
  assert.equal(empty.kind === "refused" && empty.code, "NO_NAME");
});

test("below the target the keeper only looks, and pays for no proof", async () => {
  const run = harness(BOUND, CLIMBING);
  const outcome = await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, run.deps);
  assert.deepEqual(outcome, { kind: "notYet", giftId: "1000000", rating: 1904, target: 1954, attested: false });
  assert.deepEqual(run.calls, ["plain"]);
  assert.deepEqual(run.recorded, ["look:plain:notYet"]);
});

test("at the target the reading is attested, and the attested reading alone releases the gift", async () => {
  const run = harness(BOUND, CLIMBING, {
    plain: async () => ({ username: "erik", playerId: "41", status: "basic", rating: 1960, ratedAt: NOW - 60, rd: 42, best: 1950 }),
    attest: async () => attested(1960),
  });
  const outcome = await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, run.deps);
  assert.equal(outcome.kind, "reached");
  assert.equal(run.proved[0].metricValue, 1960n);
  assert.deepEqual(run.recorded, ["reach:attested:reached"]);

  // The plain read said yes and the attested one says no: the attested one decides, and nothing is sent.
  const disagree = harness(BOUND, CLIMBING, {
    plain: async () => ({ username: "erik", playerId: "41", status: "basic", rating: 1960, ratedAt: NOW - 60, rd: 42, best: 1950 }),
    attest: async () => attested(1950),
  });
  const short = await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, disagree.deps);
  assert.deepEqual(short, { kind: "notYet", giftId: "1000000", rating: 1950, target: 1954, attested: true });
  assert.deepEqual(disagree.proved, []);
});

test("when the plain read fails, the attested reading is taken anyway, so looking never costs the recipient", async () => {
  const run = harness(BOUND, CLIMBING, {
    plain: async () => Promise.reject(new ChessReadError("FETCH_FAILED", "Chess.com is not answering")),
    attest: async () => attested(1954),
  });
  const outcome = await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, run.deps);
  assert.equal(outcome.kind, "reached", "exactly the target is enough");
});

test("a reading that cannot be taken is a typed refusal the pass can hold on, and nothing is sent", async () => {
  const run = harness(BOUND, CLIMBING, {
    plain: async () => Promise.reject(new ChessReadError("FETCH_FAILED", "Chess.com is not answering")),
    attest: async () => Promise.reject(new ChessReadError("FETCH_FAILED", "Chess.com could not be read right now")),
  });
  const outcome = await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, run.deps);
  assert.equal(outcome.kind === "refused" && outcome.code, "FETCH_FAILED");
  assert.deepEqual(run.proved, []);
});

test("another player under the same name never pays, and a renamed account is said as such", async () => {
  const taken = harness(BOUND, CLIMBING, { plain: async () => ({ username: "erik", playerId: "999", status: "basic", rating: 2400, ratedAt: NOW, rd: 42, best: 1950 }) });
  const outcome = await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, taken.deps);
  assert.equal(outcome.kind === "refused" && outcome.code, "OTHER_PLAYER");
  assert.deepEqual(taken.calls, [], "no proof is paid for and nothing is sent");

  const renamed = harness(BOUND, CLIMBING, { plain: async () => Promise.reject(new ChessReadError("PROFILE_NOT_FOUND", "gone")) });
  const gone = await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, renamed.deps);
  assert.equal(gone.kind === "refused" && gone.code, "PROFILE_NOT_FOUND");
});

test("the contract's refusal is recorded with the reading and said in the milestone's own words", async () => {
  const run = harness(BOUND, CLIMBING, {
    plain: async () => ({ username: "erik", playerId: "41", status: "basic", rating: 1960, ratedAt: NOW, rd: 42, best: 1950 }),
    attest: async () => attested(1960),
    prove: async () => Promise.reject(new RelayerError("REVERTED", "The contract refused: DeadlinePassed", "DeadlinePassed")),
  });
  const outcome = await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, run.deps);
  assert.deepEqual(outcome, { kind: "refused", giftId: "1000000", code: "TIME_IS_UP", message: "The time for this gift is over.", rating: 1960 });
  assert.deepEqual(run.recorded, ["reach:attested:refused:DeadlinePassed"]);
});

test("an account Chess.com has closed is bound to nothing, earns nothing, and is written down for both pages (U1)", async () => {
  const closed = new ChessReadError("ACCOUNT_CLOSED", "Chess.com has closed this account");
  // The first reading: nothing is proved, so the gift is never bound, and the code stays unused.
  const first = harness(RECORD, OPENED, {
    attest: async () => {
      throw closed;
    },
  });
  const start = await runMilestoneReading({ giftId: "1000000", purpose: "start" }, first.deps);
  assert.equal(start.kind === "refused" && start.code, "ACCOUNT_CLOSED");
  assert.equal(start.kind === "refused" && start.message, "Chess.com has closed this account, so this gift can no longer be earned.");
  assert.deepEqual(first.calls, [], "nothing was proved, and nothing bound");
  assert.deepEqual(first.recorded, ["look:plain:refused:ACCOUNT_CLOSED"], "the pages read it from here");

  // A later reading, closed while the plain read looks: no proof is paid for, because the proof would say the same.
  const later = harness(BOUND, CLIMBING, {
    plain: async () => {
      throw closed;
    },
  });
  const reach = await runMilestoneReading({ giftId: "1000000", purpose: "reach", force: true }, later.deps);
  assert.equal(reach.kind === "refused" && reach.code, "ACCOUNT_CLOSED");
  assert.deepEqual(later.calls, [], "no attested reading is paid for");
  assert.deepEqual(later.recorded, ["look:plain:refused:ACCOUNT_CLOSED"]);

  // Closed between the look and the proof: the attested reading refuses it too, and still nothing is sent.
  const between = harness(BOUND, CLIMBING, {
    plain: async () => ({ username: "erik", playerId: "41", status: "basic", rating: 2400, ratedAt: NOW, rd: 42, best: 2400 }),
    attest: async () => {
      throw closed;
    },
  });
  const proved = await runMilestoneReading({ giftId: "1000000", purpose: "reach", force: true }, between.deps);
  assert.equal(proved.kind === "refused" && proved.code, "ACCOUNT_CLOSED");
  assert.deepEqual(between.proved, [], "nothing reached the contract");

  // The refusal is about the account, not about us: the pass does not hold the gift on it, so it comes back at the end.
  assert.equal(MILESTONE_OURS_TO_FIX.has("ACCOUNT_CLOSED"), false);
  assert.equal(MILESTONE_OURS_TO_FIX.has("PROOF_INVALID"), true, "a profile without a status is ours to fix, and holds the gift");
});

test("nothing is read for a gift that cannot move any more, or twice in one pass", async () => {
  for (const [state, reason] of [
    [{ ...CLIMBING, startingValue: 1915n }, "start_too_high"],
    [{ ...CLIMBING, deadline: NOW - 1 }, "deadline_passed"],
    [{ ...CLIMBING, settled: true, earned: 25_000_000n }, "finished"],
  ] as const) {
    const run = harness(BOUND, state);
    const outcome = await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, run.deps);
    assert.deepEqual(outcome, { kind: "already", giftId: "1000000", reason });
    assert.deepEqual(run.calls, []);
  }
  const recent = harness(BOUND, CLIMBING, { readRecently: async () => true });
  assert.deepEqual(await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, recent.deps), { kind: "already", giftId: "1000000", reason: "read_recently" });
  const forced = harness(BOUND, CLIMBING, { readRecently: async () => true });
  assert.equal((await runMilestoneReading({ giftId: "1000000", purpose: "reach", force: true }, forced.deps)).kind, "notYet", "the recipient's own request is always read");
});

test("a closed account is what both pages read, and neither side is offered a gesture the route would refuse (U1)", () => {
  const reading = (outcome: MilestoneReading["outcome"]): MilestoneReading => ({
    giftId: "1000000",
    purpose: "look",
    attested: false,
    username: "erik",
    playerId: null,
    rating: null,
    ratedAt: null,
    rd: null,
    observedAt: NOW,
    nullifier: null,
    outcome,
    txHash: null,
  });
  const viewer = { isRecipient: true, isFunder: false, holdsTheLink: false };
  const build = (last: MilestoneReading | null) =>
    milestoneStatusOf({ record: BOUND, milestone: null, state: CLIMBING, contract: CONTRACT, latest: null, last, reachedAt: null, viewer, nowSeconds: NOW });
  assert.equal(build(reading("refused:ACCOUNT_CLOSED")).accountClosed, true);
  assert.equal(build(reading("notYet")).accountClosed, false, "a reading that went through says the account is open");
  assert.equal(build(null).accountClosed, false, "no reading yet says nothing about the account");

  // One sentence for both sides: it says what Chess.com did, and accuses nobody.
  assert.equal(CHESS_MILESTONE.words.accountClosed, "Chess.com has closed this account, so this gift can no longer be earned.");
  const page = readFileSync("app/components/MilestoneGiftPage.tsx", "utf8");
  assert.match(page, /status\.accountClosed && !status\.finished \? <p className="font-medium">\{milestone\?\.words\.accountClosed\}<\/p> : null/);
  assert.equal(page.match(/&& !status\.accountClosed/g)?.length, 5, "no reading, no code, no proof, no check, and no wait for a connection");
});

test("the Chess.com code is letters only and found whatever surrounds it", () => {
  let byte = 0;
  const code = newChessCode(() => byte++ % 256);
  assert.equal(code.length, CHESS_CODE_LENGTH);
  for (const letter of code) assert.ok(CHESS_CODE_ALPHABET.includes(letter));
  assert.ok(!/[^A-Z]|[IO]/.test(code));
  assert.ok(nameHasChessCode("Erik kxq-prt", "KXQPRT"));
  assert.ok(!nameHasChessCode("Erik", "KXQPRT"));
  assert.ok(!nameHasChessCode(null, "KXQPRT"));
  assert.ok(!nameHasChessCode("anything", ""), "an empty code is never found");
});
