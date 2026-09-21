"use client";
import { useEffect, useState } from "react";

/**
 * Whether this document has already drawn a screen (D160).
 *
 * The entrance of step 1 says a page changed: blocks rise one after another, each waiting its turn. That is true of
 * a screen reached from another screen, and it is not true of the first one a document draws, where there is nothing
 * to have come from. There it only means the page is visibly incomplete for as long as the turns last: the founder
 * saw the words fade in over an empty space where the card goes, and read it as the page loading a second time.
 *
 * So the first screen arrives, and every screen after it enters. The server always draws a first screen, so its HTML
 * and the first render in the browser agree; a navigation rebuilds the screen, and by then this says so.
 *
 * The answer is taken once, when the screen is built, and never again while it stands. Read on every render instead,
 * it flips under the screen the moment anything else changes, the class on the page changes with it, and every block
 * plays its entrance a second time: which is the very thing this is here to stop.
 */
let drawnBefore = false;

export function useHasDrawnBefore(): boolean {
  const [before] = useState(() => drawnBefore);
  useEffect(() => {
    drawnBefore = true;
  }, []);
  return before;
}
