import type { CSSProperties, ReactNode } from "react";
import { DISPLAY, META, TITLE } from "../components/ui";
import { Appearance } from "./Appearance";
import { BackLink } from "./BackLink";
import { Mark } from "./Mark";
import { Nav, type Destination } from "./Nav";

/**
 * What every screen shares (the product structure of 17 Sep 2026, section 3).
 *
 * At the top, the mark. Below 840 pixels a destination has the bar of three destinations at the bottom; from
 * 840 the rail on the left, and the column sits centred in the space beside it, never floating in the void. A
 * task has neither: the mark, one way back at the same place on every step, and the step's title, in a narrow
 * column (GOV.UK: "back link, page heading, continue button"). A document is prose, capped at the line length.
 *
 * The bar and the rail draw nothing without an account, so the promise page and a gift opened from a link are
 * a column and the mark, which is all a person without an account has anywhere to go.
 *
 * Opposite the mark, on every kind of screen, the appearance control (D97). Where a screen also has an action there,
 * the appearance sits before it and stays the quieter of the two.
 */
type Props =
  | Readonly<{
      kind: "destination";
      active: Destination;
      title?: string;
      /** One small action in the header, opposite the mark: the door, on the page without an account (brief, section 7). */
      action?: ReactNode;
      /**
       * The page without an account: no bar, no rail, and no room kept for the rail either, so the column is centred
       * in the window itself (D127). Without this the column sat 88 px right of centre on a wide screen for a rail
       * that draws nothing.
       */
      bare?: boolean;
      /** The page without an account: the column of `.home-column`, the card's width below 1024 and the title's from it (D130). */
      wide?: boolean;
      /** Home with an account: the column is the card's width plus its margins, so everything shares its edges (D128). */
      width?: "card";
      children: ReactNode;
    }>
  | Readonly<{
      kind: "task";
      back?: string;
      backLabel?: string;
      /** The back link goes to `back` itself rather than one step back through the browser's history. */
      backFollows?: boolean;
      /** "Step 2 of 5", above the step's title (GOV.UK's caption), in the meta voice: it says where you are. */
      caption?: string;
      step?: ReactNode;
      children: ReactNode;
    }>
  | Readonly<{ kind: "document"; back?: string; backLabel?: string; children: ReactNode }>;

export function Shell(props: Props) {
  const width =
    props.kind === "task"
      ? "max-w-[var(--app-column-max)]"
      : props.kind === "document"
        ? "max-w-[var(--prose-max)]"
        : props.width === "card"
          ? "max-w-[calc(var(--gift-card-width)+2*var(--page-margin))]"
          : props.wide
            ? "home-column"
            : "max-w-[var(--destination-max)]";
  // Room for the bar below it and beside the rail on a destination; a task and a document have neither.
  const room =
    props.kind === "destination" && !props.bare
      ? "pb-[calc(var(--nav-bar-height)+var(--space-xl))] [@media(min-width:840px)]:pb-[var(--space-xl)] pl-[var(--page-offset)]"
      : "";

  return (
    <>
      {/* The page without an account draws no rail, so it keeps no room for one: the offset the sheets are placed by
          is zero there (D137). At 88 it pushed every sheet that many pixels right of the window's middle, which is
          what the founder measured on the catalogue. */}
      <div className={room} style={props.kind === "destination" && props.bare ? ({ "--page-offset": "0px" } as CSSProperties) : undefined}>
        <main className={`mx-auto flex w-full ${width} flex-col gap-[var(--space-xl)] px-[var(--page-margin)] py-[var(--space-lg)]`}>
          <header className="flex flex-col items-start gap-[var(--space-sm)]">
            <div className="flex w-full items-center justify-between gap-[var(--space-md)]">
              <Mark />
              <div className="flex items-center gap-[var(--space-sm)]">
                <Appearance />
                {props.kind === "destination" && props.action ? props.action : null}
              </div>
            </div>
            {props.kind === "task" && props.back ? <BackLink href={props.back} label={props.backLabel} follow={props.backFollows} /> : null}
            {props.kind === "document" && props.back ? <BackLink href={props.back} label={props.backLabel} /> : null}
            {props.kind === "task" && props.caption ? <p className={META}>{props.caption}</p> : null}
            {props.kind === "task" && props.step ? <h1 className={TITLE}>{props.step}</h1> : null}
            {/* Room between the mark and a destination's title, which grows with the title: the two faces touched at 1 440. */}
            {props.kind === "destination" && props.title ? (
              <h1 className={`${DISPLAY} mt-[var(--space-sm)] [@media(min-width:840px)]:mt-[var(--space-xl)]`}>{props.title}</h1>
            ) : null}
          </header>
          {props.children}
        </main>
      </div>
      {props.kind === "destination" && !props.bare ? <Nav active={props.active} /> : null}
    </>
  );
}
