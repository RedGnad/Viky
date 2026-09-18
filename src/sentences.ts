/**
 * Every sentence a person reads, in one place.
 *
 * The app speaks the device's language with English as the fallback, and only English is written for the
 * event (decision 3 of the design pass, 17 Sep 2026). Holding the words here, away from the screens, is what
 * lets French be added without rewriting a screen. The way out came first; the three destinations, the shell
 * and the help page followed with the product structure of 17 Sep; the other tasks move here on their lines.
 *
 * Every sentence that states an amount or a state is listed in docs/SCREEN-CLAIMS.md with the code path that
 * makes it true. No sentence here names a coin, a network, or an identifier: when a third party demands one, it
 * is "the code" that party asks for. The one exception is the card service's own page, which cannot be prefilled
 * (D32): its two settings are quoted in its words, with a sentence saying they need no understanding (flows F6).
 * No sentence here names a source either: those words are in the register, src/conditions.ts.
 */

/** The three destinations of the bar and the rail, and the mark. */
export const NAV = {
  mark: "Viky",
  home: "Home",
  gifts: "Gifts",
  me: "Me",
  back: "Back",
} as const;

/** Home: the money, the one action, the way out, and what is moving. */
export const HOME = {
  promise: "The money is already in their name",
  promiseBody:
    "Put money behind someone's goal. It becomes theirs as they make verified progress, and whatever they do not earn comes back to you. Nobody profits from anyone failing.",
  offer: "Offer a gift",
  finish: "Finish the gift you set up",
  howItWorks: "How it works",
  steps: [
    "You choose who it is for, what they will do, how much, and for how long.",
    "They connect what they do. Each day they reach the goal, that day's share becomes theirs.",
    "Each day they miss comes back to you, by itself. Nobody profits from anyone failing.",
  ],
  inAccount: "In your account",
  /** Under the amount at display size: what is approximate, when the rate was read, and the dollars themselves. */
  aboutRate: (date: string, dollars: string) => `About, at the rate of ${date}: ${dollars}`,
  keep: "Yours to keep, to put behind another goal, or to take out.",
  takeItOut: "Take it out",
  readyLine: (name: string, number: string) => `${number} of it is ready to send to ${name}.`,
  readyLabel: (name: string) => `Ready to send to ${name}`,
  moving: "What's moving",
  seeAll: "See all gifts",
  empty: "No gift yet. Offer one, or open a link someone sent you.",
  loading: "Looking for your gifts",
  failed: "Your gifts could not be loaded.",
} as const;

/**
 * The one door into an account (the art direction brief of 17 Sep 2026, section 7). FIDO's research on 128 people from
 * 32 companies: "display a single, discoverable call to action to sign in or create a new account", because some people
 * "are uncertain whether they have an account". Pressing it opens the passkey at once; the panel only appears when that
 * does not work, which is when the person has no passkey here or waved the sheet away.
 */
/**
 * The appearance control (D97): one icon in the header, on every screen. Its name says where the product is now and
 * what a press will do, because an icon alone says neither, and a reader that speaks the screen aloud has only this.
 */
export const APPEARANCE = {
  system: "Appearance: as your device. Press for day.",
  light: "Appearance: day. Press for night.",
  dark: "Appearance: night. Press to follow your device again.",
} as const;

export const DOOR = {
  open: "Sign in or create account",
  how: "Your face or your fingerprint, and nothing to remember.",
  create: "Create your account",
  again: "Try again",
  notNow: "Not now",
  busy: "One moment",
  title: "Sign in or create account",
} as const;

/** Gifts: everything given and received. */
export const GIFTS = {
  title: "Gifts",
  given: "Given",
  received: "Received",
  emptyGiven: "Nothing given yet.",
  emptyReceived: "Nothing received yet.",
  signInFirst: "Sign in to see your gifts.",
} as const;

/**
 * One card for a gift, wherever it appears: for whom, for what, how much, its state. The funder reads who it is for,
 * the recipient who it is from, by the names given on the first step of offering it; a gift made before the names
 * existed falls back to what is known.
 */
export const GIFT_CARD = {
  /** The label on the one example card, on the page without an account: it is never passed off as somebody's gift. */
  example: "Example",
  forYou: "For you",
  forWhoever: "For whoever opens the link",
  forName: (name: string) => `For ${name}`,
  fromName: (name: string) => `From ${name}`,
  /** Read by neither of the gift's two people: both sides named, and nothing addressed to the reader. */
  fromFor: (funder: string | null, recipient: string | null) => {
    if (funder && recipient) return `From ${funder}, for ${recipient}`;
    if (funder) return `From ${funder}`;
    if (recipient) return `For ${recipient}`;
    return "Somebody else's gift";
  },
  amountDaily: (total: string, perDay: string, days: number) => `${total}, ${perDay} a day for ${days} days`,
  notOpened: "Not opened yet.",
  counting: (done: number, of: number, missed: number) => `Counting: ${done} of ${of} days done, ${missed} missed.`,
  finished: (done: number, of: number, missed: number) => `Finished: ${done} of ${of} days done, ${missed} missed.`,
  takenBack: "Taken back before it was opened.",
  theirsOf: (theirs: string, total: string, back: string) => `${theirs} of ${total} theirs, ${back} back to you`,
  yoursOf: (yours: string, total: string, back: string) => `${yours} of ${total} yours, ${back} gone back`,
  theirsGoneBack: (theirs: string, total: string, back: string) => `${theirs} of ${total} theirs, ${back} gone back`,
  milestoneToday: (reading: number, target: number) => `Today: ${reading}, target ${target}.`,
  milestoneNotRead: (target: number) => `Target ${target}. Not read yet.`,
  milestoneReached: (target: number) => `Reached ${target}.`,
  milestoneMissed: (target: number) => `Did not reach ${target} in time.`,
  /** "$25.00, by 1 Oct 2026" once started; "$25.00, within 30 days of connecting" before. */
  milestoneAmount: (total: string, by: string) => `${total}, ${by}`,
  milestoneStartTooHigh: (start: number, target: number) => `Already at ${target} when it was connected (${start}): it cannot count it, and goes back at the end.`,
} as const;

