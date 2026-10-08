/**
 * The gift a payment made a moment ago, kept for the one screen that follows it: the gift's own page, since the UI
 * pass of 8 Oct 2026 (screen 3). The character at the head of that page answers the payment, once, as it did on the
 * screen that stood there before (V4, decision B): arriving from the payment plays it, and loading the page again
 * does not.
 *
 * In the tab's own session and nowhere else. Read as the page is first drawn, and forgotten once it has been: reading
 * changes nothing, so a page drawn twice by React reads the same thing both times.
 */

const KEY = "viky.justMade";

export function markJustMade(giftId: string): void {
  try {
    window.sessionStorage.setItem(KEY, giftId);
  } catch {
    // A browser that refuses storage still made the gift: only the character's arrival is not played.
  }
}

/** Whether this gift was made a moment ago in this tab. */
export function wasJustMade(giftId: string): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === giftId;
  } catch {
    return false;
  }
}

/** The arrival was played: the next load of the page is a load, not a payment. */
export function forgetJustMade(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing was kept, so nothing is left to forget.
  }
}
