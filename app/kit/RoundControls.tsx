import type { ReactNode } from "react";
import { META } from "../components/ui";

/**
 * The standing controls of a page (the founder's rule 6 of 1 Oct 2026, the mockup you-decide.html): round buttons
 * with two words each, under a label, on the ground. A white disc of 64 with the ink outline and the relief every key
 * stands on, its name under it, and its state in the small capitals. Never a sentence: what there is to say is said
 * in the sheet a button opens, after the press.
 *
 * The person a gift is for has three (app/kit/YouDecide.tsx); the person who offered it has theirs
 * (app/kit/FunderControls.tsx). The look is the stylesheet's (`.you-decide`), so both rows are one drawing.
 */
export function RoundControls({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <section className="you-decide gift-card-width" aria-label={label}>
      <p className={META}>{label}</p>
      <div className="you-decide-acts">{children}</div>
    </section>
  );
}

/** One round button: a disc with its drawing, its name in two words, and its state in the small capitals. */
export function Act({ name, state, onPress, children, ...rest }: Readonly<{ name: string; state: string; onPress: () => void; children: ReactNode; "data-decide": string }>) {
  return (
    <button type="button" className="you-decide-act" onClick={onPress} {...rest}>
      <span className="you-decide-disc">{children}</span>
      <span className="you-decide-name">{name}</span>
      <span className={`${META} you-decide-state`}>{state}</span>
    </button>
  );
}

/** The drawing of "Messages": a bell. */
export function BellMark() {
  return (
    <svg aria-hidden focusable="false" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}
