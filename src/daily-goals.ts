import type { Hex } from "viem";
import { DUOLINGO_COURSE_PROVIDER_ID, DUOLINGO_PUBLIC_PROVIDER_ID } from "./duolingo-public-terms";
import { FITBIT_CONNECTED_PROVIDER_ID, GOAL_TYPE_DUOLINGO_COURSE_XP, GOAL_TYPE_DUOLINGO_XP, GOAL_TYPE_FITBIT_ACTIVITY, GOAL_TYPE_STRAVA_DISTANCE, STRAVA_CONNECTED_PROVIDER_ID } from "./gift-terms";

/**
 * Every goal of the daily contract that has a condition behind it, with the provider id each check-in for it must
 * carry, as `MILESTONE_GOALS` (src/milestone-goals.ts) lists the milestone contract's. Browser safe.
 *
 * It is what a new deployment of the daily contract registers. Each value was read on the contract in service on
 * 1 Oct 2026 (`goalProviders`) and is the same there. Goal 2 is registered on that contract too and is not here: no
 * condition of the register uses it, and on the second version of the contract a goal is added and never changed, so
 * a number nobody uses is better left free than spent.
 */

export type DailyGoal = Readonly<{ goalType: number; providerId: Hex; source: string; detail: string }>;

export const DAILY_GOALS: readonly DailyGoal[] = [
  { goalType: GOAL_TYPE_DUOLINGO_XP, providerId: DUOLINGO_PUBLIC_PROVIDER_ID, source: "Duolingo", detail: "experience total, read from the public profile" },
  { goalType: GOAL_TYPE_STRAVA_DISTANCE, providerId: STRAVA_CONNECTED_PROVIDER_ID, source: "Strava", detail: "connected by the person" },
  { goalType: GOAL_TYPE_DUOLINGO_COURSE_XP, providerId: DUOLINGO_COURSE_PROVIDER_ID, source: "Duolingo", detail: "one course, read from the public profile" },
  { goalType: GOAL_TYPE_FITBIT_ACTIVITY, providerId: FITBIT_CONNECTED_PROVIDER_ID, source: "Fitbit", detail: "connected by the person" },
];
