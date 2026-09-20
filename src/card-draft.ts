import { draftFromTerms, draftToTerms, STARTING_DRAFT, type GiftDraft } from "./gift-draft";
import { cardDraftFrom, PENDING_GIFT_STORAGE_KEY, saveCardDraft } from "./pending-gift";

/**
 * The card being filled in, as a store the screens read rather than a copy each of them keeps.
 *
 * Why a store and not state: the card is written on the device (D74), and the device is the truth. A screen that
 * copied it into React state would have to read that copy back in an effect, which React says not to do and which
 * would make the first render in the browser disagree with the page the server drew. `useSyncExternalStore` is the
 * answer React gives for exactly this: the server's snapshot is an empty card, the browser's is whatever the device
 * kept, and a write tells every screen at once.
 *
 * It also means the card on Home and the paying screen cannot drift: there is one gift, in one place.
 */

const listeners = new Set<() => void>();
let lastRaw: string | null | undefined;
let last: GiftDraft = STARTING_DRAFT;

function raw(): string | null {
  try {
    return window.localStorage.getItem(PENDING_GIFT_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Told when this page writes, and when another tab does (the browser's own `storage` event). */
export function subscribeToCardDraft(changed: () => void): () => void {
  listeners.add(changed);
  window.addEventListener("storage", changed);
  return () => {
    listeners.delete(changed);
    window.removeEventListener("storage", changed);
  };
}

/**
 * The same object until what is written changes, because React compares snapshots by identity and a fresh object
 * every time would render for ever.
 */
export function cardDraft(): GiftDraft {
  const now = raw();
  if (now !== lastRaw) {
    lastRaw = now;
    const terms = cardDraftFrom(now, Date.now());
    last = terms ? draftFromTerms(terms) : STARTING_DRAFT;
  }
  return last;
}

/**
 * What the server draws, and what a device with nothing kept on it shows: the starting card, a plausible gift with
 * the first name left empty (the founder, 20 Sep 2026). A server knows nobody's device, so this is also the
 * snapshot React renders on the server and hydrates against.
 */
export function startingCardDraft(): GiftDraft {
  return STARTING_DRAFT;
}

/** Writes the card to the device and tells every screen reading it. */
export function writeCardDraft(draft: GiftDraft, account: string | undefined): void {
  saveCardDraft(draftToTerms(draft, account));
  lastRaw = undefined;
  for (const changed of [...listeners]) changed();
}

/** Forgotten, once the gift is made or the person asks for a different one. */
export function clearedCardDraft(): void {
  lastRaw = undefined;
  for (const changed of [...listeners]) changed();
}
