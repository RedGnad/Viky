import type { Hex } from "viem";
import { CHESS_IDENTITY_LABEL, chessClimbOfGoal, chessProviderId, isChessClimb, type ChessClimb } from "./chess-com";
import { CODEFORCES_GOAL_TYPE, CODEFORCES_IDENTITY_LABEL, codeforcesProviderId } from "./codeforces";

/**
 * The climbs a gift can be made on, whatever the source (the founder, 27 Sep 2026: Codeforces beside Chess.com): a
 * cadence of Chess.com, or Codeforces' one rating. Each has its goal on the contract, its provider id signed into
 * every proof, and the label its identity pseudonym is made with. Browser safe.
 */
export const CODEFORCES_CLIMB = "codeforces";
export type ClimbId = ChessClimb | typeof CODEFORCES_CLIMB;

export function isClimbId(value: unknown): value is ClimbId {
  return value === CODEFORCES_CLIMB || isChessClimb(value);
}

export function climbOfGoal(goalType: number): ClimbId | undefined {
  return goalType === CODEFORCES_GOAL_TYPE ? CODEFORCES_CLIMB : chessClimbOfGoal(goalType);
}

/** Which house reads the climb. */
export function climbSource(climb: ClimbId): "chess" | "codeforces" {
  return climb === CODEFORCES_CLIMB ? "codeforces" : "chess";
}

export function climbProviderId(climb: ClimbId): Hex {
  return climb === CODEFORCES_CLIMB ? codeforcesProviderId() : chessProviderId(climb);
}

export function climbIdentityLabel(climb: ClimbId): string {
  return climb === CODEFORCES_CLIMB ? CODEFORCES_IDENTITY_LABEL : CHESS_IDENTITY_LABEL;
}
