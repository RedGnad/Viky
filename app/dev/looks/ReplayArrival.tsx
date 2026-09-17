"use client";
import { REPLAY_ARRIVAL } from "@/app/kit/Motion";
import { LAB } from "./words";

/**
 * The laboratory's own control, not the product's: it plays a screen's arrival again from the example's last visit, so
 * the founder can watch it more than once (brief, section 6). Pictures of the screens leave it out.
 */
export function ReplayArrival() {
  return (
    <button
      type="button"
      data-lab-tool
      onClick={() => window.dispatchEvent(new Event(REPLAY_ARRIVAL))}
      className="fixed top-[var(--space-md)] right-[var(--space-md)] z-50 min-h-[var(--tap-target)] rounded-full border-2 border-dashed border-[var(--muted)] bg-[var(--surface)] px-[var(--space-md)] text-[length:var(--type-help)] text-[var(--text)]"
    >
      {LAB.replayArrival}
    </button>
  );
}
