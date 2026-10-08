"use client";
import { useEffect, useState, type ReactNode } from "react";
import { DONE_SHOWN_MS } from "@/src/waits";
import { PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON } from "../components/ui";
import { FieldRefusal } from "./FieldRefusal";
import { StepInProgress } from "./Waiting";

/**
 * The one button, and its four states, each seen from the press (the UI pass of 8 Oct 2026, rule 3).
 *
 * - At rest: its words, on its relief.
 * - Doing: it stays down where the press put it, in its own colour, the wheel turning beside the verb of what is
 *   being done. A step that asks no decision is this state, never a screen of its own (rule 4).
 * - Done: still down, the mark beside the word that says it is done; the one action gives its sun back meanwhile.
 * - Failed: back at rest, with one line under it that says what did not happen.
 *
 * Before it, a button that waited faded and kept its words, or changed them with nothing moving, and each screen
 * wrote its own. A button that cannot be pressed yet (a field not filled in) is another thing, and keeps the faded
 * look of rule 3 of 1 Oct 2026: `waiting`.
 *
 * While it is doing or done it is not pressed again: the press is dropped here, and the button stays in the page's
 * order, where a screen reader hears what it is doing. A button that sends a form (`submits`) drops the form's own
 * press the same way. The wheel is the working ring every wait has
 * (app/kit/Waiting.tsx); a device asking for less motion stops it and keeps the words.
 */
const LOOKS = { primary: PRIMARY_BUTTON, secondary: SECONDARY_BUTTON, small: SMALL_BUTTON } as const;

export function Button({
  look = "primary",
  doing = null,
  done = null,
  failed = null,
  failedId,
  step = null,
  waiting = false,
  submits = false,
  onPress,
  className = "",
  describedBy,
  children,
  ...marks
}: Readonly<{
  look?: keyof typeof LOOKS;
  /** What is being done, in its "-ing" form, while the press is answered; nothing at rest. */
  doing?: string | null | false;
  /** What was done, for the moment it is shown (`useDone`); nothing otherwise. */
  done?: string | null | false;
  /** What did not happen, said under the button, which is back at rest. */
  failed?: string | null;
  /** The id of that line, for the field or the button it is about. */
  failedId?: string;
  /** The step in progress, named under the button once the wait has passed ten seconds (app/kit/Waiting.tsx). */
  step?: string | null;
  /** It cannot be pressed yet. */
  waiting?: boolean;
  /** It sends the form it stands in: the press is the form's, and a press while it is doing or done sends nothing. */
  submits?: boolean;
  onPress?: () => void;
  className?: string;
  describedBy?: string;
  children: ReactNode;
  /** The marks a test or a stylesheet finds the button by. */
  [mark: `data-${string}`]: string | undefined;
}>) {
  const state = doing ? "doing" : done ? "done" : undefined;
  return (
    <>
      <button
        type={submits ? "submit" : "button"}
        className={`${LOOKS[look]} ${className}`.trim()}
        data-state={state}
        aria-busy={doing ? true : undefined}
        aria-disabled={state ? true : undefined}
        aria-describedby={failed && failedId ? failedId : describedBy}
        disabled={waiting && !state}
        {...marks}
        onClick={(event) => {
          // A press while it works is dropped here, a form's own included: the form is sent once.
          if (state) event.preventDefault();
          else onPress?.();
        }}
      >
        {doing ? (
          <span className="inline-flex items-center justify-center gap-[var(--space-sm)]" data-waiting="">
            <span className="working-ring working-ring-inline" aria-hidden="true" />
            <span>{doing}</span>
          </span>
        ) : done ? (
          <span className="inline-flex items-center justify-center gap-[var(--space-sm)]" data-done="">
            <svg aria-hidden focusable="false" viewBox="0 0 24 24" className="h-[1.15em] w-[1.15em] shrink-0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            <span>{done}</span>
          </span>
        ) : (
          children
        )}
      </button>
      <StepInProgress busy={Boolean(doing)} step={step} />
      {failed && !state ? <FieldRefusal id={failedId ?? "button-refused"}>{failed}</FieldRefusal> : null}
    </>
  );
}

/**
 * The moment a button says it is done: true from `mark` for `DONE_SHOWN_MS`, then the button is back at rest and can
 * be pressed again. A copy is the plain case: "Copied", and then the button copies again.
 */
export function useDone(): readonly [boolean, () => void] {
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (!at) return;
    const timer = window.setTimeout(() => setAt(0), DONE_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [at]);
  return [at > 0, () => setAt(Date.now())] as const;
}
