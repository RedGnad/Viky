/**
 * The way from the first screen to the card (D221), without leaving "#offer" in the address (D240).
 *
 * A fragment link writes its fragment into the address, and every later load of that address starts at the fragment:
 * an installed app reopening on its last address, a reload, a tab the browser restores. The founder saw the landing
 * open part way down at launch (25 Sep 2026); the cause is that address, kept from the last press on this link. So the
 * press scrolls to the card itself and writes nothing, and a stale "#offer" a device still holds from before is
 * dropped on arrival, so its next launch starts at the top. The browser's own memory of where a page was scrolled on
 * a reload is left alone: it is the browser's, and it is right.
 *
 * `window.history.replaceState` is the way Next 16 documents for changing the address without a navigation
 * (`single-page-applications.md`, "Shallow routing on the client", read in `node_modules/next/dist/docs` on
 * 25 Sep 2026): it integrates with the router rather than fighting it.
 */
export const CARD_FRAGMENT = "#offer";

/** The phrase under the card that says what a gift can wait for, as shown now, which the way to the card centres with it. */
export const FOLLOWS_CARD = "data-follows-card";

/** The room kept above the card when the card and its line are taller than the screen. */
const ROOM_ABOVE = 16;

/**
 * Where the page stops (the founder, 28 Sep 2026: the card came to the very top and its line to the very bottom): the
 * card and the line that follows it, centred together in the screen, which leaves the character just gone above. When
 * the two are taller than the screen, the card's top with a little room, so the card is never cut.
 */
export function cardScrollTop(place: Readonly<{ cardTop: number; groupBottom: number; viewport: number }>): number {
  const tall = place.groupBottom - place.cardTop;
  const top = tall <= place.viewport - 2 * ROOM_ABOVE ? place.cardTop - (place.viewport - tall) / 2 : place.cardTop - ROOM_ABOVE;
  return Math.max(0, Math.round(top));
}

/**
 * Pressed: scroll to the card and its line, smoothly where movement is welcome (`scroll-behavior` in globals.css
 * decides), put the keyboard's starting point on it as a fragment would, and write nothing in the address. Without the
 * card on the page, the browser follows the fragment as usual.
 */
export function goToTheCard(event: { preventDefault: () => void }): void {
  const card = document.getElementById(CARD_FRAGMENT.slice(1));
  if (!card) return;
  event.preventDefault();
  const line = document.querySelector(`[${FOLLOWS_CARD}]`);
  const cardTop = card.getBoundingClientRect().top + window.scrollY;
  const groupBottom = (line ?? card).getBoundingClientRect().bottom + window.scrollY;
  window.scrollTo({ top: cardScrollTop({ cardTop, groupBottom, viewport: window.innerHeight }) });
  card.focus({ preventScroll: true });
}

/** On arrival: a "#offer" left in the address by an earlier press is dropped, so the next launch starts at the top. */
export function dropStaleCardFragment(): void {
  if (window.location.hash !== CARD_FRAGMENT) return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}
