import Link from "next/link";
import type { ReactNode } from "react";
import { TITLE } from "./ui";

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
 */
export function Screen({
  title,
  back,
  backLabel = "Back",
  layout = "journey",
  look,
  aside,
  children,
}: Readonly<{
  title?: string;
  back?: string;
  backLabel?: string;
  layout?: "journey" | "destination" | "document";
  /**
   * The look the screen wears. Left out, it is the calm look every other screen wears today. `poster` is the
   * direction the funder chose on 15 Sep, which app/globals.css hands to the whole document while this screen
   * is on it. The signed-out home and the funder journey ask for it so far; a screen that follows joins by asking
   * too.
   */
  look?: "poster";
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
   * A journey sits in the middle of a tall screen instead of clinging to the top of it. Found by opening the
   * product on a desktop rather than by photographing it: one short card at the top of a 900 pixel page,
   * with the bottom half dead, is what "mobile only" actually looks like, and centring the column was the
   * missing half of keeping it narrow.
   *
   * Done with `my-auto` on the inner block rather than `justify-center` on the outer one, because
   * `justify-content: center` clips the top of anything taller than the screen and a long step would lose
   * its own heading.
   */
  const inner = layout === "journey" ? "my-auto" : "";

  return (
    <main
      data-look={look}
      className={`mx-auto flex ${layout === "journey" ? "min-h-[100svh] " : ""}w-full ${width} flex-col px-[var(--page-margin)] py-[var(--space-xl)]`}
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
          {title ? <h1 className={TITLE}>{title}</h1> : null}
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
