/**
 * What a milestone gift's page reads (C2 wires it; S3 builds the page against it). Browser safe.
 *
 * The gift route answers `kind: "milestone"` with these fields for a gift held by the milestone contract. Until a
 * milestone condition is live, only the capture run answers it, with simulated data, so the page can be read and
 * judged before the first real milestone gift exists.
 */

export type MilestoneStatus = Readonly<{
  kind: "milestone";
  giftId: string;
  /** An id of src/conditions.ts: the source's name and words come from the register. */
  conditionId: string;
  youAreTheRecipient: boolean;
  youAreTheFunder: boolean;
  names: { recipientName: string | null; funderName: string | null } | null;
  goalAccount: { username: string | null };
  amount: string;
  amountDisplay: string;
  /** Where the person stood when the gift was connected, and what they must reach. */
  startReading: number | null;
  target: number;
  /** The last reading the keeper made, and when. */
  todayReading: number | null;
  readAtMs: number | null;
  /** The end of the last day on which reaching the target still counts. */
  deadlineMs: number;
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
  withdrawNonce: string;
  escrow: `0x${string}`;
}>;

/** Where today's reading sits between the start and the target, from 0 to 1, for the meter. */
export function milestoneProgress(status: Pick<MilestoneStatus, "startReading" | "target" | "todayReading" | "reached">): number {
  if (status.reached) return 1;
  if (status.todayReading === null) return 0;
  const start = status.startReading ?? 0;
  if (status.target <= start) return status.todayReading >= status.target ? 1 : 0;
  return Math.min(1, Math.max(0, (status.todayReading - start) / (status.target - start)));
}
