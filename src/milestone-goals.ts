import type { Hex } from "viem";
import { CHESS_MODES, chessGoalType, chessProviderId } from "./chess-com";
import { CHESS_TACTICS_GOAL_TYPE, chessTacticsProviderId } from "./chess-tactics";
import { COURSERA_GOAL_TYPE, courseraProviderId } from "./coursera-certificate";
import { CREDLY_GOAL_TYPE, credlyProviderId } from "./credly-badge";
import { detProviderId } from "./duolingo-english-test";
import { LICHESS_CADENCES, lichessGoalType, lichessProviderId } from "./lichess";
import { SHAPE_CLIMB, SHAPE_HAVE_OR_NOT } from "./milestone-protocol";

/**
 * Every goal the milestone contract knows, in one list (U3, 18 Sep 2026).
 *
 * A goal is three things on chain: a number, the provider id every proof for it must carry, and the shape it is
 * judged by. The shape belongs to the goal and not to the terms, so a source that moves is proved as a climb and
 * nothing else, whatever a funder's app puts in that field (D49).
 *
 * The owner registers them, and `scripts/register-milestone-goals.ts` is the session that does it: it reads what is
 * already there, sends only what is missing, and refuses to overwrite a number that is registered to something else,
 * because a live gift keys on it.
 */

export type MilestoneGoal = Readonly<{
  goalType: number;
  providerId: Hex;
  /** `SHAPE_CLIMB` or `SHAPE_HAVE_OR_NOT`. */
  shape: number;
  /** For the operator's own reading of the plan, never for a screen. */
  source: string;
  detail: string;
}>;

/** The Duolingo English Test: one goal, because the test is one test and the score is the target (U3). */
export const DET_GOAL_TYPE = 5;

export const MILESTONE_GOALS: readonly MilestoneGoal[] = [
  ...CHESS_MODES.map((mode) => ({
    goalType: chessGoalType(mode),
    providerId: chessProviderId(mode),
    shape: SHAPE_CLIMB,
    source: "Chess.com",
    detail: mode,
  })),
  { goalType: DET_GOAL_TYPE, providerId: detProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "Duolingo English Test", detail: "overall score" },
  ...LICHESS_CADENCES.map((cadence) => ({
    goalType: lichessGoalType(cadence),
    providerId: lichessProviderId(cadence),
    shape: SHAPE_CLIMB,
    source: "Lichess",
    detail: cadence,
  })),
  // A course certificate: granted once, with nothing to score, so what a proof carries is that it exists (C3).
  { goalType: COURSERA_GOAL_TYPE, providerId: courseraProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "Coursera", detail: "a course certificate" },
  // A certification badge: granted once by an issuer that is not the person, so it is had or not (20 Sep 2026).
  { goalType: CREDLY_GOAL_TYPE, providerId: credlyProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "Credly", detail: "a certification badge" },
  // The puzzle rating: it moves, so it is a climb like the cadences, on the same page and without an RD.
  { goalType: CHESS_TACTICS_GOAL_TYPE, providerId: chessTacticsProviderId(), shape: SHAPE_CLIMB, source: "Chess.com", detail: "tactics" },
];

export function milestoneGoal(goalType: number): MilestoneGoal | undefined {
  return MILESTONE_GOALS.find((goal) => goal.goalType === goalType);
}

/** What a run would do to one goal: nothing, register it, or stop because the number belongs to something else. */
export type GoalState = "registered" | "missing" | "taken";

export const NO_PROVIDER: Hex = `0x${"0".repeat(64)}`;

export function planFor(goal: MilestoneGoal, onChain: Readonly<{ provider: string; shape: number }>): GoalState {
  if (onChain.provider.toLowerCase() === goal.providerId.toLowerCase() && onChain.shape === goal.shape) return "registered";
  if (onChain.provider.toLowerCase() === NO_PROVIDER) return "missing";
  return "taken";
}
