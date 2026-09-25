import type { DisplayCurrency } from "@/src/display-currency";
import { currencyMark } from "@/src/amount-in-currency";

/**
 * The money marks, drawn by hand in the house's own line (the founder, 21 Sep 2026).
 *
 * Neither face we have could carry them. The title face draws a dollar whose bar barely leaves its S, which is what
 * the founder rejected on 20 Sep; the text face draws a conventional one, and beside a figure in the title face it is
 * visibly another hand, which is what he rejected on 21 Sep. So the two symbols are drawn: the conventional skeleton,
 * an S through a bar and a C through two bars, in one even stroke with round ends, which is the line the characters
 * and the controls are already drawn in.
 *
 * They are built to the measured figure rather than to taste. Fredoka 600 at the card's own 39 pixels: a figure is 29
 * pixels tall and its stem is 6.5 (`review-captures/measure-fredoka.ts`, 21 Sep 2026). So a unit here is a pixel at a
 * 39 pixel figure, the stroke is 6, the euro stands 29 tall on the line, and the dollar's bar is the one thing that
 * passes below it. Everything is in `em`, so a mark drawn for the card is the same mark at any size.
 *
 * The CFA franc has no symbol in use: it is its letters, and its letters are the title face's own, at the same cap
 * height as these two. Nothing is drawn for it.
 */

/**
 * The euro: a C in one stroke, two bars through it, 29 tall on the line. Where the bars sit is the founder's eye twice
 * over (25 Sep 2026): centred at x 9, well inside the bowl, they sat too far right; centred on the arc's crossing (x
 * 3.3, D257), too far left. They are centred half way between the two, at x 6.2, the upper 11 long and the lower 10,
 * which leaves a little more of each bar outside the bowl than inside it, as the drawn sign does.
 */
function Euro() {
  return (
    <svg
      viewBox="-2.3 0 22.9 29"
      aria-hidden
      focusable="false"
      style={{ height: "0.7436em", width: "0.5872em" }}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      <path d="M17.35 5.95 A 8.6 11.5 0 1 0 17.35 23.05" strokeWidth="6" />
      <path d="M0.7 11.3 H 11.7" strokeWidth="5.2" />
      <path d="M1.2 18.1 H 11.2" strokeWidth="5.2" />
    </svg>
  );
}

/** The dollar: the same stroke, an S, and the bar through it, which is the only part that passes the line. */
function Dollar() {
  return (
    <svg
      viewBox="0.2 -4.2 20 34.8"
      aria-hidden
      focusable="false"
      style={{ height: "0.8718em", width: "0.5011em", verticalAlign: "-0.05em" }}
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
    >
      <path d="M17.2 7.6 C 17.2 3.9 14.1 1.4 10.2 1.4 C 6.6 1.4 3.2 3.6 3.2 7.2 C 3.2 11.2 7.3 12.6 10.2 13.5 C 13.5 14.5 17.2 15.9 17.2 19.8 C 17.2 23.4 13.8 25.6 10.2 25.6 C 6.6 25.6 3.2 23.4 3.2 19.6" />
      <path d="M10.2 -1.2 V 27.6" />
    </svg>
  );
}

/**
 * The mark of the currency a figure is read in, at the size of the words around it.
 *
 * The franc's letters are set smaller than the figure, which is what every money app does with a code rather than a
 * symbol, and it is what keeps three letters from reading as part of the number. At 0.58 of the card's figure they
 * also fit inside the same 48 pixel control the two symbols sit in, so the field beside the mark stands in the same
 * place whichever currency is being read (the founder, 21 Sep 2026).
 */
export function MoneyMark({ currency }: Readonly<{ currency: DisplayCurrency }>) {
  if (currency === "USD") return <Dollar />;
  if (currency === "EUR") return <Euro />;
  return (
    <span aria-hidden className="text-[0.58em] tracking-[0]">
      {currencyMark(currency).sign}
    </span>
  );
}
