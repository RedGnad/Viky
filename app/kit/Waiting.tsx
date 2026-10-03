"use client";
import { useEffect, useState, type ReactNode } from "react";
import { NAME_THE_STEP_AFTER_MS } from "@/src/waits";
import { HELP } from "../components/ui";

/**
 * Every wait that follows a press (the founder, 3 Oct 2026): the one wheel the product has, inside the button, from
 * the press; and past ten seconds, a line under the button that names the step in progress. A button used to change
 * its words and fade, with nothing moving, which reads as a press nobody registered (NN/g 2014; Apple's Human Interface
 * Guidelines, "Loading": "Show something as soon as possible").
 *
 * The wheel is the working ring (app/kit/Working.tsx) in the button's own ink. A device asking for reduced motion
 * stops it, as it stops the ring everywhere, and keeps the words.
 */

/** A button's words, or, while its press is being answered, the wheel and what is being done. */
export function ButtonWords({ busy, doing, children }: Readonly<{ busy: boolean; doing: string; children: ReactNode }>) {
  if (!busy) return <>{children}</>;
  return (
    <span className="inline-flex items-center justify-center gap-[var(--space-sm)]" data-waiting="">
      <span className="working-ring working-ring-inline" aria-hidden="true" />
      <span>{doing}</span>
    </span>
  );
}

/** Whether a wait has lasted long enough for its step to be named. It starts again with every wait. */
export function useLongWait(busy: boolean): boolean {
  const [long, setLong] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => setLong(true), NAME_THE_STEP_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
      setLong(false);
    };
  }, [busy]);
  return busy && long;
}

/** Under a button whose wait has passed ten seconds: the step in progress, said once to a screen reader. */
export function StepInProgress({ busy, step }: Readonly<{ busy: boolean; step: string | null | undefined }>) {
  const long = useLongWait(busy);
  return long && step ? (
    <p className={HELP} role="status" data-step-in-progress="">
      {step}
    </p>
  ) : null;
}

/** Something being read with no button to carry it, a list or a page: the wheel beside the line that says what. */
export function WaitLine({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className={`${HELP} inline-flex items-center gap-[var(--space-sm)]`} role="status" data-waiting="">
      <span className="working-ring working-ring-inline" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
