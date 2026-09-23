import type { Hex } from "viem";
import {
  gradeTargetProblem,
  gradeUnits,
  isGradeShape,
  isPortalId,
  NO_RESULTS_PAGE,
  type ResultsExtract,
  UNIVERSITY_DURATION_DAYS,
  UNIVERSITY_ENROLLED,
  UNIVERSITY_GOAL_TYPE,
  UNIVERSITY_GRADE_GOAL_TYPE,
  UNIVERSITY_PASSED,
  UNIVERSITY_RESULTS_DURATION_DAYS,
  UNIVERSITY_YEAR_GOAL_TYPE,
  universityGradeSubject,
  universitySubject,
  universityYearSubject,
} from "./university-shown";
import { CHESS_MODES, CHESS_TACTICS, chessGoalType, isValidChessUsername, ratingHasSettled, recordHasSettled, type ChessClimb } from "./chess-com";
import {
  CHESS_RATING,
  CHESS_TACTICS_RECORD,
  conditionById,
  CREDLY_BADGE,
  COURSERA_CERTIFICATE as COURSERA_CONDITION,
  DUOLINGO_ENGLISH_TEST,
  type Condition,
  ECOLEDIRECTE_GRADE_SHOWN,
  UDEMY_COURSE_SHOWN,
  BAC_CAMEROON_SHOWN,
  BAC_FRANCE_SHOWN,
  BAC_MOROCCO_SHOWN,
  CAMBRIDGE_ENGLISH_SHOWN,
  IELTS_SHOWN,
  TOEFL_MYBEST_SHOWN,
  UNIVERSITY_ENROLLMENT_SHOWN,
  UNIVERSITY_GRADE_SHOWN,
  UNIVERSITY_YEAR_PASSED_SHOWN,
} from "./conditions";
import { COURSERA_DURATION_DAYS, COURSERA_GOAL_TYPE, COURSERA_HAS_IT, courseraCodeOf, courseraSlugOf, courseraSubject } from "./coursera-certificate";
import { CREDLY_DURATION_DAYS, CREDLY_GOAL_TYPE, CREDLY_HAS_IT, credlyBadgeIdOf, credlyPairOf, credlySubject } from "./credly-badge";
import {
  certificateSubject,
  detAliasOf,
  isValidDetScore,
  normaliseCertificateName,
  DET_DURATION_DAYS,
  DET_MAX_SCORE,
  DET_MIN_SCORE,
  DET_SCORE_STEP,
  DET_SOURCE,
} from "./duolingo-english-test";
import { DET_GOAL_TYPE } from "./milestone-goals";
import { isValidToeflScore, TOEFL_DURATION_DAYS, TOEFL_GOAL_TYPE, TOEFL_MAX_SCORE, TOEFL_MIN_SCORE, TOEFL_SHOWN_SUBJECT } from "./toefl-shown";
import {
  BAC_DURATION_DAYS,
  BAC_PASSED,
  CAMBRIDGE_SCALE,
  cambridgeInWords,
  EXAM_DURATION_DAYS,
  EXAM_GOAL_TYPES,
  EXAM_NOT_REGISTERED,
  EXAM_PROVIDERS,
  examSubject,
  IELTS_BAND,
  ieltsUnits,
  isValidCambridgeScore,
  isValidIeltsBand,
  type ExamId,
} from "./exam-shown";
import { CERTIFICATE as CERTIFICATE_SHAPE, CHESS_RATING as CHESS_RATING_SHAPE, type MilestoneShape } from "./milestone-terms";
import { UDEMY_DURATION_DAYS, UDEMY_FINISHED, UDEMY_GOAL_TYPE, UDEMY_NOT_REGISTERED, UDEMY_PROVIDER, udemySlugOf, udemySubject } from "./udemy-shown";
import { ECOLEDIRECTE_GOAL_TYPE, ECOLEDIRECTE_NOT_REGISTERED, ECOLEDIRECTE_PROVIDER, ECOLEDIRECTE_SUBJECT, isValidSchoolTarget, SCHOOL_DURATION_DAYS, schoolGradeInWords } from "./school-shown";

/**
 * The milestone half of the register of conditions (src/conditions.ts). A milestone asks the funder more than a daily
 * condition does, a cadence, a target and where the person stands today, and it lives on its own contract with goal
 * types of its own. What a screen needs for that is here, keyed by the condition, so no screen names a source or a
 * cadence in its own words (structure of 17 Sep 2026, section 12, item 10). Browser safe.
 */

