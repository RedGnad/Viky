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
import { StartNotSigned } from "../src/v2-start";

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
  proofPauseBegan: 0,
  version: 1,
  openingKey: null,
  endedAt: 0,
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

test("on the second version the start is read, held and not sent: it waits for the recipient's own signature (the review of 2 Oct 2026, R-15)", async () => {
  const held: Array<{ account: string; message: Record<string, string | number>; after: { bindTo?: string; reading?: Record<string, unknown>; maximumStart?: string } }> = [];
  const run = harness(RECORD, OPENED, {
    attest: async () => attested(1904, { name: null }),
    // What the relay answers for a climb with no start and no signature of the recipient (src/milestone-relay.ts).
    prove: async (input) => {
      run.calls.push("prove");
      throw new StartNotSigned("milestone", CONTRACT, { giftId: input.message.giftId, identityHash: input.message.identityHash, metricValue: input.message.metricValue, observedAt: input.message.observedAt });
    },
    hold: async (error, kept) => {
      held.push(kept);
      return { kind: "sign", giftId: error.start.giftId.toString(), start: { of: error.kind, contract: error.contract, identityHash: error.start.identityHash, metricValue: error.start.metricValue.toString(), observedAt: error.start.observedAt.toString() } };
    },
  });
  const outcome = await runMilestoneReading({ giftId: "1000000", purpose: "start" }, run.deps);
  assert.deepEqual(outcome, { kind: "sign", giftId: "1000000", start: { of: "milestone", contract: CONTRACT, identityHash: IDENTITY, metricValue: "1904", observedAt: String(NOW - 5) } });
  // Read once and asked for: nothing is bound and nothing is written in the journal until the contract has taken it.
  assert.deepEqual(run.calls, ["prove"]);
  assert.deepEqual(run.recorded, []);
  assert.equal(held.length, 1);
  assert.equal(held[0].account, RECORD.recipient);
  // What is held is the reading itself, every number as text, with what its path writes once it is sent.
  assert.equal(held[0].message.metricValue, "1904");
  assert.equal(held[0].message.observedAt, String(NOW - 5));
  assert.equal(held[0].message.nullifier, `0x${"ee".repeat(32)}`);
  assert.equal(held[0].after.bindTo, "41");
  assert.equal(held[0].after.maximumStart, OPENED.maximumStart.toString());
  assert.deepEqual({ purpose: held[0].after.reading?.purpose, rating: held[0].after.reading?.rating, attested: held[0].after.reading?.attested }, { purpose: "start", rating: 1904, attested: true });
});

/**
 * The review of 2 Oct 2026, R-14. A pause from two days before a climb's deadline; the person reaches the target the
 * day before the deadline and it cannot be proved, readings are paused. When they reopened, the server answered that
 * the deadline had passed, and six hours later the whole gift went back to its funder.
 */
