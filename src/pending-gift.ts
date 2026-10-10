import { conditionById, DUOLINGO_DAILY } from "./conditions";
import { formatAusd } from "./gift-reader";
import { certificateById, milestoneById } from "./milestone-conditions";
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
 * Only the terms are kept, and only here: the two names, the condition, the source's name when one was given, how
 * much, for how long, the daily target, and whose account set it up. Nothing here moves money. The page still converts
 * only what arrived and gives only with a signature (D33).
 */

export const PENDING_GIFT_STORAGE_KEY = "viky.pendingGift";

/** How long a gift set up and not yet made is picked up again: well past the several hours a payment can take. */
export const PENDING_GIFT_MAX_AGE_MS = 72 * 60 * 60 * 1000;

export type PendingGiftTerms = Readonly<{
  /**
   * Whose gift it is. Empty means nobody's yet: since the vision of 19 Sep 2026 the card on Home is filled in before
   * anything is asked of a visitor, so a gift can be written down here with no account behind it. It takes the
   * account's name when that person signs in to pay, and a gift held for an account is still never handed to another.
   */
  account: string;
  recipientName: string;
  funderName: string;
  /** An id of src/conditions.ts. A gift kept before the register existed was the first condition, the daily lesson. */
  conditionId: string;
  username: string;
  dollars: string;
  days: string;
  target: string;
  /** The one course a day is counted on, and its title, when the funder chose one (U1). */
  course?: string;
  courseTitle?: string;
  /** The scale a grade is typed on, and whether it is the university's own (the founder, 28 Sep 2026). */
  scale?: string;
  scaleFixed?: boolean;
  /** The way in the funder pressed, by name, so the wait says what to set on the page they opened (D101). */
  wayIn?: string;
  /** A milestone's cadence, and where the person stood when the funder chose: the ceiling they sign is built on it (C2). */
  cadence?: string;
  standing?: number;
  standingReadAt?: string;
  /** The amount as the person typed it and the currency they typed it in, or nothing while it is the card's own (D158). */
  typedAmount?: string;
  typedIn?: string;
}>;
export type PendingGift = PendingGiftTerms & Readonly<{ savedAtMs: number }>;

export function pendingGiftToStore(terms: PendingGiftTerms, nowMs: number): string {
  return JSON.stringify({ ...terms, account: terms.account.toLowerCase(), savedAtMs: nowMs });
}

/** The gift to pick up again for this account now, or nothing: another account's, an old one, or anything unreadable. */
export function pendingGiftFor(raw: string | null, account: string | undefined, nowMs: number): PendingGift | undefined {
  if (!raw) return undefined;
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
    // Kept since 17 Sep; a gift kept on a device before then has neither name, and it is still picked up.
    recipientName: text("recipientName") ?? "",
    funderName: text("funderName") ?? "",
    conditionId: text("conditionId") ?? DUOLINGO_DAILY.id,
    username: text("username"),
    dollars: text("dollars"),
    days: text("days"),
    target: text("target"),
    ...(text("wayIn") !== undefined ? { wayIn: text("wayIn") } : {}),
    ...(text("course") !== undefined ? { course: text("course") } : {}),
    ...(text("courseTitle") !== undefined ? { courseTitle: text("courseTitle") } : {}),
    ...(text("scale") !== undefined ? { scale: text("scale"), scaleFixed: record.scaleFixed === true } : {}),
    ...(text("cadence") !== undefined ? { cadence: text("cadence") } : {}),
    ...(typeof record.standing === "number" ? { standing: record.standing } : {}),
    ...(text("standingReadAt") !== undefined ? { standingReadAt: text("standingReadAt") } : {}),
    // The figure typed, kept with the payment started, so the gift is said as it was typed wherever it is picked up
    // again (the founder, 4 Oct 2026). It was written down and never read back.
    ...(text("typedAmount") !== undefined ? { typedAmount: text("typedAmount"), typedIn: text("typedIn") ?? "USD" } : {}),
    savedAtMs: typeof record.savedAtMs === "number" ? record.savedAtMs : undefined,
  };
  if (gift.account === undefined || gift.username === undefined || !gift.dollars || !gift.days || !gift.target || gift.savedAtMs === undefined) {
    return undefined;
  }
  // A gift nobody has claimed yet is picked up by whoever signs in on this device; one already held for an account
  // is never handed to another, which is the rule D74 was written for.
  if (gift.account !== "" && gift.account !== account?.toLowerCase()) return undefined;
  // Saved in the future is not a gift anybody set up; saved too long ago is not one they are still waiting on.
  if (gift.savedAtMs > nowMs + 60_000 || nowMs - gift.savedAtMs > PENDING_GIFT_MAX_AGE_MS) return undefined;
  // Terms the gift itself would refuse are not picked up either.
  try {
    dollarsToUnits(gift.dollars);
  } catch {
    return undefined;
  }
  // A daily gift runs seven days at least; a milestone may be a single day (D43).
  const milestone = conditionById(gift.conditionId)?.kind === "milestone";
  // Something had or not judges its target by its own rule, as the card and the route do: a race may ask for nothing
  // but the finish, which it writes 0.
  const certificate = certificateById(gift.conditionId);
  const targetHolds = certificate ? certificate.validTarget(Number(gift.target)) : Number(gift.target) > 0;
  if (!(Number(gift.days) >= (milestone ? 1 : 7)) || !targetHolds) return undefined;
  // Only a climb has a cadence and a place it started from. Asked of every milestone, they refused every gift had or
  // not (the final audit of 9 Oct 2026, A5): an enrolment or a score paid for by card was never read back as a gift
  // kept, so Home offered no way back to its payment, and its wait was built on the wrong provider.
  if (milestoneById(gift.conditionId) !== undefined && (gift.cadence === undefined || gift.standing === undefined || gift.standingReadAt === undefined)) return undefined;
  return gift as PendingGift;
}