export type MilestoneCadence = Readonly<{
  id: ChessClimb;
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
    /** The best that account ever held in that cadence, under today's reading. Information, never a refusal. */
    best: (best: number) => string;
    /** The button that reads where they stand, before it is pressed and while it works. Two climbs on one source
        read two different numbers, so neither may be called "their rating" by a screen (ui review, 20 Sep 2026). */
    read: string;
    reading: string;
    refusals: Readonly<{
      nameShape: string;
      notFound: string;
      noRating: (cadence: string) => string;
      unavailable: string;
      targetShape: string;
      noCadence: string;
      settling: string;
      /** Chess.com has closed the account (U1): the funder is refused before anything is paid. */
      closed: string;
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
    /** The source has closed the account (U1). The same sentence for both sides: it says the fact, and accuses nobody. */
    accountClosed: string;
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
    best: (best) => `Their best ever: ${best}.`,
    read: "Read their rating",
    reading: "Reading their rating",
    refusals: {
      nameShape: "A Chess.com name has three to twenty-five letters, figures, hyphens or underscores, like hikaru.",
      notFound: "No Chess.com player goes by that name. Check the spelling.",
      noRating: (cadence) => `They have no ${cadence.toLowerCase()} rating yet. Choose another rating, or ask them to play a rated game first.`,
      unavailable: "Chess.com is not answering. Try again in a moment.",
      targetShape: "Write the rating as a number, like 1500.",
      noCadence: "Choose which rating.",
      settling: "This rating is still settling: they need a few more games first.",
      closed: "Chess.com has closed this account, so nothing on it can be earned.",
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
    accountClosed: "Chess.com has closed this account, so this gift can no longer be earned.",
  },
};

/**
 * The puzzle record, a climb with nothing to choose inside it: the page publishes one puzzle rating and no cadence,
 * so the funder is asked the name, the record to beat, and how long, and nothing else. The chooser draws no question
 * where a milestone has one climb.
 */
const TACTICS_CLIMB: readonly MilestoneCadence[] = [
  { id: CHESS_TACTICS, goalType: chessGoalType(CHESS_TACTICS), label: "Puzzles", help: "The best puzzle rating that account ever reached." },
];

export const CHESS_TACTICS_MILESTONE: MilestoneCondition = {
  condition: CHESS_TACTICS_RECORD,
  // The cadences' own shape, and the fifty points are theirs: nothing has been measured about how fast a puzzle
  // record moves. It is the conservative side of the two, because a record is only beaten once and never given back,
  // where a rating can be reached on a good afternoon and lost on the next.
  shape: CHESS_RATING_SHAPE,
  cadences: TACTICS_CLIMB,
  standingPath: "/api/chess/standing",
  validName: isValidChessUsername,
  settled: recordHasSettled,
  duration: { min: 1, max: 365, suggested: 30 },
  words: {
    cadenceQuestion: "Which rating?",
    targetLabel: "The record they reach",
    today: (standing) => `Their record today is ${standing}.`,
    todayRow: (standing) => `${standing} in puzzles`,
    best: (best) => `Their best ever: ${best}.`,
    read: "Read their record",
    reading: "Reading their record",
    refusals: {
      nameShape: "A Chess.com name has three to twenty-five letters, figures, hyphens or underscores, like hikaru.",
      notFound: "No Chess.com player goes by that name. Check the spelling.",
      // Chess.com publishes no puzzle rating at all for an account that never solved one, so there is nothing to
      // climb from and the gift cannot be made. It is not refused as a zero, which would be a number nobody set.
      noRating: () => "They have never solved a puzzle on Chess.com, so there is no record to beat yet. Ask them to solve a few first.",
      unavailable: "Chess.com is not answering. Try again in a moment.",
      targetShape: "Write the record as a number, like 1500.",
      noCadence: "Choose which rating.",
      settling: "This record could not be read.",
      closed: "Chess.com has closed this account, so nothing on it can be earned.",
    },
    goal: (target) => `${target} in puzzles`,
    durationLabel: "Days they have to beat it",
    durationHelp: "Counted from the day they connect Chess.com, so opening the link late costs them nothing.",
    durationShape: (min, max) => `Between ${min} and ${max} days.`,
    durationInWords: (days) => `${days} ${days === 1 ? "day" : "days"} from the day they connect Chess.com`,
    whenReached: "When they beat it, all of this becomes theirs",
    ifNot: "If they do not beat it in time, all of it comes back to you. Nothing is kept by anybody else.",
    codeSteps: "On Chess.com, open Settings, then Profile. In Details, add this code to your first name, and save:",
    accountClosed: "Chess.com has closed this account, so this gift can no longer be earned.",
  },
};

const MILESTONES: readonly MilestoneCondition[] = [CHESS_MILESTONE, CHESS_TACTICS_MILESTONE];

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

/**
 * The milestone one climb belongs to. A rating and a puzzle record are read from the same source and the same route,
 * and they are refused in different words and judged by different guards, so what answers about a climb is the
 * condition that owns it rather than the first Chess.com one in the register.
 */
export function milestoneOfClimb(climb: string): MilestoneCondition | undefined {
  return MILESTONES.find((entry) => entry.cadences.some((cadence) => cadence.id === climb));
}

/** The cadence a milestone gift's goal type on the contract stands for. */
export function cadenceOfGoal(milestone: MilestoneCondition, goalType: number): MilestoneCadence | undefined {
  return milestone.cadences.find((cadence) => cadence.goalType === goalType);
}

/**
 * The other shape of milestone: something granted once, with a day on it (D47). It asks the funder nothing about a
 * cadence and nothing about where the person stands, because no public page says "not yet obtained": the page exists
 * only once the thing is granted. What the funder signs is the person, the score to reach, and a date.
 *
 * It is kept beside the climb rather than folded into it. The two ask different questions, and a type that pretended
 * otherwise would make every screen ask which half of itself it meant.
 */
export type CertificateCondition = Readonly<{
  condition: Condition;
  shape: MilestoneShape;
  /** The goal type on the milestone contract; its shape is fixed there when the goal is registered. */
  goalType: number;
  /** Viky's route that reads a pasted certificate, plainly, before any money moves. A shown condition has none. */
  readPath?: string;
  /**
   * Why no gift can be made on it today, whoever asks (D176): a provider of ours not registered yet. The create route
   * refuses `NOT_CONFIGURED` with these words; the day the provider is pinned, this is gone.
   */
  notOpen?: string;
  /**
   * Whether the funder types the person's name into the terms. A certificate binds a printed name; a proof shown
   * from an account binds the account and carries no name, so its subject is constant and nothing is asked (D164).
   */
  asksName?: boolean;
  /** True of something that could be a link to this source's certificate. */
  validLink: (value: string) => boolean;
  /**
   * Whether the name the funder typed is one this source's certificate could carry. The test prints a legal name and
   * asks for two words; a course certificate can carry one, and a real one does (measured 19 Sep 2026), so each
   * condition says what it takes rather than the screens assuming the stricter of the two.
   */
  validName: (value: string) => boolean;
  /** Whether the number the funder set is one this condition takes. */
  validTarget: (value: number) => boolean;
  /**
   * The person and the thing, hashed as the funder signs them into the terms. A score certificate binds the name; a
   * course certificate binds the name and the course, because "a certificate" alone would be paid by any of them.
   */
  subject: (input: Readonly<{ name: string; course?: string }>) => Hex;
  /**
   * The contract's integer for a target typed on the source's own scale, where the two differ: a grade is typed as
   * 14.5 and signed as 1450, in hundredths (D174). Absent where the target is the integer itself. The browser and
   * the create route both sign through it, so the terms rebuilt are the terms signed.
   */
  targetUnits?: (target: number) => number;
  /**
   * A condition made on a student portal Viky has proved (D165, D174): the portal is what the funder chose in
   * `course`, and the condition says why a row cannot take a gift on it with this target, by code, before any money
   * moves: no results page proved, a scale of letters, a target off the scale.
   */
  portal?: Readonly<{ refuses: (portal: Readonly<{ results: ResultsExtract | null }>, target: number) => Readonly<{ code: string; message: string }> | undefined }>;
  /**
   * What the funder names instead of a score, where there is nothing to score (C3). The certificate page carries the
   * same word as an ordinary course link, so the funder pastes the link and nothing is resolved between the two.
   */
  course?: Readonly<{
    label: string;
    help: string;
    /** The course inside whatever was pasted, or nothing. Where there is a list, what a choice from it answers. */
    slugOf: (pasted: string) => string | undefined;
    /**
     * Where the source's own catalogue is searched, when the thing is found by its words rather than pasted as a
     * link: the funder types, reads each answer with who awards it, and chooses. What the terms then carry is the
     * answer's own id, never the words (Credly, 20 Sep 2026).
     */
    search?: Readonly<{
      /** Viky's route that asks the source's search, with `?q=`. */
      path: string;
      placeholder: string;
      /** What the field says under itself when the words gave nothing. */
      nothing: string;
    }>;
    /** The line of the check screen. */
    row: string;
    /**
     * What the field says back once a course is recognised. A phone cuts a pasted link after its first thirty
     * characters, head first, so the part that names the course is exactly the part it hides (ui review, 19 Sep
     * 2026). This is the word that goes into the terms, said in full, under the box.
     */
    named: (course: string) => string;
  }>;
  target: Readonly<{
    label: string;
    help: string;
    min: number;
    max: number;
    step: number;
    suggested: number;
    /** "120 on the test", on the check screen. */
    inWords: (value: number) => string;
  }>;
  duration: Readonly<{ min: number; max: number; suggested: number }>;
  words: Readonly<{
    /** The question of the funder's detail step, which is also its title. */
    detailQuestion: string;
    /** The name the funder types, which the certificate must carry for the gift to pay. */
    nameLabel: string;
    nameHelp: string;
    /** What the recipient is asked for on their own page, and where they find it on the source's own site. */
    linkLabel: string;
    linkHelp: string;
    /** What Viky reads from the page, and what it does not keep: said before the link is pasted, not after. */
    whatIsRead: string;
    check: string;
    checking: string;
    /** What the gift pays for, on the check screen. */
    goal: (target: number) => string;
    /** The review, in one line: what the certificate has to show for this gift to pay. */
    mustShow: (name: string, target: number) => string;
    durationLabel: string;
    durationHelp: string;
    durationShape: (min: number, max: number) => string;
    durationInWords: (days: number) => string;
    whenReached: string;
    ifNot: string;
    refusals: Readonly<{
      targetShape: string;
      nameShape: string;
      linkShape: string;
      /** The taker has made the certificate private again, or it has run out of its two years. */
      notPublic: string;
      expired: string;
      notFound: string;
      unavailable: string;
      /** The certificate is in somebody else's name. */
      anotherName: string;
      below: (target: number, score: number) => string;
      beforeTheGift: string;
      afterTheDeadline: string;
    }>;
  }>;
}>;

export const DET_MILESTONE: CertificateCondition = {
  condition: DUOLINGO_ENGLISH_TEST,
  shape: CERTIFICATE_SHAPE,
  goalType: DET_GOAL_TYPE,
  readPath: "/api/det/certificate",
  validLink: (value) => detAliasOf(value) !== undefined,
  // The certificate prints the name its taker sat under, which their identity document carries: two words at least.
  validName: (value) => normaliseCertificateName(value).split(" ").filter(Boolean).length >= 2,
  validTarget: isValidDetScore,
  subject: ({ name }) => certificateSubject(DET_SOURCE, name),
  target: {
    label: "The score they reach",
    help: "The test is scored from 10 to 160, in fives. Most universities ask for something between 100 and 125.",
    min: DET_MIN_SCORE,
    max: DET_MAX_SCORE,
    step: DET_SCORE_STEP,
    suggested: 120,
    inWords: (value) => `${value} on the test`,
  },
  duration: DET_DURATION_DAYS,
  words: {
    detailQuestion: "Their name, and the score to reach",
    nameLabel: "Their full name, as on their identity document",
    nameHelp: "The certificate prints the name they sat the test under. If it does not match, the gift cannot pay.",
    linkLabel: "The link to your certificate",
    linkHelp: 'In your Duolingo English Test account, open your certificate and press "Get Shareable Link". That is what makes the page public, and it is the link to paste here.',
    whatIsRead:
      "Viky reads three things from that page: your score, the day of the test, and the name printed on it. It keeps those with the gift and nothing else. Your date of birth and your photograph are on the same page and are never asked for, received or kept.",
    check: "Check my certificate",
    checking: "Reading your certificate",
    goal: (target) => `Reach ${target} on the test`,
    mustShow: (name, target) =>
      `The certificate has to be in the name ${name}, show ${target} or more, and carry a test date inside these days. Nothing else is read from it.`,
    durationLabel: "How long do they have?",
    durationHelp: "The test must be taken inside that time, and the day on the certificate is what counts.",
    durationShape: (min, max) => `Between ${min} and ${max} days.`,
    durationInWords: (days) => `${days} ${days === 1 ? "day" : "days"} from today`,
    whenReached: "When they reach that score, all of this becomes theirs",
    ifNot: "If they do not reach it in time, all of it comes back to you. Nothing is kept by anybody else.",
    refusals: {
      targetShape: `A score between ${DET_MIN_SCORE} and ${DET_MAX_SCORE}, in fives.`,
      nameShape: "Type their name as it will appear on the certificate.",
      linkShape: "That is not a certificate link. It looks like certs.duolingo.com followed by a code.",
      notPublic: "That certificate is not public. Open it and press Get Shareable Link, then try again.",
      expired: "That certificate has expired. A result can only be shared for two years after the test.",
      notFound: "No certificate answers to that link. Check that you copied the whole link.",
      unavailable: "The certificate could not be read right now. Try again in a moment.",
      anotherName: "That certificate is in another name, so this gift cannot pay for it.",
      below: (target, score) => `That certificate is ${score}. This gift is for ${target}.`,
      beforeTheGift: "That test was taken before this gift was made, so it is not what the gift is for.",
      afterTheDeadline: "That test was taken after this gift's last day.",
    },
  },
};

/**
 * A course certificate (C3). The same shape as the test, asking one different thing: there is nothing to score, so
 * what the funder names beside the person is the course itself, by pasting its ordinary link. The certificate page
 * carries the same word for it, measured on two live certificates four years apart, so nothing is resolved between
 * what the funder types and what a proof reads.
 *
 * The target on the contract is one, and a proof carries one: the certificate exists or it does not. What tells two
 * courses apart is the subject, which binds the person and the course together.
 */
export const COURSERA_MILESTONE: CertificateCondition = {
  condition: COURSERA_CONDITION,
  shape: CERTIFICATE_SHAPE,
  goalType: COURSERA_GOAL_TYPE,
  readPath: "/api/coursera/certificate",
  validLink: (value) => courseraCodeOf(value) !== undefined,
  // A real certificate carries an empty last name (measured 19 Sep 2026), so one word is a name here.
  validName: (value) => normaliseCertificateName(value).split(" ").filter(Boolean).length >= 1,
  validTarget: (value) => value === COURSERA_HAS_IT,
  subject: ({ name, course }) => courseraSubject(name, String(course ?? "")),
  course: {
    label: "The course, by its link",
    help: "Open the course on Coursera and paste the whole link from your browser, like https://www.coursera.org/learn/introduction-git-github. The short form works too.",
    slugOf: courseraSlugOf,
    row: "Which course",
    named: (course) => `This gift will be for ${course}. That is the word Coursera puts on the certificate.`,
  },
  target: {
    label: "What the certificate has to be",
    help: "A Coursera certificate is granted or it is not, so there is nothing to choose here.",
    min: COURSERA_HAS_IT,
    max: COURSERA_HAS_IT,
    step: 1,
    suggested: COURSERA_HAS_IT,
    inWords: () => "the certificate of that course",
  },
  duration: COURSERA_DURATION_DAYS,
  words: {
    detailQuestion: "Their name, and the course",
    nameLabel: "Their name, as Coursera prints it on a certificate",
    nameHelp: "The name on their Coursera account. If it does not match, the gift cannot pay.",
    linkLabel: "The link to your certificate",
    linkHelp: 'In Coursera, open the certificate and choose Share, then paste the link here. It looks like coursera.org/verify/ followed by a code.',
    whatIsRead:
      "Viky reads four things from that page: the name on it, the course, the certificate's own code and the day it was granted. It keeps those with the gift and nothing else.",
    check: "Check my certificate",
    checking: "Reading your certificate",
    goal: () => "Get that certificate",
    mustShow: (name) => `The certificate has to be in the name ${name}, for that course, and granted inside these days. Nothing else is read from it.`,
    durationLabel: "How long do they have?",
    durationHelp: "The certificate must be granted inside that time, and the day on the page is what counts.",
    durationShape: (min, max) => `Between ${min} and ${max} days.`,
    durationInWords: (days) => `${days} ${days === 1 ? "day" : "days"} from today`,
    whenReached: "When they get it, all of this becomes theirs",
    ifNot: "If they do not get it in time, all of it comes back to you. Nothing is kept by anybody else.",
    refusals: {
      targetShape: "A Coursera certificate is granted or it is not, so there is nothing to set here.",
      nameShape: "Type their name as Coursera prints it on a certificate.",
      linkShape: "That is not a certificate link. It looks like coursera.org/verify/ followed by a code.",
      notPublic: "That certificate could not be read. Open its link yourself and check it still opens without signing in.",
      expired: "That certificate could not be read any more.",
      notFound: "No certificate answers to that link. Check that you copied the whole link.",
      unavailable: "The certificate could not be read right now. Try again in a moment.",
      anotherName: "That certificate is in another name, or for another course, so this gift cannot pay for it.",
      below: () => "That certificate is not the one this gift is for.",
      beforeTheGift: "That certificate was granted before this gift was made, so it is not what the gift is for.",
      afterTheDeadline: "That certificate was granted after this gift's last day.",
    },
  },
};

/**
 * A certification on Credly (20 Sep 2026). The same shape as a course certificate, with one difference in what the
 * funder names: a certification is read by the pair of ids its issuer publishes, so it is chosen from the short list
 * whose ids we have read, rather than named by pasting a link.
 */
export const CREDLY_MILESTONE: CertificateCondition = {
  condition: CREDLY_BADGE,
  shape: CERTIFICATE_SHAPE,
  goalType: CREDLY_GOAL_TYPE,
  readPath: "/api/credly/badge",
  validLink: (value) => credlyBadgeIdOf(value) !== undefined,
  // The page prints whatever name the person holds their Credly account under, and one word is a name there.
  validName: (value) => normaliseCertificateName(value).split(" ").filter(Boolean).length >= 1,
  validTarget: (value) => value === CREDLY_HAS_IT,
  subject: ({ name, course }) => credlySubject(name, String(course ?? "")),
  course: {
    label: "Which certification?",
    help: "Type a word or two of its name, like comptia, and choose it with the name of who awards it: the same name is awarded by several.",
    slugOf: (pasted) => credlyPairOf(pasted),
    search: {
      path: "/api/credly/search",
      placeholder: "Search a certification",
      nothing: "Credly knows no certification by those words. Try another word of its name.",
    },
    row: "Which certification",
    named: (course) => `This gift will be for ${course}.`,
  },
  target: {
    label: "What the badge has to be",
    help: "A certification is issued or it is not, so there is nothing to choose here.",
    min: CREDLY_HAS_IT,
    max: CREDLY_HAS_IT,
    step: 1,
    suggested: CREDLY_HAS_IT,
    inWords: () => "that certification",
  },
  duration: CREDLY_DURATION_DAYS,
  words: {
    detailQuestion: "Their name, and the certification",
    nameLabel: "Their name, as Credly prints it on a badge",
    nameHelp: "The name on their Credly account. If it does not match, the gift cannot pay.",
    linkLabel: "The link to your badge",
    linkHelp: "In Credly, open the badge and choose Share, then paste the link here. It looks like credly.com/badges/ followed by a code.",
    whatIsRead:
      "Viky reads three things about that badge: which certification it is, the day it was issued, and the name on its public page. It keeps those with the gift and nothing else. The badge's record also carries your email, hashed; nothing here reads it, receives it or keeps it.",
    check: "Check my badge",
    checking: "Reading your badge",
    goal: () => "Get that certification",
    mustShow: (name) => `The badge has to be in the name ${name}, for that certification, and issued inside these days. Nothing else is read from it.`,
    durationLabel: "How long do they have?",
    durationHelp: "The certification must be issued inside that time, and the day on the badge is what counts.",
    durationShape: (min, max) => `Between ${min} and ${max} days.`,
    durationInWords: (days) => `${days} ${days === 1 ? "day" : "days"} from today`,
    whenReached: "When they get it, all of this becomes theirs",
    ifNot: "If they do not get it in time, all of it comes back to you. Nothing is kept by anybody else.",
    refusals: {
      targetShape: "A certification is issued or it is not, so there is nothing to set here.",
      nameShape: "Type their name as Credly prints it on a badge.",
      linkShape: "That is not a badge link. It looks like credly.com/badges/ followed by a code.",
      notPublic: "That badge could not be read. Open its link yourself and check it still opens without signing in.",
      expired: "That badge could not be read any more.",
      notFound: "No badge answers to that link. Check that you copied the whole link.",
      unavailable: "The badge could not be read right now. Try again in a moment.",
      anotherName: "That badge is in another name, or for another certification, so this gift cannot pay for it.",
      below: () => "That badge is not the one this gift is for.",
      beforeTheGift: "That certification was issued before this gift was made, so it is not what the gift is for.",
      afterTheDeadline: "That certification was issued after this gift's last day.",
    },
  },
};


/** The certificate detail of a condition, or nothing when the condition is not one. */
/**
 * A TOEFL score shown from the person's own ETS account (D164): the certificate shape, asking the funder a score
 * and a length and no name, and asking the person nothing to paste. What the funder signs is the one subject every
 * gift on this condition carries, the score to show, and a date.
 */
export const TOEFL_SHOWN_MILESTONE: CertificateCondition = {
  condition: TOEFL_MYBEST_SHOWN,
  shape: CERTIFICATE_SHAPE,
  goalType: TOEFL_GOAL_TYPE,
  asksName: false,
  validLink: () => false,
  validName: () => true,
  validTarget: isValidToeflScore,
  subject: () => TOEFL_SHOWN_SUBJECT,
  target: {
    label: "The score they show",
    help: "The TOEFL iBT total is scored from 0 to 120. Universities most often ask for something between 80 and 100.",
    min: TOEFL_MIN_SCORE,
    max: TOEFL_MAX_SCORE,
    step: 1,
    suggested: 90,
    inWords: (value) => `${value} on the TOEFL`,
  },
  duration: TOEFL_DURATION_DAYS,
  words: {
    detailQuestion: "The score to show",
    nameLabel: "",
    nameHelp: "",
    linkLabel: "",
    linkHelp: "",
    whatIsRead: "Viky keeps the score the proof carries and the booking it belongs to, and nothing else. Your ETS password never reaches Viky.",
    check: "",
    checking: "",
    goal: (target) => `Show a TOEFL score of at least ${target}`,
    mustShow: (_name, target) => `A score of ${target} or more, shown from the person's own ETS account. When it was earned is not read.`,
    durationLabel: "How long do they have?",
    durationHelp: "The score has to be shown inside that time, and the day it is shown is what counts.",
    durationShape: (min, max) => `Between ${min} and ${max} days.`,
    durationInWords: (days) => `${days} ${days === 1 ? "day" : "days"} from today`,
    whenReached: "When they show that score, all of this becomes theirs",
    ifNot: "If they do not show it in time, all of it comes back to you. Nothing is kept by anybody else.",
    refusals: {
      targetShape: `A score between ${TOEFL_MIN_SCORE} and ${TOEFL_MAX_SCORE}.`,
      nameShape: "",
      linkShape: "",
      notPublic: "",
      expired: "",
      notFound: "",
      unavailable: "The proof could not be checked right now. Try again in a moment.",
      anotherName: "",
      below: (target, score) => `That score is ${score}. This gift is for ${target}.`,
      beforeTheGift: "",
      afterTheDeadline: "That was shown after this gift's last day.",
    },
  },
};

/** "Which university?", as the three conditions on the rail ask it: the same search over the proved portals (D165). */
const UNIVERSITY_COURSE: NonNullable<CertificateCondition["course"]> = {
  label: "Which university?",
  help: "Type a word of its name. Only a portal Viky has already proved with a student can be chosen: that is what makes the proof worth anything.",
  slugOf: (picked) => (isPortalId(picked.trim()) ? picked.trim() : undefined),
  search: {
    path: "/api/portals/search",
    placeholder: "Search a university",
    nothing: "Viky has proved no student portal by those words yet. The list grows one university at a time, with a student present.",
  },
  row: "Which university",
  named: (course) => `This gift will be for ${course}.`,
};

/**
 * Staying enrolled, shown from the person's own student portal (D165). The certificate shape with no name asked:
 * what the funder chooses is the portal, from the ones Viky has proved, and it is bound into the subject they sign.
 * There is nothing to score: enrolled is one, and the page that says so is what the person shows.
 */
export const UNIVERSITY_SHOWN_MILESTONE: CertificateCondition = {
  condition: UNIVERSITY_ENROLLMENT_SHOWN,
  shape: CERTIFICATE_SHAPE,
  goalType: UNIVERSITY_GOAL_TYPE,
  asksName: false,
  readPath: "",
  validLink: () => false,
  validName: () => true,
  validTarget: (value) => value === UNIVERSITY_ENROLLED,
  subject: ({ course }) => universitySubject(String(course ?? "")),
  // Any proved portal takes a gift on enrolment: that is what proving it means.
  portal: { refuses: () => undefined },
  course: { ...UNIVERSITY_COURSE, named: (course) => `This gift will be for staying enrolled at ${course}.` },
  target: {
    label: "What has to be shown",
    help: "Enrolled or not: there is nothing to choose here.",
    min: UNIVERSITY_ENROLLED,
    max: UNIVERSITY_ENROLLED,
    step: 1,
    suggested: UNIVERSITY_ENROLLED,
    inWords: () => "enrolled at that university",
  },
  duration: UNIVERSITY_DURATION_DAYS,
  words: {
    detailQuestion: "Which university, and how long",
    nameLabel: "",
    nameHelp: "",
    linkLabel: "",
    linkHelp: "",
    whatIsRead: "Viky keeps that the portal said enrolled, and the day it was shown, and nothing else. Your portal password never reaches Viky, and nothing about your marks is read.",
    check: "",
    checking: "",
    goal: () => "Show that you are enrolled",
    mustShow: () => "The page of their own student portal that says they are enrolled, shown from their own account. When they enrolled is not read.",
    durationLabel: "How long do they have?",
    durationHelp: "It has to be shown inside that time, and the day it is shown is what counts.",
    durationShape: (min, max) => `Between ${min} and ${max} days.`,
    durationInWords: (days) => `${days} ${days === 1 ? "day" : "days"} from today`,
    whenReached: "When they show they are enrolled, all of this becomes theirs",
    ifNot: "If they do not show it in time, all of it comes back to you. Nothing is kept by anybody else.",
    refusals: {
      targetShape: "",
      nameShape: "",
      linkShape: "",
      notPublic: "",
      expired: "",
      notFound: "",
      unavailable: "The proof could not be checked right now. Try again in a moment.",
      anotherName: "That was shown from another university's portal than the one this gift is for.",
      below: () => "The page shown does not say enrolled.",
      beforeTheGift: "",
      afterTheDeadline: "That was shown after this gift's last day.",
    },
  },
};

/**
 * Passing the year at their university, shown from the results page of the same portal (D174). Enrolment's shape
 * again, with one more thing the row must hold: the results page, proved from a student's session like the first.
 * There is nothing to score: passed is one, and the page that says so is what the person shows.
 */
export const UNIVERSITY_YEAR_MILESTONE: CertificateCondition = {
  condition: UNIVERSITY_YEAR_PASSED_SHOWN,
  shape: CERTIFICATE_SHAPE,
  goalType: UNIVERSITY_YEAR_GOAL_TYPE,
  asksName: false,
  readPath: "",
  validLink: () => false,
  validName: () => true,
  validTarget: (value) => value === UNIVERSITY_PASSED,
  subject: ({ course }) => universityYearSubject(String(course ?? "")),
  portal: { refuses: (portal) => (portal.results ? undefined : NO_RESULTS_PAGE) },
  course: { ...UNIVERSITY_COURSE, named: (course) => `This gift will be for passing the year at ${course}.` },
  target: {
    label: "What has to be shown",
    help: "Passed or not: there is nothing to choose here.",
    min: UNIVERSITY_PASSED,
    max: UNIVERSITY_PASSED,
    step: 1,
    suggested: UNIVERSITY_PASSED,
    inWords: () => "the year passed at that university",
  },
  duration: UNIVERSITY_RESULTS_DURATION_DAYS,
  words: {
    detailQuestion: "Which university, and how long",
    nameLabel: "",
    nameHelp: "",
    linkLabel: "",
    linkHelp: "",
    whatIsRead: "Viky keeps that the results page said passed, and the day it was shown, and nothing else. Your portal password never reaches Viky, and no grade is read.",
    check: "",
    checking: "",
    goal: () => "Show that you passed the year",
    mustShow: () => "The results page of their own student portal that says they passed the year, or the semester, shown from their own account. A page of another year does not count where the portal dates it.",
    durationLabel: "How long do they have?",
    durationHelp: "It has to be shown inside that time, and the day it is shown is what counts.",
    durationShape: (min, max) => `Between ${min} and ${max} days.`,
    durationInWords: (days) => `${days} ${days === 1 ? "day" : "days"} from today`,
    whenReached: "When they show they passed, all of this becomes theirs",
    ifNot: "If they do not show it in time, all of it comes back to you. Nothing is kept by anybody else.",
    refusals: {
      targetShape: "",
      nameShape: "",
      linkShape: "",
      notPublic: "",
      expired: "",
      notFound: "",
      unavailable: "The proof could not be checked right now. Try again in a moment.",
      anotherName: "That was shown from another university's portal than the one this gift is for.",
      below: () => "The results page shown does not say passed.",
      beforeTheGift: "",
      afterTheDeadline: "That was shown after this gift's last day.",
    },
  },
};

/**
 * Reaching a grade at their university, shown from the same results page (D174): the TOEFL's shape on the portal's
 * rail. The funder types the grade on the university's own scale, with decimals (14.5, or 3.5 for a GPA), and signs it
 * in hundredths; the scale is the row's, so a grade off it, or a scale of letters, is refused when the gift is made
 * and never when the person shows. Twelve is suggested because the corridor's universities grade out of twenty; on
 * another scale the create route says what the scale is.
 */
export const UNIVERSITY_GRADE_MILESTONE: CertificateCondition = {
  condition: UNIVERSITY_GRADE_SHOWN,
  shape: CERTIFICATE_SHAPE,
  goalType: UNIVERSITY_GRADE_GOAL_TYPE,
  asksName: false,
  readPath: "",
  validLink: () => false,
  validName: () => true,
  validTarget: isGradeShape,
  targetUnits: gradeUnits,
  subject: ({ course }) => universityGradeSubject(String(course ?? "")),
  portal: { refuses: (portal, target) => (portal.results ? gradeTargetProblem(portal.results.grade.scale, target) : NO_RESULTS_PAGE) },
  course: { ...UNIVERSITY_COURSE, named: (course) => `This gift will be for a grade at ${course}.` },
  target: {
    label: "The grade they reach",
    help: "On the university's own scale, with a dot for decimals: 14.5 out of 20, or 3.5 for a GPA out of 4. A grade off that scale is refused when the gift is made.",
    min: 0.01,
    max: 1_000,
    step: 0.01,
    suggested: 12,
    inWords: (value) => `${value.toFixed(2)} on the university's own scale`,
  },
  duration: UNIVERSITY_RESULTS_DURATION_DAYS,
  words: {
    detailQuestion: "Which university, and the grade to reach",
    nameLabel: "",
    nameHelp: "",
    linkLabel: "",
    linkHelp: "",
    whatIsRead: "Viky keeps the grade the results page carries, on the university's own scale, and the day it was shown, and nothing else. Your portal password never reaches Viky.",
    check: "",
    checking: "",
    goal: (target) => `Reach ${target.toFixed(2)} at their university`,
    mustShow: (_name, target) => `A grade of ${target.toFixed(2)} or more on the university's own scale, shown from their own results page. A page of another year does not count where the portal dates it.`,
    durationLabel: "How long do they have?",
    durationHelp: "The grade has to be shown inside that time, and the day it is shown is what counts.",
    durationShape: (min, max) => `Between ${min} and ${max} days.`,
    durationInWords: (days) => `${days} ${days === 1 ? "day" : "days"} from today`,
    whenReached: "When they show that grade, all of this becomes theirs",
    ifNot: "If they do not show it in time, all of it comes back to you. Nothing is kept by anybody else.",
    refusals: {
      targetShape: "Write the grade as a number on the university's scale, with a dot for decimals, like 14.5.",
      nameShape: "",
      linkShape: "",
      notPublic: "",
      expired: "",
      notFound: "",
      unavailable: "The proof could not be checked right now. Try again in a moment.",
      anotherName: "That was shown from another university's portal than the one this gift is for.",
      below: (target, score) => `That grade is ${(score / 100).toFixed(2)}. This gift is for ${(target / 100).toFixed(2)}.`,
      beforeTheGift: "",
      afterTheDeadline: "That was shown after this gift's last day.",
    },
  },
};

/** What every examination result of D176 shares with the TOEFL's shape: no name asked, nothing to paste, the subject constant. */
function examShape(id: ExamId, condition: Condition): Pick<CertificateCondition, "condition" | "shape" | "goalType" | "asksName" | "readPath" | "validLink" | "validName" | "subject" | "notOpen"> {
  return {
    condition,
    shape: CERTIFICATE_SHAPE,
    goalType: EXAM_GOAL_TYPES[id],
    asksName: false,
    readPath: "",
    validLink: () => false,
    validName: () => true,
    subject: () => examSubject(id),
    ...(EXAM_PROVIDERS[id] ? {} : { notOpen: EXAM_NOT_REGISTERED }),
  };
}

const EXAM_REFUSALS = {
  nameShape: "",
  linkShape: "",
  notPublic: "",
  expired: "",
  notFound: "",
  unavailable: "The proof could not be checked right now. Try again in a moment.",
  anotherName: "",
  beforeTheGift: "",
  afterTheDeadline: "That was shown after this gift's last day.",
} as const;

const EXAM_DURATION_WORDS = {
  durationLabel: "How long do they have?",
  durationHelp: "The result has to be shown inside that time, and the day it is shown is what counts.",
  durationShape: (min: number, max: number) => `Between ${min} and ${max} days.`,
  durationInWords: (days: number) => `${days} ${days === 1 ? "day" : "days"} from today`,
  ifNot: "If they do not show it in time, all of it comes back to you. Nothing is kept by anybody else.",
} as const;

/**
 * A Cambridge English result (D176): the funder types the overall score to show on the Cambridge English Scale, the
 * one scale every Cambridge English exam reports on, and the words say which level it is. The proof carries the
 * overall score of the Statement of Results; the contract compares it with the target as it is.
 */
export const CAMBRIDGE_MILESTONE: CertificateCondition = {
  ...examShape("cambridge-english-shown", CAMBRIDGE_ENGLISH_SHOWN),
  validTarget: isValidCambridgeScore,
  target: {
    label: "The score to show",
    help: "On the Cambridge English Scale, from 80 to 230, the same for every Cambridge English exam: B1 starts at 140, B2 at 160, C1 at 180, C2 at 200.",
    min: CAMBRIDGE_SCALE.min,
    max: CAMBRIDGE_SCALE.max,
    step: 1,
    suggested: 160,
    inWords: (value) => cambridgeInWords(value),
  },
  duration: EXAM_DURATION_DAYS,
  words: {
    detailQuestion: "The level to show",
    nameLabel: "",
    nameHelp: "",
    linkLabel: "",
    linkHelp: "",
    whatIsRead: "Viky keeps the overall score and the level the Statement of Results shows, and nothing else. Your Cambridge English password never reaches Viky.",
    check: "",
    checking: "",
    goal: (target) => `Show a Cambridge English result of at least ${cambridgeInWords(target)}`,
    mustShow: (_name, target) => `A Statement of Results with an overall score of ${cambridgeInWords(target)} or more, shown from the person's own Cambridge English account. When it was earned is not read.`,
    ...EXAM_DURATION_WORDS,
    whenReached: "When they show that result, all of this becomes theirs",
    refusals: {
      ...EXAM_REFUSALS,
      targetShape: `A score between ${CAMBRIDGE_SCALE.min} and ${CAMBRIDGE_SCALE.max} on the Cambridge English Scale, like 160 for B2.`,
      below: (target, score) => `That result is ${score}. This gift is for ${target}.`,
    },
  },
};

/**
 * An IELTS band (D176): the funder types the overall band, in halves with a dot, and signs it in tenths; the proof
 * carries the overall band in the same tenths.
 */
export const IELTS_MILESTONE: CertificateCondition = {
  ...examShape("ielts-shown", IELTS_SHOWN),
  validTarget: isValidIeltsBand,
  targetUnits: ieltsUnits,
  target: {
    label: "The overall band to show",
    help: "IELTS bands run from 1.0 to 9.0 in halves, with a dot: 6.5 is what many universities ask for.",
    min: IELTS_BAND.min,
    max: IELTS_BAND.max,
    step: IELTS_BAND.step,
    suggested: 6.5,
    inWords: (value) => `Band ${value.toFixed(1)}`,
  },
  duration: EXAM_DURATION_DAYS,
  words: {
    detailQuestion: "The band to show",
    nameLabel: "",
    nameHelp: "",
    linkLabel: "",
    linkHelp: "",
    whatIsRead: "Viky keeps the overall band the result shows, and nothing else. Your British Council password never reaches Viky.",
    check: "",
    checking: "",
    goal: (target) => `Show an IELTS band of at least ${target.toFixed(1)}`,
    mustShow: (_name, target) => `An IELTS result with an overall band of ${target.toFixed(1)} or more, shown from the person's own British Council test taker account. When it was earned is not read.`,
    ...EXAM_DURATION_WORDS,
    whenReached: "When they show that band, all of this becomes theirs",
    refusals: {
      ...EXAM_REFUSALS,
      targetShape: "A band between 1.0 and 9.0, in halves, with a dot: 6.5.",
      below: (target, band) => `That band is ${(band / 10).toFixed(1)}. This gift is for ${(target / 10).toFixed(1)}.`,
    },
  },
};

/** The baccalauréat passed, in one of three countries (D176): passed or not, nothing to choose, the year's own session. */
function bacMilestone(id: ExamId, condition: Condition, whatIsRead: string, mustShow: string): CertificateCondition {
  return {
    ...examShape(id, condition),
    validTarget: (value) => value === BAC_PASSED,
    target: {
      label: "What has to be shown",
      help: "Passed or not: there is nothing to choose here.",
      min: BAC_PASSED,
      max: BAC_PASSED,
      step: 1,
      suggested: BAC_PASSED,
      inWords: () => "the baccalauréat passed",
    },
    duration: BAC_DURATION_DAYS,
    words: {
      detailQuestion: "How long do they have?",
      nameLabel: "",
      nameHelp: "",
      linkLabel: "",
      linkHelp: "",
      whatIsRead,
      check: "",
      checking: "",
      goal: () => "Show that you passed the baccalauréat",
      mustShow: () => mustShow,
      ...EXAM_DURATION_WORDS,
      whenReached: "When they show they passed, all of this becomes theirs",
      refusals: {
        ...EXAM_REFUSALS,
        targetShape: "",
        below: () => "The results page shown does not say passed.",
      },
    },
  };
}

export const BAC_MOROCCO_MILESTONE = bacMilestone(
  "bac-morocco-shown",
  BAC_MOROCCO_SHOWN,
  "Viky keeps that the page said passed, and the day it was shown, and nothing else. Your CNE and CIN are typed in your own browser and never reach Viky.",
  "The Ministry's Bac Digital page that says the candidate passed, opened with their own CNE and CIN. The session is the year's own.",
);
export const BAC_CAMEROON_MILESTONE = bacMilestone(
  "bac-cameroon-shown",
  BAC_CAMEROON_SHOWN,
  "Viky keeps that the page said passed, and the day it was shown, and nothing else. Your Epim-Exam password never reaches Viky.",
  "The page of the candidate's own Epim-Exam space that says they passed, shown from their own account. The session is the year's own.",
);
export const BAC_FRANCE_MILESTONE = bacMilestone(
  "bac-france-shown",
  BAC_FRANCE_SHOWN,
  "Viky keeps that the page said passed, and the day it was shown, and nothing else. Your Cyclades password never reaches Viky.",
  "The page of the candidate's own Cyclades space that says they passed, shown from their own account. The session is the year's own.",
);

/**
 * A Udemy course finished, shown (D178): the Coursera shape's question, the course by its link, with nothing to paste
 * afterwards and no name asked. The course's slug is the subject the funder signs; the person shows their own account.
 */
export const UDEMY_MILESTONE: CertificateCondition = {
  condition: UDEMY_COURSE_SHOWN,
  shape: CERTIFICATE_SHAPE,
  goalType: UDEMY_GOAL_TYPE,
  asksName: false,
  readPath: "",
  validLink: () => false,
  validName: () => true,
  validTarget: (value) => value === UDEMY_FINISHED,
  subject: ({ course }) => udemySubject(String(course ?? "")),
  ...(UDEMY_PROVIDER ? {} : { notOpen: UDEMY_NOT_REGISTERED }),
  course: {
    label: "The course, by its link",
    help: "Open the course on Udemy and paste the whole link from your browser, like https://www.udemy.com/course/the-complete-python-bootcamp/.",
    slugOf: udemySlugOf,
    row: "Which course",
    named: (course) => `This gift will be for ${course}. That is the word Udemy puts in the course's link.`,
  },
  target: {
    label: "What has to be shown",
    help: "A course is finished or it is not, so there is nothing to choose here.",
    min: UDEMY_FINISHED,
    max: UDEMY_FINISHED,
    step: 1,
    suggested: UDEMY_FINISHED,
    inWords: () => "that course, finished",
  },
  duration: UDEMY_DURATION_DAYS,
  words: {
    detailQuestion: "The course, and how long",
    nameLabel: "",
    nameHelp: "",
    linkLabel: "",
    linkHelp: "",
    whatIsRead: "Viky keeps that your Udemy account shows this course finished, and the day it was shown, and nothing else. Your Udemy password never reaches Viky.",
    check: "",
    checking: "",
    goal: () => "Show that course finished",
    mustShow: () => "The person's own Udemy account showing that course finished, shown from their own browser. When it was finished is not read.",
    ...EXAM_DURATION_WORDS,
    durationHelp: "The course has to be shown finished inside that time, and the day it is shown is what counts.",
    whenReached: "When they show it finished, all of this becomes theirs",
    refusals: {
      ...EXAM_REFUSALS,
      targetShape: "",
      anotherName: "That was shown for another course than the one this gift is for.",
      below: () => "The course shown is not finished yet.",
    },
  },
};

/**
 * An average at school, shown from the pupil's or the family's own EcoleDirecte account (D179): the university grade's
 * shape on the one scale of French schools, out of 20 in hundredths, with no portal to choose and no name asked.
 */
export const ECOLEDIRECTE_MILESTONE: CertificateCondition = {
  condition: ECOLEDIRECTE_GRADE_SHOWN,
  shape: CERTIFICATE_SHAPE,
  goalType: ECOLEDIRECTE_GOAL_TYPE,
  asksName: false,
  readPath: "",
  validLink: () => false,
  validName: () => true,
  validTarget: isValidSchoolTarget,
  targetUnits: gradeUnits,
  subject: () => ECOLEDIRECTE_SUBJECT,
  ...(ECOLEDIRECTE_PROVIDER ? {} : { notOpen: ECOLEDIRECTE_NOT_REGISTERED }),
  target: {
    label: "The average to reach",
    help: "Out of 20, with a dot for decimals: 12.5, or 14. The overall average on the grades page is what counts.",
    min: 0.01,
    max: 20,
    step: 0.01,
    suggested: 12,
    inWords: (value) => schoolGradeInWords(value),
  },
  duration: SCHOOL_DURATION_DAYS,
  words: {
    detailQuestion: "The average to reach",
    nameLabel: "",
    nameHelp: "",
    linkLabel: "",
    linkHelp: "",
    whatIsRead: "Viky keeps the overall average the grades page shows, and the day it was shown, and nothing else: no grade, no remark, no name. Your EcoleDirecte password never reaches Viky.",
    check: "",
    checking: "",
    goal: (target) => `Reach an average of ${schoolGradeInWords(target)} at school`,
    mustShow: (_name, target) => `An overall average of ${schoolGradeInWords(target)} or more on the grades page of the person's own EcoleDirecte account, shown from their own browser. Which term it is for is not read.`,
    ...EXAM_DURATION_WORDS,
    durationHelp: "The average has to be shown inside that time, and the day it is shown is what counts.",
    whenReached: "When they show that average, all of this becomes theirs",
    refusals: {
      ...EXAM_REFUSALS,
      targetShape: "Write the average out of 20, with a dot for decimals, like 12.5.",
      below: (target, score) => `That average is ${(score / 100).toFixed(2)} / 20. This gift is for ${(target / 100).toFixed(2)} / 20.`,
    },
  },
};

/** The five examination results of D176, in the register's order, for the door and the tests. */
export const EXAM_MILESTONES: readonly CertificateCondition[] = [CAMBRIDGE_MILESTONE, IELTS_MILESTONE, BAC_MOROCCO_MILESTONE, BAC_CAMEROON_MILESTONE, BAC_FRANCE_MILESTONE];

const CERTIFICATES: readonly CertificateCondition[] = [
  DET_MILESTONE,
  COURSERA_MILESTONE,
  CREDLY_MILESTONE,
  TOEFL_SHOWN_MILESTONE,
  ...EXAM_MILESTONES,
  UDEMY_MILESTONE,
  UNIVERSITY_SHOWN_MILESTONE,
  UNIVERSITY_YEAR_MILESTONE,
  UNIVERSITY_GRADE_MILESTONE,
  ECOLEDIRECTE_MILESTONE,
];

export function certificateOf(condition: Condition | undefined): CertificateCondition | undefined {
  if (!condition || condition.kind !== "milestone") return undefined;
  return CERTIFICATES.find((entry) => entry.condition.id === condition.id);
}

export function certificateById(conditionId: string): CertificateCondition | undefined {
  return certificateOf(conditionById(conditionId));
}

/** The certificate condition a gift's goal type on the contract stands for, which is how a reading finds its words. */
export function certificateOfGoal(goalType: number): CertificateCondition | undefined {
  return CERTIFICATES.find((entry) => entry.goalType === goalType);
}
