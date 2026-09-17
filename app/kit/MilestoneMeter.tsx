import { milestoneProgress, type MilestoneStatus } from "@/src/milestone-view";

/**
 * A milestone's progress as one bar, in ink on the surface: the start on the left, the target on the right, today's
 * reading filled between them (structure, section 6). A picture of the sentence beside it, so it is hidden from a
 * screen reader. Nothing is drawn as reached until the keeper has read it reached.
 */
export function MilestoneMeter({ status, startLabel, targetLabel }: Readonly<{ status: MilestoneStatus; startLabel?: string; targetLabel?: string }>) {
  const progress = milestoneProgress(status);
  return (
    <span aria-hidden className="flex flex-col gap-[var(--space-xs)]">
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
  );
}
