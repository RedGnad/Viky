"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAccount } from "@/src/account/provider";
import { DISPLAY, META, TITLE } from "../components/ui";
import { Appearance } from "./Appearance";
import { BackLink } from "./BackLink";
import { HeadCharacter } from "./HeadCharacter";
import { Mark } from "./Mark";
import { useRevealOnScroll } from "./Motion";
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
      /**
       * What the page lays under its column, from one edge of the window to the other: the landing's posters, whose
       * grounds run the whole width (the founder, 5 Oct 2026). Outside the column, so nothing there is held to it, and
       * outside what enters and what is revealed block by block: it has its own movement.
       */
      under?: ReactNode;
      /**
       * The character at the head of this screen, opposite its title (D154). Every screen of the app carries it now,
       * not only the ones a gift is made on: it is the one thing here that answers a gesture.
       */
      character?: ReactNode;
      children: ReactNode;
    }>
  | Readonly<{
      kind: "task";
      back?: string;
      backLabel?: string;
      /** The back link goes to `back` itself rather than one step back through the browser's history. */
      backFollows?: boolean;
      /**
       * The character at the head of this screen, opposite the way back (D148). A task that does not ask for one
       * keeps the head it had: the row is only drawn when there is somebody to put in it.
       */
      character?: ReactNode;
      /** "Step 2 of 5", above the step's title (GOV.UK's caption), in the meta voice: it says where you are. */
      caption?: string;
      step?: ReactNode;
      children: ReactNode;
    }>
  | Readonly<{ kind: "document"; back?: string; backLabel?: string; character?: ReactNode; children: ReactNode }>;

/**
 * Whether this document has drawn a screen already (D198). The first screen of a document is drawn whole and still,
 * because on a reload it replaces the same screen on the glass and an entrance would be that screen going out and
 * coming back. Every screen after it is reached by a navigation, where the template builds it anew and it enters.
 * A module variable rather than state: the server never sets it, so the server and the browser's first render agree.
 */
let aScreenWasDrawn = false;

