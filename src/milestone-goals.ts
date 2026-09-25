import type { Hex } from "viem";
import { CHESS_MODES, CHESS_TACTICS, chessGoalType, chessProviderId } from "./chess-com";
import { COURSERA_GOAL_TYPE, courseraProviderId } from "./coursera-certificate";
import { EDX_GOAL_TYPE, edxProviderId } from "./edx-certificate";
import { ACCREDIBLE_GOAL_TYPE, accredibleProviderId } from "./accredible-credential";
import { CREDLY_GOAL_TYPE, credlyProviderId } from "./credly-badge";
import { detProviderId } from "./duolingo-english-test";
import { LICHESS_CADENCES, lichessGoalType, lichessProviderId } from "./lichess";
import { SHAPE_CLIMB, SHAPE_HAVE_OR_NOT } from "./milestone-protocol";
import { UNIVERSITY_GOAL_TYPE, UNIVERSITY_GRADE_GOAL_TYPE, UNIVERSITY_YEAR_GOAL_TYPE, universityGradeProviderId, universityShownProviderId, universityYearProviderId } from "./university-shown";
import { TOEFL_GOAL_TYPE, toeflShownProviderId } from "./toefl-shown";
import { EXAM_GOAL_TYPES, EXAM_IDS, examProviderId } from "./exam-shown";
import { UDEMY_GOAL_TYPE, udemyProviderId } from "./udemy-shown";
import { ECOLEDIRECTE_GOAL_TYPE, ecoleDirecteProviderId } from "./school-shown";
import { CHSI_GOAL_TYPE, chsiProviderId } from "./chsi-shown";
import { WAEC_GOAL_TYPE, waecProviderId } from "./waec-shown";
import { MITX_ONLINE_GOAL_TYPE, mitxOnlineProviderId } from "./mitx-online-certificate";
import { MARATHON_GOAL_TYPE, marathonProviderId } from "./marathon";
import { PRONOTE_GOAL_TYPE, pronoteProviderId } from "./pronote-shown";

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
  // edX (D212): a verified certificate, read from the public page edX publishes for it.
  { goalType: EDX_GOAL_TYPE, providerId: edxProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "edX", detail: "a verified course certificate" },
  // Accredible (D213): a credential its issuer published, read from its public record.
  { goalType: ACCREDIBLE_GOAL_TYPE, providerId: accredibleProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "Accredible", detail: "a credential an issuer published" },
  // CHSI (D215): enrolment in China, shown from the person's own report.
  { goalType: CHSI_GOAL_TYPE, providerId: chsiProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "CHSI", detail: "enrolment in China, shown" },
  // WAEC (D217): WASSCE credits, shown from WAEC's own checker.
  { goalType: WAEC_GOAL_TYPE, providerId: waecProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "WAEC", detail: "WASSCE credits, shown" },
  // MITx Online (D222): a certificate from MIT's own course platform.
  { goalType: MITX_ONLINE_GOAL_TYPE, providerId: mitxOnlineProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "MITx Online", detail: "an MIT course certificate" },
  // Breizh Chrono (D273): a marathon finished, read from the timing company's own results page.
  { goalType: MARATHON_GOAL_TYPE, providerId: marathonProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "Breizh Chrono", detail: "a marathon finished" },
  // A certification badge: granted once by an issuer that is not the person, so it is had or not (20 Sep 2026).
  { goalType: CREDLY_GOAL_TYPE, providerId: credlyProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "Credly", detail: "a certification badge" },
  // Staying enrolled, shown from the person's own student portal: one goal for every portal, the portal pinned in
  // the gift's subject (D165). Had or not, like a certificate.
  { goalType: UNIVERSITY_GOAL_TYPE, providerId: universityShownProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "a university's student portal", detail: "enrolled, shown" },
  // The puzzle rating: it moves, so it is a climb like the cadences, on the same page and without an RD.
  { goalType: chessGoalType(CHESS_TACTICS), providerId: chessProviderId(CHESS_TACTICS), shape: SHAPE_CLIMB, source: "Chess.com", detail: "the puzzle record" },
  // A TOEFL score shown from the person's own ETS account (D164): had or not, the "show" sense; the "reach" sense,
  // once a provider of ours reads the test's date, takes its own number and never this one.
  { goalType: TOEFL_GOAL_TYPE, providerId: toeflShownProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "ETS", detail: "a TOEFL score, shown" },
  // The year passed and a grade reached, shown from the results page of the same portal (D174): one goal each for
  // every portal, the portal pinned in the gift's subject under each condition's own name. Had or not, the grade
  // compared with the target in hundredths.
  { goalType: UNIVERSITY_YEAR_GOAL_TYPE, providerId: universityYearProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "a university's student portal", detail: "the year passed, shown" },
  { goalType: UNIVERSITY_GRADE_GOAL_TYPE, providerId: universityGradeProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "a university's student portal", detail: "a grade reached, shown" },
  // The examination results shown from the person's own account (D176): had or not, a score or a band compared with
  // the target on the exam's own scale (the Cambridge English Scale as it is, an IELTS band in tenths), the
  // baccalauréat passed or not.
  ...EXAM_IDS.map((id) => ({ goalType: EXAM_GOAL_TYPES[id], providerId: examProviderId(id), shape: SHAPE_HAVE_OR_NOT, source: "an examining body's own results page", detail: `${id.replace(/-shown$/, "").replace(/-/g, " ")}, shown` })),
  // A Udemy course finished, shown from the person's own account (D178): had or not, the course in the subject.
  { goalType: UDEMY_GOAL_TYPE, providerId: udemyProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "Udemy", detail: "a course finished, shown" },
  // An average at school, shown from the pupil's own EcoleDirecte account (D179): had or not, compared in hundredths.
  { goalType: ECOLEDIRECTE_GOAL_TYPE, providerId: ecoleDirecteProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "EcoleDirecte", detail: "an average at school, shown" },
  // PRONOTE (D203): an average at school, shown from the family's own space, the space bound into the subject.
  { goalType: PRONOTE_GOAL_TYPE, providerId: pronoteProviderId(), shape: SHAPE_HAVE_OR_NOT, source: "PRONOTE", detail: "an average at school, shown" },
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
