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
/** The small print under that phrase, which the way to the card keeps below the screen where it can. */
export const CARD_NOTE = "data-card-note";

/** The room kept above the card when the card and its line are taller than the screen. */
const ROOM_ABOVE = 16;
/** Below this width the screen is a phone's, where the small print leaves first; above it, the character does. */
export const PHONE_WIDTH = 600;

export type CardPlace = Readonly<{
  cardTop: number;
  /** The bottom of the phrase's shown text. */
  groupBottom: number;
  viewport: number;
  /** The lowest point of the character above the card that a cut would show: its body and its hands, not its legs. */
  heroBottom?: number;
  /** The top of the small print under the phrase. */
  noteTop?: number;
  phone?: boolean;
}>;

/**
 * Where the page stops (the founder, 28 Sep 2026): the card and the phrase shown under it centred together, as close
 * as the two edges allow. Above, no piece of the character cut by the top of the screen; below, no small print cut by
 * its bottom. When both cannot be had, a phone lets the character's hands show before the small print, and a larger
 * screen the small print before the character (his word for each). When the card and its phrase are taller than the
 * screen, the card's top with a little room, so the card is never cut.
 */
export function cardScrollTop(place: CardPlace): number {
  const tall = place.groupBottom - place.cardTop;
  if (tall > place.viewport - 2 * ROOM_ABOVE) return Math.max(0, Math.round(place.cardTop - ROOM_ABOVE));
  const centred = place.cardTop - (place.viewport - tall) / 2;
  const lowest = place.heroBottom ?? -Infinity;
  const highest = place.noteTop === undefined ? Infinity : place.noteTop - place.viewport;
  let top = centred;
  if (lowest <= highest) top = Math.min(Math.max(centred, lowest), highest);
  else top = place.phone ? highest : lowest;
  // Never so far that the card's own top leaves the screen.
  return Math.max(0, Math.round(Math.min(top, place.cardTop)));
}

/** Where an element sits on the page, from the top of the page. */
const onThePage = (box: DOMRect, edge: "top" | "bottom") => box[edge] + window.scrollY;

/**
 * Pressed: scroll to the card and its phrase, smoothly where movement is welcome (`scroll-behavior` in globals.css
 * decides), put the keyboard's starting point on it as a fragment would, and write nothing in the address. Without the
 * card on the page, the browser follows the fragment as usual.
 */
export function goToTheCard(event: { preventDefault: () => void }): void {
  const card = document.getElementById(CARD_FRAGMENT.slice(1));
  if (!card) return;
  event.preventDefault();
  const cardTop = onThePage(card.getBoundingClientRect(), "top");
  // The phrase's shown text, not its element, which keeps the room of the longest phrase.
  const said = document.querySelector(`[${FOLLOWS_CARD}]`);
  let groupBottom = onThePage(card.getBoundingClientRect(), "bottom");
  if (said) {
    const range = document.createRange();
    range.selectNodeContents(said);
    groupBottom = onThePage(range.getBoundingClientRect(), "bottom");
  }
  const parts = Array.from(document.querySelectorAll('.hero-stage [data-part="body"], .hero-stage [data-part="arm"], .hero-stage [data-part="hand"]'));
  const heroBottom = parts.length ? Math.max(...parts.map((part) => onThePage(part.getBoundingClientRect(), "bottom"))) : undefined;
  const note = document.querySelector(`[${CARD_NOTE}]`);
  const noteTop = note ? onThePage(note.getBoundingClientRect(), "top") : undefined;
  const place = { cardTop, groupBottom, viewport: window.innerHeight, heroBottom, noteTop, phone: window.innerWidth < PHONE_WIDTH };
  window.scrollTo({ top: cardScrollTop(place) });
  card.focus({ preventScroll: true });
}

/** On arrival: a "#offer" left in the address by an earlier press is dropped, so the next launch starts at the top. */
export function dropStaleCardFragment(): void {
  if (window.location.hash !== CARD_FRAGMENT) return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}
