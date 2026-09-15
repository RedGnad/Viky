import type { ReactNode } from "react";
import { Drop, type Mood } from "./Drop";
import { MONEY, PROSE, TITLE } from "./ui";

/**
 * The four moments that are not ordinary: a gift is ready, a day is earned, a gift is opened, a gift is over.
 *
 * Everything else in Viky sits on calm paper, because a form, an amount and a card payment are not occasions.
 * This is where the colour goes, and it goes exactly where both published systems say it may: into the
 * surface and the shapes, never into the words. The text on it is the same text colour as everywhere else and
 * clears 4.5:1 on this surface too.
 *
 * The shapes behind the drop are organic rather than geometric, which is the whole of what is borrowed from
 * the game the funder pointed at: its principles, never its characters, which belong to Sony.
 */
export function Moment({
  mood = "cheering",
  headline,
  amount,
  children,
}: Readonly<{ mood?: Mood; headline: string; amount?: string; children?: ReactNode }>) {
  return (
    <section className="relative overflow-hidden rounded-[var(--radius-sheet)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--joy)] px-[var(--space-lg)] py-[var(--space-xxl)] text-center">
      {/* Two soft blobs, behind everything, purely decorative and never carrying meaning. */}
      {/* The height is set inline because the document's rule that stops an image pushing the page sideways gives
          every svg an automatic height, which stopped the blobs short of the bottom with a hard edge showing. The
          wave runs past the right edge for the same reason: it used to end at 250 of 300. */}
      <svg aria-hidden focusable="false" className="pointer-events-none absolute inset-0 w-full" style={{ height: "100%" }} preserveAspectRatio="none" viewBox="0 0 300 200">
        <path d="M-20 60c40-50 90 10 140-20s130 20 200-30v200H-20Z" fill="var(--surface)" opacity="0.28" />
        <circle cx="262" cy="34" r="34" fill="var(--surface)" opacity="0.35" />
        <circle cx="36" cy="168" r="26" fill="var(--surface)" opacity="0.3" />
      </svg>

      <div className="relative flex flex-col items-center gap-[var(--space-md)]">
        <Drop mood={mood} />
        <h2 className={TITLE}>{headline}</h2>
        {amount ? <p className={MONEY}>{amount}</p> : null}
        {children ? <div className={`${PROSE} text-balance`}>{children}</div> : null}
      </div>
    </section>
  );
}
