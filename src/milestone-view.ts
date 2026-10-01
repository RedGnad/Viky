import type { MilestonePhase } from "./milestone-reader";

/**
 * What a milestone gift's page reads (C2 wires it; S3 builds the page against it). Browser safe.
 *
 * The gift route answers `kind: "milestone"` with these fields for a gift held by the milestone contract
 * (src/milestone-status.ts). Every figure that is money or a state is the contract's; "today" is the latest reading Viky
 * took, and says when. A climb's clock starts at its first reading (D46), so before that there is no deadline, only a
 * number of days.
 */

export type MilestoneStatus = Readonly<{
  kind: "milestone";
  /**
   * Which of the two shapes this gift is (D47). A climb is proved by readings the keeper takes; a certificate is
   * proved once, by the page its holder shares, so the page asks for a link instead of drawing a meter.
   */
  shape: "climb" | "certificate";
  giftId: string;
  /** An id of src/conditions.ts: the source's name and words come from the register. */
  conditionId: string;
  youAreTheRecipient: boolean;
  youAreTheFunder: boolean;
  names: { recipientName: string | null; funderName: string | null } | null;
  /** The account read, as the source spells it; the code only ever reaches the recipient signed in. */
  goalAccount: {
    username: string | null;
    bound: boolean;
    code: string | null;
    codeExpiresAt: string | null;
    /** True when the funder named the account: nothing is asked of the recipient's own profile then (D27). */
    namedByFunder: boolean;
  };
  amount: string;
  amountDisplay: string;
  /** Where the person stood when the gift was connected, and what they must reach. */
  startReading: number | null;
  target: number | null;
  /** The last reading the keeper made, and when. */
  todayReading: number | null;
  readAtMs: number | null;
  /** The moment reaching the target stops counting, once the first reading has started the clock. */
  deadlineMs: number | null;
  /** How long the climb lasts from its first reading. */
  durationDays: number;
  opened: boolean;
  connected: boolean;
  reached: boolean;
  reachedAtMs: number | null;
  finished: boolean;
  cancelled: boolean;
  earned: string;
  earnedDisplay: string;
  takenDisplay: string;
  returnedDisplay: string;
  createdAtChain: number;
  claimedAtChain: number;
  withdrawNonce: string;
  escrow: `0x${string}`;
  /** What the contract would do now (src/milestone-reader.ts). */
  phase: MilestonePhase;
  /** The cadence read, as the register names it. */
  cadence: { id: string; label: string };
  /** Chess.com has closed the account (U1): nothing more can be earned, and the gift goes back at the deadline. */
  accountClosed: boolean;
  /** The first reading, when it stood above the highest start the funder accepted and was not recorded; nothing otherwise. */
  startAboveCap?: number | null;
  /** The highest start the funder accepted: a start above it can never pay. */
  maximumStart: number;
  /** Where they stood when the funder chose, as the funder's screen read it. */
  standingAtOffer: number | null;
  /**
   * "Finish a marathon" (D273): the race the gift was made on, whether the bib can still be entered, the bib bound,
   * and the line read once there is one (the name, the bib, the time), to whoever may see the names.
   */
  marathon: {
    raceId: string;
    raceName: string;
    /** The distance the gift was made on, "Half marathon". */
    distance: string;
    startsAt: string;
    bibOpen: boolean;
    bib: string | null;
    result: { runner: string; bib: string; official: string; finishSeconds: number } | null;
  } | null;
  /**
   * "Set a time at a WCA competition" (the founder, 27 Sep 2026): the competition and the event the gift was made
   * on, the competitor once checked on the competitors list (as they gave themselves, and their WCA id), and the
   * result read once there is one (the name, the id, the best single), to whoever may see the names.
   */
  /**
   * What a university gift waits on (D313): its provider being built, which the operator was asked for when the gift
   * was made; or a first proof read through a witness with no pin yet, held for review or refused by it. Nothing once
   * it is settled, and nothing for any other gift.
   */
  /**
   * A grade gift's target in words, on the scale it was made on or the university's pinned one: "14.50 out of 20", "B".
   * The contract holds hundredths, which are no words to read. Nothing for any other gift.
   */
  targetWords?: string | null;
  /**
   * What a gift had or not asks, in the register's words: "enrolled at that university", "finish the race". Its
   * target on the contract is 1, or a count nobody reads, and is never printed. Nothing for a climb or a grade.
   */
  asked?: string | null;
  review: Readonly<{ status: "building" | "pending" | "refused"; /** The refusal in its own words, where it has them: a scale that does not match. */ message?: string }> | null;
  wca: {
    competitionId: string;
    eventId: string;
    eventLabel: string;
    title: string;
    registered: { who: string; wcaId: string | null } | null;
    result: { name: string; wcaId: string; best: number; inWords: string } | null;
  } | null;
}>;

/**
 * Where today's reading sits on the way to the target, from 0 to 1, for the trail (D232): measured from nothing, not
 * from where they started, so somebody who already has 383 of 2,500 is drawn a little way along rather than at the
 * very start. Nunes and Drèze, The Endowed Progress Effect (Journal of Consumer Research, 2006): people shown a goal
 * already begun persist more than people shown one not yet begun, and this picture is true, since what they have
 * counts from nothing; where they started is in what was agreed, in words. Nothing read yet: at the start. Reached:
 * at the end.
 */
export function milestoneProgress(status: Pick<MilestoneStatus, "target" | "todayReading" | "reached">): number {
  if (status.reached) return 1;
  // Nothing read, or read and not shown to this reader (the figures go where the names go).
  if (status.todayReading === null || status.target === null) return 0;
  if (status.target <= 0) return status.todayReading >= status.target ? 1 : 0;
  return Math.min(1, Math.max(0, status.todayReading / status.target));
}
