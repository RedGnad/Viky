import { conditionById, type Condition } from "./conditions";
import type { PendingGiftTerms } from "./pending-gift";
import { AmountError, dollarsToUnits } from "./money";
import { certificateById, milestoneById } from "./milestone-conditions";
import { checkTarget, MilestoneTermsError } from "./milestone-terms";

/**
 * The gift being filled in, as an object rather than as a journey (the product vision of 19 Sep 2026, section 6).
 *
 * The card has four cases, For, will, amount and for how long, and one shape. This module is what they mean: which
 * case is filled, what each one still needs, and what the whole thing has to hold before it can be paid for. It is
 * pure and browser safe, so the card, the sheets and the tests all read the same rules, and it knows nothing about
 * screens: no words are written here, they are in the register and in src/sentences.ts.
 *
 * What it does not change: the terms the create routes receive. A filled draft carries exactly the fields those
 * routes already take, in the same shapes, because the screen above them was the only thing the vision replaces.
 */

/** What the card draws once the condition is known: a row of days, a climb towards a number, a stamp (section 6). */
export type GiftShape = "days" | "climb" | "stamp";

/** The four cases, in the order they are read. */
export type CardCase = "for" | "will" | "amount" | "howLong";

export const CARD_CASES: readonly CardCase[] = ["for", "will", "amount", "howLong"];

export type GiftDraft = Readonly<{
  recipientName: string;
  funderName: string;
  /** An id of the register; empty while nothing is chosen. */
  conditionId: string;
  /**
   * Who is read: the account name on the source for a condition read by name, and the name the certificate must
   * carry for one read from a link. A daily condition may leave it empty, because the recipient can name their own.
   */
  subject: string;
  /** The one course a day is counted on, when the source holds several and the funder chose one (U1). */
  course?: string;
  courseTitle?: string;
  /** A climb's cadence, and where that account stood when the funder chose the target (C2, D44). */
  cadence?: string;
  standing?: number;
  standingReadAt?: string;
  /** What a day has to reach, or the number to climb to, or the score the certificate must show. */
  target: string;
  dollars: string;
  /**
   * The amount as the person typed it, and what they were reading in when they did (D158). Two things at once:
   *
   * - **whether the amount is theirs at all.** A card starts on a round figure in the reader's currency, or on the
   *   account's own money, and follows both until somebody types an amount. Pressing a length or choosing a
   *   condition writes the card to the device without making its amount a decision, and before this such a card
   *   was kept as "thirty dollars" and read back as 26.18 euros for ever, whatever the account held.
   * - **what to show them back.** The chain holds dollars, cut to the cent and never rounded up, so 45 euros are
   *   held as $51.91 which are 44.99 euros: a person who typed 45 and came back to 44.99 would be right to call it
   *   a bug. What they typed comes back exactly, while what is sent stays the dollars below.
   */
  typedAmount?: string;
  typedIn?: string;
  days: string;
}>;

export const EMPTY_DRAFT: GiftDraft = {
  recipientName: "",
  funderName: "",
  conditionId: "",
  subject: "",
  target: "",
  dollars: "",
  days: "",
};


/**
 * How long a daily gift runs. The create route refuses anything outside it (`app/api/gift/create/route.ts`), and a
 * test holds these three numbers against that route, so the card cannot offer what the route would refuse.
 */
export const DAILY_DURATION = { min: 7, max: 90, suggested: 30 } as const;

/**
 * The card as a visitor first meets it (the founder, 20 Sep 2026): a plausible gift rather than four holes. A
 * Duolingo lesson, thirty dollars, thirty days, at the bar the register itself suggests for a day.
 *
 * The one thing left empty is the first name, because it is the one thing Viky cannot guess, and it is the field
 * that carries the cursor. Nothing here is a claim: the money is only taken at the passkey, and every number below
 * is one the funder can change on the card before pressing anything.
 */
export const STARTING_DRAFT: GiftDraft = {
  ...EMPTY_DRAFT,
  conditionId: "duolingo-daily",
  target: String(conditionById("duolingo-daily")?.target?.suggested ?? 10),
  dollars: "30",
  days: String(DAILY_DURATION.suggested),
};

export function conditionOfDraft(draft: GiftDraft): Condition | undefined {
  return draft.conditionId ? conditionById(draft.conditionId) : undefined;
}

/** The shape a condition gives the card, from the register alone: a screen never decides this. */
export function shapeOf(conditionId: string): GiftShape | undefined {
  const condition = conditionById(conditionId);
  if (!condition) return undefined;
  if (condition.kind === "daily") return "days";
  if (certificateById(conditionId)) return "stamp";
  if (milestoneById(conditionId)) return "climb";
  return undefined;
}

/** How long this condition's gift may run, and what the sheet offers before anybody touches it. */
export function durationBounds(conditionId: string): Readonly<{ min: number; max: number; suggested: number }> {
  return certificateById(conditionId)?.duration ?? milestoneById(conditionId)?.duration ?? DAILY_DURATION;
}

/** Whether a name this source is read by is one it could answer for: the register's own rule, never a rule of ours. */
export function subjectLooksRight(conditionId: string, value: string): boolean {
  const certificate = certificateById(conditionId);
  if (certificate) return value.trim().length > 0;
  const milestone = milestoneById(conditionId);
  if (milestone) return milestone.validName(value.trim());
  const check = conditionById(conditionId)?.link.kind === "username" ? conditionById(conditionId) : undefined;
  const valid = check?.link.kind === "username" ? check.link.check?.valid : undefined;
  return valid ? valid(value.trim()) : value.trim().length > 0;
}

/** A first name as the gift will print it: something written, and not a paragraph. */
function nameGiven(value: string): boolean {
  const name = value.trim();
  return name.length > 0 && name.length <= 40;
}

