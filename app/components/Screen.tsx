import Link from "next/link";
import type { ReactNode } from "react";
import { TITLE } from "./ui";

/**
 * The shape of every screen, in one place.
 *
 * The margin, the column width and the vertical rhythm were decided per screen before this existed, which is
 * why the home page centred itself vertically while the funder screen did not. Now there is one answer: a
 * single column, 16px of margin on a phone and 24px from 600px wide, capped at 480px so a line of prose can
 * never run past what any published range calls readable.
 *
 * `back` is what makes a journey a journey: the structure has no menu and no tabs, because GOV.UK asks for no
 * navigation links when a service has a clear end-to-end path, and Apple reserves a tab bar for navigating
 * rather than for acting. A screen in a journey offers exactly one way back.
 */
export function Screen({
  title,
  back,
  backLabel = "Back",
  children,
}: Readonly<{
  title?: string;
  /** Where the one way back goes. A destination has none; a step in a journey always does. */
  back?: string;
  backLabel?: string;
  children: ReactNode;
}>) {
  return (
    <main className="mx-auto flex w-full max-w-[var(--app-column-max)] flex-col gap-[var(--space-xl)] px-[var(--page-margin)] py-[var(--space-xl)]">
      {back || title ? (
        <header className="flex flex-col gap-[var(--space-sm)]">
          {back ? (
            <Link
              href={back}
              className="inline-flex min-h-[var(--tap-target)] items-center self-start text-[length:var(--type-body)] text-[var(--accent-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
            >
              {backLabel}
            </Link>
          ) : null}
          {title ? <h1 className={TITLE}>{title}</h1> : null}
        </header>
      ) : null}
      {children}
    </main>
  );
}