/** "Léa's", for a name the funder typed. */
const their = (name: string) => `${name}'s`;

/**
 * Offering a gift, flows F1 to F11 on the product structure: who it is for, what they will do, the condition's own
 * detail, how much and for how long, the check, then paying, the wait, and the confirmation. Nothing here names a
 * source: what a condition is called, what its name field asks and what counts as a day come from the register, and
 * the card service's name comes from `WAY_IN`.
 */
export const FUND = {
  step: (number: number, of: number) => `Step ${number} of ${of}`,
  continue: "Continue",
  backToGifts: "Back to my gifts",
  backToCheck: "Back to the check",
  notNow: "Not now",
  change: "Change",

  who: {
    title: "Who is it for?",
    recipientLabel: "Their first name",
    funderLabel: "Your name, as they know you",
    funderHelp: "Like Mum, or Tom: the gift says who it is from.",
    seen: "Both names show on the gift, to them and to whoever opens its link.",
    neverWrites: "Viky never writes to them. You send them the link yourself, once the gift is ready.",
    refusals: {
      recipientEmpty: "Write their first name.",
      funderEmpty: "Write your name, as they know you.",
      tooLong: "40 characters at most.",
      notText: "Letters, spaces, dots, apostrophes or hyphens only.",
    },
  },

  what: { title: "What will they do?" },

  detail: { checking: "Checking the name" },

  amount: {
    title: "How much, and for how long?",
    dollarsLabel: "How much, in dollars",
    dollarsHelp: (about: string | undefined) => (about ? `At least $1.00. ${about[0].toUpperCase()}${about.slice(1)}.` : "At least $1.00."),
    daysLabel: "For how many days",
    daysHelp: "7 at least, 90 at most.",
    missed: "And each day they miss, the same comes back to you.",
    refusals: { daysShape: "Whole days, like 7.", daysLow: "7 days at least.", daysHigh: "90 days at most.", targetShape: "A whole number, like 10." },
  },

  check: {
    title: "Check this over",
    rows: {
      for: "For",
      from: "From",
      what: "What they will do",
      goes: "Goes in their name",
      dayEarned: "A day earned",
      dayCounts: "What counts as a day",
      firstDay: "First day counted",
      ends: "Ends",
    },
    dayEarned: (perDay: string, exact: boolean, days: number) => `${exact ? "" : "about "}${perDay}, over ${days} days`,
    firstDay: (source: string) => `The day after they connect ${source}`,
    ends: (days: number) => `${days} days after that`,
    missed: (time: string) =>
      `A day they miss can still be caught up the next day. If it is not, it comes back to you by itself the morning after, at about ${time} your time.`,
    namesSeen: (recipient: string, funder: string) => `${recipient} and ${funder} show on the gift, to whoever opens its link.`,
    linkRisk: (recipient: string) => `The link you will get opens the gift for whoever opens it first. Send it only to ${recipient}.`,
    fourteenDays: "If nobody opens it within 14 days, it all comes back to you, and the same if it is opened and never connected.",
    paying: "Paying for it",
    /** One card per way in (D101): each says what it costs, what it delivers, and where its figures were read. */
    payingWith: (name: string) => `Paying with ${name}`,
    payWith: (name: string) => `Pay with ${name}`,
    payWithFor: (name: string, euros: number) => `Pay ${euros} EUR with ${name}`,
    byCardUnknown: "by card",
    smallest: (name: string, euros: number) => `${name} takes nothing under ${euros} EUR.`,
    nothingToSwap: "What arrives is what the gift holds, so nothing is changed afterwards and nothing is left over.",
    swapAfter: "What arrives is changed into what the gift holds, in one step you confirm, and a little stays behind for it.",
    youPay: "You pay",
    byCard: (euros: number) => `${euros} EUR by card`,
    alreadyHeld: "Already in your account",
    arrives: "Arrives in your account",
    aboutDollars: (dollars: number) => `about $${dollars}`,
    staysYours: "Stays yours",
    fee: (name: string, fee: string) => `${name} keeps ${fee} of what you pay, and checks who you are the first time, once.`,
    /** What that rail says about how long it takes, in its own words. A rail that says nothing gets no sentence. */
    delay: (name: string, takes: string) => `${name} says ${takes}.`,
    arrivedWorth: (dollars: string) => `A card payment is in your account: about ${dollars}.`,
    arrivedLater: "A card payment is in your account. Its value in dollars will show once the price answers.",
    arrivedUse: (amount: string, recipient: string) =>
      `Using it turns it into dollars, a few seconds, then puts ${amount} in ${their(recipient)} name. If it falls short, the next screen says how much more to pay.`,
    fromAccount: (held: string) => `It comes from your account, which holds ${held}.`,
    pay: (euros: number) => `Pay ${euros} EUR by card`,
    useArrived: "Use the payment that arrived",
    putIt: (amount: string, recipient: string) => `Put ${amount} in ${their(recipient)} name`,
  },

  account: {
    title: "One account, and then you can pay",
    yourGift: (amount: string, recipient: string, days: number) => `Your gift: ${amount} for ${recipient}, ${days} days.`,
    why: "The money is held in your name until they earn it, so it needs somewhere of yours to be held.",
  },

  waiting: {
    title: (euros: number | undefined) => (euros ? `Waiting for your ${euros} EUR payment` : "Waiting for your payment"),
    inAccountNow: (held: string) => `In your account now: ${held}`,
    setThese: (name: string) => `On ${name}'s page, set these yourself:`,
    settings: (euros: number | undefined, delivers: { coin: string; network: string }) => [
      "Pick: Buy.",
      euros ? `Pay: ${euros} EUR.` : "Pay: in EUR.",
      `Receive: ${delivers.coin}.`,
      `Network: ${delivers.network}.`,
      "Send to: the code below.",
      "Whose it is: your own.",
    ],
    theirWords: (name: string, delivers: { coin: string; network: string }) =>
      `${delivers.coin} and ${delivers.network} are the two words ${name} uses for the money it delivers to Viky. You never have to understand them.`,
    /** What the wait ends with, which differs by rail (D101). */
    thenNothing: "When it lands, the gift is made straight away: there is nothing else to confirm.",
    thenChanged: "When it lands, you confirm one step that turns it into what the gift holds, and a little stays behind for it.",
    codeLabel: (name: string) => `The code to give ${name}`,
    copy: "Copy the code",
    copied: "Copied",
    copyRefused: "Your browser would not let us copy it. Press and hold the code, then choose Copy.",
    startsEnds: (start: string, end: string) => `Before you pay, check what you pasted starts with ${start} and ends with ${end}.`,
    leave: "You can leave this page: the gift is kept, and Viky picks it up when you come back.",
    stay: "Keep this page open: this device would not keep the gift.",
    openAgain: (name: string) => `Open ${name} again`,
    different: "Set up a different gift instead",
    staysInAccount: "Whatever you paid stays in your account, for this gift or the next one.",
  },

  arrived: {
    title: "Your payment arrived",
    gettingReady: "Getting it ready, a few seconds.",
    putting: (arrived: string | undefined, amount: string, recipient: string) =>
      `${arrived ? `${arrived} arrived. ` : ""}Putting ${amount} in ${their(recipient)} name.`,
    short: (arrived: string, amount: string, euros: number, held: string) =>
      `${arrived} arrived, less than the ${amount} for this gift. Pay ${euros} EUR more, or make the gift ${held}.`,
    payMore: (euros: number) => `Pay ${euros} EUR more`,
    makeIt: (held: string) => `Make it ${held}`,
    priceMoved: "The price changed and nothing was changed. Viky will try again in a moment.",
  },

  closed: {
    title: "Your session closed while you were paying",
    kept: (amount: string, recipient: string) => `Nothing is lost. Your ${amount} gift for ${recipient} is kept on this device, and whatever you paid stays in your account.`,
    keptWhileOpen: (amount: string, recipient: string) =>
      `Nothing is lost. Your ${amount} gift for ${recipient} is kept while this page stays open, and whatever you paid stays in your account.`,
    signInAgain: "Sign in again and Viky picks up where it stopped: your payment becomes the gift as soon as it is here.",
  },

  waitingGift: {
    title: "A gift is waiting for your payment",
    which: (amount: string, recipient: string) => `${amount} for ${recipient}, set up on this device and not made yet.`,
    whichUnnamed: (amount: string) => `${amount}, set up on this device and not made yet.`,
    signIn: "Sign in to pick it up",
    staysInAccount: "Whatever you paid stays in your account.",
  },

  made: {
    title: (amount: string, recipient: string) => `${amount} is in ${their(recipient)} name.`,
    terms: (amount: string, days: number, perDay: string, exact: boolean, source: string) =>
      `${amount} over ${days} days, ${exact ? "" : "about "}${perDay} a day, first day counted the day after they connect ${source}.`,
    reference: (when: string, giftId: string) => `Made ${when}. Reference: gift ${giftId}.`,
    linkTitle: "The link",
    copy: "Copy the link",
    copied: "Copied",
    share: "Share",
    shareText: (recipient: string) => `${recipient}, this is for you.`,
    copyRefused: "Your browser would not let us copy it. Press and hold the link above, then choose Copy.",
    onlyThem: (recipient: string) => `Whoever opens this link takes the gift, so send it only to ${recipient}.`,
    nextTitle: "What happens next",
    theyConnectAny: "connects what they will do",
    next: (recipient: string, theyConnect: string, eachDay: string, perDay: string, time: string) => [
      `${recipient} opens the link and ${theyConnect}.`,
      `From the day after, ${eachDay} puts ${perDay} in ${their(recipient)} name.`,
      `A day they miss and do not catch up the next day comes back to your account the morning after, at about ${time} your time. If nobody opens the link within 14 days, it all comes back.`,
    ],
    seeIt: "See this gift",
  },

  failures: {
    other: "That did not go through, and nothing was taken. Try again.",
    signInFirst: "Sign in first.",
    tryAgain: "Try again",
  },
} as const;