export function Shell(props: Props) {
  const [enters] = useState(() => aScreenWasDrawn);
  useEffect(() => {
    aScreenWasDrawn = true;
  }, []);
  /**
   * The character stands on every screen, not only on Home (the life of the product, step 3, 23 Sep 2026): a screen
   * that names none is given the head character, which carries the gaze, the two hover expressions and the reactions
   * of D181. The page without an account is the one exception: it draws its own, larger, beside its title.
   */
  const main = useRef<HTMLElement>(null);
  useRevealOnScroll(main);
  // Whom this screen was drawn for, readable on the page itself: the server's answer is in the first byte, so a screen
  // drawn for nobody and then replaced by the account's is visible to a test and to the trace (D196).
  const { address } = useAccount();
  const character = props.character !== undefined ? props.character : props.kind === "destination" && props.bare ? null : <HeadCharacter />;
  /**
   * The three destinations share one column, the gift card's with the page's margins (the founder, 4 Oct 2026): Gifts
   * and Me took 680, so the column changed width from one tab to the next and a gift's card there was 632 wide,
   * against the rule of 20 Sep 2026 that a gift card is 440 and never wider.
   *
   * The column of this page, its margins included: what the page is held to, and what every sheet over it is as wide
   * as, so a sheet's edges fall on the page's as they do on a phone (the founder, 4 Oct 2026). It was 560 over a card
   * of 440, which no mockup had decided. The page without an account is as wide as its widest line from 1024
   * (`.home-column`), and what a sheet covers there is the card: its column is the card's.
   */
  const column = props.kind === "task" ? "var(--app-column-max)" : props.kind === "document" ? "var(--prose-max)" : "calc(var(--gift-card-width) + 2 * var(--page-margin))";
  const width = props.kind === "destination" && props.wide ? "home-column" : "max-w-[var(--page-column)]";
  /**
   * The rail and the bar are drawn on a destination that is somebody's, and nowhere else (`Nav` draws nothing without
   * an account). No rail drawn, no room kept (D127, and the founder, 4 Oct 2026): Gifts and Me without an account kept
   * the rail's room, and their column stood 44 pixels right of the window's middle.
   */
  const rail = props.kind === "destination" && !props.bare && Boolean(address);
  // Room for the bar below it and beside the rail on a destination; a task and a document have neither.
  const room = rail ? "page-beside-the-rail pb-[calc(var(--nav-bar-height)+var(--space-xl))] [@media(min-width:840px)]:pb-[var(--space-xl)] pl-[var(--page-offset)]" : "";

  return (
    <>
      {/* The offset a sheet is placed by is zero everywhere, and the rail's width only here, where the rail is drawn
          (`.page-beside-the-rail`, the founder, 4 Oct 2026). It was the rail's width on every page from 840, taken
          back for one kind of page at a time (20 Sep 2026, then D137): a task and a document draw no rail and kept
          it, so every sheet over a gift's page, a payment or a withdrawal stood 44 pixels right of its page. */}
      <div className={room} data-page-kind={props.kind} style={{ "--page-column": column } as CSSProperties}>
        {/* Everything this page carries enters when the page is reached from another, 250 ms, once, block by block
            (D146, D171); the mark and the appearance control stand still, because they are in the same place on every
            screen. The first screen a document draws is drawn whole and still (D198): on a reload it replaces itself
            on the glass, and entering would be going out and coming back. */}
        <main ref={main} data-drawn-for={address ? "account" : "nobody"} className={`${enters ? "page-enters " : ""}mx-auto flex w-full ${width} flex-col gap-[var(--space-xl)] px-[var(--page-margin)] py-[var(--space-lg)]`}>
          <header className="flex flex-col items-start gap-[var(--space-sm)]">
            <div className="page-mark flex w-full items-center justify-between gap-[var(--space-md)]">
              <Mark />
              <div className="flex items-center gap-[var(--space-sm)]">
                <Appearance />
                {props.kind === "destination" && props.action ? props.action : null}
              </div>
            </div>
            {props.kind === "task" && character ? (
              <div className="flex w-full items-center justify-between gap-[var(--space-md)]">
                {props.back ? <BackLink href={props.back} label={props.backLabel} follow={props.backFollows} /> : <span />}
                {character}
              </div>
            ) : props.kind === "task" && props.back ? (
              <BackLink href={props.back} label={props.backLabel} follow={props.backFollows} />
            ) : null}
            {props.kind === "document" && character ? (
              <div className="flex w-full items-center justify-between gap-[var(--space-md)]">
                {props.back ? <BackLink href={props.back} label={props.backLabel} /> : <span />}
                {character}
              </div>
            ) : props.kind === "document" && props.back ? (
              <BackLink href={props.back} label={props.backLabel} />
            ) : null}
            {props.kind === "task" && props.caption ? <p className={META}>{props.caption}</p> : null}
            {props.kind === "task" && props.step ? <h1 className={TITLE}>{props.step}</h1> : null}
            {/* Room between the mark and a destination's title, which grows with the title: the two faces touched at 1 440.
                The character stands at the end of that row, where a task carries it beside the way back (D154). */}
            {props.kind === "destination" && (props.title || character) ? (
              <div className="flex w-full items-end justify-between gap-[var(--space-md)] mt-[var(--space-sm)] [@media(min-width:840px)]:mt-[var(--space-xl)]">
                {props.title ? <h1 className={DISPLAY}>{props.title}</h1> : <span />}
                {character}
              </div>
            ) : null}
          </header>
          {props.children}
        </main>
        {props.kind === "destination" && props.under ? <div data-under-the-column="">{props.under}</div> : null}
      </div>
      {rail && props.kind === "destination" ? <Nav active={props.active} /> : null}
    </>
  );
}
