/**
 * The mark a person comes back with once their proof is made (the founder, 10 Oct 2026).
 *
 * The verification page sends the person to one address after a proof and to another after a verification that was
 * abandoned (Reclaim's `setRedirectUrl` and `setCancelRedirectUrl`). Both were the gift's page, so the page could not
 * tell a proof made from a page loaded again, and "Shown." must never be said of something that was not. The address
 * after a proof carries this mark and the other does not. The gift's page reads it once, with the page, and takes it
 * out of the address bar, so a page loaded again does not say it a second time.
 *
 * It names nothing and opens nothing: written by hand it changes one headline, on the writer's own page, and only
 * while a verification of theirs is open.
 */
export const SHOWN_MARK = "shown";

/** The gift's page as the person is brought back to it with a proof made, under the site's own address. */
export const shownReturnPath = (giftId: string) => `/g/${giftId}?${SHOWN_MARK}=1`;

/** Whether the page was asked for with the mark. */
export const cameBackShown = (value: string | string[] | undefined) => value === "1";

/** An address of this site without the mark, as the bar shows it once the page has read it. */
export function withoutShownMark(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(SHOWN_MARK);
  return `${url.pathname}${url.search}${url.hash}`;
}