/** "1 day", "2 days". */
const days = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

/** A sentence that may open on a figure written "about $2.85" starts with a capital all the same. */
const sentence = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;

/**
 * A gift's page, flows R1 to R12, read by the person it is for or by the funder (R11). What depends on the source is in
 * the register (`recipient` words); the names are the ones given when the gift was offered, and a gift made before
 * them keeps the sentence it had.
 */
export const GIFT_PAGE = {
  aboutViky: "About Viky",
  backToGifts: "Back to my gifts",
  loading: "One moment",
  notFound: "This gift could not be found.",

  titleYours: (funder: string | null, amount: string) => (funder ? `${funder} put ${amount} in your name.` : `${amount} is in your name.`),
  titleTheirs: (recipient: string | null, amount: string) => (recipient ? `You put ${amount} in ${their(recipient)} name.` : `You put ${amount} in their name.`),
  /**
   * A gift read by somebody who is neither of its two people: a judge opening a link, most often, and anybody else the
   * link reached. Everything they read is in the third person, because "in your name" would be a lie to them.
   */
  titleReading: (funder: string | null, recipient: string | null, amount: string) => {
    if (funder && recipient) return `${funder} put ${amount} in ${their(recipient)} name.`;
    if (funder) return `${funder} put ${amount} in someone else's name.`;
    if (recipient) return `${amount} is in ${their(recipient)} name.`;
    return `${amount} is in someone else's name.`;
  },
  notYours: "This gift is not yours. You can read where it stands; nothing here is yours to do.",
  becomesYours: (perDay: string, eachDay: string, when: string) => `It becomes yours as you go: ${perDay} for ${eachDay}, ${when}.`,
  becomesTheirs: (perDay: string, eachDay: string, when: string) => `It becomes theirs as they go: ${perDay} for ${eachDay}, ${when}.`,
  forDaysFromConnecting: (count: number) => `for ${days(count)} from the day after it is connected`,
  goesBackToThem: (perDay: string, funder: string | null) =>
    sentence(`${perDay} goes back to ${funder ?? "them"} for each day without it that is not caught up the next day. Nobody else ever profits from a missed day.`),
  comesBackToYou: (perDay: string) => sentence(`${perDay} comes back to you for each day without it that is not caught up the next day. Nobody else ever profits from a missed day.`),
  openBy: (date: string, funder: string | null) => `Open it by ${date}: after 14 days unopened, it goes back to ${funder ?? "them"}.`,

  createToOpen: "Create your account to open it. Nothing to install.",
  /** An opened gift, read by somebody with no account: it may be theirs, and it may not, so it says "if". */
  signInToSee: "Sign in if this gift is yours.",
  openMyGift: "Open my gift",
  opening: "Opening",
  missingKey: "This link is missing its key. Ask for the link again.",
  openedByOther: "This gift was already opened by the person it is for.",
  readingWhose: (funder: string | null, recipient: string | null) =>
    `It is between ${funder ?? "the person who offered it"} and ${recipient ?? "the person it is for"}.`,

  continue: "Continue",
  checking: "Checking the name",
  notYetBody: (funder: string | null) => `The money stays in your name. Nothing counts until you connect, and after 14 days unconnected it goes back to ${funder ?? "them"}.`,
  copyCode: "Copy the code",
  copied: "Copied",
  /** Only on the device that made the gift, which is the only one holding the link (it carries the key). */
  copyLinkAgain: "Copy the link again",
  linkOnlyHere: "Only this device kept it: the link carries the key that opens the gift.",
  copyRefused: "Your browser would not let us copy it. Press and hold the code, then choose Copy.",
  validUntil: (moment: string) => `Valid until ${moment} your time. After that, ask for a new one here.`,
  expired: "This code has expired.",
  newCode: "Get a new code",
  iAddedIt: "I added it",
  reading: "Reading your profile",
  removeAfter: "You can take the code out of your name as soon as this screen says it is done.",
  keepMyName: "Keep the name I had",
  namedWrong: (funder: string | null) => `Ask ${funder ?? "the person who sent it"} to check the name. Nothing counts until it is right.`,
  startCounting: "Start counting",
  notSeenYet: "Wait a minute and press again, or get a new code.",
  codeOut: "You can take the code out of your name now.",

  counting: (range: string) => `Counting: ${range}.`,
  dayOf: (day: number, total: number, range: string) => `Day ${day} of ${total}, ${range}.`,
  nextReading: (moment: string) => `Next reading: ${moment} your time.`,
  yoursSoFar: "Yours so far",
  theirsSoFar: "Theirs so far",
  alreadyTaken: "Already taken",
  backToFunder: (funder: string | null) => (funder ? `Back to ${funder}` : "Back to them"),
  cameBackToYou: "Came back to you",
  amountDays: (amount: string, count: number) => `${amount}, ${days(count)}`,
  inYourAccount: (moment: string) => `It is in your account, last sent back ${moment} your time.`,
  countNow: "Count now",
  readCounted: (count: number) => (count === 0 ? "Read. Nothing new to count yet." : count === 1 ? "One more day is yours." : `${count} more days are yours.`),
  nothingToDo: {
    not_bound: "Connect first.",
    not_opened: "Open the gift first.",
    no_account: "Add your name first.",
    already_bound: "Already connected. Nothing else to do.",
    finished: "This gift is finished.",
    cancelled: "This gift went back before it started counting.",
  } as Record<string, string>,

  take: (amount: string) => `Take ${amount}`,
  takeReview: (amount: string) => `Take ${amount} into your account. It stays yours: from your account you can send it to your bank. Nothing to pay.`,
  notNow: "Not now",
  taking: "Taking it",
  taken: (amount: string, when: string, giftId: string, take: number) => `${amount} is in your account, ${when}. Reference: gift ${giftId}, take ${take}.`,
  stillInGift: (earned: string, left: number) => `Still in the gift: ${earned} earned and not taken. ${left === 0 ? "No day to come." : `${days(left)} to come.`}`,
  sendToBank: "Send it to my bank",

  finished: (range: string) => `This gift is finished. ${range}.`,
  daysYours: (count: number, total: number, amount: string) => `${count} of ${total} days were yours: ${amount}.`,
  daysTheirs: (count: number, total: number, amount: string) => `${count} of ${total} days were theirs: ${amount}.`,
  wentBackTo: (count: number, funder: string | null, amount: string) => `${days(count)} went back to ${funder ?? "them"}: ${amount}.`,
  cameBack: (count: number, amount: string) => `${days(count)} came back to you: ${amount}.`,
  wentBackBeforeStart: "This gift went back before it started counting.",
  beingEarned: "There is nothing for you to do: what they earn is theirs, and what they miss comes back to you by itself.",
  made: (date: string, giftId: string) => `Made ${date}. Reference: gift ${giftId}.`,

  closedTitle: "Your session closed while you were away",
  closedBody: "Nothing moved and nothing was taken.",

  dayWords: {
    earned: "earned",
    returnedYours: "back to them",
    returnedTheirs: "back to you",
    /** A reader is neither of them, so a day that went back went back to somebody named, or to nobody they know. */
    returnedReading: "gone back",
    catchable: "catch up",
    aboutToReturn: "not judged yet",
    today: "today",
    toCome: "to come",
  },
  daysLabel: "Every day of this gift",
  fromCountsNote: "Some days here are drawn from the totals, earned first and then the days that went back, because they were settled before Viky kept a record of each day.",
} as const;

