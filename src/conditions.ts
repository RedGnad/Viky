import { isValidDuolingoUsername } from "./duolingo-public-terms";
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

/**
 * How a funder's typed name is checked before any money moves: its shape here, its existence by a public read on
 * Viky's own route (decision 10 of the drawn flows), and the refusal for each, said under the field.
 */
export type NameCheck = Readonly<{
  valid: (value: string) => boolean;
  /** Viky's route that reads the source's public profile by name. */
  path: string;
  refusals: Readonly<{ shape: string; notFound: string; unavailable: string }>;
}>;

/** How a person is tied to what they will do. */
export type ConditionLink =
  /** A public name on the source's site, which the funder may give or the recipient names. */
  | Readonly<{
      kind: "username";
      /** The question on the funder's step, which is also its title. */
      label: string;
      help: string;
      /** Why giving it protects the gift, said once under the field. */
      why?: string;
      example: string;
      /** The line of the check screen, and what it says when the funder left the name empty. */
      row: string;
      noneGiven: string;
      check?: NameCheck;
    }>
  /** A public page of the source the recipient hands over. */
  | Readonly<{ kind: "link"; label: string; help: string }>;

/** What a daily condition asks of a day, and how the funder sets it on "How much, and for how long". */
export type DailyTarget = Readonly<{
  label: string;
  /** "10 XP a day", on the check screen. */
  inWords: (value: number) => string;
  suggested: number;
  min: number;
  tooLow: string;
}>;

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
  /**
   * The title of the step that asks the condition's own detail (structure, section 5, step 3): who is read, and what
   * counts. A condition with nothing to ask of the funder has none, and the step is skipped.
   */
  detailTitle?: string;
  /** A daily condition's bar for one day, asked on the detail step; a milestone has its own target and none of this. */
  target?: DailyTarget;
  /** The reading the keeper or the recipient makes, by its id in src/attested-sources.ts. */
  reading: string;
  words: Readonly<{
    /** What an earned day is called on the funder's screen: "Each day they reach it". */
    earnedDay: string;
    /** The state of a gift opened and not yet connected, on a card. */
    connect: string;
    /** The recipient's own instruction while counting, with the source named. */
    doIt: string;
    /** A day that counts, as the confirmation's next steps say it: "each day with a lesson". */
    eachDay: string;
    /** What the person does once the link is open, on the funder's confirmation: "connects their Duolingo". */
    theyConnect?: string;
    /** What a counted day was, in the morning message to the funder: "yesterday's lesson". */
    yesterday?: string;
    /** One line under a gift link's preview in a messaging app, to the person it is for. */
    preview?: string;
  }>;
  /**
   * What the gift's page says to the person it is for, and to the funder reading the same page (flows R1 to R12).
   * Only a condition whose page is built carries it; the page falls back to the register's other words otherwise.
   */
  recipient?: RecipientWords;
}>;

