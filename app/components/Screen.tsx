import Link from "next/link";
import type { ReactNode } from "react";
import { DISPLAY, TITLE } from "./ui";

/**
 * The shape of every screen, in one place, and there are two shapes because there are two kinds of screen.
 *
 * A **journey** is one thing at a time with a way back: give a gift, take one, connect Duolingo, take money
 * out. It stays a narrow column at every size, because a line of text and a form both read badly wide and
 * because a journey has nothing to put beside itself.
 *
 * A **destination** is read rather than walked through: the home, a gift, the account. It grows with the
 * screen, and from 840 pixels it becomes two panes, because that is the first width where two of Material's
 * own 360 default panes plus its 24 spacer and two 24 margins actually fit.
 *
 * A **document** is a wall of prose: privacy, the legal notice. It is capped at the line length and nothing
 * else, because the opposite mistake to a narrow strip is a legal page whose lines run 115 characters across
 * a desktop. Both were live at the same time, on different pages, and both are what "not a design pass"
 * looks like.
 *
 * Capping the whole product at a journey's width was the mistake this replaces: it made Viky mobile only
 * rather than mobile first, a narrow strip floating in the middle of a desktop with two thirds of the screen
 * empty. A line length is a rule about text and about forms, never about a container.
 *
 * `back` is what makes a journey a journey. The structure has no menu and no tabs: GOV.UK asks for no
 * navigation links when a service has a clear end-to-end path, and Apple reserves a tab bar for navigating
 * rather than for acting. A screen in a journey offers exactly one way back; a destination offers none.
 *
 * Every screen wears the poster look, the direction the funder chose on 15 Sep. The `data-look="poster"` below is
 * what app/globals.css hands to the whole document, so a screen drawn through this component inherits the look
 * without styling of its own (D71). A destination and a document open with the display title, the page's own; a
 * journey's title is one step's, so it keeps the ordinary title size.
 */
export function Screen({
  title,
  back,
  backLabel = "Back",
  layout = "journey",
  aside,
  children,
}: Readonly<{
  title?: string;
  back?: string;
  backLabel?: string;
  layout?: "journey" | "destination" | "document";
  /**
   * The second pane, on a destination. Below 840 it simply follows the first, in one column, so nothing is
   * hidden from a phone and nothing is invented for a desktop.
   */
  aside?: ReactNode;
  children: ReactNode;
}>) {
  const width =
    layout === "journey"
      ? "max-w-[var(--app-column-max)]"
      : layout === "document"
        ? "max-w-[var(--prose-max)]"
        : "max-w-[var(--destination-max)] [@media(min-width:840px)]:max-w-[1100px]";

  /**
   * A journey used to sit in the middle of a tall screen, and it does not any more. Centring a short step moved
   * "Back to my gifts" and the title by up to a hundred pixels between one step of the way out and the next, on
   * every screen of a journey about money (the reviewer's finding of 17 Sep 2026, decided by the founder the
   * same day): the way back stays in the same place on every screen, whatever the step holds.
   */
  const inner = "";

  return (
    <main
      data-look="poster"
      className={`mx-auto flex w-full ${width} flex-col px-[var(--page-margin)] py-[var(--space-xl)]`}
    >
      <div className={`${inner} flex w-full flex-col gap-[var(--space-xl)]`}>
      {back || title ? (
        <header className="flex flex-col items-start gap-[var(--space-sm)]">
          {/* Pulled left by its own padding so the word stays flush with the page margin while the target
              around it is a full 48 wide. A short label is the usual way a back link ends up too small. */}
          {back ? (
            <Link
              href={back}
              className="-ml-[var(--space-md)] inline-flex min-h-[var(--tap-target)] min-w-[var(--tap-target)] items-center px-[var(--space-md)] text-[length:var(--type-body)] text-[var(--accent-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
            >
              {backLabel}
            </Link>
          ) : null}
          {title ? <h1 className={layout === "journey" ? TITLE : DISPLAY}>{title}</h1> : null}
        </header>
      ) : null}

      {layout === "destination" && aside ? (
        <div className="grid gap-[var(--space-xl)] [@media(min-width:840px)]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] [@media(min-width:840px)]:items-start">
          <div className="flex flex-col gap-[var(--space-xl)]">{children}</div>
          <div className="flex flex-col gap-[var(--space-xl)]">{aside}</div>
        </div>
      ) : (
        children
      )}
      </div>
    </main>
  );
}
