"use client";
import { useState } from "react";
import { ReachedMoment, reachedOfStatus, useLoaded } from "@/app/kit/ReachedMoment";
import type { MilestoneStatus } from "@/src/milestone-view";
import { LAB } from "../words";

/**
 * The laboratory's moment: the production one, from example data, played once the page has loaded and never written.
 * Once closed, a laboratory tool plays it again, from its start, as many times as the founder wants to watch it (4 Oct
 * 2026).
 */
export function LabReached({ status, who }: Readonly<{ status: MilestoneStatus; who: "recipient" | "funder" }>) {
  const loaded = useLoaded();
  /** Which playing this is: a new one draws the moment anew, from its first frame. */
  const [playing, setPlaying] = useState(1);
  const [closed, setClosed] = useState(false);
  if (!loaded) return null;
  // The moment is a modal: nothing beside it can be pressed while it is open. Once it is closed, by its own action,
  // the laboratory offers it again.
  if (!closed) return <ReachedMoment key={playing} gift={reachedOfStatus(status, who, { recipientName: "Boo", funderName: "Mom" })} onClose={() => setClosed(true)} />;
  return (
    <button
      type="button"
      data-lab-tool
      onClick={() => {
        setClosed(false);
        setPlaying((times) => times + 1);
      }}
      className="fixed top-[var(--space-md)] right-[var(--space-md)] z-[1000] min-h-[var(--tap-target)] rounded-full border-2 border-dashed border-[var(--muted)] bg-[var(--surface)] px-[var(--space-md)] text-[length:var(--type-help)]"
    >
      {LAB.replayMoment}
    </button>
  );
}