/** The words of a gift's page that depend on the source: how to connect it, how to prove it, what a day is. */
export type RecipientWords = Readonly<{
  /** "each day with your lesson", and the funder's reading of it. */
  eachDayYours: string;
  eachDayTheirs: string;
  /** Opened, not connected yet. */
  stillNeeds: string;
  connectTitle: string;
  usernameLabel: string;
  usernameHelp: string;
  typeToContinue: string;
  noPassword: string;
  notYet: string;
  /** The proof that the account is theirs, when they named it themselves. */
  proveTitle: (username: string) => string;
  proveSteps: string;
  slowToShow: string;
  /** When the funder named the account. */
  namedBy: (username: string, funder: string) => string;
  notMine: string;
  /** Connected. */
  countingFrom: (firstDay: string) => string;
  reads: string;
  /** A day that is neither counted nor lost yet, to each side. */
  catchUpYours: (deadline: string) => string;
  catchUpTheirs: (deadline: string) => string;
  /** The outcome of a reading that found nothing new today. */
  alreadyRead: string;
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
    why: "Naming it is the surest thing you can do: only that Duolingo can then earn this gift, whoever opens the link.",
    example: "ama_learns",
    row: "Their Duolingo name",
    noneGiven: "They name their own when they open it",
    check: {
      valid: isValidDuolingoUsername,
      path: "/api/duolingo/profile",
      refusals: {
        shape: "A Duolingo name has letters, figures, dots, hyphens or underscores, like ama_learns.",
        notFound: "No public Duolingo profile goes by that name. Check the spelling, or leave it empty.",
        unavailable: "Duolingo is not answering. Try again in a moment, or leave it empty.",
      },
    },
  },
  detailTitle: "Their Duolingo, and what counts as a day",
  target: {
    label: "XP they reach for a day to count",
    inWords: (value) => `${value} XP a day`,
    suggested: 10,
    min: 1,
    tooLow: "At least 1 XP.",
  },
  reading: "duolingo-profile",
  words: {
    earnedDay: "Each day they reach it, this becomes theirs",
    connect: "Opened. Connect Duolingo to start counting.",
    doIt: "Do your lesson; nothing else. Each morning Viky reads your Duolingo and counts the day before.",
    eachDay: "each day with a lesson",
    theyConnect: "connects their Duolingo",
    yesterday: "yesterday's lesson",
    preview: "A Duolingo lesson each day: each day you do one, that day's share becomes yours.",
  },
  recipient: {
    eachDayYours: "each day with your lesson",
    eachDayTheirs: "each day with their lesson",
    stillNeeds: "The gift is in your name. It still needs your Duolingo to start counting.",
    connectTitle: "Connect your Duolingo",
    usernameLabel: "Your Duolingo username",
    usernameHelp: "The name under your picture in Duolingo, like ama_learns. Your profile must be public.",
    typeToContinue: "Type your Duolingo name to continue.",
    noPassword: "No password, no sign-in: your lessons are read from your public profile. Next, a short code proves the profile is yours.",
    notYet: "I do not have Duolingo yet",
    proveTitle: (username) => `Prove ${username} is yours`,
    proveSteps: "In Duolingo, open Profile, then Settings, then Name, and add this code to your name:",
    slowToShow: "Duolingo can take a minute to show a new name. If Viky cannot see the code yet, wait a minute and press again.",
    namedBy: (username, funder) => `Your Duolingo: ${username}. Named by ${funder}. Nothing to sign in to, nothing to install: your lessons are read from your public profile.`,
    notMine: "That is not my Duolingo name",
    countingFrom: (firstDay) => `Done. From tomorrow, ${firstDay}, every day with your lesson is yours, counted by itself.`,
    reads: "Viky reads your Duolingo every day at that time and counts the day before.",
    catchUpYours: (deadline) => `Yesterday is not counted yet, and not lost either. Do a lesson before ${deadline} your time and it still counts.`,
    catchUpTheirs: (deadline) => `Yesterday is not counted yet, and not lost either: a lesson before ${deadline} your time still earns that day.`,
    alreadyRead: "Viky already read your Duolingo today. Come back tomorrow.",
  },
};

/**
 * C2, the milestone on Chess.com. Its cadences, its target question and its refusals are the milestone half of the
 * register (src/milestone-conditions.ts). Live once MilestoneGift is deployed and a real gift has run on it.
 */
export const CHESS_RATING: Condition = {
  id: "chess-rating",
  kind: "milestone",
  goalType: null,
  live: false,
  source: "Chess.com",
  name: "Reach a chess rating on Chess.com",
  help: "Their public Chess.com rating, read every day. Nothing to install, no password.",
  link: {
    kind: "username",
    label: "Their Chess.com name",
    help: "The name on their Chess.com profile, like hikaru. It is needed to read where they stand today.",
    why: "Only that Chess.com account can earn this gift, and they prove it is theirs with a short code when they open it.",
    example: "hikaru",
    row: "Their Chess.com name",
    noneGiven: "Not given",
    // The name is checked by reading where they stand in the chosen cadence, before any money moves. The rule is
    // Chess.com's own, the same as `isValidChessUsername`, which a test holds equal to it.
    check: {
      valid: (value) => /^[A-Za-z0-9_-]{3,25}$/.test(value),
      path: "/api/chess/standing",
      refusals: {
        shape: "A Chess.com name has three to twenty-five letters, figures, hyphens or underscores, like hikaru.",
        notFound: "No Chess.com player goes by that name. Check the spelling.",
        unavailable: "Chess.com is not answering. Try again in a moment.",
      },
    },
  },
  detailTitle: "Their Chess.com, and the rating they reach",
  // The reading that connects them. Each later reading is their cadence's own (src/milestone-conditions.ts).
  reading: "chess-profile",
  words: {
    earnedDay: "When they reach it, all of this becomes theirs",
    connect: "Opened. Connect Chess.com to start.",
    doIt: "Play; nothing else. Viky reads your Chess.com rating every day.",
    eachDay: "the first reading at the rating",
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
    eachDay: "the day the certificate is shared",
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
