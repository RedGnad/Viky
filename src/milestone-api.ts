import { NextResponse } from "next/server";
import { contractRefusal, giftErrorResponse, NO_STORE } from "./gift-api";
import { RelayerError } from "./relayer";

/**
 * What the milestone contract's typed refusals mean to a person. Its own table, because two contracts can name a
 * refusal the same way and mean different things by it: `DeadlinePassed` on the way out is a quote that took too
 * long, and here it is a gift whose time ran out. Refusals both contracts share keep the daily table's sentence.
 */
const MILESTONE_REFUSALS: Readonly<Record<string, { code: string; message: string; status: 400 | 404 | 409 | 503 }>> = {
  NotThereYet: { code: "NOT_THERE_YET", message: "Not there yet. Nothing was changed.", status: 409 },
  StartTooHigh: { code: "START_TOO_HIGH", message: "This gift started from above the rating it was set up for, so it can no longer be earned.", status: 409 },
  DeadlinePassed: { code: "TIME_IS_UP", message: "The time for this gift is over.", status: 409 },
  AlreadySettled: { code: "FINISHED", message: "This gift is finished.", status: 409 },
  TooEarly: { code: "TOO_EARLY", message: "It is too early to send this gift back.", status: 409 },
  ProofIsPaused: { code: "PAUSED", message: "Readings are paused for a moment. Try again later.", status: 409 },
  StaleObservation: { code: "OLDER_THAN_LAST", message: "That reading is older than the last one. Try again in a moment.", status: 409 },
  IdentityMismatch: { code: "OTHER_ACCOUNT", message: "This is not the Chess.com account this gift is for.", status: 409 },
  InvalidTarget: { code: "INVALID_TARGET", message: "That rating is not allowed.", status: 400 },
  InvalidMaximumStart: { code: "INVALID_TARGET", message: "The rating to reach must be above where they stand.", status: 400 },
  InvalidShape: { code: "GOAL_NOT_OFFERED", message: "This goal is not offered yet.", status: 400 },
  InvalidSubject: { code: "GOAL_NOT_OFFERED", message: "This goal is not offered yet.", status: 400 },
  UnknownGoal: { code: "GOAL_NOT_OFFERED", message: "This rating is not offered yet.", status: 400 },
  InvalidDuration: { code: "INVALID_DURATION", message: "That number of days is not allowed.", status: 400 },
};

export function milestoneRefusal(name: string | undefined): { code: string; message: string } | null {
  if (name && MILESTONE_REFUSALS[name]) return { code: MILESTONE_REFUSALS[name].code, message: MILESTONE_REFUSALS[name].message };
  return contractRefusal(name);
}

/** The gift routes' error response, with the milestone contract's meanings first. */
export function milestoneErrorResponse(error: unknown, forOperator = false): NextResponse {
  if (error instanceof RelayerError && error.code === "REVERTED" && error.contractError && MILESTONE_REFUSALS[error.contractError]) {
    const known = MILESTONE_REFUSALS[error.contractError];
    return NextResponse.json({ error: known.message, code: known.code, contractError: error.contractError }, { status: known.status, headers: NO_STORE });
  }
  return giftErrorResponse(error, forOperator);
}