/**
 * Whether a gift kept on this device was made after all (the final audit of 9 Oct 2026, A4). The screen that makes a
 * gift says "You can close this page", and a page closed while the creation was on its way never heard that it went
 * through: for three days the device went on saying the gift was set up and not made, with a button that would make a
 * second one. The account's own list knows: a gift this account paid for, for the same first name, the same amount
 * and the same number of days, funded after this one was written down, is the gift it became.
 */
export function madeSince(
  kept: Readonly<Pick<PendingGift, "recipientName" | "dollars" | "days" | "savedAtMs">>,
  gifts: ReadonlyArray<Readonly<{ role: string; recipientName: string | null; amountDisplay: string; durationDays: number; fundedAt: number }>>,
): boolean {
  let amount: string;
  try {
    amount = formatAusd(dollarsToUnits(kept.dollars));
  } catch {
    return false;
  }
  const name = (kept.recipientName ?? "").trim();
  return gifts.some((gift) => gift.role === "funder" && (gift.recipientName ?? "").trim() === name && gift.amountDisplay === amount && gift.durationDays === Number(kept.days) && gift.fundedAt * 1000 > kept.savedAtMs);
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
  return account !== undefined && pendingGiftFor(raw, account || undefined, nowMs) !== undefined;
}

/**
 * The card as it is being filled in, whatever state it is in (the vision of 19 Sep 2026, section 6).
 *
 * The readers above answer one question, "is there a gift here that could be paid for now", and they refuse anything
 * incomplete, which is right: nothing half written should be picked up as a gift waiting for money. The card asks a
 * different question, "what was this person writing", and a card with two cases filled is exactly that. Same place on
 * the device, same age limit, no completeness.
 */
export function saveCardDraft(terms: PendingGiftTerms): boolean {
  return savePendingGift(terms);
}

export function loadCardDraft(nowMs: number = Date.now()): PendingGiftTerms | undefined {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PENDING_GIFT_STORAGE_KEY);
  } catch {
    return undefined;
  }
  return cardDraftFrom(raw, nowMs);
}

/** Pure, so the rule about what survives a reload is a test rather than a thing the browser knows. */
export function cardDraftFrom(raw: string | null, nowMs: number): PendingGiftTerms | undefined {
  if (!raw) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : undefined);
  const savedAtMs = typeof record.savedAtMs === "number" ? record.savedAtMs : undefined;
  if (savedAtMs === undefined || savedAtMs > nowMs + 60_000 || nowMs - savedAtMs > PENDING_GIFT_MAX_AGE_MS) return undefined;
  return {
    account: text("account") ?? "",
    recipientName: text("recipientName") ?? "",
    funderName: text("funderName") ?? "",
    conditionId: text("conditionId") ?? "",
    username: text("username") ?? "",
    dollars: text("dollars") ?? "",
    days: text("days") ?? "",
    target: text("target") ?? "",
    ...(text("course") !== undefined ? { course: text("course") } : {}),
    ...(text("courseTitle") !== undefined ? { courseTitle: text("courseTitle") } : {}),
    ...(text("scale") !== undefined ? { scale: text("scale"), scaleFixed: record.scaleFixed === true } : {}),
    ...(text("cadence") !== undefined ? { cadence: text("cadence") } : {}),
    ...(typeof record.standing === "number" ? { standing: record.standing } : {}),
    ...(text("standingReadAt") !== undefined ? { standingReadAt: text("standingReadAt") } : {}),
    ...(text("typedAmount") !== undefined ? { typedAmount: text("typedAmount"), typedIn: text("typedIn") ?? "USD" } : {}),
  };
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

/** The gift kept on this device, whoever set it up: what the page says is waiting, before anybody signs in. */
export function peekPendingGift(): PendingGift | undefined {
  try {
    const raw = window.localStorage.getItem(PENDING_GIFT_STORAGE_KEY);
    if (!pendingGiftExists(raw, Date.now())) return undefined;
    const account = (JSON.parse(String(raw)) as { account: string }).account;
    return pendingGiftFor(raw, account, Date.now());
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
