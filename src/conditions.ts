import { isValidDuolingoUsername } from "./duolingo-public-terms";
import { UNIVERSITY_SOURCE } from "./university-shown";
import { ECOLEDIRECTE_SOURCE } from "./school-shown";
import { PRONOTE_SOURCE } from "./pronote-shown";
import { GOAL_TYPE_DUOLINGO_COURSE_XP, GOAL_TYPE_DUOLINGO_XP, GOAL_TYPE_FITBIT_ACTIVITY, GOAL_TYPE_STRAVA_DISTANCE } from "./gift-terms";

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
 * What `live` means, since 23 Sep 2026 (the founder's rule, D184, which replaces D109): a condition built is open
 * to everybody as soon as its path is complete, the register, the goal on the chain, the provider defined, the flow
 * built to the end. No operator door for what is built. The public page tells the truth line by line: "Open. Nobody
 * has shown one yet." until a real proof has passed, then "Open."; "Being built" only when a piece is really missing.
 */

export type ConditionKind = "daily" | "milestone";

/**
 * The families the chooser groups by, once there are enough conditions to need grouping (design audit of 16 Sep 2026,
 * section 3). They live here and not on a screen: a family is a fact about what a person would be doing, like the
 * condition itself, and a screen that invented its own headings would drift from the register the first time one
 * moved.
 *
 * The titles are everyday verbs and name no source, because a heading that said Duolingo would turn the catalogue
 * into a shelf of brands rather than of efforts. Inside a family the order is alphabetical, the GOV.UK rule, so that
 * an editor's choice is never read as advice.
 *
 * Four of them, filed by what the person does and not by who issues it (the founder, 28 Sep 2026), in this order:
 * Learn, School & studies, Play, Move, which the chooser draws as two rows of two tiles. School & studies holds the
 * university (enrolment, the year, a grade), the examinations (TOEFL, the Duolingo English Test, the baccalauréat,
 * WAEC, Cambridge, IELTS) and the online courses of universities, named by the university. Learn holds the daily lesson, the Codeforces rating and the certifications an
 * issuer awards. Inside a family the order is the register's (D139).
 */
export type ConditionFamily = "learn" | "exam" | "play" | "move";

export const FAMILIES: readonly Readonly<{ id: ConditionFamily; title: string }>[] = [
  // The founder's order of 28 Sep 2026, which is also the four tiles' two rows: Learn, School & studies; Play, Move.
  { id: "learn", title: "Learn" },
  // The id stays `exam`, the one the examination results had since D176: only the title widens.
  { id: "exam", title: "School & studies" },
  { id: "play", title: "Play" },
  // Move (D188): a source the person connects once, read each morning with their key.
  { id: "move", title: "Move" },
];

/**
 * The families there were until 24 Sep 2026, and where each went (D220). A family id written before that day, in a
 * gift's record or anywhere else, still reads through `familyOf`: nothing that names one is ever left without a family.
 */
export type RetiredFamily = "language" | "course" | "certification" | "study" | "school";
export const RETIRED_FAMILIES: Readonly<Record<RetiredFamily, ConditionFamily>> = {
  language: "learn",
  course: "learn",
  certification: "learn",
  study: "exam",
  school: "exam",
};

/** The family an id names today, whether it is one of the four or one retired on 24 Sep 2026; nothing for any other word. */
export function familyOf(id: string): ConditionFamily | undefined {
  if (FAMILIES.some((family) => family.id === id)) return id as ConditionFamily;
  return Object.prototype.hasOwnProperty.call(RETIRED_FAMILIES, id) ? RETIRED_FAMILIES[id as RetiredFamily] : undefined;
}

/**
 * The services the chooser lists once, whatever the number of their conditions (the founder, 29 Sep 2026): the three
 * university lines share the university, its portal and its list, and differ only in what is shown, so they are one
 * line, "At university", and its questions ask what they will show.
 */
export type ChoiceGroupId = "university";
export const CHOICE_GROUPS: Readonly<Record<ChoiceGroupId, Readonly<{ name: string; question: string }>>> = {
  university: { name: "At university", question: "What will they show?" },
};

/** The conditions of a group, in the register's order. */
export function groupMembers(group: ChoiceGroupId, among: readonly Condition[] = CONDITIONS): readonly Condition[] {
  return among.filter((condition) => condition.group?.id === group);
}

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
export type ConditionState = "open" | "asked-the-source" | "no-public-page";

/**
 * Three states, since the founder's rule of 23 Sep 2026 (D184): "Being tested" is gone, because nothing is said
 * tested or used without a real proof; the page prints the count of real proofs beside "Open" instead.
 */
export const STATES: readonly Readonly<{ id: ConditionState; title: string; meaning: string }>[] = [
  { id: "open", title: "Open", meaning: "Anybody can offer this today." },
  {
    id: "asked-the-source",
    title: "Waiting for the source's answer",
    meaning: "Built or planned, and closed until the source has answered in writing whether a program may read their pages.",
  },
  {
    id: "no-public-page",
    title: "No public page exists",
    meaning: "No public page shows it. The person can show it from their own account, and Viky is building that.",
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
      /**
       * The one line under the field, where it is not the help's own first sentence (the founder's rule 4 of 1 Oct
       * 2026, kit-rules.html): the help is then read whole in "How this is checked".
       */
      line?: string;
      /** Why giving it protects the gift, read in "How this is checked". */
      why?: string;
      example: string;
      /** The line of the check screen, and what it says when the funder left the name empty. */
      row: string;
      noneGiven: string;
      check?: NameCheck;
    }>
  /** A public page of the source the recipient hands over. */
  | Readonly<{ kind: "link"; label: string; help: string }>
  /**
   * An account the person connects once, on the source's own page, in their own browser (D188, the third nature):
   * the one gesture, in place of a name, and the consent said in our words before it.
   */
  | Readonly<{ kind: "connect"; label: string; help: string; consent: ConnectConsent }>;

/**
 * What the person is told before connecting, in Viky's words and not the source's (D188, rule 1): what Viky will
 * say to the funder, what the funder will never see, and how to disconnect and erase. Printed by the connect screen
 * and nowhere else; every sentence passes the consumer words check.
 */
export type ConnectConsent = Readonly<{
  /** "Connect your Fitbit". */
  title: string;
  /** What is read each morning, and what the funder is told: a yes or a no. */
  sees: string;
  /** What the funder will never see: the route, the times, the numbers. */
  never: string;
  /** How to disconnect and erase, from this page, at any time. */
  erase: string;
  /** The button that opens the source's own page. */
  connect: string;
  connecting: string;
  /** Once connected: what is now true, and the gesture that starts the counting. */
  connected: string;
  start: string;
  /** The way out, and what it says once done. */
  disconnect: string;
  erased: string;
  /** The person's own reading of the day, if they ask for it: shown to them alone, kept nowhere. */
  todayYours: string;
}>;

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

/**
 * The two natures of a condition (D162): read for the person by Viky, from a page anybody can open, without a
 * gesture; or shown by the person, from their own account, one gesture at a time. It is printed as two words on the
 * chooser, on the card and on the catalogue, and nowhere else.
 */
export type ConditionNature = "read" | "shown" | "connected";

export type Condition = Readonly<{
  /** Stable, and what a gift's terms could name one day; never printed. */
  id: string;
  kind: ConditionKind;
  /**
   * Read for them, shown by them, or connected by them (D188): a key the person hands Viky once, read each morning
   * with the attestor never seeing it. Every condition of the pilot is read: the two others are different promises.
   */
  nature: ConditionNature;
  /** The contract's goal type for a daily condition; a milestone lives on its own contract and has none. */
  goalType: number | null;
  /** Wired from end to end. Only these are offered on "What will they do?". */
  live: boolean;
  /**
   * Where it stands in the open, said in words on "What Viky can check". Open means the same thing as `live`. A
   * condition being built beside the register (`BUILDING`) carries none: the page says "Being built" of it, and
   * "Being tested" is printed only once a real gift runs on it (the founder, 23 Sep 2026, D169). Four states, no fifth.
   */
  state?: ConditionState;
  /** The piece really missing before it opens, in one line (D184). A condition that is open has nothing to say here. */
  beforeItOpens?: string;
  /** The source's own name, the one word a screen may print about it. */
  source: string;
  /** Which family the chooser files it under. */
  family: ConditionFamily;
  /** The condition in words, as the radio on "What will they do?" reads it. */
  name: string;
  /**
   * One line for several conditions of the same service (the founder, 29 Sep 2026): the chooser lists the group once,
   * and its questions ask which of them, as "Which rating?" asks a chess cadence. `mode` is that answer's own words.
   */
  group?: Readonly<{ id: ChoiceGroupId; mode: string }>;
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
    /** The same of a day counted the day it was done, which the third daily contract allows: "today's lesson". */
    today?: string;
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
  /**
   * That fold: the button that opens the source's own site and says so, and one line (the founder, 4 Oct 2026).
   */
  notYetHow: Readonly<{ says: string; open: string; href: string }>;
  /** The proof that the account is theirs, when they named it themselves. */
  proveTitle: (username: string) => string;
  /** The second of the three steps of the code: where it goes at the source, in a few words (the founder, 4 Oct 2026). */
  codeStep: string;
  slowToShow: string;
  /** When the funder named the account. */
  namedBy: (username: string, funder: string) => string;
  /** How an account the funder named is read, said in "How this is checked" at the moment it is connected. */
  namedHow: string;
  /** The button that opens the name's field again, where the person typed the name themselves. It says what it does. */
  anotherUsername: string;
  /**
   * The fold under the one action, where the funder named the account: pressing it does nothing but open a sentence,
   * so it is a fold with a question for its name, not a button (the founder, 4 Oct 2026).
   */
  notYours: string;
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
  /**
   * The same gift read as the day goes (the third daily contract, 3 Oct 2026): a day is paid the day it is done, its
   * page looks as it opens, and nothing is pressed. Absent on a condition that is read each morning on every version.
   */
  asItGoes?: Readonly<{
    /**
     * What is agreed and guaranteed about the day's pay, read in "What was agreed" (the re-read of 3 Oct 2026, C2):
     * nothing a reading's own timing could make untrue is promised there. The exact rule is on the judges page.
     */
    agreed: string;
    /** Connected: the first day is the day of the connection. */
    countingFrom: (firstDay: string) => string;
    /** How it is read, in "How this is checked", to the person it is for and to anybody else. */
    reads: string;
    readsTheirs: string;
    /** Today is open and what is done each day has not been seen yet. */
    notIn: string;
    /** It has been seen, and the attested reading is under way. */
    inYours: string;
    inTheirs: (name: string | null) => string;
    /** An earlier day is still open: what the next one pays, and what one more pays. `day` is "yesterday", "today" or a date. */
    nextPaysYours: (day: string) => string;
    nextPaysTheirs: (name: string | null, day: string) => string;
    oneMorePays: (day: string) => string;
  }>;
}>;

export const DUOLINGO_DAILY: Condition = {
  id: "duolingo-daily",
  kind: "daily",
  nature: "read",
  goalType: GOAL_TYPE_DUOLINGO_XP,
  live: true,
  state: "open",
  source: "Duolingo",
  family: "learn",
  name: "A Duolingo lesson each day",
  help: "Read each morning from their public Duolingo profile, with nothing to install: it proves the account did the lesson, not who held the phone.",
  link: {
    kind: "username",
    label: "Their Duolingo name",
    help: "The name under their picture in Duolingo, like ama_learns.",
    line: "Empty? They name their own.",
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
    today: "today's lesson",
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
    // A fold's name, a question: pressing it opens a sentence and does nothing else (the founder, 4 Oct 2026).
    notYet: "No Duolingo yet?",
    notYetHow: { says: "Free. Come back with your username.", open: "Open Duolingo", href: "https://www.duolingo.com" },
    proveTitle: (username) => `Prove ${username} is yours`,
    codeStep: "Add it to your name in Duolingo: Profile, Settings, Name.",
    slowToShow: "Duolingo can take a minute to show a new name. If Viky cannot see the code yet, wait a minute and press again.",
    namedBy: (username, funder) => `Your Duolingo: ${username}. Named by ${funder}.`,
    namedHow: "Nothing to sign in to, nothing to install: your lessons are read from your public profile.",
    // On that screen "name" is already the Duolingo name the code goes into, and the field is called "username".
    anotherUsername: "Use another username",
    notYours: "Not your Duolingo name?",
    countingFrom: (firstDay) => `Done. From tomorrow, ${firstDay}, every day with your lesson is yours, counted by itself.`,
    reads: "Viky reads your Duolingo every day at that time and counts the day before.",
    readsTheirs: "Viky reads their Duolingo every day at that time and counts the day before.",
    catchUpYours: (deadline) => `Yesterday is not counted yet, and not lost either. Do a lesson before ${deadline} your time and it still counts.`,
    catchUpTheirs: (deadline) => `Yesterday is not counted yet, and not lost either: a lesson before ${deadline} your time still earns that day.`,
    alreadyRead: "Viky already read your Duolingo today. Come back tomorrow.",
    asItGoes: {
      agreed: "One lesson pays one day. A second lesson the same day counts for tomorrow only if today was already counted when it was taken.",
      countingFrom: (firstDay) => `Done. From today, ${firstDay}, every day with your lesson is yours, counted the day you do it.`,
      reads: "Viky looks at your Duolingo when this page opens, and through the day. A lesson is counted the day you do it.",
      readsTheirs: "Viky looks at their Duolingo when this page opens, and through the day. A lesson is counted the day it is done.",
      notIn: "Today's lesson is not in yet.",
      inYours: "Your lesson is in.",
      inTheirs: (name) => (name ? `${name}'s lesson is in.` : "Their lesson is in."),
      nextPaysYours: (day) => `Your next lesson pays ${day}.`,
      nextPaysTheirs: (name, day) => `${name ? `${name}'s` : "Their"} next lesson pays ${day}.`,
      oneMorePays: (day) => `One more pays ${day}.`,
    },
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
  nature: "read",
  goalType: null,
  live: true,
  state: "open",
  source: "Chess.com",
  family: "play",
  name: "A chess rating on Chess.com",
  help: "Their public Chess.com rating, read every day: Chess.com polices cheating itself, and Viky never pays an account it has closed.",
  link: {
    kind: "username",
    label: "Their Chess.com name",
    help: "The name on their Chess.com profile, like hikaru. It is needed to read where they stand today.",
    why: "Only that Chess.com account can earn this gift. Check the name: nobody is asked to prove it is theirs.",
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
  nature: "read",
  goalType: null,
  live: true,
  state: "open",
  source: "Chess.com",
  family: "play",
  name: "A puzzle record on Chess.com",
  help: "The best puzzle rating that account ever reached, on the same public page as their rating: it only goes up, and Viky never pays an account Chess.com has closed.",
  link: {
    kind: "username",
    label: "Their Chess.com name",
    help: "The name on their Chess.com profile, like hikaru. It is needed to read the record they hold today.",
    why: "Only that Chess.com account can earn this gift. Check the name: nobody is asked to prove it is theirs.",
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
  nature: "read",
  goalType: null,
  // Open since 19 Sep 2026: goal 5 is registered on the milestone contract, which was the only thing between this and
  // a gift being creatable on it (D109). What is not settled has not gone away, and it is on the judges page: the
  // reading is automated, which is the act Duolingo's terms ask about, and that written question is unanswered.
  live: true,
  state: "open",
  source: "Duolingo English Test",
  family: "exam",
  name: "A Duolingo English Test score",
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
  nature: "read",
  goalType: null,
  // Open on 20 Sep 2026, with goal 10 registered on the milestone contract, so a gift can be made on it (D109). What
  // their terms ask about an automated reading is on the judges page, where what a reading is worth is written, and
  // it is the same sentence the English test carries: the fact, and no word about who decides it here.
  live: true,
  state: "open",
  source: "Coursera",
  family: "exam",
  name: "A Coursera certificate",
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
 * An edX verified certificate (D212), read for the person like Coursera's: the link they share, the page edX
 * publishes for it, the name and the course the funder signed. Being built until goal 25 is signed and the reading
 * service runs its source.
 */
export const EDX_CERTIFICATE: Condition = {
  id: "edx-certificate",
  kind: "milestone",
  nature: "read",
  goalType: null,
  // Open since goal 25 was signed and the reading service ran the edX source (D218).
  live: true,
  state: "open",
  source: "edX",
  family: "exam",
  // The schools behind the courses, which is what a funder recognises (the founder, 29 Sep 2026), in the register's 30.
  name: "Harvard, MIT and more, on edX",
  help: "The verified certificate's public page on edX, shared when they have it: the course and the day are read from it, and edX checks identity for that track.",
  link: { kind: "link", label: "The link to your certificate", help: "In edX, open the certificate and copy the whole link from your browser, courses.edx.org/certificates/ followed by its id, then paste it here." },
  reading: "edx-certificate",
  words: {
    earnedDay: "When they get it, this becomes theirs",
    connect: "Opened. Share the edX certificate's link when you have it.",
    doIt: "Finish the course on the verified track. When the certificate is yours, share its link here.",
    eachDay: "the day the certificate is shared",
    preview: "An edX certificate: the gift is yours the day you share it.",
  },
};

/**
 * A certificate from MITx Online, MIT's own course platform (D222), read for the person like an edX one: MIT's courses
 * left edX for it. Being built until goal 29 is signed and the reading service runs the MITx Online source.
 */
export const MITX_ONLINE_CERTIFICATE_LINE: Condition = {
  id: "mitx-online-certificate",
  kind: "milestone",
  nature: "read",
  goalType: null,
  // Open since goal 29 was signed and the reading service ran the MITx Online source (D222, D275).
  live: true,
  state: "open",
  source: "MITx Online",
  family: "exam",
  name: "An MIT course certificate",
  help: "The certificate's public page on MITx Online, shared when they have it: the course and the day are read from it. It proves a course taken, not a place at MIT.",
  link: { kind: "link", label: "The link to your certificate", help: "In MITx Online, open the certificate from your dashboard and copy the whole link from your browser, mitxonline.mit.edu/certificate/ followed by its id, then paste it here." },
  reading: "mitx-online-certificate",
  words: {
    earnedDay: "When they get it, this becomes theirs",
    connect: "Opened. Share the MITx Online certificate's link when you have it.",
    doIt: "Finish the course on the certificate track. When the certificate is yours, share its link here.",
    eachDay: "the day the certificate is shared",
    preview: "An MIT course certificate, from MITx Online: the gift is yours the day you share it.",
  },
};

/**
 * A certification on Credly, and a family of its own (the founder's line of 20 Sep 2026). A certification is not a
 * course taken: a CompTIA is sat as an examination with no course at all, and what is awarded is awarded by
 * somebody who is not the person. Filing it beside Coursera erased the distinction that made it worth building.
 *
 * The difference from a course certificate is who says it was earned: the issuer publishes the badge under its own
 * id, and the person cannot issue one to themselves. What they can do is choose to make it public, which is what a
 * gift reads.
 *
 * Open on 20 Sep 2026 with goal 11 registered on the milestone contract. No gift has run on it yet.
 */
export const CREDLY_BADGE: Condition = {
  id: "credly-badge",
  kind: "milestone",
  nature: "read",
  goalType: null,
  live: true,
  state: "open",
  source: "Credly",
  family: "learn",
  name: "A certification on Credly",
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

/**
 * A credential its issuer published on Accredible (D213), read for the person like a Credly badge: the link they
 * share, the record Accredible publishes for it, the name and the credential the funder named. Being built until goal
 * 26 is signed and the reading service runs its source.
 */
export const ACCREDIBLE_CREDENTIAL: Condition = {
  id: "accredible-credential",
  kind: "milestone",
  nature: "read",
  goalType: null,
  // Open since goal 26 was signed and the reading service ran the Accredible source (D218).
  live: true,
  state: "open",
  source: "Accredible",
  family: "learn",
  name: "A credential on Accredible",
  help: "The credential its issuer published on Accredible, read from its public record: the title, the issuer and the day, and nobody can issue one to themselves.",
  link: { kind: "link", label: "The link to your credential", help: "Open your credential on credential.net and copy the whole link from your browser, then paste it here." },
  reading: "accredible-credential",
  words: {
    earnedDay: "When they get it, this becomes theirs",
    connect: "Opened. Share the Accredible credential's link when you have it.",
    doIt: "Earn the credential. When the issuer has published it, share its link here.",
    eachDay: "the day the credential is shared",
    preview: "A credential on Accredible: the gift is yours the day you share it.",
  },
};

/**
 * The first condition of the second nature (D162, D164): a score the person shows from their own ETS account. Open
 * since 23 Sep 2026 under the founder's rule (D184): its path is complete, the register, goal 13 registered on the
 * milestone contract, the directory's provider pinned, the flow built to the end. Nobody has shown one yet, and the
 * public page says so until somebody has.
 */
export const TOEFL_MYBEST_SHOWN: Condition = {
  id: "toefl-mybest-shown",
  kind: "milestone",
  nature: "shown",
  goalType: null,
  live: true,
  state: "open",
  source: "ETS",
  family: "exam",
  name: "A TOEFL score, shown",
  help: "A score they hold, shown from their own ETS account: it proves the account that signed in, not who sat the test, and when it was earned is not read.",
  link: { kind: "link", label: "Show it from your ETS account", help: "Press Show it on your gift's page and sign in to ETS in the tab that opens. Nothing to paste." },
  reading: "toefl-mybest-shown",
  words: {
    earnedDay: "When they show that score, all of this becomes theirs",
    connect: "Opened. Show the score from your ETS account when you are ready.",
    doIt: "Press Show it and sign in to ETS in the tab that opens. The score on your account is what counts.",
    eachDay: "the day it is shown",
    preview: "A TOEFL score, shown from your own ETS account: the gift is yours when you show it.",
  },
};

/**
 * Staying enrolled at a university, shown from the person's own student portal (D165). The portal is chosen by the
 * funder from the list (src/portal-store.ts, the world's since D313) and bound into what they sign; the person shows the
 * page that says they are enrolled. It opens the day a real portal has been proved end to end, and on the founder's
 * word.
 */
export const UNIVERSITY_ENROLLMENT_SHOWN: Condition = {
  id: "university-enrollment-shown",
  kind: "milestone",
  nature: "shown",
  goalType: null,
  // Open since the first portal row exists (D200): the American University of Rome, from the Reclaim directory (D199).
  live: true,
  state: "open",
  source: UNIVERSITY_SOURCE,
  family: "exam",
  name: "Enrolled at university, shown",
  group: { id: "university", mode: "Enrolled" },
  help: "Shown by them from their own student portal: the page that says they are enrolled, no marks read. It proves the account, not who sits in class.",
  link: { kind: "link", label: "Show it from your student portal", help: "Press Show it on your gift's page and sign in to your university's portal in the tab that opens. Nothing to paste." },
  reading: "university-enrollment-shown",
  words: {
    earnedDay: "When they show they are enrolled, all of this becomes theirs",
    connect: `Opened. Nothing shown yet from ${UNIVERSITY_SOURCE}.`,
    doIt: "Press Show it and sign in to your student portal in the tab that opens. The page that says you are enrolled is what counts.",
    eachDay: "the day it is shown",
    preview: "Enrolled at your university, shown from your own student portal: the gift is yours when you show it.",
  },
};

/**
 * Passing the year at their university, shown from the results page of the person's own student portal (D174): the
 * second line on the rail. The same university as enrolment, chosen by the funder from the list, and its results
 * provider (D313); the year, or the semester, as the page itself says it.
 */
export const UNIVERSITY_YEAR_PASSED_SHOWN: Condition = {
  id: "university-year-passed-shown",
  kind: "milestone",
  nature: "shown",
  goalType: null,
  // Open since D313 (the founder, 28 Sep 2026): a university without a results provider takes the gift all the same,
  // and the provider is asked for and built within two days.
  live: true,
  state: "open",
  source: UNIVERSITY_SOURCE,
  family: "exam",
  name: "Passed the year at university",
  group: { id: "university", mode: "The year passed" },
  help: "The results page of their own student portal, shown by them, saying they passed the year or the semester: it proves the account, not who sat the exams.",
  link: { kind: "link", label: "Show it from your student portal", help: "Press Show it on your gift's page and sign in to your university's portal in the tab that opens. Nothing to paste." },
  reading: "university-year-passed-shown",
  words: {
    earnedDay: "When they show they passed, all of this becomes theirs",
    connect: `Opened. Nothing shown yet from ${UNIVERSITY_SOURCE}.`,
    doIt: "Press Show it and sign in to your student portal in the tab that opens. The results page that says you passed is what counts.",
    eachDay: "the day it is shown",
    preview: "The year passed at your university, shown from your own student portal: the gift is yours when you show it.",
  },
};

/**
 * Reaching a grade at their university, shown from the same results page (D174): the third line on the rail, and
 * the one with a target, as the TOEFL score has. The grade is read on the university's own scale, the one the
 * portal's row declares; a scale of letters is declared and refused until a later decision says what a letter is
 * worth.
 */
export const UNIVERSITY_GRADE_SHOWN: Condition = {
  id: "university-grade-shown",
  kind: "milestone",
  nature: "shown",
  goalType: null,
  // Open since D313 (the founder, 28 Sep 2026): a university without a results provider takes the gift all the same,
  // and the provider is asked for and built within two days.
  live: true,
  state: "open",
  source: UNIVERSITY_SOURCE,
  family: "exam",
  name: "Reached a grade at university",
  group: { id: "university", mode: "A grade" },
  help: "The results page of their own student portal, shown by them, with the grade read on the university's own scale: it proves the account, not who sat the exams.",
  link: { kind: "link", label: "Show it from your student portal", help: "Press Show it on your gift's page and sign in to your university's portal in the tab that opens. Nothing to paste." },
  reading: "university-grade-shown",
  words: {
    earnedDay: "When they show that grade, all of this becomes theirs",
    connect: `Opened. Nothing shown yet from ${UNIVERSITY_SOURCE}.`,
    doIt: "Press Show it and sign in to your student portal in the tab that opens. The grade on your results page is what counts.",
    eachDay: "the day it is shown",
    preview: "A grade at your university, shown from your own student portal: the gift is yours when you show it.",
  },
};

/**
 * Enrolment in a Chinese university, shown from the Ministry's own register, CHSI (D215): the person opens their own
 * student-status verification report with the code they applied for, in the verification tab. Shown and not read for
 * them, because the report's page can put an image captcha in front of a server. Being built until our provider is
 * registered from a real report and goal 27 is signed.
 */
export const CHSI_ENROLMENT_SHOWN: Condition = {
  id: "chsi-enrolment-shown",
  kind: "milestone",
  nature: "shown",
  goalType: null,
  live: false,
  beforeItOpens: "Its provider, registered on the Reclaim dashboard from a real CHSI report, and goal 27 signed by the owner.",
  source: "CHSI",
  family: "exam",
  name: "Enrolled in China, shown",
  help: "Their own student-status report on CHSI, the Ministry's register, opened by them with its code: enrolled or not. It proves the report's holder, not who sits in class.",
  link: { kind: "link", label: "Show it from your CHSI report", help: "Press Show it on your gift's page, then type your report's verification code in the tab that opens. Nothing to paste here." },
  reading: "chsi-enrolment-shown",
  words: {
    earnedDay: "When they show they are enrolled, all of this becomes theirs",
    connect: "Opened. Show your student-status report from CHSI when you are ready.",
    doIt: "Press Show it and type your report's verification code in the tab that opens. The student status is what counts.",
    eachDay: "the day it is shown",
    preview: "Enrolled in China, shown from your own CHSI report: the gift is yours when you show it.",
  },
};

/**
 * A WASSCE result, shown from WAEC's own result checker (D217): the person types their card on WAEC's page in the
 * verification tab, because WAEC's terms forbid giving its access codes to anyone else. Credits with English and
 * Mathematics among them. Being built until our provider is registered from a real result and goal 28 is signed.
 */
export const WAEC_RESULT_SHOWN: Condition = {
  id: "waec-result-shown",
  kind: "milestone",
  nature: "shown",
  goalType: null,
  live: false,
  beforeItOpens: "Its provider, registered on the Reclaim dashboard from a real WAEC result, and goal 28 signed by the owner.",
  source: "WAEC",
  family: "exam",
  name: "WASSCE credits, shown",
  help: "Their own WASSCE result on WAEC's checker, opened by them with their result card: the credits, English and Mathematics among them. It proves the result, not who sat the exam.",
  link: { kind: "link", label: "Show it from WAEC's result checker", help: "Press Show it on your gift's page, then type your examination number and your card on WAEC's page in the tab that opens. Nothing to paste here." },
  reading: "waec-result-shown",
  words: {
    earnedDay: "When they show those credits, all of this becomes theirs",
    connect: "Opened. Show your WASSCE result from WAEC's checker when it is out.",
    doIt: "Press Show it and type your examination number and your result card on WAEC's page in the tab that opens. The credits are what count.",
    eachDay: "the day it is shown",
    preview: "WASSCE credits, shown from WAEC's own result checker: the gift is yours when you show them.",
  },
};

/**
 * Fitbit, connected by the person (D188): the first condition of the third nature. Since the legacy Fitbit Web API
 * closes in September 2026, it is read through the Google Health API, which reads Fitbit trackers and Pixel Watches
 * (D197): the person authorises Viky once on Google's own page, and each morning the keeper asks for yesterday's
 * active minutes through the attested fetch with their key as a secret, judges them against the target, and keeps the
 * verdict alone. The funder learns a yes
 * or a no for the day; the numbers are read, judged and dropped.
 */
export const FITBIT_DAILY: Condition = {
  id: "fitbit-daily",
  kind: "daily",
  nature: "connected",
  goalType: GOAL_TYPE_FITBIT_ACTIVITY,
  // Open since the reading service ran its source and the five variables were set (D201).
  live: true,
  state: "open",
  source: "Fitbit",
  family: "move",
  name: "Active minutes a day, Fitbit",
  help: "Connected once through Google: each morning, did yesterday's Fitbit reach the minutes? Viky keeps only yes or no. It proves the tracker moved, not the wearer.",
  link: {
    kind: "connect",
    label: "Connect your Fitbit",
    help: "You authorise Viky once, on Google's own page, with the Google account your Fitbit uses. Nothing to type here, nothing to paste.",
    consent: {
      title: "Connect your Fitbit",
      sees: "Each morning Viky asks Google Health one thing about yesterday: did your Fitbit's active minutes reach the target. The person who sent this gift is told yes or no for the day, and nothing else.",
      never: "They never see where you went, when, for how long, or any number: not your steps, not your heart rate, not your minutes. Viky reads them, judges the day, and keeps none of them.",
      erase: "You can disconnect and erase from this page at any time. Viky then gives Google's key back and keeps nothing of yours; the gift goes on, with each day counted as not done until you connect again.",
      connect: "Connect Fitbit",
      connecting: "Opening Fitbit",
      connected: "Fitbit is connected. From tomorrow, every day with your minutes is yours, counted each morning.",
      start: "Start counting",
      disconnect: "Disconnect and erase",
      erased: "Disconnected. Google's key is given back and nothing of yours is kept. Connect again whenever you like.",
      todayYours: "Only you can see today's number, and Viky keeps it nowhere.",
    },
  },
  detailTitle: "Their Fitbit, and the minutes a day",
  target: {
    label: "Active minutes they reach for a day to count",
    inWords: (value) => `${value} active minutes a day`,
    suggested: 30,
    min: 1,
    tooLow: "At least 1 minute.",
  },
  reading: "google-health-active-minutes",
  words: {
    earnedDay: "Each day they reach it, this becomes theirs",
    connect: "Opened. Connect Fitbit to start counting.",
    doIt: "Move; nothing else. Each morning Viky asks Google Health whether yesterday reached your minutes.",
    eachDay: "each day with the minutes",
    theyConnect: "connects their Fitbit",
    yesterday: "yesterday's minutes",
    preview: "Active minutes a day, on Fitbit: each day you reach them, that day's share becomes yours.",
  },
};

/**
 * Strava, connected by the person (D191): the second source of the third nature, on the model of Fitbit. They
 * authorise Viky once on Strava's own page; each morning the keeper reads yesterday's activities with their key as a
 * secret, adds the distances, judges the day against the kilometres the funder set, and keeps the verdict alone.
 * Goal 4 of the daily contract, registered in the same Safe session as goal 6.
 */
/**
 * "Reach a Codeforces rating" (the founder, 27 Sep 2026): a climb of the Learn family in the chess rating's shape,
 * read for the person from Codeforces' public API every day. The funder gives the handle and the rating; the person
 * binds the account with a code in their profile; Codeforces polices itself (plagiarism, rounds made unrated). Being
 * built until goal 33 is signed and the reading service runs the Codeforces source.
 */
export const CODEFORCES_RATING: Condition = {
  id: "codeforces-rating",
  kind: "milestone",
  nature: "read",
  goalType: null,
  // Open since goal 33 was signed and the reading service ran the Codeforces sources (D281).
  live: true,
  state: "open",
  source: "Codeforces",
  family: "learn",
  name: "Reach a Codeforces rating",
  help: "Their public Codeforces rating, read every day: Codeforces polices cheating itself and makes rounds unrated when it must. It proves the rating, not who solved.",
  link: {
    kind: "username",
    label: "Their Codeforces handle",
    help: "The handle on their Codeforces profile, like tourist. It is needed to read where they stand today.",
    why: "Only that Codeforces account can earn this gift. Check the name: nobody is asked to prove it is theirs.",
    example: "tourist",
    row: "Their Codeforces handle",
    noneGiven: "Not given",
    // The handle is checked by reading where they stand, before any money moves: the same rule as `isValidCodeforcesHandle`.
    check: {
      valid: (value) => /^[A-Za-z0-9_.-]{3,24}$/.test(value),
      path: "/api/codeforces/standing",
      refusals: {
        shape: "A Codeforces handle has three to twenty-four letters, figures, underscores, hyphens or dots, like tourist.",
        notFound: "No Codeforces user goes by that handle. Check the spelling.",
        unavailable: "Codeforces is not answering. Try again in a moment.",
      },
    },
  },
  reading: "codeforces-user",
  detailTitle: "Their Codeforces, and the rating they reach",
  words: {
    earnedDay: "When they reach it, all of this becomes theirs",
    connect: "Opened. Connect Codeforces to start the climb.",
    doIt: "Connect your Codeforces account, then climb. Viky reads your rating every day.",
    eachDay: "the day the rating is read",
    preview: "Reach a Codeforces rating: the gift is yours the day your rating gets there.",
  },
};

/**
 * "Set a time at a WCA competition" (the founder, 27 Sep 2026): a milestone of the Play family, read for the person
 * from the World Cube Association's public API, the way a marathon is read from its timing company (D273). The
 * funder chooses the coming competition and the event and writes the person's name; before the day, the public list
 * of competitors stands in for the bib; after it, the person's result in that event is read. Being built until goal
 * 32 is signed and the reading service runs the WCA source.
 */
export const WCA_TIME_LINE: Condition = {
  id: "wca-time",
  kind: "milestone",
  nature: "read",
  goalType: null,
  // Open since goal 32 was signed and the reading service ran the WCA source (D281).
  live: true,
  state: "open",
  source: "the WCA",
  family: "play",
  // The founder's "Set a time at a WCA competition" is thirty-one characters; the card holds thirty (21 Sep 2026).
  name: "A time at a WCA competition",
  help: "Their result in one event at one competition, read from the WCA's public results: the name, the event, the best single. It proves the result, not who solved.",
  link: { kind: "link", label: "Your WCA ID or your name", help: "Before the competition, check on your gift's page that you are on its competitors list. After it, Viky reads your result." },
  reading: "wca-person-results",
  words: {
    earnedDay: "When they set the time, all of this becomes theirs",
    connect: "Opened. Check that you are on the competitors list before the competition; after it, Viky reads your result from the WCA.",
    doIt: "Check that you are on the competitors list before the competition, then compete. After it, Viky reads your result from the WCA's public results.",
    eachDay: "the day the result is read",
    preview: "Set a time at a WCA competition: the gift is yours when the WCA's results say you did.",
  },
};

/**
 * "Finish a marathon" (D273): a milestone of the Move family, read for the person from the timing company's own
 * public results page, as an examination result is read from its board. The funder writes the runner's name and
 * chooses the race; the person enters their bib before the start; the reading service reads the runner's own line.
 * Being built until goal 30 is signed and the reading service runs the Breizh Chrono source.
 */
export const MARATHON_FINISH_LINE: Condition = {
  id: "marathon-finish",
  kind: "milestone",
  nature: "read",
  goalType: null,
  // Open since goal 30 was signed and the reading service ran the Breizh Chrono source (D273, D275).
  live: true,
  state: "open",
  source: "Breizh Chrono",
  family: "move",
  name: "Finish a marathon",
  help: "Their line on the timing company's results page, read for them: the name, the bib and the official time. It proves the result, not who wore the bib.",
  link: { kind: "link", label: "Your bib number", help: "Enter the number on your bib on your gift's page before the race starts. After the finish, Viky reads your line on the results page." },
  reading: "breizh-chrono-runner",
  words: {
    earnedDay: "When they finish, all of this becomes theirs",
    connect: "Opened. Enter your bib number before the race starts; after the finish, Viky reads your line on Breizh Chrono.",
    doIt: "Enter your bib number here before the start, then run. After the finish, Viky reads your line on the timing company's results page.",
    eachDay: "the day the result is read",
    preview: "Finish a marathon: the gift is yours when the results page says you did.",
  },
};

export const STRAVA_DAILY: Condition = {
  id: "strava-daily",
  kind: "daily",
  nature: "connected",
  goalType: GOAL_TYPE_STRAVA_DISTANCE,
  // Open since the reading service ran its source and the five variables were set (D201).
  live: true,
  state: "open",
  source: "Strava",
  family: "move",
  name: "Kilometres each day, on Strava",
  help: "Connected once: each morning, did yesterday's Strava activities reach the distance? Viky keeps only yes or no. It proves the account moved, not who moved.",
  link: {
    kind: "connect",
    label: "Connect your Strava",
    help: "You authorise Viky once, on Strava's own page. Nothing to type here, nothing to paste.",
    consent: {
      title: "Connect your Strava",
      sees: "Each morning Viky asks Strava one thing about yesterday: did your activities add up to the kilometres. The person who sent this gift is told yes or no for the day, and nothing else.",
      never: "They never see where you went, when, how fast, or any number: not your routes, not your times, not your distance. Viky reads them, judges the day, and keeps none of them.",
      erase: "You can disconnect and erase from this page at any time. Viky then gives Strava's key back and keeps nothing of yours; the gift goes on, with each day counted as not done until you connect again.",
      connect: "Connect Strava",
      connecting: "Opening Strava",
      connected: "Strava is connected. From tomorrow, every day with your kilometres is yours, counted each morning.",
      start: "Start counting",
      disconnect: "Disconnect and erase",
      erased: "Disconnected. Strava's key is given back and nothing of yours is kept. Connect again whenever you like.",
      todayYours: "Only you can see today's number, and Viky keeps it nowhere.",
    },
  },
  detailTitle: "Their Strava, and the kilometres a day",
  target: {
    label: "Kilometres they cover for a day to count",
    inWords: (value) => `${value} km a day`,
    suggested: 3,
    min: 1,
    tooLow: "At least 1 kilometre.",
  },
  reading: "strava-day-activities",
  words: {
    earnedDay: "Each day they reach it, this becomes theirs",
    connect: "Opened. Connect Strava to start counting.",
    doIt: "Move; nothing else. Each morning Viky asks Strava whether yesterday's activities reached your kilometres.",
    eachDay: "each day with the kilometres",
    theyConnect: "connects their Strava",
    yesterday: "yesterday's kilometres",
    preview: "Kilometres each day, on Strava: each day you reach them, that day's share becomes yours.",
  },
};

// The order inside each family is the founder's of 28 Sep 2026: the university, then the examinations, then the
// universities' online courses; Duolingo, Codeforces, Credly, Accredible; chess, WCA; Fitbit, Strava, the races.
export const CONDITIONS: readonly Condition[] = [UNIVERSITY_ENROLLMENT_SHOWN, UNIVERSITY_YEAR_PASSED_SHOWN, UNIVERSITY_GRADE_SHOWN, TOEFL_MYBEST_SHOWN, DUOLINGO_ENGLISH_TEST, EDX_CERTIFICATE, MITX_ONLINE_CERTIFICATE_LINE, COURSERA_CERTIFICATE, DUOLINGO_DAILY, CODEFORCES_RATING, CREDLY_BADGE, ACCREDIBLE_CREDENTIAL, CHESS_RATING, CHESS_TACTICS_RECORD, WCA_TIME_LINE, FITBIT_DAILY, STRAVA_DAILY, MARATHON_FINISH_LINE];

/**
 * What is built with a piece really missing (D184): a provider not registered, a portal not proved. Nobody can make a
 * gift on these, operator or not; the public page prints them under their family with "Being built" and the missing
 * piece in one line. The day the piece exists, the line moves into the register above, open, and this list shrinks.
 */

/**
 * The five examination results of D176, each shown from the person's own account with the examining body, each
 * waiting for a provider of ours registered from a real candidate's session (src/exam-shown.ts). The words of each
 * are the TOEFL's shape: a result they hold, shown; when it was earned is not read; the account, not who sat it.
 */
const EXAM_BEFORE_IT_OPENS = "Its provider, registered on the Reclaim dashboard from the definition in docs/reclaim, and its goal signed by the owner.";
const EXAM_LINK: ConditionLink = { kind: "link", label: "Show it from your own account", help: "Press Show it on your gift's page and sign in in the tab that opens. Nothing to paste." };

export const CAMBRIDGE_ENGLISH_SHOWN: Condition = {
  id: "cambridge-english-shown",
  kind: "milestone",
  nature: "shown",
  goalType: null,
  live: false,
  beforeItOpens: EXAM_BEFORE_IT_OPENS,
  source: "Cambridge English",
  family: "exam",
  name: "A Cambridge English result, shown",
  help: "Their Statement of Results, shown from their own Cambridge English account: the overall score on the Cambridge English Scale and its level. It proves the account, not who sat the exam.",
  link: EXAM_LINK,
  reading: "cambridge-english-shown",
  words: {
    earnedDay: "When they show that result, all of this becomes theirs",
    connect: "Opened. Show the result from your Cambridge English account when it is out.",
    doIt: "Press Show it and sign in to Cambridge English in the tab that opens. The overall score on your Statement of Results is what counts.",
    eachDay: "the day it is shown",
    preview: "A Cambridge English result, shown from your own account: the gift is yours when you show it.",
  },
};

export const IELTS_SHOWN: Condition = {
  id: "ielts-shown",
  kind: "milestone",
  nature: "shown",
  goalType: null,
  live: false,
  beforeItOpens: EXAM_BEFORE_IT_OPENS,
  source: "British Council",
  family: "exam",
  name: "An IELTS band, shown",
  help: "Their result, shown from their own British Council test taker account: the overall band. It proves the account, not who sat the test.",
  link: EXAM_LINK,
  reading: "ielts-shown",
  words: {
    earnedDay: "When they show that band, all of this becomes theirs",
    connect: "Opened. Show the band from your British Council account when the result is out.",
    doIt: "Press Show it and sign in to the British Council in the tab that opens. The overall band on your result is what counts.",
    eachDay: "the day it is shown",
    preview: "An IELTS band, shown from your own British Council account: the gift is yours when you show it.",
  },
};

export const BAC_MOROCCO_SHOWN: Condition = {
  id: "bac-morocco-shown",
  kind: "milestone",
  nature: "shown",
  goalType: null,
  live: false,
  beforeItOpens: EXAM_BEFORE_IT_OPENS,
  source: "Bac Digital",
  family: "exam",
  name: "The baccalauréat passed, Morocco",
  help: "The Ministry's own Bac Digital service, opened by the candidate with their CNE and CIN in their own browser, shown by them: passed or not. It proves the candidate's numbers, not who sat the exam.",
  link: EXAM_LINK,
  reading: "bac-morocco-shown",
  words: {
    earnedDay: "When they show they passed, all of this becomes theirs",
    connect: "Opened. Show your result from Bac Digital when it is out.",
    doIt: "Press Show it and type your CNE and CIN in the tab that opens. The page that says you passed is what counts.",
    eachDay: "the day it is shown",
    preview: "The baccalauréat passed, shown from the Ministry's own service: the gift is yours when you show it.",
  },
};

export const BAC_CAMEROON_SHOWN: Condition = {
  id: "bac-cameroon-shown",
  kind: "milestone",
  nature: "shown",
  goalType: null,
  live: false,
  beforeItOpens: EXAM_BEFORE_IT_OPENS,
  source: "Epim-Exam",
  family: "exam",
  name: "The baccalauréat passed, Cameroon",
  help: "The candidate's own space on Epim-Exam, the Office du Baccalauréat's platform, shown by them: passed or not. It proves the account, not who sat the exam.",
  link: EXAM_LINK,
  reading: "bac-cameroon-shown",
  words: {
    earnedDay: "When they show they passed, all of this becomes theirs",
    connect: "Opened. Show your result from your Epim-Exam space when it is out.",
    doIt: "Press Show it and sign in to Epim-Exam in the tab that opens. The page that says you passed is what counts.",
    eachDay: "the day it is shown",
    preview: "The baccalauréat passed, shown from your own Epim-Exam space: the gift is yours when you show it.",
  },
};

export const BAC_FRANCE_SHOWN: Condition = {
  id: "bac-france-shown",
  kind: "milestone",
  nature: "shown",
  goalType: null,
  live: false,
  beforeItOpens: EXAM_BEFORE_IT_OPENS,
  source: "Cyclades",
  family: "exam",
  name: "The baccalauréat passed, France",
  help: "The candidate's own Cyclades space, shown by them: passed or not, as the results page says it. It proves the account, not who sat the exam.",
  link: EXAM_LINK,
  reading: "bac-france-shown",
  words: {
    earnedDay: "When they show they passed, all of this becomes theirs",
    connect: "Opened. Show your result from your Cyclades space when it is out.",
    doIt: "Press Show it and sign in to Cyclades in the tab that opens. The page that says you passed is what counts.",
    eachDay: "the day it is shown",
    preview: "The baccalauréat passed, shown from your own Cyclades space: the gift is yours when you show it.",
  },
};

/**
 * A school average shown from the pupil's or the family's own EcoleDirecte account (D179): the family "School & studies" (School until D220), with a
 * target out of 20 as the university grade has. PRONOTE is built beside it (D203), its publisher's terms and the risk written.
 */
export const ECOLEDIRECTE_GRADE_SHOWN: Condition = {
  id: "ecoledirecte-grade-shown",
  kind: "milestone",
  nature: "shown",
  goalType: null,
  live: false,
  beforeItOpens: "Its provider, registered on the Reclaim dashboard from the definition in docs/reclaim, and goal 23 signed by the owner.",
  source: ECOLEDIRECTE_SOURCE,
  family: "exam",
  name: "Reach an average at school, shown",
  help: "Their own EcoleDirecte account, or the family's, shown by them: the overall average out of 20 on the grades page. It proves the account, not who did the work.",
  link: { kind: "link", label: "Show it from your EcoleDirecte account", help: "Press Show it on your gift's page and sign in to EcoleDirecte in the tab that opens. Nothing to paste." },
  reading: "ecoledirecte-grade-shown",
  words: {
    earnedDay: "When they show that average, all of this becomes theirs",
    connect: "Opened. Show your average from your EcoleDirecte account when the grades are in.",
    doIt: "Press Show it and sign in to EcoleDirecte in the tab that opens. The overall average on your grades page is what counts.",
    eachDay: "the day it is shown",
    preview: "An average at school, shown from your own EcoleDirecte account: the gift is yours when you show it.",
  },
};

/**
 * Parked (D207): PRONOTE encrypts its answers and its bulletins, so this line is off the register's lists and offered
 * to nobody, kept in the code for the day a readable answer exists. It was:  A school average shown from the family's own PRONOTE space (D203): EcoleDirecte's line, with the space chosen by
 * the funder as a portal is, and the publisher's terms against it written on the judges' page with the risk assumed.
 */
export const PRONOTE_GRADE_SHOWN: Condition = {
  id: "pronote-grade-shown",
  kind: "milestone",
  nature: "shown",
  goalType: null,
  live: false,
  beforeItOpens: "PRONOTE encrypts every answer by default, so a proof can read no average; a way to read one is needed before a provider, then goal 24.",
  source: PRONOTE_SOURCE,
  family: "exam",
  name: "An average on PRONOTE, shown",
  help: "The family's own PRONOTE space, shown by them: the overall average out of 20. It proves the account, not who did the work.",
  link: { kind: "link", label: "Show it from your PRONOTE space", help: "Press Show it on your gift's page and sign in to the school's PRONOTE space in the tab that opens. Nothing to paste." },
  reading: "pronote-grade-shown",
  words: {
    earnedDay: "When they show that average, all of this becomes theirs",
    connect: "Opened. Show the average from your PRONOTE space when the grades are in.",
    doIt: "Press Show it and sign in to the school's PRONOTE space in the tab that opens, as a parent if you can. The overall average is what counts.",
    eachDay: "the day it is shown",
    preview: "An average at school, shown from your own PRONOTE space: the gift is yours when you show it.",
  },
};



export const BUILDING: readonly Condition[] = [
  CHSI_ENROLMENT_SHOWN,
  BAC_MOROCCO_SHOWN,
  BAC_CAMEROON_SHOWN,
  BAC_FRANCE_SHOWN,
  WAEC_RESULT_SHOWN,
  CAMBRIDGE_ENGLISH_SHOWN,
  IELTS_SHOWN,
  ECOLEDIRECTE_GRADE_SHOWN,
];

/**
 * What people ask for and no source lets anybody check, with the reading each line rests on (design audit, section 5).
 *
 * These are not conditions: nothing is wired and nothing is planned, and the wall is at the source rather than in our
 * code. They are here so the public page can say so in the same words as the rest, rather than leave a whole kind of
 * gift looking like an oversight. Each `why` is what was read on the sources' own pages, on the day it names.
 *
 * "No public page exists" is about a page anybody can open, which is the reading Viky does without a gesture. It is
 * not a claim that nothing could ever be proved: a person signing in to their own account and showing what they see
 * there is the other reading (D162), and each line says whether Viky is building it for that one.
 */
export type Frontier = Readonly<{
  id: string;
  name: string;
  state: ConditionState;
  why: string;
  /**
   * Whether Viky is building the other reading for it, the one the person shows from their own account (D162), said
   * on the line so a reader knows which of these is on its way and which is not (the founder, 22 Sep 2026).
   */
  building: string | null;
  /**
   * The condition beside the register that `building` is about, so the catalogue does not print it a second time. A
   * line that says "being built" and names none is about lines printed under their own family (D176).
   */
  conditionId?: string;
}>;

/** The two sentences a frontier line ends on. */
export const FRONTIER_PROGRESS = {
  building: (what: string) => `Being built: ${what}`,
  notBuilding: "Not being built.",
} as const;

export const FRONTIERS: readonly Frontier[] = [
  {
    id: "supervised-exams",
    name: "A Cambridge, IELTS or TOEFL result",
    state: "no-public-page",
    why: "The result goes to institutions. Checking one means an account an organisation applies for, opened with numbers the candidate hands over, and nothing about one person that anybody else can open. Read on 19 Sep 2026 on Cambridge English's, IELTS's and ETS's own pages.",
    building: "a Cambridge English result and an IELTS band the person shows from their own account, with the two words SHOWN BY THEM on it; the TOEFL score is open, under School & studies.",
  },
  {
    id: "university-enrolment",
    name: "Being enrolled at a university",
    state: "no-public-page",
    why: "Enrolment lives in the university's own student portal, which opens for the student and for nobody else. Nothing Viky could read without the student signing in says who is enrolled.",
    building: "staying enrolled, shown by the person from their own student portal, with the two words SHOWN BY THEM on it.",
    conditionId: "university-enrollment-shown",
  },
  {
    id: "state-diplomas",
    name: "A state diploma",
    state: "no-public-page",
    why: "In France the holder draws an attestation from the state's own service, and a check needs the control key printed on it. Nothing anybody can open, and what a program could read would be that attestation rather than the diploma. Read on 19 Sep 2026 on diplome.gouv.fr.",
    // The baccalauréat is a state diploma, and its three lines (D176) print under "School & studies" with the frontier's
    // word: this line says they are on their way and names none, so nothing is printed twice.
    building: "the baccalauréat passed, shown by the candidate from the examining body's own results page, in Morocco, Cameroon and France, with the two words SHOWN BY THEM on it.",
  },
  {
    id: "school-marks",
    name: "School marks",
    state: "no-public-page",
    why: "They live in a school's own portal, which opens for the family and for nobody else. No source publishes a page about a pupil.",
    // One portal is on its way (D179); PRONOTE is parked, its answers and its bulletins being encrypted (D207).
    building: "an average shown by the pupil or the family from their own EcoleDirecte account, with the two words SHOWN BY THEM on it; not PRONOTE, whose pages and bulletins are encrypted, so nothing in them can be proved.",
  },
];

/**
 * Lines being built that "What will they do?" lists anyway, marked "Being built" (D311). Empty since 29 Sep 2026 (the
 * founder): the EcoleDirecte average left the screens while it is being built, its code and its condition kept. A line
 * listed here is still refused at creation before anything is taken while its provider is missing (`notOpen`).
 */
export const OFFERED_WHILE_BUILDING: readonly string[] = [];

/** What "What will they do?" lists: only what works from end to end today. */
export function liveConditions(): readonly Condition[] {
  return CONDITIONS.filter((condition) => condition.live);
}

/**
 * The condition of a gift already made, from the goal type its contract holds; a gift made through the door too. A
 * gift counted on one course (goal 5, U1) is the daily lesson's condition read on one course, not another condition.
 */
export function conditionOfGoal(goalType: number): Condition | undefined {
  if (goalType === GOAL_TYPE_DUOLINGO_COURSE_XP) return DUOLINGO_DAILY;
  return CONDITIONS.find((condition) => condition.goalType === goalType) ?? BUILDING.find((condition) => condition.goalType === goalType);
}

export function conditionById(id: string): Condition | undefined {
  return CONDITIONS.find((condition) => condition.id === id) ?? BUILDING.find((condition) => condition.id === id);
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
/** One section of the public page: the register's lines, and beside them what is being built in that family (D169). */
export type CatalogueSection = ConditionSection & Readonly<{ building: readonly Condition[] }>;

/**
 * What "What Viky can check" lists: every family with a line in the register or a line being built. A condition
 * being built is printed under its family with the word "Being built" and what has to happen first, unless a frontier
 * line already says it is being built (the TOEFL score and enrolment, shown from an account nobody can read without
 * the person). The year passed and the grade (D174) have no frontier line, so they are the first printed this way.
 */
export function catalogueSections(): readonly CatalogueSection[] {
  const onFrontier = new Set(FRONTIERS.map((frontier) => frontier.conditionId).filter((id): id is string => Boolean(id)));
  return FAMILIES.map(({ id, title }) => ({
    family: id,
    title,
    conditions: CONDITIONS.filter((condition) => condition.family === id),
    building: BUILDING.filter((condition) => condition.family === id && !onFrontier.has(condition.id)),
  })).filter((section) => section.conditions.length > 0 || section.building.length > 0);
}

/** The state of a condition in the register, which always carries one; a condition being built has none to ask for. */
export function stateOf(condition: Condition): Readonly<{ id: ConditionState; title: string; meaning: string }> {
  if (!condition.state) throw new Error(`${condition.id} is being built and carries no state`);
  return stateWords(condition.state);
}

function sectioned(conditions: readonly Condition[]): readonly ConditionSection[] {
  return FAMILIES.map(({ id, title }) => ({
    family: id,
    title,
    // In the register's own order, never the alphabet's (D139): inside a family the first line is the one to offer
    // first, and the founder put the daily lesson before the test because it asks less of whoever receives it.
    conditions: conditions.filter((condition) => condition.family === id),
  })).filter((section) => section.conditions.length > 0);
}
