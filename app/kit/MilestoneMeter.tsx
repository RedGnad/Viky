import { milestoneProgress, type MilestoneStatus } from "@/src/milestone-view";
import { Character, type CharacterState } from "./Character";
import { Gaze } from "./Motion";

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

export function MilestoneMeter({ status, startLabel, targetLabel, size = "small" }: Readonly<{ status: MeterStatus; startLabel?: string; targetLabel?: string; size?: "small" | "large" }>) {
  const progress = milestoneProgress(status);
  const character = (
    <Character state={milestoneCharacter(status)} size={size} className={size === "large" ? "h-auto w-[72px] shrink-0" : "h-auto w-[44px] shrink-0"} />
  );
  return (
    <span aria-hidden className="flex items-center gap-[var(--space-md)]">
      {size === "large" ? <Gaze>{character}</Gaze> : character}
      <span className="flex flex-1 flex-col gap-[var(--space-xs)]">
      <span className="relative block h-[10px] w-full overflow-hidden rounded-full border border-[var(--control-border)] bg-[var(--surface)]">
        <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--text)]" style={{ width: `${Math.round(progress * 100)}%` }} />
      </span>
      {startLabel || targetLabel ? (
        <span className="flex justify-between text-[length:var(--type-help)] leading-[var(--type-help-leading)] text-[var(--muted)]">
          <span>{startLabel}</span>
          <span>{targetLabel}</span>
        </span>
      ) : null}
      </span>
    </span>
  );
}
