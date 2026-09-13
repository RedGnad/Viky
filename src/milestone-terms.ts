/**
 * The two numbers a milestone gift is signed with, and where they come from. Browser safe.
 *
 * The contract takes a target and a highest accepted starting point (D44). Only the first is a question for
 * a funder: "what should they reach" is about the gift, "what is the highest starting point you will pay a
 * climb from" is about the contract. So the screen reads where the person stands today, adds a small margin
 * for the noise of an ordinary day, and signs that as the ceiling along with the rest of the terms.
 *
 * The reading taken here is a plain one, not an attested one, and that is deliberate: it decides what the
 * funder is shown and agrees to, with their own eyes and their own money, not what releases anything. Every
 * reading that moves money is attested (D27).
 */

export type MilestoneShape = Readonly<{
  /** How far above today's reading the ceiling sits, to absorb one ordinary day of movement. */
  startMargin: number;
  /** How far above today's reading the target must be for the gift to mean anything. */
  minimumClimb: number;
  /** True when the thing is had or not had, so today's reading is zero and no ceiling is worth showing. */
  allOrNothing: boolean;
}>;

/**
 * A chess rating moves by roughly ten points a game, so ten absorbs the ordinary. Fifty is about five net
 * wins: below that the gift would pay for a normal afternoon.
 */
export const CHESS_RATING: MilestoneShape = { startMargin: 10, minimumClimb: 50, allOrNothing: false };

/** A certificate is had or not had. Today's reading is zero, the ceiling is zero, the target is one. */
export const CERTIFICATE: MilestoneShape = { startMargin: 0, minimumClimb: 1, allOrNothing: true };

export class MilestoneTermsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MilestoneTermsError";
  }
}

/** The smallest target worth offering, given where the person stands today. */
export function smallestTarget(shape: MilestoneShape, standingToday: number): number {
  return standingToday + shape.minimumClimb;
}

/**
 * The highest starting point the funder accepts, from today's reading. Always below the target, which the
 * contract also insists on, so the two can never disagree.
 */
export function startingCeiling(shape: MilestoneShape, standingToday: number, target: number): number {
  if (shape.allOrNothing) return 0;
  const ceiling = standingToday + shape.startMargin;
  return ceiling < target ? ceiling : target - 1;
}

/** Refuses a target that is not a climb, before anyone signs anything. */
export function checkTarget(shape: MilestoneShape, standingToday: number, target: number): void {
  if (!Number.isSafeInteger(target) || target <= 0) throw new MilestoneTermsError("Choose what they should reach");
  if (!Number.isSafeInteger(standingToday) || standingToday < 0) throw new MilestoneTermsError("We could not read where they stand today");
  if (target < smallestTarget(shape, standingToday)) {
    throw new MilestoneTermsError(
      shape.allOrNothing
        ? "They already have it, so there is nothing to earn"
        : `They are at ${standingToday} today. Choose ${smallestTarget(shape, standingToday)} or more, so the gift is worth earning.`,
    );
  }
}

/** What the screen says, in the funder's own words, before they sign. */
export function inPlainWords(shape: MilestoneShape, standingToday: number, target: number): string {
  if (shape.allOrNothing) return `The gift is theirs when they have it, and comes back to you if they do not get it in time.`;
  return `Today they are at ${standingToday}. The gift is theirs when they reach ${target}, and only if they start from under ${startingCeiling(shape, standingToday, target)}.`;
}
