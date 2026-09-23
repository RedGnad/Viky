import { strict as assert } from "node:assert";
import test from "node:test";
import { funderMayTakeItBack, giftOfMilestone, giftOfSummary, momentOf, readAs, type Moment } from "../src/gift-moment.js";
import type { GiftSummary } from "../src/client/gift.js";
import type { MilestoneStatus } from "../src/milestone-view.js";

/**
 * The table of document J, row by row: nine moments, two roles, and the rule that a moment offers one action or
 * none. Read against the table rather than against the screen, so a screen that drifts from it fails here first.
 */

const daily = (over: Partial<GiftSummary> = {}): GiftSummary =>
  ({
    giftId: "3",
    role: "recipient",
    goalType: 1,
    goalUsername: null,
    usernameSource: null,
    recipientName: "Léa",
    funderName: "Maman",
    catchUpSeconds: 108_000,
    days: [],
    fundedAt: 0,
    startDay: 0,
    endDay: 7,
    amountDisplay: "$7.00",
    perDayDisplay: "$1.00",
    durationDays: 7,
    creditedDays: 0,
    missedDays: 0,
    opened: false,
    counting: false,
    finished: false,
    cancelled: false,
    earnedDisplay: "$0.00",
    theirsDisplay: "$0.00",
    returnedDisplay: "$0.00",
    ...over,
  }) as GiftSummary;

const climb = (over: Partial<MilestoneStatus> = {}): MilestoneStatus =>
  ({
    kind: "milestone",
    shape: "climb",
    giftId: "1000000",
    conditionId: "chess-rating",
    youAreTheRecipient: true,
    youAreTheFunder: false,
    names: { recipientName: "Léa", funderName: "Maman" },
    goalAccount: { username: "lea_plays", bound: false, code: null, codeExpiresAt: null, namedByFunder: false },
    amount: "50000000",
    amountDisplay: "$50.00",
    startReading: null,
    target: 1500,
    todayReading: null,
    readAtMs: null,
    deadlineMs: null,
    durationDays: 30,
    opened: false,
    connected: false,
    reached: false,
    reachedAtMs: null,
    finished: false,
    cancelled: false,
    earned: "0",
    earnedDisplay: "$0.00",
    takenDisplay: "$0.00",
    returnedDisplay: "$0.00",
    createdAtChain: 0,
    claimedAtChain: 0,
    phase: "unopened",
    ...over,
  }) as MilestoneStatus;

test("a gift nobody opened: the recipient opens it, the funder sends the link again", () => {
  const gift = giftOfSummary(daily());
  assert.equal(momentOf(gift), "unopened");
  assert.equal(readAs(gift, "recipient").action, "open");
  assert.equal(readAs(gift, "funder").action, "linkAgain");
  assert.equal(funderMayTakeItBack(gift, "funder"), true, "ending it is the funder's second gesture, under the first");
  assert.equal(funderMayTakeItBack(gift, "recipient"), false);
});

test("opened and not connected is the one moment where the whole agreement is read", () => {
  const gift = giftOfSummary(daily({ opened: true }));
  assert.equal(momentOf(gift), "openedNotConnected");
  assert.equal(readAs(gift, "recipient").action, "connect");
  assert.equal(readAs(gift, "recipient").agreementOpen, true);
  // Everywhere else it is folded under its own name, because by then it has already been read.
  for (const other of [daily({ opened: true, counting: true }), daily({ opened: true, finished: true, creditedDays: 5 })]) {
    assert.equal(readAs(giftOfSummary(other), "recipient").agreementOpen, false);
  }
});

test("a gift that runs asks for nothing, even with money earned: taking it out is the action of the end (V4)", () => {
  // The founder's table of 23 Sep 2026: "En cours: aucune. C'est une page qu'on regarde." It overrules #76, which
  // offered the money at every moment some had been earned.
  const halfway = giftOfSummary(daily({ opened: true, counting: true, creditedDays: 2, earnedDisplay: "$2.00" }));
  assert.equal(momentOf(halfway), "counting");
  for (const voice of ["recipient", "funder", "reader"] as const) assert.equal(readAs(halfway, voice).action, null);
  // At the end, taking it out is the one action, and only while there is something to take.
  const won = giftOfSummary(daily({ opened: true, finished: true, creditedDays: 2, earnedDisplay: "$2.00" }));
  assert.equal(readAs(won, "recipient").action, "take");
  assert.equal(readAs(won, "funder").action, null, "what was earned leaves only to the person it is for");
  const takenAlready = giftOfSummary(daily({ opened: true, finished: true, creditedDays: 2, earnedDisplay: "$0.00" }));
  assert.equal(readAs(takenAlready, "recipient").action, null);
});

