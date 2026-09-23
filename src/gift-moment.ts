import type { MilestoneStatus } from "./milestone-view";
import type { Voice } from "./gift-voice";

/**
 * Where a gift is in its life, and what its page must lead with (document J, 19 Sep 2026).
 *
 * The defect this closes: the page tried to be two things at once, the agreement (what was promised, fixed, read
 * once) and the state (where it stands, changing, read every day), both written at the same weight in the same
 * prose at every visit. Measured on 19 Sep, all twenty-three states of the page said at least one figure twice.
 *
 * So the page is cut by moment, not by screen. Each moment answers one question, and it answers it with four things
 * in this order: the state in one sentence, the figure that counts now, the next moment with its date, and one
 * action or none. Everything else, the agreement and how it is checked, is folded under its own name.
 *
 * Both roles read the same page, and their questions are not the same one: "is it for me?" against "did they see
 * it?". They diverge at the opening, at the deadline and at the return, which is where this module gives each role
 * its own sentence.
 */

export type Moment =
  /** Nobody has opened the link yet. */
  | "unopened"
  /** Opened, and the source it counts is not connected: the one moment where the whole agreement is read. */
  | "openedNotConnected"
  /** A habit being counted day by day. */
  | "counting"
  /** A rating climbing towards a target. */
  | "climbing"
  /** Something granted once, waiting for the proof that it was. */
  | "awaitingProof"
  /** The first reading stood above what a climb may start from, so nothing can be earned. */
  | "startTooHigh"
  /** Reached, or finished with something earned: the money is theirs. */
  | "won"
  /** The deadline passed, or the days ran out: what is left goes back. */
  | "over"
  /** Taken back before anybody opened it, or returned in full. */
  | "cameBack";

/**
 * The one action a moment offers, at most. A moment with none is a page that is read, not used, and most moments
 * are: that is where the largest cut is, and it comes from the moment rather than from counting words.
 */
export type MomentAction =
  | "open"
  | "connect"
  | "shareProof"
  | "askAgain"
  | "take"
  | "linkAgain"
  /** A start too high, to the funder: the way on is another gift, made from Home. */
  | "offerAgain"
  | "takeItBack"
  | null;

export type MomentRead = Readonly<{
  moment: Moment;
  /** The single action of this moment for this reader, or nothing. */
  action: MomentAction;
  /** Whether the agreement is read in full here rather than folded: true at the one moment a person discovers it. */
  agreementOpen: boolean;
}>;

/** What a gift looks like to this module, whichever of the three shapes it has. */
type Gift = Readonly<{
  opened: boolean;
  cancelled: boolean;
  finished: boolean;
  /** The source is connected and the counting or the climb has started. */
  connected: boolean;
  /** Anything at all has been earned. */
  earnedAnything: boolean;
  shape: "days" | "climb" | "stamp";
  /** A climb whose first reading stood too high to leave anything to earn. */
  startTooHigh: boolean;
  /** The source itself closed the account this gift reads, so nothing can be earned and nothing can be pressed. */
  sourceClosed: boolean;
  /** There is money in it that the person it is for may take out now. */
  moneyToTake: boolean;
}>;

/** A money figure with something in it: the summary carries what a person reads, never units. */
const hasMoney = (amount: string) => !/^[^0-9]*0[.,]00[^0-9]*$/.test(amount.trim());

/**
 * A daily gift, from the card's own summary (Home, Gifts) or from the page's own read of it. The two describe the
 * same gift and do not spell "it has started" the same way: a card says `counting`, the page says `connected`, and
 * reading one through the other's name made a gift that had just been connected look as if it had not been.
 */
