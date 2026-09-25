"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { HELP, TITLE } from "../components/ui";

/**
 * A sheet: where a case of the card is filled in (the product vision of 19 Sep 2026, sections 4 and 6).
 *
 * The rule it exists for: a case opens in a sheet at the bottom of the screen, never on another page. The card stays
 * where it is, the sheet comes up over it, and closing it puts the person back in front of the object they are
 * building rather than at the top of a new screen.
 *
 * It is a native `<dialog>` opened with `showModal`, so the browser gives what would otherwise be written by hand and
 * written badly: the focus stays inside, Escape closes it, everything behind it is inert, and a screen reader
 * announces a dialog. The backdrop closes it too, because a sheet is a place a person can leave by tapping away.
 */
export function Sheet({
  open,
  title,
  help,
  beside,
  onClose,
  children,
  footer,
  tall = false,
}: Readonly<{
  open: boolean;
  title: string;
  /** One line under the title, when the sheet needs to say what it is for. */
  help?: string;
  /** What stands beside the title, before the way out of the sheet: the character, where a sheet has one (D148). */
  beside?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** The action that ends the sheet, kept at the bottom where the thumb is. */
  footer?: ReactNode;
  /** A sheet with more to say stops a little higher, at the cap pay.html draws, and still never fills the screen. */
  tall?: boolean;
}>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const labelId = useId();
  /** Where a drag on the head began, and how far it has come: a sheet is dismissed by pulling it down. */
  const from = useRef<number | null>(null);
  const [pulled, setPulled] = useState(0);
  /** The part that scrolls, and the block inside it, so both its window and its contents can be measured. */
  const scroller = useRef<HTMLDivElement>(null);
  const inside = useRef<HTMLDivElement>(null);
  /** Which edge still has something behind it, which is what the fade is drawn from. */
  const [more, setMore] = useState<"none" | "above" | "below" | "both">("none");
  /** Whether the questions overflow the sheet, so a finger on them scrolls them and nothing else. */
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  /*
    A sheet stops at 74 % of the height (D113) and its questions scroll inside it. What was missing was the sign that
    they do: measured on a phone on 20 Sep 2026, the list of conditions showed three choices and three quarters of a
    fourth, cut against the edge of the action, with nothing saying a fifth existed. So the scrolling part is read on
    every scroll and on every change of size, its own or its contents', and it fades at whichever edge still hides
    something. When everything fits, which is most sheets most of the time, nothing is drawn.
  */
  useEffect(() => {
    const body = scroller.current;
    const block = inside.current;
    if (!body || !block) return;
    const read = () => {
      // A couple of pixels of slack: a scroll position is fractional, and an edge is either reached or it is not.
      const above = body.scrollTop > 2;
      const below = body.scrollTop + body.clientHeight < body.scrollHeight - 2;
      setMore(above && below ? "both" : above ? "above" : below ? "below" : "none");
      setScrolls(body.scrollHeight > body.clientHeight + 2);
    };
    read();
    body.addEventListener("scroll", read, { passive: true });
    const watch = new ResizeObserver(read);
    watch.observe(body);
    watch.observe(block);
    return () => {
      body.removeEventListener("scroll", read);
      watch.disconnect();
    };
  }, [open]);

  /*
    A sheet opens at the top of what it says, and starts there again whenever it changes what it says: choosing a
    condition turns the list into that condition's questions, and somebody who scrolled to press the last choice
    would otherwise arrive in the middle of the answer.

    It opened on the answer already given for one day, which is what put the chooser at 196 pixels of 720 on the
    production of 20 Sep 2026: in the middle of the list, with a sentence cut in two against the top edge.
  */
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [open, title]);

  /*
    A scroll that starts on the sheet stays on the sheet (D249, the founder, 25 Sep 2026): the page behind scrolls only
    under a gesture on the part of it the sheet leaves exposed, where the target is the dialog's own backdrop. On a
    touch screen the stylesheet does it (`touch-action` on the parts that do not scroll, `overscroll-behavior` at the
    ends of the list); a wheel has no such property, so it is stopped here, unless the list under it can scroll.
  */
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.target === element) return;
      const body = scroller.current;
      const inList = body && body.contains(event.target as Node) && body.scrollHeight > body.clientHeight + 2;
      if (!inList) event.preventDefault();
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);

  return (
    <dialog
      ref={dialog}
      className={tall ? "sheet sheet-tall" : "sheet"}
      aria-labelledby={labelId}
      // Escape, the close button and the backdrop all end in the same place: the dialog's own close event.
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
    >
      <div className="on-paper flex max-h-[inherit] flex-col" style={pulled > 0 ? { transform: `translateY(${pulled}px)` } : undefined}>
        <header
          className="flex touch-none flex-col gap-[var(--space-sm)] px-[var(--space-lg)] pt-[var(--space-sm)]"
          onPointerDown={(event) => {
            // A press on the close button is a press on the close button. Capturing the pointer for the drag
            // retargets its click to this header, and the button never hears it (the founder, 20 Sep 2026: "the
            // cross does nothing").
            if ((event.target as Element).closest("button")) return;
            from.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (from.current === null) return;
            setPulled(Math.max(0, event.clientY - from.current));
          }}
          onPointerUp={() => {
            // Far enough to mean it, and the browser closes the sheet; short of that it settles back.
            if (pulled > 80) dialog.current?.close();
            from.current = null;
            setPulled(0);
          }}
          onPointerCancel={() => {
            from.current = null;
            setPulled(0);
          }}
        >
          {/* The handle of the rendered mockups: what says this can be pulled down, and what a thumb pulls. */}
          <span aria-hidden className="mx-auto h-[5px] w-[44px] rounded-full bg-[var(--surface-rule)]" />
          <div className="flex items-start justify-between gap-[var(--space-md)]">
          <div className="space-y-[var(--space-xs)]">
            <h2 id={labelId} className={TITLE}>
              {title}
            </h2>
            {help ? <p className={HELP}>{help}</p> : null}
          </div>
          {beside ? <div className="ml-auto flex items-center">{beside}</div> : null}
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="-mr-[var(--space-sm)] -mt-[var(--space-sm)] inline-flex min-h-[var(--tap-target)] min-w-[var(--tap-target)] items-center justify-center rounded-full text-[length:var(--type-title)] transition-colors duration-[var(--hover-duration)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)] motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--paper-field)]"
          >
            <span aria-hidden="true">&times;</span>
          </button>
          </div>
        </header>
        {/*
          `flex-auto` and not `flex-1`: a basis of zero collapses this to nothing, and the sheet then stands at the
          height of its head and its action with the questions scrolled away inside. `min-h-0` is what lets it shrink
          when the sheet meets its cap, so a long list scrolls in itself instead of pushing the action out of frame.
        */}
        <div ref={scroller} data-more={more} data-scrolls={scrolls ? "yes" : "no"} className="sheet-body min-h-0 flex-auto overflow-y-auto px-[var(--space-lg)] py-[var(--space-md)]">
          <div ref={inside} className="space-y-[var(--space-md)]">
            {children}
          </div>
        </div>
        {footer ? (
          <div className="sheet-foot flex flex-col gap-[var(--tap-gap)] border-t border-[var(--divider)] px-[var(--space-lg)] pt-[var(--space-md)] pb-[calc(var(--space-lg)+env(safe-area-inset-bottom,0px))]">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
