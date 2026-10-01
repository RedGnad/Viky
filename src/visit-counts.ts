/**
 * What a visit count may say of the page it counts (the founder, 1 Oct 2026). Browser safe.
 *
 * Vercel Web Analytics counts page views with no cookie, and would send the page's whole address. Two things in an
 * address of Viky's are not statistics: the key of a gift's link (`?t=`), which opens the gift for whoever holds it,
 * and the gift's number, which would make one line per gift. So everything after the path is dropped, whatever it is,
 * and a gift's page is counted as one page, under the name its route has (`/g/[id]`).
 */

/** The place every gift's page is counted under. */
export const GIFT_PAGE_COUNTED_AS = "/g/[id]";

/** A page's path as a visit count may carry it: a gift's page without its number, every other page as itself. */
export function countedPath(path: string): string {
  return path.replace(/^\/g\/[^/?#]+/, GIFT_PAGE_COUNTED_AS);
}

/** A page's address as a visit count may carry it: no query, no fragment, no gift number. */
export function countedAddress(address: string): string {
  const counted = new URL(address);
  counted.search = "";
  counted.hash = "";
  counted.pathname = countedPath(counted.pathname);
  return counted.toString();
}
