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

/**
 * Pressed: scroll to the card, smoothly where movement is welcome (`scroll-behavior` in globals.css decides), put the
 * keyboard's starting point on it as a fragment would, and write nothing in the address. Without the card on the
 * page, the browser follows the fragment as usual.
 */
export function goToTheCard(event: { preventDefault: () => void }): void {
  const card = document.getElementById(CARD_FRAGMENT.slice(1));
  if (!card) return;
  event.preventDefault();
  card.scrollIntoView({ block: "start" });
  card.focus({ preventScroll: true });
}

/** On arrival: a "#offer" left in the address by an earlier press is dropped, so the next launch starts at the top. */
export function dropStaleCardFragment(): void {
  if (window.location.hash !== CARD_FRAGMENT) return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}