/**
 * A milestone gift's page, built against the register and shown for real once a milestone condition is live (C2).
 * The target and the readings are the gift's own data; the source's name is the register's.
 */
export const MILESTONE_PAGE = {
  target: (target: number, source: string) => `Reach ${target} on ${source}`,
  /** "by 17 Oct 2026" once the first reading has started the clock; "within 30 days of connecting" before (D46). */
  byDate: (date: string) => `by ${date}`,
  withinDays: (days: number) => `within ${days} ${days === 1 ? "day" : "days"} of connecting`,
  ruleYours: (target: number, by: string, time: string) => `It is yours when you reach ${target}, ${by}. Checked every day at about ${time} your time.`,
  ruleTheirs: (target: number, by: string, time: string) => `It is theirs when they reach ${target}, ${by}. Checked every day at about ${time} your time.`,
  startedAt: (reading: number) => `Started at ${reading}.`,
  lastRead: (moment: string) => `Last read ${moment} your time.`,
  notReadYetYours: (source: string) => `Not read yet: the first reading is taken when you connect ${source}, and it is where you start.`,
  notReadYetTheirs: (source: string) => `Not read yet: the first reading is taken when they connect ${source}, and it is where they start.`,
  atDeadlineYours: (by: string, amount: string, funder: string | null) => `If you reach it ${by}, the ${amount} is yours. If not, it goes back to ${funder ?? "them"}.`,
  atDeadlineTheirs: (by: string, amount: string) => `If they reach it ${by}, the ${amount} is theirs. If not, it comes back to you.`,
  reachedYours: (date: string, amount: string) => `Reached on ${date}: the ${amount} is yours.`,
  reachedTheirs: (date: string, amount: string) => `Reached on ${date}: the ${amount} is theirs.`,
  /** "by 17 Oct 2026", or "in time" for a gift that was never started. */
  inTime: "in time",
  missedYours: (by: string, amount: string, funder: string | null) => `Not reached ${by}: the ${amount} went back to ${funder ?? "them"}.`,
  missedTheirs: (by: string, amount: string) => `Not reached ${by}: the ${amount} came back to you.`,
} as const;

