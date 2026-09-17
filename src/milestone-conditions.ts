import { CHESS_MODES, chessGoalType, isValidChessUsername, ratingHasSettled, type ChessMode } from "./chess-com";
import { CHESS_RATING, conditionById, type Condition } from "./conditions";
import { CHESS_RATING as CHESS_RATING_SHAPE, type MilestoneShape } from "./milestone-terms";

/**
 * The milestone half of the register of conditions (src/conditions.ts). A milestone asks the funder more than a daily
 * condition does, a cadence, a target and where the person stands today, and it lives on its own contract with goal
 * types of its own. What a screen needs for that is here, keyed by the condition, so no screen names a source or a
 * cadence in its own words (structure of 17 Sep 2026, section 12, item 10). Browser safe.
 */

export type MilestoneCadence = Readonly<{
  id: ChessMode;
  /** The goal type on the milestone contract. */
  goalType: number;
  label: string;
  help: string;
}>;

export type MilestoneCondition = Readonly<{
  condition: Condition;
  shape: MilestoneShape;
  cadences: readonly MilestoneCadence[];
  /** Viky's route that reads where a person stands today, plainly, before any money moves. */
  standingPath: string;
  validName: (value: string) => boolean;
  /**
   * Whether a reading has settled enough for the climb the funder signs to measure anything, from what the source gives
   * beside the number (for Chess.com, its RD, D90). A funder is refused a cadence that has not.
   */
  settled: (rd: number | null) => boolean;
  duration: Readonly<{ min: number; max: number; suggested: number }>;
  words: Readonly<{
    cadenceQuestion: string;
    targetLabel: string;
    /** Under the target, once today's reading is known. */
    today: (standing: number, cadence: string) => string;
    /** The one-line value of the check screen's "Today" row. */
    todayRow: (standing: number, cadence: string) => string;
    reading: string;
    refusals: Readonly<{
      nameShape: string;
      notFound: string;
      noRating: (cadence: string) => string;
      unavailable: string;
      targetShape: string;
      noCadence: string;
      settling: string;
    }>;
    /** "When they reach 1500 in rapid". */
    goal: (target: number, cadence: string) => string;
    /** The amount step's length question and help. */
    durationLabel: string;
    durationHelp: string;
    durationShape: (min: number, max: number) => string;
    /** How long they have, as the check screen says it. */
    durationInWords: (days: number) => string;
    /** What the amount card under the fields says. */
    whenReached: string;
    ifNot: string;
    /** Where, on the source's own site, the recipient puts the code. */
    codeSteps: string;
  }>;
}>;

const CHESS_CADENCES: readonly MilestoneCadence[] = [
  { id: "rapid", goalType: chessGoalType("rapid"), label: "Rapid", help: "Games of more than ten minutes a player." },
  { id: "blitz", goalType: chessGoalType("blitz"), label: "Blitz", help: "Games of three to ten minutes a player." },
  { id: "bullet", goalType: chessGoalType("bullet"), label: "Bullet", help: "Games of under three minutes a player." },
  { id: "daily", goalType: chessGoalType("daily"), label: "Daily", help: "Games played a move at a time, over days." },
];

// The order of CHESS_MODES is the order a funder reads them in; a test holds the two together.
if (CHESS_CADENCES.map((cadence) => cadence.id).join() !== CHESS_MODES.join()) throw new Error("the cadences and the modes disagree");

export const CHESS_MILESTONE: MilestoneCondition = {
  condition: CHESS_RATING,
  shape: CHESS_RATING_SHAPE,
  cadences: CHESS_CADENCES,
  standingPath: "/api/chess/standing",
  validName: isValidChessUsername,
  settled: ratingHasSettled,
  duration: { min: 1, max: 365, suggested: 30 },
  words: {
    cadenceQuestion: "Which rating?",
    targetLabel: "The rating they reach",
    today: (standing, cadence) => `Today they are at ${standing} in ${cadence.toLowerCase()}.`,
    todayRow: (standing, cadence) => `${standing} in ${cadence.toLowerCase()}`,
    reading: "Reading their rating",
    refusals: {
      nameShape: "A Chess.com name has three to twenty-five letters, figures, hyphens or underscores, like hikaru.",
      notFound: "No Chess.com player goes by that name. Check the spelling.",
      noRating: (cadence) => `They have no ${cadence.toLowerCase()} rating yet. Choose another rating, or ask them to play a rated game first.`,
      unavailable: "Chess.com is not answering. Try again in a moment.",
      targetShape: "Write the rating as a number, like 1500.",
      noCadence: "Choose which rating.",
      settling: "This rating is still settling: they need a few more games first.",
    },
    goal: (target, cadence) => `${target} in ${cadence.toLowerCase()}`,
    durationLabel: "Days they have to reach it",
    durationHelp: "Counted from the day they connect Chess.com, so opening the link late costs them nothing.",
    durationShape: (min, max) => `Between ${min} and ${max} days.`,
    durationInWords: (days) => `${days} ${days === 1 ? "day" : "days"} from the day they connect Chess.com`,
    whenReached: "When they reach it, all of this becomes theirs",
    ifNot: "If they do not reach it in time, all of it comes back to you. Nothing is kept by anybody else.",
    // Chess.com's help centre, read 17 Sep 2026: Settings, then Profile, then the Details section, first and last name.
    codeSteps: "On Chess.com, open Settings, then Profile. In Details, add this code to your first name, and save:",
  },
};

const MILESTONES: readonly MilestoneCondition[] = [CHESS_MILESTONE];

/** The milestone detail of a condition, or nothing for a daily one. */
export function milestoneOf(condition: Condition | undefined): MilestoneCondition | undefined {
  if (!condition || condition.kind !== "milestone") return undefined;
  return MILESTONES.find((entry) => entry.condition.id === condition.id);
}

export function milestoneById(conditionId: string): MilestoneCondition | undefined {
  return milestoneOf(conditionById(conditionId));
}

export function cadenceOf(milestone: MilestoneCondition, id: string): MilestoneCadence | undefined {
  return milestone.cadences.find((cadence) => cadence.id === id);
}

/** The cadence a milestone gift's goal type on the contract stands for. */
export function cadenceOfGoal(milestone: MilestoneCondition, goalType: number): MilestoneCadence | undefined {
  return milestone.cadences.find((cadence) => cadence.goalType === goalType);
}
