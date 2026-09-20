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
 * (src/attested-sources.ts, src/milestone-terms.ts).
 *
 * What `live` means, since 19 Sep 2026 (D109): a gift can be made on it today. While we build, a condition wired from
 * end to end is offered as soon as that is true, rather than after a real gift has finished running on it; the
 * stricter door is kept for the version that is submitted. Chess.com went live under that rule, with two real gifts
 * already running on it; the Duolingo English Test follows the day its goal is registered on the contract.
 */

export type ConditionKind = "daily" | "milestone";

/**
 * The families the chooser groups by, once there are enough conditions to need grouping (design audit of 16 Sep 2026,
 * section 3). They live here and not on a screen: a family is a fact about what a person would be doing, like the
 * condition itself, and a screen that invented its own headings would drift from the register the first time one
 * moved.
 *
 * The titles are everyday verbs and name no source, because a heading that said Duolingo would turn the catalogue
 * into a shelf of brands rather than of efforts. The order is ours and it is deliberate: learning and sitting an exam
 * come first, because that is the door our segment walks through. Inside a family the order is alphabetical, the
 * GOV.UK rule, so that an editor's choice is never read as advice.
 */
export type ConditionFamily = "language" | "course" | "play" | "move";

export const FAMILIES: readonly Readonly<{ id: ConditionFamily; title: string }>[] = [
  { id: "language", title: "Learn a language" },
  { id: "course", title: "Finish a course" },
  { id: "play", title: "Play" },
  { id: "move", title: "Move" },
];

/** From this many conditions on offer, the chooser stops being one list and becomes one section per family. */
export const SECTIONS_FROM = 6;

/**
 * Where a condition stands in the open (design audit of 16 Sep 2026, section 5).
 *
 * The chooser offers only what is proved, and that rule does not move. What was missing was a public answer to the
 * question the rule raises, "so what can Viky check?", and the page at /what-viky-can-check is it: every condition
 * the register holds, offered or not, each with its state in words.
 *
 * Four states and no fifth. A condition that fits none of them is not written on that page at all, because inventing
 * a state to fit a thing is how a catalogue starts promising what nobody built. `open` is the same fact as `live`, so
 * a condition cannot be open on the page and absent from the chooser, or the other way round.
 */
export type ConditionState = "open" | "being-tested" | "asked-the-source" | "no-public-page";

export const STATES: readonly Readonly<{ id: ConditionState; title: string; meaning: string }>[] = [
  { id: "open", title: "Open", meaning: "Anybody can offer this today." },
  {
    id: "being-tested",
    title: "Being tested",
    meaning: "It works from end to end and one real gift is running on it. Nobody else is offered it yet.",
  },
  {
    id: "asked-the-source",
    title: "Waiting for the source's answer",
    meaning: "Built or planned, and closed until the source has answered in writing whether a program may read their pages.",
  },
  {
    id: "no-public-page",
    title: "No public page exists",
    meaning: "There is no page about one person that anybody can open, so nobody can check it: not Viky, not you.",
  },
];

/** The words of a state, for the page that prints them. */
export function stateWords(id: ConditionState): Readonly<{ id: ConditionState; title: string; meaning: string }> {
  const found = STATES.find((state) => state.id === id);
  if (!found) throw new Error(`no such state: ${id}`);
  return found;
}

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

/**
 * A source that holds several courses, of which exactly one counts (U1). Asked only when the funder gave the account
 * name, because the list comes from that account's own public page; without a name the gift counts the whole profile,
 * as every gift did before.
 */
export type ConditionCourse = Readonly<{
  /** "Which course counts?" */
  label: string;
  help: string;
  /** The line of the check screen, and what the gift's page says when the account is not learning it any more. */
  row: string;
  missing: (course: string) => string;
  /** What the whole profile counting looks like on the check screen, when no course was chosen. */
  wholeProfile: string;
}>;

