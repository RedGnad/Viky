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
  giftId: string;
  /** An id of src/conditions.ts: the source's name and words come from the register. */
  conditionId: string;
  youAreTheRecipient: boolean;
  youAreTheFunder: boolean;
  names: { recipientName: string | null; funderName: string | null } | null;
  /** The account read, as the source spells it; the code only ever reaches the recipient signed in. */
  goalAccount: { username: string | null; bound: boolean; code: string | null; codeExpiresAt: string | null };
  amount: string;
  amountDisplay: string;
  /** Where the person stood when the gift was connected, and what they must reach. */
  startReading: number | null;
  target: number;
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
  /** The highest start the funder accepted: a start above it can never pay. */
  maximumStart: number;
  /** Where they stood when the funder chose, as the funder's screen read it. */
  standingAtOffer: number | null;
}>;

/** Where today's reading sits between the start and the target, from 0 to 1, for the meter. */
export function milestoneProgress(status: Pick<MilestoneStatus, "startReading" | "target" | "todayReading" | "reached">): number {
  if (status.reached) return 1;
  if (status.todayReading === null) return 0;
  const start = status.startReading ?? 0;
  if (status.target <= start) return status.todayReading >= status.target ? 1 : 0;
  return Math.min(1, Math.max(0, (status.todayReading - start) / (status.target - start)));
}