test("a reading a pause kept from being sent is kept, paid for once, and sent when readings reopen", async () => {
  const deadline = NOW - 86_400;
  const journal: MilestoneReading[] = [];
  const keeps = (run: ReturnType<typeof harness>): Partial<MilestoneReadingDeps> => ({
    attested: async () => journal.filter((reading) => reading.attested),
    last: async () => journal.at(-1) ?? null,
    record: async (reading) => {
      journal.push(reading);
      run.recorded.push(`${reading.purpose}:${reading.attested ? "attested" : "plain"}:${reading.outcome}`);
    },
  });
  const atTarget = { plain: async () => ({ username: "erik", playerId: "41", status: "basic", rating: 1960, ratedAt: NOW - 7_200, rd: 42, best: 1960 }), attest: async () => attested(1960, { observedAt: NOW - 3_600 }) };

  // While the pause runs: its deadline fell inside it, so the gift is still read. The target is reached, the contract
  // refuses the proof, and the reading is written down.
  const paused: MilestoneState = { ...CLIMBING, version: 2, deadline, proofPaused: true, proofPauseBegan: deadline - 86_400, proofResumedAt: NOW + 4 * 86_400 };
  let run = harness(BOUND, paused);
  Object.assign(run.deps, keeps(run), atTarget, {
    prove: async () => {
      run.calls.push("prove");
      throw new RelayerError("REVERTED", "The contract refused: ProofIsPaused", "ProofIsPaused");
    },
  });
  let outcome = await runMilestoneReading({ giftId: "1000000", purpose: "reach", force: true }, run.deps);
  assert.equal(outcome.kind === "refused" && outcome.code, "PAUSED");
  assert.deepEqual(run.calls, ["prove"]);
  assert.deepEqual(run.recorded, ["reach:attested:refused:ProofIsPaused"]);

  // The next pass, five minutes later, still paused: that reading is enough. No proof is paid for again.
  run = harness(BOUND, paused);
  Object.assign(run.deps, keeps(run), { plain: async () => assert.fail("no look"), attest: async () => assert.fail("no second proof while the first is kept") });
  outcome = await runMilestoneReading({ giftId: "1000000", purpose: "reach", force: true }, run.deps);
  assert.deepEqual(outcome, { kind: "refused", giftId: "1000000", code: "PAUSED", message: "Readings are paused for a moment. Try again later.", rating: 1960 });
  assert.deepEqual(run.calls, []);

  // Readings reopen. The deadline is behind, so nothing read now can count; the reading that was kept is signed again
  // and sent as it was read: its value, its moment, its nullifier.
  const reopened: MilestoneState = { ...paused, proofPaused: false, proofResumedAt: NOW - 600 };
  run = harness(BOUND, reopened);
  Object.assign(run.deps, keeps(run), { plain: async () => assert.fail("no look past the deadline"), attest: async () => assert.fail("no new proof past the deadline") });
  outcome = await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, run.deps);
  assert.deepEqual(outcome, { kind: "reached", giftId: "1000000", rating: 1960, hash: "0x52" });
  assert.equal(run.proved.length, 1);
  assert.deepEqual(
    { metricValue: run.proved[0].metricValue, observedAt: run.proved[0].observedAt, nullifier: run.proved[0].nullifier, issuedAt: run.proved[0].issuedAt },
    { metricValue: 1960n, observedAt: BigInt(NOW - 3_600), nullifier: `0x${"ee".repeat(32)}`, issuedAt: BigInt(NOW) },
  );
  assert.deepEqual(run.recorded, ["reach:attested:reached"]);
});

test("only a reading the contract would still take is sent again: taken by the moment it judges by, newer than its last, of the gift's own player", async () => {
  const deadline = NOW - 86_400;
  const kept = (extra: Partial<MilestoneReading>): MilestoneReading => ({ giftId: "1000000", purpose: "reach", attested: true, username: "erik", playerId: "41", rating: 1960, ratedAt: NOW - 7_200, rd: 42, observedAt: NOW - 3_600, nullifier: `0x${"ee".repeat(32)}`, outcome: "refused:ProofIsPaused", txHash: null, ...extra });
  const second: MilestoneState = { ...CLIMBING, version: 2, deadline, proofPaused: false, proofPauseBegan: deadline - 86_400, proofResumedAt: NOW - 600 };
  const sent = async (state: MilestoneState, readings: MilestoneReading[], more: Partial<MilestoneReadingDeps> = {}) => {
    const run = harness(BOUND, state, { attested: async () => readings, plain: async () => assert.fail("no look"), attest: async () => assert.fail("no proof"), ...more });
    return { outcome: await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, run.deps), run };
  };
  const passed = { kind: "already", giftId: "1000000", reason: "deadline_passed" };
  // Nothing kept: the deadline has passed, as before.
  assert.deepEqual((await sent(second, [])).outcome, passed);
  // Taken after the pause ended: past the moment the contract judges a reading by.
  assert.deepEqual((await sent(second, [kept({ observedAt: NOW - 300 })])).outcome, passed);
  // Short of the target, refused for another reason, of another player, older than the contract's last reading: none is sent.
  assert.deepEqual((await sent(second, [kept({ rating: 1950 })])).outcome, passed);
  assert.deepEqual((await sent(second, [kept({ outcome: "refused:NotThereYet" })])).outcome, passed);
  assert.deepEqual((await sent(second, [kept({ playerId: "42" })])).outcome, passed);
  assert.deepEqual((await sent(second, [kept({ observedAt: second.lastProofAt })])).outcome, passed);
  // A stop signed since holds it back, and still paused nothing is sent.
  assert.deepEqual((await sent(second, [kept({})], { leave: async () => ({ allowed: false, reason: "stopped" }) })).outcome, passed);
  // The newest that qualifies is the one sent.
  const two = await sent(second, [kept({ observedAt: NOW - 7_200, nullifier: `0x${"aa".repeat(32)}`, rating: 1955 }), kept({})]);
  assert.equal(two.outcome.kind, "reached");
  assert.equal(two.run.proved[0].nullifier, `0x${"ee".repeat(32)}`);

  // On the first version the deadline never moves: only a reading taken before it is sent, as the contract takes it.
  const first: MilestoneState = { ...CLIMBING, version: 1, deadline, lastProofAt: deadline - 3_600, proofPaused: false, proofPauseBegan: 0, proofResumedAt: NOW - 600 };
  assert.deepEqual((await sent(first, [kept({ observedAt: deadline + 60 })])).outcome, passed);
  assert.equal((await sent(first, [kept({ observedAt: deadline - 60 })])).outcome.kind, "reached");
  // What the contract then refuses, because the grace has run out, is said and written as any refusal is.
  const late = await sent(first, [kept({ observedAt: deadline - 60 })], {
    prove: async () => {
      throw new RelayerError("REVERTED", "The contract refused: DeadlinePassed", "DeadlinePassed");
    },
  });
  assert.deepEqual(late.outcome, { kind: "refused", giftId: "1000000", code: "TIME_IS_UP", message: "The time for this gift is over.", rating: 1960 });
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

});