export type Condition = Readonly<{
  /** Stable, and what a gift's terms could name one day; never printed. */
  id: string;
  kind: ConditionKind;
  /** The contract's goal type for a daily condition; a milestone lives on its own contract and has none. */
  goalType: number | null;
  /** Wired from end to end. Only these are offered on "What will they do?". */
  live: boolean;
  /** Where it stands in the open, said in words on "What Viky can check". Open means the same thing as `live`. */
  state: ConditionState;
  /** What has to happen before it is offered to anybody, in one line. A condition that is open has nothing to say here. */
  beforeItOpens?: string;
  /** The source's own name, the one word a screen may print about it. */
  source: string;
  /** Which family the chooser files it under. */
  family: ConditionFamily;
  /** The condition in words, as the radio on "What will they do?" reads it. */
  name: string;
  /**
   * The one line under that radio, and the only other thing the chooser says about a condition: how it is verified and
   * by whom, in one sentence (design audit of 16 Sep 2026, section 3). The two used to be two lines, the register's and
   * U2's, and a funder read the same thing twice (founder, 18 Sep 2026).
   *
   * It is a verification sentence, not a description: it says what is read and what that reading is worth, including
   * what it is not worth. The Duolingo line is the model, and the audit's table is where the others came from, kept
   * here only where the table said more than the register already did.
   */
  help: string;
  link: ConditionLink;
  /**
   * The title of the step that asks the condition's own detail (structure, section 5, step 3): who is read, and what
   * counts. A condition with nothing to ask of the funder has none, and the step is skipped.
   */
  detailTitle?: string;
  /** A daily condition's bar for one day, asked on the detail step; a milestone has its own target and none of this. */
  target?: DailyTarget;
  /** The one course a day is counted on (U1), asked on the same step once the source has answered with its courses. */
  course?: ConditionCourse;
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
  /** The same sentence to anybody who is not the person the gift is for: the funder, and a reader of neither side. */
  readsTheirs: string;
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
  state: "open",
  source: "Duolingo",
  family: "language",
  name: "A Duolingo lesson each day",
  help: "Read each morning from their public Duolingo profile, with nothing to install: it proves the account did the lesson, not who held the phone.",
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
  course: {
    label: "Which course counts?",
    help: "Only this course earns a day. Experience won in another course does not count.",
    row: "Which course",
    missing: (course) => `This Duolingo is not learning ${course} any more, so no day can be counted. Ask for a new gift: nothing is lost, and the whole amount goes back at the end.`,
    wholeProfile: "Any course on that profile",
  },
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
    readsTheirs: "Viky reads their Duolingo every day at that time and counts the day before.",
    catchUpYours: (deadline) => `Yesterday is not counted yet, and not lost either. Do a lesson before ${deadline} your time and it still counts.`,
    catchUpTheirs: (deadline) => `Yesterday is not counted yet, and not lost either: a lesson before ${deadline} your time still earns that day.`,
    alreadyRead: "Viky already read your Duolingo today. Come back tomorrow.",
  },
};

/**
 * C2, the milestone on Chess.com. Its cadences, its target question and its refusals are the milestone half of the
 * register (src/milestone-conditions.ts).
 *
 * Open since 19 Sep 2026 (D108): two real gifts run on it, 1,000,000 and 1,000,002, both connected and read by the
 * keeper on the chain, so a gift can be made on it by anybody rather than only through the operator door.
 */
export const CHESS_RATING: Condition = {
  id: "chess-rating",
  kind: "milestone",
  goalType: null,
  live: true,
  state: "open",
  source: "Chess.com",
  family: "play",
  name: "Reach a chess rating on Chess.com",
  help: "Their public Chess.com rating, read every day: Chess.com polices cheating itself, and Viky never pays an account it has closed.",
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
    preview: "A chess rating on Chess.com: the gift is yours when you reach it.",
  },
};

/**
 * The puzzle record, beside the rating and not folded into it (the founder's line of 20 Sep 2026). Chess.com
 * publishes the best puzzle rating an account ever reached on the same page as the cadences, and that number never
 * goes down, so the gift is "beat your own record" rather than "hold a rating": nothing a person does after
 * reaching it can take it away, and nothing but solving puzzles can move it.
 *
 * Open on 20 Sep 2026 with goal 12 registered on the milestone contract. No gift has run on it yet.
 */