export function giftOfSummary(gift: Readonly<{
  opened: boolean;
  cancelled: boolean;
  finished: boolean;
  counting?: boolean;
  connected?: boolean;
  creditedDays: number;
  missedDays: number;
  earnedDisplay: string;
}>): Gift {
  return {
    opened: gift.opened,
    cancelled: gift.cancelled,
    finished: gift.finished,
    connected: (gift.counting ?? gift.connected ?? false) || gift.creditedDays + gift.missedDays > 0,
    earnedAnything: gift.creditedDays > 0,
    shape: "days",
    startTooHigh: false,
    sourceClosed: false,
    moneyToTake: hasMoney(gift.earnedDisplay),
  };
}

/** A milestone gift, of either shape. */
export function giftOfMilestone(status: MilestoneStatus): Gift {
  return {
    opened: status.opened,
    cancelled: status.cancelled,
    finished: status.finished,
    connected: status.connected,
    earnedAnything: status.reached,
    shape: status.shape === "certificate" ? "stamp" : "climb",
    startTooHigh: status.phase === "startTooHigh",
    sourceClosed: status.accountClosed,
    moneyToTake: BigInt(status.earned) > 0n,
  };
}

/**
 * The moment a gift is in. Read in the order a life runs, so a gift that ended is never described by where it stood
 * on the way: taken back, then settled, then opened, then connected.
 */
export function momentOf(gift: Gift): Moment {
  if (gift.cancelled) return "cameBack";
  if (gift.finished) return gift.earnedAnything ? "won" : "over";
  if (!gift.opened) return "unopened";
  if (gift.startTooHigh) return "startTooHigh";
  if (!gift.connected) return "openedNotConnected";
  return gift.shape === "days" ? "counting" : gift.shape === "climb" ? "climbing" : "awaitingProof";
}

/**
 * What this reader may do at this moment, and whether the agreement stands open.
 *
 * A reader who is neither of the two people has no gesture anywhere: a link gives the right to read where a gift
 * stands and nothing else (D99). The funder's only gestures are on a gift nobody has opened, because after that the
 * gift is somebody else's.
 */
export function readAs(gift: Gift, voice: Voice, moment: Moment = momentOf(gift)): MomentRead {
  const agreementOpen = moment === "openedNotConnected";
  if (voice === "reader") return { moment, action: null, agreementOpen };
  // The source closed the account: no reading, no code, no proof, no check. Nothing here can be earned any more, and
  // a button that the route would refuse is a button nobody should meet.
  if (gift.sourceClosed && !gift.finished) return { moment, action: null, agreementOpen };
  if (voice === "funder") {
    // Two gestures exist while nobody has opened it, and they are not of the same weight: sending the link again is
    // the everyday one, taking the gift back ends it. The second is offered under the first, never beside it.
    // A start too high is the other: the way on is another gift, which only the funder can make (document J).
    return { moment, action: moment === "unopened" ? "linkAgain" : moment === "startTooHigh" ? "offerAgain" : null, agreementOpen };
  }
  // While a gift runs, its page is looked at and nothing is asked (the founder's table of 23 Sep 2026, V4): taking
  // the money out is the action of the moment it is theirs, "Atteint", and of no other. Until then, #76 offered it at
  // every moment money had been earned; the table overrules that.
  switch (moment) {
    case "unopened":
      return { moment, action: "open", agreementOpen };
    case "openedNotConnected":
      return { moment, action: "connect", agreementOpen };
    case "awaitingProof":
      return { moment, action: "shareProof", agreementOpen };
    case "startTooHigh":
      return { moment, action: "askAgain", agreementOpen };
    case "won":
      // Nothing to take once it is taken: the moment stays, and the page is read.
      return { moment, action: gift.moneyToTake ? "take" : null, agreementOpen };
    default:
      // Counting, climbing, over, came back: a page that is looked at. Whatever a person may still do here is said
      // quietly, because nothing on this screen is waiting for them.
      return { moment, action: null, agreementOpen };
  }
}

/** The funder's second gesture, under the first: ending a gift nobody opened. Never offered beside another action. */
export function funderMayTakeItBack(gift: Gift, voice: Voice): boolean {
  return voice === "funder" && momentOf(gift) === "unopened";
}
