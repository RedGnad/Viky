import { TRADEMARKS } from "@/src/sentences";
import { HELP } from "../components/ui";

/**
 * What the owner of a mark asks at the bottom of a page that names it (the founder, 5 Oct 2026). ETS, for the TOEFL:
 * its notice "at the bottom of each web page", "in a legible print size and color so that it is easily read"
 * (ets.org/legal/trademarks.html, read on 5 Oct 2026). Small and readable, in the quiet voice.
 *
 * With `naming`, the words a page prints that may or may not name the mark, a gift's condition or the lines of a list:
 * the notice is drawn only when one of them does. Without it, the page names the mark whatever it shows.
 */
export function namesTheMark(naming: readonly (string | null | undefined)[]): boolean {
  return naming.some((words) => typeof words === "string" && words.includes(TRADEMARKS.ets.name));
}

export function MarkNotice({ naming, className = "" }: Readonly<{ naming?: readonly (string | null | undefined)[]; className?: string }>) {
  if (naming && !namesTheMark(naming)) return null;
  return (
    <p data-mark-notice="" className={`${HELP} ${className}`}>
      {TRADEMARKS.ets.notice}
    </p>
  );
}
