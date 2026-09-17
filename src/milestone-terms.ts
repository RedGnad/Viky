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
  /** How far above today's reading the target must be for the gift to mean anything. */
  minimumClimb: number;
  /** True when the thing is had or not had, so today's reading is zero and no ceiling is worth showing. */
  allOrNothing: boolean;
}>;

/**
 * Fifty points is about five net wins from where they stand the day the funder pays: below that the gift would pay for
 * a normal afternoon. Measured on 17 Sep 2026 (D90): a rating whose RD is under 60 moves by 1 to 13 points a game, and
 * far more above it, which is why a cadence whose rating has not settled is refused (`ratingHasSettled`).
 */
export const CHESS_RATING: MilestoneShape = { minimumClimb: 50, allOrNothing: false };

/** A certificate is had or not had. Today's reading is zero, the ceiling is zero, the target is one. */
export const CERTIFICATE: MilestoneShape = { minimumClimb: 1, allOrNothing: true };

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
 * The highest starting point the funder accepts: one below the target, and nothing tighter (D91).
 *
 * It used to be today's reading plus a small margin, which killed a gift for a recipient who simply played between
 * paying and connecting: two wins put them over it and nothing could be earned. The tight ceiling protected nothing
 * that the rest does not already: the creation reads the rating, reads it again before the money moves, and refuses any
 * target under `minimumClimb` above it, so the target is already a real climb from the day the funder paid. What is
 * left to refuse is the one thing that would pay for nothing: a start already at or past the target.
 */
export function startingCeiling(shape: MilestoneShape, target: number): number {
  return shape.allOrNothing ? 0 : target - 1;
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

/** What the screen says, in the funder's own words, before they sign. How long they have is the next question. */
export function inPlainWords(shape: MilestoneShape, standingToday: number, target: number): string {
  if (shape.allOrNothing) return `The gift is theirs when they have it, and comes back to you if they do not get it in time.`;
  return `Today they are at ${standingToday}. The gift is theirs when they reach ${target}.`;
}