export const CHESS_TACTICS_RECORD: Condition = {
  id: "chess-tactics",
  kind: "milestone",
  goalType: null,
  live: true,
  state: "open",
  source: "Chess.com",
  family: "play",
  name: "Beat their puzzle record on Chess.com",
  help: "The best puzzle rating that account ever reached, on the same public page as their rating: it only goes up, and Viky never pays an account Chess.com has closed.",
  link: {
    kind: "username",
    label: "Their Chess.com name",
    help: "The name on their Chess.com profile, like hikaru. It is needed to read the record they hold today.",
    why: "Only that Chess.com account can earn this gift, and they prove it is theirs with a short code when they open it.",
    example: "hikaru",
    row: "Their Chess.com name",
    noneGiven: "Not given",
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
  detailTitle: "Their Chess.com, and the record they reach",
  reading: "chess-profile",
  words: {
    earnedDay: "When they beat it, all of this becomes theirs",
    connect: "Opened. Connect Chess.com to start.",
    doIt: "Solve puzzles; nothing else. Viky reads your best puzzle rating every day.",
    eachDay: "the first reading at the new record",
    preview: "A puzzle record on Chess.com: the gift is yours when you beat it.",
  },
};

/**
 * U3, the one supervised result of the four read on 18 Sep 2026: the test is recorded, the identity checked against a
 * document, and the session reviewed by examiners. `live` stays false until a real gift has run on it and the founder
 * has settled the question of Duolingo's terms on automated reading.
 */
export const DUOLINGO_ENGLISH_TEST: Condition = {
  id: "duolingo-english-test",
  kind: "milestone",
  goalType: null,
  // Open since 19 Sep 2026: goal 5 is registered on the milestone contract, which was the only thing between this and
  // a gift being creatable on it (D109). What is not settled has not gone away, and it is on the judges page: the
  // reading is automated, which is the act Duolingo's terms ask about, and that written question is unanswered.
  live: true,
  state: "open",
  source: "Duolingo English Test",
  family: "language",
  name: "Reach a score on the Duolingo English Test",
  help: "Sat on camera with an identity document, marked by examiners: the score is read from the page they share, and nobody can award it to themselves.",
  link: {
    kind: "link",
    label: "The link to your certificate",
    help: "In your Duolingo English Test account, open your certificate, press Get Shareable Link, and paste the link here.",
  },
  reading: "det-certificate",
  words: {
    earnedDay: "When they reach that score, all of this becomes theirs",
    connect: "Opened. Share the Duolingo English Test certificate's link once the test is done.",
    doIt: "Take the test. When the certificate is ready, make its link shareable and paste it here.",
    eachDay: "the day of the test",
    preview: "A score on the Duolingo English Test: the gift is yours when you reach it.",
  },
};

/** C3, written with its words, live once a real certificate gift has run. */
export const COURSERA_CERTIFICATE: Condition = {
  id: "coursera-certificate",
  kind: "milestone",
  goalType: null,
  // Open on 20 Sep 2026, with goal 10 registered on the milestone contract, so a gift can be made on it (D109). What
  // their terms ask about an automated reading is on the judges page, where what a reading is worth is written, and
  // it is the same sentence the English test carries: the fact, and no word about who decides it here.
  live: true,
  state: "open",
  source: "Coursera",
  family: "course",
  name: "Get a Coursera certificate",
  help: "The certificate's public page, shared when they have it: the course and the day are read from it, and Coursera checks identity once, not each piece of work.",
  link: { kind: "link", label: "The link to your certificate", help: "In Coursera, open the certificate and choose Share, then paste the link here." },
  reading: "coursera-certificate",
  words: {
    earnedDay: "When they get it, this becomes theirs",
    connect: "Opened. Share the Coursera certificate's link when you have it.",
    doIt: "Finish the course. When the certificate is yours, share its link here.",
    eachDay: "the day the certificate is shared",
    preview: "A Coursera certificate: the gift is yours the day you share it.",
  },
};

/**
 * A certification on Credly, the badge half of the "course" family (20 Sep 2026). The difference from a course
 * certificate is who says it was earned: the issuer publishes the badge under its own id, and the person cannot
 * issue one to themselves. What they can do is choose to make it public, which is what a gift reads.
 *
 * Open on 20 Sep 2026 with goal 11 registered on the milestone contract. No gift has run on it yet.
 */
export const CREDLY_BADGE: Condition = {
  id: "credly-badge",
  kind: "milestone",
  goalType: null,
  live: true,
  state: "open",
  source: "Credly",
  family: "course",
  name: "Get a certification on Credly",
  help: "The badge its issuer published, read from Credly's own record of it: the issuer awards the badge, and nobody can award one to themselves.",
  link: { kind: "link", label: "The link to your badge", help: "In Credly, open the badge and choose Share, then paste the link here." },
  reading: "credly-assertion",
  words: {
    earnedDay: "When they get it, this becomes theirs",
    connect: "Opened. Share the Credly badge's link when you have it.",
    doIt: "Finish the course. When the badge is yours, share its link here.",
    eachDay: "the day the badge is shared",
    preview: "A certification on Credly: the gift is yours the day you share the badge.",
  },
};

export const CONDITIONS: readonly Condition[] = [DUOLINGO_DAILY, CHESS_RATING, CHESS_TACTICS_RECORD, DUOLINGO_ENGLISH_TEST, COURSERA_CERTIFICATE, CREDLY_BADGE];

/**
 * What people ask for and no source lets anybody check, with the reading each line rests on (design audit, section 5).
 *
 * These are not conditions: nothing is wired and nothing is planned, and the wall is at the source rather than in our
 * code. They are here so the public page can say so in the same words as the rest, rather than leave a whole kind of
 * gift looking like an oversight. Each `why` is what was read on the sources' own pages, on the day it names.
 *
 * "No public page exists" is about a page anybody can open, which is the only kind of reading Viky does today. It is
 * not a claim that nothing could ever be proved: a person signing in to their own account and proving what they see
 * there is a different reading, and it is not built.
 */
export type Frontier = Readonly<{ id: string; name: string; state: ConditionState; why: string }>;

export const FRONTIERS: readonly Frontier[] = [
  {
    id: "supervised-exams",
    name: "A Cambridge, IELTS or TOEFL result",
    state: "no-public-page",
    why: "The result goes to institutions. Checking one means an account an organisation applies for, opened with numbers the candidate hands over, and nothing about one person that anybody else can open. Read on 19 Sep 2026 on Cambridge English's, IELTS's and ETS's own pages.",
  },
  {
    id: "state-diplomas",
    name: "A state diploma",
    state: "no-public-page",
    why: "In France the holder draws an attestation from the state's own service, and a check needs the control key printed on it. Nothing anybody can open, and what a program could read would be that attestation rather than the diploma. Read on 19 Sep 2026 on diplome.gouv.fr.",
  },
  {
    id: "school-marks",
    name: "School marks",
    state: "no-public-page",
    why: "They live in a school's own portal, which opens for the family and for nobody else. No source publishes a page about a pupil.",
  },
];

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

/** One section of the chooser: a family, its title, and the conditions offered inside it, alphabetically. */
export type ConditionSection = Readonly<{ family: ConditionFamily; title: string; conditions: readonly Condition[] }>;

/**
 * How the chooser should draw what it is offering (design audit, section 3).
 *
 * Under six conditions it stays one list, because sections over four items are furniture rather than help. From six
 * it becomes one section per family, in the register's family order, alphabetical inside each, and a family with
 * nothing offered does not appear at all: an empty heading would advertise something the chooser refuses to offer.
 * Whichever shape it takes, the selection is single, and it is the same radio group.
 */
export function chooserSections(offered: readonly Condition[]): readonly ConditionSection[] | null {
  if (offered.length < SECTIONS_FROM) return null;
  return sectioned(offered);
}

/** Everything the register holds, by family, for the public page: what is offered and what is not, in one list. */
export function catalogueSections(): readonly ConditionSection[] {
  return sectioned(CONDITIONS);
}

function sectioned(conditions: readonly Condition[]): readonly ConditionSection[] {
  return FAMILIES.map(({ id, title }) => ({
    family: id,
    title,
    conditions: conditions.filter((condition) => condition.family === id).sort((a, b) => a.name.localeCompare(b.name, "en")),
  })).filter((section) => section.conditions.length > 0);
}
