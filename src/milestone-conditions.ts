import type { Hex } from "viem";
import { CHESS_MODES, chessGoalType, isValidChessUsername, ratingHasSettled, type ChessMode } from "./chess-com";
import { CHESS_RATING, conditionById, COURSERA_CERTIFICATE as COURSERA_CONDITION, DUOLINGO_ENGLISH_TEST, type Condition } from "./conditions";
import { COURSERA_DURATION_DAYS, COURSERA_GOAL_TYPE, COURSERA_HAS_IT, courseraCodeOf, courseraSlugOf, courseraSubject } from "./coursera-certificate";
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
import { CERTIFICATE as CERTIFICATE_SHAPE, CHESS_RATING as CHESS_RATING_SHAPE, type MilestoneShape } from "./milestone-terms";

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
    /** The best that account ever held in that cadence, under today's reading. Information, never a refusal. */
    best: (best: number) => string;
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
  /** Viky's route that reads a pasted certificate, plainly, before any money moves. */
  readPath: string;
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
   * What the funder names instead of a score, where there is nothing to score (C3). The certificate page carries the
   * same word as an ordinary course link, so the funder pastes the link and nothing is resolved between the two.
   */
  course?: Readonly<{
    label: string;
    help: string;
    /** The course inside whatever was pasted, or nothing. */
    slugOf: (pasted: string) => string | undefined;
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

const CERTIFICATES: readonly CertificateCondition[] = [DET_MILESTONE, COURSERA_MILESTONE];

/** The certificate detail of a condition, or nothing when the condition is not one. */
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