/**
 * Offering a milestone gift (C2): the same flow as FUND, where a milestone asks different things. What a condition,
 * its cadences and its reading are called comes from the register (src/conditions.ts, src/milestone-conditions.ts);
 * `source` below is always the register's word, never one written here.
 */
export const MILESTONE_FUND = {
  detail: {
    read: "Read their rating",
    reading: "Reading their rating",
    smallest: (smallest: number) => `${smallest} or more, so the gift is worth earning.`,
    readAgain: "The name or the rating changed. Read their rating again.",
    readAt: (time: string) => `Read at ${time}.`,
    settlingRehearsal:
      "This rating is still settling, so one game can move it far more than this climb. Offered here only because this account runs Viky and nobody else is offered this yet: for a rehearsal gift, not for anyone's real one.",
  },
  amount: {
    title: "How much, and how long do they have?",
  },
  check: {
    rows: {
      name: "Their name there",
      cadence: "Which rating",
      today: "Where they stand today",
      reach: "They reach",
      goes: "Goes in their name",
      long: "How long they have",
      ifNot: "If they do not reach it",
    },
    allBack: "All of it comes back to you",
    howItWorks: (source: string, target: number, time: string) =>
      `Their first reading is taken when they connect ${source}, and that is where they start. After that Viky reads their rating every day, at about ${time} your time, and the first reading at ${target} or more makes all of it theirs at once.`,
    whyCeiling: (target: number) =>
      `If they have already reached ${target} when they connect, this gift cannot count it and comes back to you at the end: a gift is for a climb, not for where they already are.`,
    fourteenDays: "If nobody opens it within 14 days, it all comes back to you, and the same if it is opened and never connected.",
  },
  account: {
    yourGift: (amount: string, recipient: string) => `Your gift: ${amount} for ${recipient}.`,
  },
  made: {
    terms: (amount: string, goal: string, days: number, source: string) =>
      `${amount} when they reach ${goal}, within ${days} ${days === 1 ? "day" : "days"} of connecting ${source}. All of it, at once, or all of it back to you.`,
    next: (recipient: string, source: string, target: number, days: number, time: string) => [
      `${recipient} opens the link and puts a short code in their ${source} name, once. That first reading is where they start.`,
      `Viky reads their rating every day at about ${time} your time. The first reading at ${target} or more puts all of it in ${recipient}'s name.`,
      `If they do not reach it within ${days} ${days === 1 ? "day" : "days"} of connecting, all of it comes back to your account. If nobody opens the link within 14 days, it all comes back too.`,
    ],
  },
  failures: {
    standingMoved: "Choose the rating again",
  },
  operatorOnly: "Not offered to anyone yet. You see it because this account runs Viky.",
} as const;