function targetNumber(draft: GiftDraft): number | undefined {
  const value = Number(draft.target);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * Whether what the condition itself asks has been answered. It is part of the will case, not a case of its own: the
 * vision keeps a condition's own questions in the sheet that chose it, because they are one thought (section 6).
 */
export function conditionAnswered(draft: GiftDraft): boolean {
  const condition = conditionOfDraft(draft);
  if (!condition) return false;
  const target = targetNumber(draft);
  const certificate = certificateById(draft.conditionId);
  if (certificate) {
    // Judged exactly as the route will judge it, by the condition's own rules: the test prints a legal name and asks
    // for two words, a course certificate can carry one. The score is the source's own scale, never a number of ours,
    // and where there is nothing to score the funder names the course instead (C3).
    if (certificate.asksName !== false && !certificate.validName(draft.subject)) return false;
    if (certificate.course) return Boolean(draft.course) && certificate.validTarget(target ?? Number.NaN);
    return target !== undefined && certificate.validTarget(target);
  }
  const milestone = milestoneById(draft.conditionId);
  if (milestone) {
    if (!milestone.validName(draft.subject.trim())) return false;
    if (!draft.cadence || draft.standing === undefined || !draft.standingReadAt) return false;
    if (target === undefined) return false;
    try {
      checkTarget(milestone.shape, draft.standing, target);
    } catch (error) {
      if (error instanceof MilestoneTermsError) return false;
      throw error;
    }
    return true;
  }
  // A daily condition: the bar for a day, and a name only if the funder knows it, because the recipient can give
  // their own when they open the link (D27). An empty name is an answer here, a wrong one is not.
  if (draft.subject.trim().length > 0 && !subjectLooksRight(draft.conditionId, draft.subject)) return false;
  const bar = condition.target?.min ?? 1;
  return target !== undefined && target >= bar;
}

export function amountGiven(draft: GiftDraft): boolean {
  try {
    dollarsToUnits(draft.dollars);
    return true;
  } catch (error) {
    if (error instanceof AmountError) return false;
    throw error;
  }
}

export function durationGiven(draft: GiftDraft): boolean {
  const { min, max } = durationBounds(draft.conditionId);
  const days = Number(draft.days);
  return Number.isInteger(days) && days >= min && days <= max;
}

/** Which of the four cases are filled, as the card reads them to draw itself. */
export function filledCases(draft: GiftDraft): Readonly<Record<CardCase, boolean>> {
  return {
    // The name of the person it is for. The funder's own name is not asked for on the card and never blocks: the
    // card says "a gift from you" until they write one, and the register has always allowed a gift from nobody.
    for: nameGiven(draft.recipientName),
    will: conditionAnswered(draft),
    amount: amountGiven(draft),
    howLong: durationGiven(draft),
  };
}

/**
 * Whether the card can be paid for. The name is not part of it (the founder, 20 Sep 2026): the action says what it
 * will take from the first screen, and a gift whose recipient is named by nobody is a gift for whoever opens the
 * link, which this product has always made. What must be true is what the money rests on: the condition answered,
 * an amount that can be read, and a length the route will accept.
 */
export function isComplete(draft: GiftDraft): boolean {
  const filled = filledCases(draft);
  return filled.will && filled.amount && filled.howLong;
}

/** The case the card points at next: the first one still empty, and nothing once they are all filled. */
export function nextCase(draft: GiftDraft): CardCase | undefined {
  const filled = filledCases(draft);
  return CARD_CASES.find((slot) => !filled[slot]);
}

/**
 * The card as the device keeps it (D74, `src/pending-gift.ts`), and back. The draft and those terms are the same
 * gift written twice, so the two conversions live together and a field cannot be dropped on the way out and not
 * noticed on the way back.
 */
export function draftToTerms(draft: GiftDraft, account: string | undefined): PendingGiftTerms {
  return {
    account: account ?? "",
    recipientName: draft.recipientName,
    funderName: draft.funderName,
    conditionId: draft.conditionId,
    username: draft.subject,
    dollars: draft.dollars,
    ...(draft.typedAmount !== undefined ? { typedAmount: draft.typedAmount, typedIn: draft.typedIn ?? "USD" } : {}),
    days: draft.days,
    target: draft.target,
    ...(draft.course ? { course: draft.course, courseTitle: draft.courseTitle ?? "" } : {}),
    ...(draft.cadence ? { cadence: draft.cadence } : {}),
    ...(draft.standing !== undefined ? { standing: draft.standing } : {}),
    ...(draft.standingReadAt ? { standingReadAt: draft.standingReadAt } : {}),
  };
}

export function draftFromTerms(terms: PendingGiftTerms): GiftDraft {
  return {
    recipientName: terms.recipientName,
    funderName: terms.funderName,
    conditionId: terms.conditionId,
    subject: terms.username,
    ...(terms.course ? { course: terms.course, courseTitle: terms.courseTitle ?? "" } : {}),
    ...(terms.cadence ? { cadence: terms.cadence } : {}),
    ...(terms.standing !== undefined ? { standing: terms.standing } : {}),
    ...(terms.standingReadAt ? { standingReadAt: terms.standingReadAt } : {}),
    target: terms.target,
    dollars: terms.dollars,
    ...(terms.typedAmount !== undefined ? { typedAmount: terms.typedAmount, typedIn: terms.typedIn ?? "USD" } : {}),
    days: terms.days,
  };
}

/**
 * The amount in the units the contract holds, for a draft that has one. The card prints dollars and the routes take
 * units, and this is the one place that turns one into the other.
 */
export function draftUnits(draft: GiftDraft): bigint | undefined {
  try {
    return dollarsToUnits(draft.dollars);
  } catch (error) {
    if (error instanceof AmountError) return undefined;
    throw error;
  }
}
