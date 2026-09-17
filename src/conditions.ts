import { GOAL_TYPE_DUOLINGO_XP } from "./gift-terms";

/**
 * The register of conditions: the spine of the product (structure of 17 Sep 2026, section 10, C1).
 *
 * A gift is money in somebody's name, tied to what they do, for a while. What they do comes from here and from
 * nowhere else: no screen names a source in its own words, it reads the gift's condition and the words that go
 * with it from this file. Two shapes exist, a daily condition (a lesson each day) and a milestone (reach a target
 * before a date).
 *
 * Only a condition that is wired from end to end, screen to contract to keeper, is `live`, and only live
 * conditions are ever offered (the integrity rule of CLAUDE.md: nothing is "available" without the code behind
 * it). The two milestones are written here with their words because their readings and terms already exist
 * (src/attested-sources.ts, src/milestone-terms.ts); they turn live on their own lines, C2 and C3, once their
 * contract is deployed and a real gift has run on it.
 */

export type ConditionKind = "daily" | "milestone";

/** How a person is tied to what they will do. */
export type ConditionLink =
  /** A public name on the source's site, which the funder may give or the recipient names. */
  | Readonly<{ kind: "username"; label: string; help: string; example: string }>
  /** A public page of the source the recipient hands over. */
  | Readonly<{ kind: "link"; label: string; help: string }>;

export type Condition = Readonly<{
  /** Stable, and what a gift's terms could name one day; never printed. */
  id: string;
  kind: ConditionKind;
  /** The contract's goal type for a daily condition; a milestone lives on its own contract and has none. */
  goalType: number | null;
  /** Wired from end to end. Only these are offered on "What will they do?". */
  live: boolean;
  /** The source's own name, the one word a screen may print about it. */
  source: string;
  /** The condition in words, as the radio on "What will they do?" reads it. */
  name: string;
  /** One line of help under that radio. */
  help: string;
  link: ConditionLink;
  /** The reading the keeper or the recipient makes, by its id in src/attested-sources.ts. */
  reading: string;
  words: Readonly<{
    /** What an earned day is called on the funder's screen: "Each day they reach it". */
    earnedDay: string;
    /** The state of a gift opened and not yet connected, on a card. */
    connect: string;
    /** The recipient's own instruction while counting, with the source named. */
    doIt: string;
  }>;
}>;

export const DUOLINGO_DAILY: Condition = {
  id: "duolingo-daily",
  kind: "daily",
  goalType: GOAL_TYPE_DUOLINGO_XP,
  live: true,
  source: "Duolingo",
  name: "A Duolingo lesson each day",
  help: "Read every morning from their public Duolingo profile. Nothing to install, no password.",
  link: {
    kind: "username",
    label: "Their Duolingo name, if you know it",
    help: "The name under their picture in Duolingo, like ama_learns. Leave it empty and they name their own.",
    example: "ama_learns",
  },
  reading: "duolingo-profile",
  words: {
    earnedDay: "Each day they reach it, this becomes theirs",
    connect: "Opened. Connect Duolingo to start counting.",
    doIt: "Do your lesson; nothing else. Each morning Viky reads your Duolingo and counts the day before.",
  },
};

/** C2, written with its words, live once MilestoneGift is deployed and a real gift has run on it. */
export const CHESS_RATING: Condition = {
  id: "chess-rating",
  kind: "milestone",
  goalType: null,
  live: false,
  source: "Chess.com",
  name: "Reach a chess rating on Chess.com",
  help: "Their public Chess.com rating, read every morning. Nothing to install, no password.",
  link: { kind: "username", label: "Their Chess.com name", help: "The name on their Chess.com profile.", example: "hikaru" },
  reading: "chess-ratings",
  words: {
    earnedDay: "When they reach it, this becomes theirs",
    connect: "Opened. Connect Chess.com to start reading.",
    doIt: "Play; nothing else. Each morning Viky reads your Chess.com rating.",
  },
};

/** C3, written with its words, live once a real certificate gift has run. */
export const COURSERA_CERTIFICATE: Condition = {
  id: "coursera-certificate",
  kind: "milestone",
  goalType: null,
  live: false,
  source: "Coursera",
  name: "Get a Coursera certificate",
  help: "The public page of the certificate, which they share when they have it.",
  link: { kind: "link", label: "The link to your certificate", help: "In Coursera, open the certificate and choose Share, then paste the link here." },
  reading: "coursera-certificate",
  words: {
    earnedDay: "When they get it, this becomes theirs",
    connect: "Opened. Share the Coursera certificate's link when you have it.",
    doIt: "Finish the course. When the certificate is yours, share its link here.",
  },
};

export const CONDITIONS: readonly Condition[] = [DUOLINGO_DAILY, CHESS_RATING, COURSERA_CERTIFICATE];

/** What "What will they do?" lists: only what works from end to end today. */
export function liveConditions(): readonly Condition[] {
  return CONDITIONS.filter((condition) => condition.live);
}

/** The condition of a gift already made, from the goal type its contract holds. */
export function conditionOfGoal(goalType: number): Condition | undefined {
  return CONDITIONS.find((condition) => condition.goalType === goalType);
}

export function conditionById(id: string): Condition | undefined {
  return CONDITIONS.find((condition) => condition.id === id);
}