/**
 * What a person can do on a milestone gift's page (C2): open it, connect the account with a code, ask for a reading,
 * take it. The page itself, and what it says of where the gift stands, is `MILESTONE_PAGE` (S3).
 */
export const MILESTONE_ACTIONS = {
  checkNow: "Check now",
  checking: "Reading your rating",
  connectTitle: (source: string) => `Connect ${source}`,
  givenName: (source: string, username: string) => `Your ${source} name, as it was given: ${username}.`,
  whyCode: (source: string) => `To prove it is yours, you put a short code in your ${source} name for a minute. Nothing to install, no password.`,
  connectNow: (days: number) => `Connect now: only what you reach after connecting counts. You then have ${days} ${days === 1 ? "day" : "days"}.`,
  firstReading: (target: number) => `If you have already reached ${target} when you connect, this gift cannot count it, so connect before you play.`,
  getCode: "Get my code",
  gettingCode: "One moment",
  proveTitle: (username: string) => `Prove ${username} is yours`,
  added: "I added it",
  addedBusy: "Reading your profile",
  removeAfter: "You can take the code out right after. It works for an hour.",
  newCode: "Get a new code",
  theirsNotConnected: "Opened, not connected yet. If they do not connect within 14 days, it all comes back to you.",
  startTooHighMine: (start: number, target: number, funder: string | null) =>
    `You had already reached ${target} when you connected: you were at ${start}, so this gift cannot count it. Ask ${funder ?? "the person who sent it"} for a new one. It goes back to them at the end.`,
  startTooHighTheirs: (start: number, target: number, recipient: string | null) =>
    `${recipient ?? "They"} had already reached ${target} when they connected, at ${start}, so this gift cannot count it. It comes back to you at the end.`,
  overdue: "Time is up. It is being closed, and all of it goes back.",
  opened: "It is yours to earn.",
  take: (amount: string) => `Take ${amount}`,
  takeReviewTitle: (amount: string) => `Take ${amount} into your account`,
  takeRows: { goes: "Goes to", account: "Your Viky account", stays: "Stays in the gift" },
  nothingLeft: "$0.00",
  takeConfirm: (amount: string) => `Take ${amount}`,
  notNow: "Not now",
  taking: "Taking it",
  taken: (amount: string, when: string, giftId: string) => `${amount} is in your account, ${when}. Reference: gift ${giftId}.`,
  failed: "That did not go through, and nothing was changed. Try again.",
  outcome: {
    started: (start: number, target: number) => `Done. You start at ${start}. Reach ${target} and all of it is yours. You can take the code out of your name now.`,
    startedAbove: (start: number, target: number) =>
      `Recorded: you are at ${start}, already at the ${target} this gift is for, so it cannot count it. Ask for a new one; this one goes back at the end.`,
    reached: (rating: number) => `Read: ${rating}. You reached it, and all of it is yours.`,
    notYet: (rating: number, target: number) => `Read: ${rating}. ${target - rating} to go.`,
    already: {
      read_recently: "Your rating was read a moment ago.",
      finished: "This gift is finished.",
      cancelled: "This gift was taken back before it was opened.",
      start_too_high: "This gift can no longer be earned.",
      deadline_passed: "The time for this gift is over.",
      not_bound: "Connect first.",
      already_bound: "Already connected. Nothing else to do.",
      not_opened: "Open the gift first.",
      no_account: "Nothing to read yet.",
    },
  },
} as const;

/**
 * The preview a messaging app draws from a gift's link, the first thing the person it is for sees. The funder's name
 * only when the link carries its key; "Someone" otherwise, so a guessed gift number never names anybody.
 */
export const LINK_PREVIEW = {
  named: (funder: string, amount: string) => `${funder} put ${amount} in your name`,
  someone: (amount: string) => `Someone put ${amount} in your name`,
  unknown: "A gift on Viky",
  asYouGo: "It becomes yours as you go.",
  fromCondition: (name: string) => `${name}. It becomes yours as you go.`,
} as const;

/**
 * The morning message: what a phone says when nobody opened the app. The product promises no daily gesture, so the
 * day's outcome has to reach the person without one. One sentence, sent once a day for a gift, to whoever asked for
 * it. A name appears only when the gift carries one, and no sentence here names a source: the word for what was done
 * comes from the register (src/conditions.ts).
 */
