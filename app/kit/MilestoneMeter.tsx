import type { MilestoneStatus } from "@/src/milestone-view";
import type { CharacterState } from "./Character";

/**
 * What a milestone gift has done so far: its character, and one bar in ink on the surface, the start on the left, the
 * target on the right, today's reading filled between them (structure, section 6). A milestone has no days, so it has
 * one character rather than a strip of them (the art direction brief of 17 Sep 2026, section 5): asleep until it is
 * opened, awake while it is being reached for, smiling when it is reached, and leaving when the date passed without it.
 * A picture of the sentence beside it, so it is hidden from a screen reader. Nothing is drawn as reached until the
 * keeper has read it reached. The small size is 44 since D136: at 24 it was a smudge beside its bar, while the days
 * of a card next to it are 60.
 */
/** Everything either of these two reads: a gift not yet made can say all of it truthfully. */
export type MeterStatus = Pick<MilestoneStatus, "startReading" | "target" | "todayReading" | "reached" | "cancelled" | "finished" | "opened"> &
  Partial<Pick<MilestoneStatus, "phase">>;

export function milestoneCharacter(status: MeterStatus): CharacterState {
  if (status.reached) return "earned";
  if (status.cancelled || status.finished) return "returned";
  if (!status.opened) return "toCome";
  return "today";
}

/*
 * The bar this file drew on a card in a list is gone since D232: the card draws the trail (app/kit/Climb.tsx), as the
 * gift's own page has since V4. What stays here is what both read: the status a meter needs and the character of it.
 */
