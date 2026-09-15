import { dollarsToUnits } from "./money";

/**
 * The gift a funder set up before paying, kept on the device until it is made (D74).
 *
 * The defect it answers, measured on 15 Sep: the card payment took twelve minutes from order to arrival, the passkey
 * session closes after ten minutes without a signature, and the page watching for the money stopped with it. The
 * coins sat in the account, converted into nothing and given to nobody. The rail's own help centre says most
 * payments take 30 to 60 minutes. So the terms are written down when the rail opens, and read back when the same
 * account is signed in on the page again, whether the page stayed open or was opened again later.
 *
 * Only the terms are kept, and only here: a Duolingo name when one was given, how much, for how long, the daily
 * target, and whose account set it up. Nothing here moves money. The page still converts only what arrived and gives
 * only with a signature (D33).
 */

export const PENDING_GIFT_STORAGE_KEY = "viky.pendingGift";

/** How long a gift set up and not yet made is picked up again: well past the several hours a payment can take. */
export const PENDING_GIFT_MAX_AGE_MS = 72 * 60 * 60 * 1000;

export type PendingGiftTerms = Readonly<{ account: string; username: string; dollars: string; days: string; target: string }>;
export type PendingGift = PendingGiftTerms & Readonly<{ savedAtMs: number }>;

export function pendingGiftToStore(terms: PendingGiftTerms, nowMs: number): string {
  return JSON.stringify({ ...terms, account: terms.account.toLowerCase(), savedAtMs: nowMs });
}

/** The gift to pick up again for this account now, or nothing: another account's, an old one, or anything unreadable. */
export function pendingGiftFor(raw: string | null, account: string | undefined, nowMs: number): PendingGift | undefined {
  if (!raw || !account) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : undefined);
  const gift = {
    account: text("account"),
    username: text("username"),
    dollars: text("dollars"),
    days: text("days"),
    target: text("target"),
    savedAtMs: typeof record.savedAtMs === "number" ? record.savedAtMs : undefined,
  };
  if (!gift.account || gift.username === undefined || !gift.dollars || !gift.days || !gift.target || gift.savedAtMs === undefined) {
    return undefined;
  }
  if (gift.account !== account.toLowerCase()) return undefined;
  // Saved in the future is not a gift anybody set up; saved too long ago is not one they are still waiting on.
  if (gift.savedAtMs > nowMs + 60_000 || nowMs - gift.savedAtMs > PENDING_GIFT_MAX_AGE_MS) return undefined;
  // Terms the gift itself would refuse are not picked up either.
  try {
    dollarsToUnits(gift.dollars);
  } catch {
    return undefined;
  }
  if (!(Number(gift.days) >= 7) || !(Number(gift.target) > 0)) return undefined;
  return gift as PendingGift;
}

/**
 * Whether this device holds a gift set up and not made, whoever set it up. The first step asks it with nobody signed
 * in, because after a reload that step is all a funder sees and nothing there offered a way back to their gift.
 */
export function pendingGiftExists(raw: string | null, nowMs: number): boolean {
  if (!raw) return false;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return false;
  }
  const record = value as Record<string, unknown> | null;
  const account = record && typeof record.account === "string" ? record.account : undefined;
  return account !== undefined && pendingGiftFor(raw, account, nowMs) !== undefined;
}

/** Writes the terms down, and says whether the device kept them: private browsing can refuse. */
export function savePendingGift(terms: PendingGiftTerms): boolean {
  try {
    window.localStorage.setItem(PENDING_GIFT_STORAGE_KEY, pendingGiftToStore(terms, Date.now()));
    return true;
  } catch {
    return false;
  }
}

export function loadPendingGift(account: string): PendingGift | undefined {
  try {
    return pendingGiftFor(window.localStorage.getItem(PENDING_GIFT_STORAGE_KEY), account, Date.now());
  } catch {
    return undefined;
  }
}

export function hasPendingGift(): boolean {
  try {
    return pendingGiftExists(window.localStorage.getItem(PENDING_GIFT_STORAGE_KEY), Date.now());
  } catch {
    return false;
  }
}

export function forgetPendingGift(): void {
  try {
    window.localStorage.removeItem(PENDING_GIFT_STORAGE_KEY);
  } catch {
    // Nothing could be kept, so there is nothing to forget.
  }
}