export const MORNING = {
  /** The notification's own title, above the sentence. Never a name: a lock screen shows it to whoever is looking. */
  title: "Viky",
  ask: "Tell me each morning",
  asked: "Viky tells you each morning.",
  stop: "Stop telling me",
  stopped: "Viky stays quiet.",
  refused: "Your phone is not letting Viky tell you. Turn notifications on for Viky in your phone's settings.",
  failed: "That did not work. Try again.",
  /** iPhone outside the Home Screen: Safari has no push there, so installing comes first (webkit.org, 16 Feb 2023). */
  installFirst: "Add Viky to your Home Screen first. Then Viky can tell you each morning.",
  recipient: {
    earned: (amount: string) => `Yesterday counted. ${amount} is yours.`,
    returnedTo: (funder: string) => `Yesterday went back to ${funder}. Today still counts.`,
    returned: "Yesterday went back. Today still counts.",
    reached: (amount: string) => `You reached it. ${amount} is yours.`,
    expiredTo: (amount: string, funder: string) => `The time is up. ${amount} went back to ${funder}.`,
    expired: (amount: string) => `The time is up. ${amount} went back.`,
  },
  funder: {
    /** "Léa did yesterday's lesson.": the second half is the register's, so no sentence here names a source. */
    didIt: (name: string, yesterday: string, amount: string) => `${name} did ${yesterday}. ${amount} is theirs.`,
    countedNamed: (name: string, amount: string) => `${name} counted yesterday. ${amount} is theirs.`,
    counted: (amount: string) => `Yesterday counted. ${amount} is theirs.`,
    returned: (amount: string) => `Yesterday came back to you: ${amount}.`,
    reachedNamed: (name: string, amount: string) => `${name} reached it. ${amount} is theirs.`,
    reached: (amount: string) => `It is reached. ${amount} is theirs.`,
    expired: (amount: string) => `The time is up. ${amount} came back to you.`,
  },
} as const;

/** Me: the account, in the order the structure gives it. */
export const ME = {
  title: "You",
  currency: "Money shown in",
  currencies: { USD: "US dollars", EUR: "Euros", XOF: "CFA francs" },
  proposed: "what your phone suggests",
  currencySaved: "Saved.",
  /** Said while the signing session is open: what it names is how long money can move without asking again. */
  signedInUntil: (time: string) => `Signed in on this device until ${time}.`,
  /**
   * Said when this browser is signed in and nothing can be signed yet, which is every page load: the twelve hour
   * session names the account, and the key that signs lives in the page and went with it. Promising a signing window
   * that does not exist is what the old sentence did, on a screen that had just reopened.
   */
  signedIn: "Signed in on this device.",
  passkeyWhenMoneyMoves: "Your face or fingerprint is asked again the moment money moves.",
  signedOut: "Not signed in on this device.",
  signOut: "Sign out",
  anotherAccount: "Use another account",
  install: "Install Viky on this phone",
  installHow: "On iPhone: tap Share, then Add to Home Screen.",
  installed: "Viky is on this phone.",
  codeQuestion: "Need your code for a payout service?",
  codeUse: "Give it where a payout service asks where the money is sent from, or to another Viky account of yours that sends money here.",
  copyCode: "Copy your code",
  copied: "Copied",
  help: "Help",
  privacy: "Privacy",
  legal: "Legal notice",
  judges: "For judges",
} as const;

/** The help page: five questions, each answered with a sentence the product already keeps true. */
export const HELP = {
  title: "Help",
  intro: "Five questions, answered in the words the screens use.",
  questions: [
    {
      q: "Where is my money?",
      a: "In your account, on Home, under the amount. What a gift earns lands there the moment you take it, and stays yours from one gift to the next. Take it out from Home whenever the account holds anything.",
    },
    {
      q: "How does a gift work?",
      a: "Money is put in someone's name, tied to what they do, for a number of days. Each day they do it, that day's share becomes theirs. A day they miss can still be caught up the next day; if it is not, it comes back to whoever paid, by itself, the morning after. Nobody else ever profits from a missed day.",
    },
    {
      q: "My session closed. Did anything move?",
      a: "No. A session closes by itself after a while without you, and nothing moves without your face or fingerprint. Sign in again and everything is where it was.",
    },
    {
      q: "I lost my phone.",
      a: "Your account lives in your passkey, kept by Apple, Google or your password manager rather than by Viky. Sign in on the new phone the same way you did on the old one, and everything is there. There is nothing to write down and nothing we could send you.",
    },
    {
      q: "A payout service asks for a code.",
      a: 'It asks where the money is sent from. Your code is on this page, under "Need your code for a payout service?", with a button that copies it.',
    },
  ],
} as const;

