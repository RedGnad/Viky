"use client";
import type { ReactNode } from "react";
import { currencyOf } from "@/src/currencies";
import { MONEY as W } from "@/src/sentences";
import { MoneyMark } from "./MoneyMark";

/**
 * The control that says what everything on a screen is read in, and that there is a choice behind it (D152).
 *
 * The mark was a press that cycled three currencies, and nothing said so: no edge, no relief, no way to know what
 * existed or how many. In this product a thing you press carries a two pixel edge and a four pixel relief, and that
 * is what it wears now, with a chevron at the small size against its sign, which is what a list looks like
 * everywhere. It stays quiet because it keeps the size of the sign it draws, and it says what it does out loud to
 * whoever cannot see it: "Read in another currency, dollars now".
 *
 * It opens a sheet. It never changes the currency by itself: with thirty-one to choose from, a press that moved to
 * the next one would be a press nobody could aim.
 */
export function MoneyKey({ currency, onOpen, className = "" }: Readonly<{ currency: string; onOpen: () => void; className?: string }>) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={W.readInAnother(currencyOf(currency).name)}
      /* The size every control in this product keeps, 48 by 48, which clears the 44 the founder asked for and the
         44 of WCAG 2.5.5 at AAA. A sign wider than that makes the key wider; none makes it smaller. The edge and the
         chevron say it is pressed; the relief every other control stands on is left off here (the founder, 21 Sep
         2026), because the key sits inside a field's own box, and a slab inside a box read as two boxes. */
      className={`money-key inline-flex min-h-[var(--tap-target)] min-w-[var(--tap-target)] items-center gap-[2px] rounded-full border-[length:var(--control-border-width)] border-[var(--control-border)] bg-[var(--tonal)] px-[var(--space-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)] ${className}`}
    >
      <MoneyMark currency={currency} />
      <Chevron />
    </button>
  );
}

/** The one sign of a list, at the small voice's size, drawn rather than typed so it sits on the sign's own line. */
function Chevron(): ReactNode {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 24 24" className="h-[0.42em] w-[0.42em] shrink-0" style={{ minHeight: "10px", minWidth: "10px" }}>
      <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