test("a habit being counted and a rating climbing are two moments, and neither asks for anything", () => {
  const habit = giftOfSummary(daily({ opened: true, counting: true }));
  assert.equal(momentOf(habit), "counting");
  const rating = giftOfMilestone(climb({ opened: true, connected: true, phase: "climbing", startReading: 1455, todayReading: 1460 }));
  assert.equal(momentOf(rating), "climbing");
  for (const gift of [habit, rating]) {
    for (const voice of ["recipient", "funder", "reader"] as const) {
      assert.equal(readAs(gift, voice).action, null, `${momentOf(gift)} asks something of ${voice}`);
    }
  }
});

test("something granted once waits for its proof, and sharing it is the one gesture", () => {
  const paper = giftOfMilestone(climb({ shape: "certificate", opened: true, connected: true, phase: "climbing" }));
  assert.equal(momentOf(paper), "awaitingProof");
  assert.equal(readAs(paper, "recipient").action, "shareProof");
  assert.equal(readAs(paper, "funder").action, null);
});

test("a start too high says why, and the only way on is another gift", () => {
  const gift = giftOfMilestone(climb({ opened: true, connected: true, phase: "startTooHigh", startReading: 1520 }));
  assert.equal(momentOf(gift), "startTooHigh");
  assert.equal(readAs(gift, "recipient").action, "askAgain");
  assert.equal(readAs(gift, "funder").action, null);
});

test("reached is the money, and taking it out is the action; the deadline passed asks nothing of anybody", () => {
  const won = giftOfMilestone(climb({ opened: true, connected: true, finished: true, reached: true, phase: "reached", earned: "50000000", earnedDisplay: "$50.00" }));
  assert.equal(momentOf(won), "won");
  assert.equal(readAs(won, "recipient").action, "take");
  assert.equal(readAs(won, "funder").action, null);

  const over = giftOfMilestone(climb({ opened: true, connected: true, finished: true, phase: "overdue" }));
  assert.equal(momentOf(over), "over");
  for (const voice of ["recipient", "funder", "reader"] as const) assert.equal(readAs(over, voice).action, null);
});

test("a daily gift that earned something is won, and one that earned nothing is over", () => {
  assert.equal(momentOf(giftOfSummary(daily({ opened: true, finished: true, creditedDays: 5, missedDays: 2 }))), "won");
  assert.equal(momentOf(giftOfSummary(daily({ opened: true, finished: true, creditedDays: 0, missedDays: 7 }))), "over");
});

test("taken back or returned in full is one moment, and it is the end of every other", () => {
  const gift = giftOfSummary(daily({ cancelled: true, opened: true, counting: true }));
  assert.equal(momentOf(gift), "cameBack");
  for (const voice of ["recipient", "funder", "reader"] as const) assert.equal(readAs(gift, voice).action, null);
  assert.equal(funderMayTakeItBack(gift, "funder"), false, "it is already back");
});

test("a reader who is neither of the two people is offered nothing, at every moment", () => {
  const moments: Moment[] = [];
  for (const gift of [
    giftOfSummary(daily()),
    giftOfSummary(daily({ opened: true })),
    giftOfSummary(daily({ opened: true, counting: true })),
    giftOfMilestone(climb({ opened: true, connected: true, phase: "climbing" })),
    giftOfMilestone(climb({ shape: "certificate", opened: true, connected: true })),
    giftOfMilestone(climb({ opened: true, connected: true, phase: "startTooHigh" })),
    giftOfMilestone(climb({ opened: true, connected: true, finished: true, reached: true })),
    giftOfMilestone(climb({ opened: true, connected: true, finished: true })),
    giftOfSummary(daily({ cancelled: true })),
  ]) {
    moments.push(momentOf(gift));
    assert.equal(readAs(gift, "reader").action, null);
  }
  // And the nine moments of the table are all reachable, none of them by two different gifts at once.
  assert.deepEqual(moments, [
    "unopened",
    "openedNotConnected",
    "counting",
    "climbing",
    "awaitingProof",
    "startTooHigh",
    "won",
    "over",
    "cameBack",
  ]);
});