export const CASH_OUT = {
  title: "Take your money out",
  yourMoney: "Your money",
  rateNote: (about: string) => about,
  readyLine: (name: string, number: string) => `${number} of it is ready to send to ${name}.`,
  readyLabel: (name: string) => `Ready to send to ${name}`,
  worthAbout: (dollars: string) => `about $${dollars}`,
  worthLater: "Its value in dollars will show once the price answers.",
  sourceLine: (source: string, read: string) => `Read from ${source}, ${read}.`,
  anotherAccount: "Send to another Viky account of mine",
  /**
   * Where the person's bank or card is (R1). Asked once, and only when the two signals disagree; the answer orders the
   * ways out and hides none of them. The line under a card is what that service itself says about that country today.
   */
  whereIsYours: "Where is your bank or card?",
  noPayoutThere: (name: string, country: string) => `${name} lists no payout in ${country} today.`,
  noPayInThere: (name: string, country: string) => `${name} does not sell there today: adding money from ${country} will be refused on their page.`,
  chooseBank: "Send to my bank",
  chooseCard: "Send to my card",
  nothingToSend: "Nothing to send yet.",
  backHome: "Back",
  notNow: "Not now",
  oneMoment: "One moment",

  step1: "Step 1 of 3: Get it ready",
  howMuchBank: "How much do you want to send to your bank?",
  howMuchCard: "How much do you want to send to your card?",
  upTo: (max: string, about: string | undefined) => `Up to $${max}, with two decimals at most.${about ? ` ${about[0].toUpperCase()}${about.slice(1)}.` : ""}`,
  seeWhatYouWillGet: "See what you will get",
  asking: "Asking for the price",
  refusals: {
    shape: "Two decimals at most, like 9.99.",
    tooMuch: (max: string) => `That is more than your $${max}.`,
    sendAllOfIt: "Send all of it",
  },

  review: (number: string, name: string, payout: string | undefined) =>
    `You will get at least ${number} to send.${payout ? ` ${payout}` : ""} Nothing leaves your account yet.`,
  reviewPayout: (name: string, euros: string, fee: string, net: string) =>
    `${name} will turn that into about ${euros}, minus its ${fee} fee: about ${net} on your bank account.`,
  reviewCard: (name: string) => `What ${name} pays onto your card is shown on their page.`,
  reviewDollars: (dollars: string) => `That is $${dollars} of your money.`,
  priceHolds: "This price holds for 4 minutes.",
  priceRefreshed: "The price was refreshed.",
  getReady: (number: string) => `Get ${number} ready`,
  gettingReady: (number: string) => `Getting ${number} ready. A few seconds.`,

  ready: (number: string) => `Ready: ${number}`,
  stays: (dust: string) => `${dust} stays in your account.`,
  step2: (name: string) => `Step 2 of 3: Place your order with ${name}`,
  order: (number: string, name: string) => `Order ${number} on ${name}`,
  giveThisCode: (name: string) => `When ${name} asks where you are sending from, give them this code`,
  copy: "Copy",
  copied: "Copied",
  copyRefused: "Your browser would not let us copy it. Press and hold the code, then choose Copy.",
  itIsYours: (name: string) => `${name} will ask you to confirm the money is yours: it is.`,
  sixHours: (name: string) => `Once you place the order, ${name} gives you six hours to send it.`,

  step3: "Step 3 of 3: Send it",
  pasteTheCode: (name: string) => `Paste the code ${name} gives you to send to`,
  amountFixed: "Amount",
  send: (number: string, name: string) => `Send ${number} to ${name}`,
  codeRefusals: {
    shape: (name: string) => `That is not a code ${name} gives. It starts with 0x and is 42 characters long.`,
    own: (name: string) => `That is your own code. Paste the one ${name} shows you to send to.`,
  },
  confirm: (number: string, name: string) => `Send ${number} to ${name}. This cannot be undone.`,
  confirmCard: "Sending costs a small amount of what you hold, said afterwards with its figure.",
  codeYouPasted: "The code you pasted:",
  sendButton: "Send",
  sending: (number: string, name: string) => `Sending ${number} to ${name}`,

  sent: (number: string, name: string, when: string, reference: string) => `Sent ${number} to ${name} on ${when}. Reference: ${reference}.`,
  sentPays: (name: string, pays: string, bank: boolean) => (bank ? `${name} pays your bank ${pays}.` : `${name} pays ${pays}.`),
  pasteFirst: (name: string) => `Paste the code from ${name} to send it.`,
  sendingCost: (cost: string) => `Sending cost ${cost}.`,
  follow: (name: string) => `Open ${name} to follow it`,

  closedTitle: "Your session closed while you were away",
  closedBody: "Nothing moved and nothing was taken. Your money is exactly where it was, and nothing about it expires.",
  closedWhere: (number: string, name: string) => `You were at step 2 of 3: ${number} is ready to send to ${name}.`,
  signInToSee: "Sign in to see your money",
  signedOutBody: "Nothing moved and nothing was taken. Your money is exactly where it was.",

  own: {
    title: "Send to another Viky account of mine",
    code: "Paste that account's code",
    help: 'You will find it on that account\'s page, under "Your code".',
    howMuch: "How much to send",
    pasteFirst: "Paste that account's code to send it.",
    confirm: (amount: string) => `Send $${amount} to your other account. This cannot be undone.`,
    sent: (amount: string, when: string, reference: string) => `Sent $${amount} to your other account on ${when}. Reference: ${reference}.`,
    send: (amount: string) => `Send $${amount}`,
    refusals: {
      shape: "That is not a Viky code. It starts with 0x and is 42 characters long.",
      own: "That is this account's own code. Paste the other account's.",
    },
  },

  failures: {
    notConfigured: "Viky cannot pay out yet. Nothing was taken.",
    rateMoved: "The price changed before you confirmed. Nothing was taken.",
    seeTheNewPrice: "See the new price",
    keptChanging: "The price kept changing and Viky stopped after three tries. Nothing was taken. Try again in a minute.",
    tryAgain: "Try again",
    expired: "That price has expired. Ask for a new one.",
    underWay: "You already have a payout waiting to finish. Give it a few minutes, then try again.",
    notSent: (name: string) => `${name} did not receive it and nothing left your account. Try again.`,
    other: "Viky could not finish this, and nothing was taken. Your money is where it was.",
  },
} as const;

/** The home page's card about money in the account, which is where the way out begins (W1). */
export const YOUR_MONEY = {
  label: "In your account",
  keep: "Yours to keep, to put behind another goal, or to take out.",
  readyLine: (name: string, number: string) => `${number} of it is ready to send to ${name}.`,
  readyLabel: (name: string) => `Ready to send to ${name}`,
  takeItOut: "Take it out",
} as const;

/** The account's own code, on the account page, where another account or a payout service asks for it (decision 11). */
export const YOUR_CODE = {
  title: "Your code",
  use: "Give it where a payout service asks where the money is sent from, or to another Viky account of yours that sends money here.",
  copy: "Copy your code",
  copied: "Copied",
} as const;