test("a first reading above the most the funder accepted records no start, and says why to both", async () => {
  // The audit, 29 Sep 2026: a start above the cap could never settle, so it is not sent, and the gift stays unstarted.
  const high = harness(THEIR_OWN, OPENED, { attest: async () => attested(1990, { name: "KXQPRT" }) });
  const above = await runMilestoneReading({ giftId: "1000000", purpose: "start" }, high.deps);
  assert.equal(above.kind === "refused" && above.code, "START_TOO_HIGH");
  assert.equal(above.kind === "refused" && above.message, "You are at 1990, above the 1914 this gift may start from. Nothing was recorded and it has not started. It starts with a reading at 1914 or below.");
  assert.deepEqual(high.proved, [], "nothing is sent to the contract");
  assert.deepEqual(high.calls, [], "nothing is proved and nothing is bound");
  assert.deepEqual(high.recorded, ["look:plain:refused:START_TOO_HIGH"], "written down unsent, so both pages can say it");

  // At the cap exactly, it starts.
  const atCap = harness(THEIR_OWN, OPENED, { attest: async () => attested(1914, { name: "KXQPRT" }) });
  assert.equal((await runMilestoneReading({ giftId: "1000000", purpose: "start" }, atCap.deps)).kind, "started");
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

test("the pass that runs every five minutes pays for no proof when the look itself fails, except in a gift's last day (the audit of 1 Oct 2026)", async () => {
  // Two attested fetches per gift every five minutes, for as long as the source falters, used up the month's
  // allowance; after it nothing attested could be read for anybody.
  const failing = { plain: async () => Promise.reject(new ChessReadError("FETCH_FAILED", "Chess.com answered 429")), attest: async () => attested(1960) };
  let run = harness(BOUND, CLIMBING, failing);
  let outcome = await runMilestoneReading({ giftId: "1000000", purpose: "reach", lookMustSucceed: true }, run.deps);
  assert.equal(outcome.kind === "refused" && outcome.code, "FETCH_FAILED");
  assert.deepEqual(run.proved, [], "no proof was taken");
  assert.deepEqual(run.recorded, [], "and nothing is written: the pass comes back in five minutes");

  // A reading a person asks for carries no such flag: the proof is still taken, so looking never costs them.
  run = harness(BOUND, CLIMBING, failing);
  outcome = await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, run.deps);
  assert.equal(outcome.kind, "reached");

  // In the gift's last day the flag is lifted: a look that fails must not cost somebody a target reached in time.
  run = harness(BOUND, { ...CLIMBING, deadline: NOW + 86_400 - 1 }, failing);
  outcome = await runMilestoneReading({ giftId: "1000000", purpose: "reach", lookMustSucceed: true }, run.deps);
  assert.equal(outcome.kind, "reached");
  run = harness(BOUND, { ...CLIMBING, deadline: NOW + 86_400 + 60 }, failing);
  outcome = await runMilestoneReading({ giftId: "1000000", purpose: "reach", lookMustSucceed: true }, run.deps);
  assert.equal(outcome.kind, "refused", "a day and a minute before the deadline it still holds");

  // A look that answers is unchanged by the flag: below the target nothing is paid for, at the target the proof is.
  run = harness(BOUND, CLIMBING);
  assert.equal((await runMilestoneReading({ giftId: "1000000", purpose: "reach", lookMustSucceed: true }, run.deps)).kind, "notYet");
  assert.deepEqual(run.calls, ["plain"]);
  // And the frequent pass is the one that sets it.
  assert.match(readFileSync("src/frequent-pass.ts", "utf8"), /runMilestoneReading\(\{ giftId, purpose: "reach", recentSeconds: FREQUENT_PASS_RECENT_SECONDS, lookMustSucceed: true \}\)/);
});

test("a look that finds what the last one found is not a new line of the journal", async () => {
  const looks: number[] = [];
  let same = true;
  const run = harness(BOUND, CLIMBING, {
    sameLookAgain: async (look) => {
      looks.push(Number(look.rating));
      assert.equal(look.purpose, "look");
      assert.equal(look.observedAt, NOW);
      return same;
    },
  });
  assert.equal((await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, run.deps)).kind, "notYet");
  assert.deepEqual(run.recorded, [], "the newest row was brought up to now: nothing is added");
  same = false;
  assert.equal((await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, run.deps)).kind, "notYet");
  assert.deepEqual(run.recorded, ["look:plain:notYet"], "a look that differs is written");
  assert.deepEqual(looks, [1904, 1904]);
  // The journal is never cut short to make room: the first reading of a gift is what its page reads.
  assert.doesNotMatch(readFileSync("src/proof-journal.ts", "utf8"), /LIMIT 200/);
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
  // One place decides that a closed account is offered nothing, rather than five conditions on one screen: the
  // moment itself answers with no action, for either person, and the page says what the source did.
  const moment = readFileSync("src/gift-moment.ts", "utf8");
  assert.match(moment, /sourceClosed: status\.accountClosed/);
  assert.match(moment, /if \(gift\.sourceClosed && !gift\.finished\) return \{ moment, action: null, agreementOpen \};/);
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /milestone\?\.accountClosed && !gift\.finished\s*\? \[milestoneById\(milestone\.conditionId\)\?\.words\.accountClosed \?\? ""\]\.filter\(Boolean\)\s*:/);
  assert.match(page, /&& !gift\.sourceClosed/, "the quiet reading gesture is a gesture too");
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

/**
 * A button that answers nothing is a button somebody presses once and abandons. The rehearsal of 18 Sep pressed
 * "I added it", the route answered 200, and the sentence it answered with was rendered at the far end of the page,
 * below everything: from where the person stood, nothing happened.
 */
test("every gesture on a gift's page answers beside its own button, and nothing answers nowhere", () => {
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  // One answer, carrying the gesture it belongs to, rendered under that gesture and announced when it appears.
  assert.match(page, /const \[answer, setAnswer\] = useState<\{ at: Where; text: string; failed: boolean \} \| null>\(null\);/);
  assert.match(page, /const answerAt = \(where: Where\): ReactNode =>/);
  assert.match(page, /<p role="status" className=\{BODY\}>/);
  for (const gesture of ["open", "count", "take"]) {
    assert.ok(page.includes(`answerAt("${gesture}")`), `${gesture} answers where it was pressed`);
  }
  // Naming the account and taking the first reading answer inside the component that asks for them, under the
  // button that was pressed, which is why it takes the refusal by the name of the gesture.
  assert.match(page, /refusal=\{\n?\s*answer\?\.failed && \(answer\.at === "name" \|\| answer\.at === "start"\)/);
  const connect = readFileSync("app/kit/ConnectTheSource.tsx", "utf8");
  assert.equal(connect.match(/refusalAt\("start"\)/g)?.length, 2, "starting answers on both ways in that offer it");
  assert.equal(connect.match(/refusalAt\("name"\)/g)?.length, 2, "naming answers where a code is asked for and in the field itself");
  // Nothing is rendered at the end of the page any more: that is where the answer used to land, out of sight.
  assert.doesNotMatch(page, /\{notice \?/);
  // A failure always says something, whatever it was.
  assert.match(page, /setAnswer\(\{ at: where, text: screenMessage\(error\), failed: true \}\)/);
  // And an outcome of a shape nobody foresaw still says something rather than nothing.
  assert.match(page, /default:\n        return A\.failed;/);
  assert.match(page, /outcome\.message\.trim\(\)\.length > 0 \? outcome\.message : A\.failed/);
});

test("the account read and the figures of a climb go only where the names go: funder, recipient, or the link's key", () => {
  const latest: MilestoneReading = { giftId: "1000000", purpose: "look", attested: false, username: "lea_plays", playerId: "41", rating: 1410, ratedAt: NOW, rd: null, observedAt: NOW, nullifier: null, outcome: "notYet", txHash: null };
  const status = (viewer: { isRecipient: boolean; isFunder: boolean; holdsTheLink: boolean }) =>
    milestoneStatusOf({ record: BOUND, milestone: null, state: CLIMBING, contract: CONTRACT, latest, last: latest, reachedAt: null, viewer, nowSeconds: NOW, targetWords: "14.00 / 20" });
  const stranger = status({ isRecipient: false, isFunder: false, holdsTheLink: false });
  assert.equal(stranger.goalAccount.username, null);
  assert.equal(stranger.todayReading, null);
  assert.equal(stranger.startReading, null);
  assert.equal(stranger.target, null);
  assert.equal(stranger.standingAtOffer, null);
  assert.equal(stranger.targetWords, null);
  assert.equal(stranger.names, null);
  for (const viewer of [{ isRecipient: true, isFunder: false, holdsTheLink: false }, { isRecipient: false, isFunder: true, holdsTheLink: false }, { isRecipient: false, isFunder: false, holdsTheLink: true }]) {
    const seen = status(viewer);
    assert.equal(seen.todayReading, 1410);
    assert.notEqual(seen.target, null);
    assert.equal(seen.goalAccount.username, BOUND.goalUsername);
  }
});

test("the public journal gives why a reading was refused to the funder and the recipient only; disconnecting erases the source's ids; counting reads by the condition's nature", () => {
  const journal = readFileSync("app/api/gift/[id]/journal/route.ts", "utf8");
  assert.match(journal, /if \(!insider\) return NextResponse\.json\(\{ giftId: id, kind: "milestone", readings: readings\.map\(\(reading\) => \(\{ \.\.\.reading, outcome: reading\.outcome\.startsWith\("refused:"\) \? "refused" : reading\.outcome \}\)\) \}/);
  assert.match(journal, /account === record\.funder\.toLowerCase\(\) \|\| account === record\.recipient\?\.toLowerCase\(\)/);
  for (const file of ["src/connect-strava.ts", "src/connect-fitbit.ts"]) assert.match(readFileSync(file, "utf8"), /await eraseConnection\(giftId\);\n[^\n]*\n\s*await forgetConnectedAccount\(giftId\);/, file);
  assert.match(readFileSync("src/gift-store.ts", "utf8"), /SET goal_username = NULL, goal_profile_id = NULL/);
  const daily = readFileSync("src/gift-status.ts", "utf8");
  assert.match(daily, /username: names \? \(record\?\.goalUsername \?\? null\) : null,/);
});

test("without the recipient's yes nothing is read, and the journal says so once, however many passes come", async () => {
  // The founder, 29 Sep 2026: no reading that moves money without a valid agreement, on every path.
  const rows: string[] = [];
  let last: MilestoneReading | null = null;
  const run = harness(BOUND, CLIMBING, {
    leave: async () => ({ allowed: false, reason: "stopped" }),
    last: async () => last,
    record: async (reading) => {
      rows.push(reading.outcome);
      last = reading;
    },
  });
  const first = await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, run.deps);
  assert.deepEqual(first, { kind: "refused", giftId: "1000000", code: "NO_AGREEMENT", message: "Not read: no agreement.", rating: undefined });
  await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, run.deps);
  assert.deepEqual(run.calls, [], "the source is not asked, and no proof is paid for");
  assert.deepEqual(rows, ["refused:NO_AGREEMENT"], "written once, not at every pass");

  const agreed = harness(BOUND, CLIMBING, { leave: async () => ({ allowed: true, beforeAgreements: false }) });
  assert.equal((await runMilestoneReading({ giftId: "1000000", purpose: "reach" }, agreed.deps)).kind, "notYet", "with the yes, it reads");
});
