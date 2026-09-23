import { PILOT_CAP_SENTENCE } from "./money";
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

/**
 * The card a gift is filled in on, and its four sheets (the product vision of 19 Sep 2026, sections 4 and 6).
 *
 * The card is the first thing on Home, with an account or without one. It says what the gift will be in one sentence
 * of four cases, and a case opens in a sheet rather than on a page. The words here are the card's own; everything
 * about a source still comes from the register, and the questions inside the sheets are the ones the journey already
 * asked, in `FUND` and in the register, so nothing a funder reads was invented for the new shape.
 */
export const OFFER = {
  /** What the card is, for a reader who is read to: the card itself says it by being one. */
  title: "Offer a gift",
  /** The label at the head of the card, in the third voice: whose gift this is, or that it is yours to fill in. */
  yourGift: "Your gift",
  fromFunder: (funder: string) => `A gift from ${funder}`,
  /** The same label while nobody has written a name, as desktop.html writes it. */
  fromYou: "A gift from you",
  /** The figure the amount is typed beside, so the field holds the number and nothing else. */
  dollar: "$",
  /** The mark before the figure, which is also how a person changes what they read in (D144). */
  currencyLabel: (currency: string) => `Money read in ${currency}. Press for another.`,
  /** The line under the condition on the card, which opens that condition's own questions (D136). */
  detailNeeded: "Not filled in yet",
  /** The three lengths the register gives the chosen condition, and there is no fourth on the card (D130). */
  someDays: (days: number) => `${days} ${days === 1 ? "day" : "days"}`,
  /** Under the action, for a gift counted by days: what one day of it is worth, and where the rest goes. */
  eachDay: (perDay: string) => `${perDay} a day. What's missed comes back to you.`,
  /** The name the card carries, and what it says while nobody has given one: "For  who?", the question in its place. */
  forName: (recipient: string) => `For ${recipient}`,
  forNobody: "For",
  who: "who?",
  /** Where the days will be, before there is anything to draw. */
  daysAppear: "The days appear once you choose what they will do.",
  /**
   * What a case that has not been answered says, in its own place on the card (the drawn card, section 2). Not a
   * label and a blank, and never an underlined link: the word that is missing, where it will be.
   */
  invites: {
    for: "Who is it for?",
    will: "what they will do",
    amount: "how much",
    howLong: "for how long",
  },
  /** What each case is called when a reader is told they can change it. */
  slots: {
    for: { label: "Their first name" },
    will: { label: "what they will do" },
    amount: { label: "how much" },
    howLong: { label: "how long" },
  },
  change: (slot: string) => `Change ${slot}`,
  /** Under the amount, in the third voice: how long the gift runs, once somebody has said. */
  forHowLong: (days: number) => `for ${days} ${days === 1 ? "day" : "days"}`,
  /** The one action of the card, and it appears only when the four cases are filled. */
  /** The card's own action: it sends the money, and the sheet it opens is where it is paid (the founder, 21 Sep). */
  pay: (amount: string) => `Send ${amount}`,
  /** The action, shut, saying what it is waiting for: the condition's own questions, or a length the route takes. */
  stillNeeded: "Fill the card to pay",
  finishWill: "Finish what they will do to pay",
  chooseLength: "Choose how long to pay",
  done: "Done",
  sheets: {
    who: "Who is it for?",
    will: "What will they do?",
    amount: "How much?",
    howLong: "For how long?",
  },
  amountSheet: {
    /** The keypad is the first thing, as it is in the money applications our references measured. */
    backspace: "Delete the last figure",
  },
  howLongSheet: {
    /** The three lengths offered before anybody types: the shortest the route accepts, what it suggests, the longest. */
    quick: (days: number) => `${days} days`,
    label: "Or type a number of days",
  },
  /** Said while the page works out where it is: never blank, never a spinner with nothing beside it. */
  oneMoment: "One moment",
  /** The way back to the card from the paying screen, where the four cases are changed. */
  backToCard: "Back to the card",
  /** Somebody who reached the paying screen with nothing filled in: the card is where a gift is made. */
  nothingToPay: {
    title: "Nothing to pay for yet",
    body: "The gift is filled in on the card, on the first page: who it is for, what they will do, how much, and for how long.",
    action: "Back to the card",
  },
} as const;

/**
 * Paying for the gift on the card, and the wait while it is made (the rendered mockups pay.html and paying.html of
 * 19 Sep 2026, which are the specification for these two surfaces).
 *
 * Three lines and no more: what goes in their name, what the card service keeps, and what Viky keeps, which is
 * nothing. Then what this person actually pays, in their own money and at a dated rate, and the sentence that says
 * when the account is made, which is at the press and not before.
 */
export const PAY = {
  title: (recipient: string) => `Pay for ${their(recipient)} gift`,
  rows: {
    gift: (recipient: string) => `The gift, in ${their(recipient)} name`,
    /** The company is not named on the line (the founder, 20 Sep 2026): the person is paying by card, and that is all
        they need to know here. It is named where it is met, on the page that opens, and behind the fold below. */
    service: "What the card service charges",
    viky: "Viky takes",
    fromAccount: "From your account",
  },
  nothing: "nothing",
  about: "about",
  aboutDollars: (dollars: number) => `about $${dollars.toFixed(2)}`,
  youPay: "You pay about",
  euros: (euros: number) => `${euros} EUR`,
  /**
   * The rate's source, named, and why its day can be a Friday on a Sunday: the European Central Bank sets one each
   * working day and none at the weekend (the founder, 20 Sep 2026: a line that looked stale becomes a proof of care).
   */
  atTheRate: (day: string) => `At the European Central Bank's rate of ${day}. It sets one each working day.`,
  /** When the gift needs less than the smallest payment the card service takes (D125). */
  floor: (euros: number) => `The card service takes nothing under ${euros} EUR, so that is what you pay. What is left over stays in your account for your next gift.`,
  /** Said before the action, because it is what pressing it does: nothing was asked of this person until now. */
  passkeyMakesTheAccount: "Your face or your fingerprint creates your account when you press pay. Nothing was asked of you until now.",
  signedIn: "Your face or your fingerprint is asked once, to sign what you are paying for.",
  pay: "Pay",
  payEuros: (euros: number) => `Pay ${euros} EUR`,
  payFromAccount: (amount: string) => `Put ${amount} in their name`,
  paying: "One moment",
  another: "Pay by card another way",
  /** The quiet second button of the mockup: everything only some readers need, one press away. */
  whatHappens: "What happens to my money",
  notMade: "That did not go through, and nothing was taken. Try again.",
  /** The wait, while the gift is being made: what is happening, how long, and what closing the page costs. */
  putting: (amount: string, recipient: string) => `Putting ${amount} in ${their(recipient)} name.`,
  takesSeconds: "It takes a few seconds. You can close this page: the gift will be in your gifts, with its link.",
  /** The card, small, under the wait: what is being made, in one line. */
  mini: (condition: string, amount: string, days: number) => `${condition} · ${amount} for ${days} ${days === 1 ? "day" : "days"}`,
} as const;

/** Home: the money, the one action, the way out, and what is moving. */
export const HOME = {
  /** The promise, as the rendered mockups of 19 Sep 2026 write it: three short lines in the title face. */
  promise: "Send money that motivates.",
  promiseBody:
    "Put money behind someone's goal. It becomes theirs as they make verified progress, and whatever they do not earn comes back to you. Nobody profits from anyone failing.",
  /**
   * The one sentence under the card, and there is no third (the drawn card, section 6). The promise above it is the
   * title; this is what it costs a visitor to try, and what happens to what nobody earns.
   */
  promiseUnder: "Back their goal. They earn it day by day. The rest comes back to you.",
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
  keep: "Yours to keep, to put behind another goal, or to take out.",
  takeItOut: "Take it out",
  readyLine: (name: string, amount: string) => `${amount} of it is ready to send to ${name}.`,
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
  /** One control, one press: the other of day and night. What it shows is the one the screen is in. */
  toggle: "Day or night. Press for the other.",
} as const;

export const DOOR = {
  /**
   * Two words, because the header has room for two (the founder, 21 Sep 2026: "c'est trop long"). It used to name
   * both of the things it does, which is what the sheet it opens does instead: the sheet says how an account is
   * made here, in one line, and its own action is "Create your account".
   */
  open: "Sign in",
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
  /**
   * The label at the head of a card, in the third voice: whose gift it is, for a reader who did not make it, and
   * "Your gift" for the one who did (the rendered mockups of 19 Sep 2026).
   */
  fromFunderOrYours: (funder: string | null) => (funder ? `A gift from ${funder}` : "Your gift"),
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

  detail: {
    checking: "Checking the name",
    /** Before a name is given there is no profile to read, so there is no list of courses to choose from (D136). */
    courseAfterName: "Give the name above and the courses appear here. Without a name, any course on their profile counts.",
    /** One line of the list: the course as the source names it, and the experience won in it. */
    courseWithXp: (title: string, xp: number) => `${title}, ${xp.toLocaleString("en-GB")} XP won`,
  },

  amount: {
    title: "How much, and for how long?",
    dollarsLabel: "How much, in dollars",
    dollarsHelp: (about: string | undefined) => (about ? `At least $1.00. ${about[0].toUpperCase()}${about.slice(1)}.` : "At least $1.00."),
    /**
     * The pilot's ceiling, said where the amount is chosen rather than met as a refusal afterwards (mitigation b,
     * 19 Sep 2026). It is the sentence src/money.ts refuses with, so the step and the field never disagree.
     */
    pilotCap: PILOT_CAP_SENTENCE,
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
    /** The two disclosures of the check (GOV.UK Details): what only some readers need, out of everybody's way. */
    elseTitle: "What else this means",
    feeTitle: (name: string) => `How ${name} charges`,
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
    /**
     * Under the loop, while the gift is being made. It says the time and what a closed page costs, and both are true:
     * the route waits for the chain to settle before it answers, and a gift that was made is in the list with its own
     * page, where the link can be had again. Never "do not close this page": that would be a threat we cannot keep.
     */
    takesSeconds: "This takes a few seconds.",
    pageMayClose: "If this page closes, look under your gifts: what was made is there, with its link. What was not can be picked up again.",
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
    /** Because the link is lost the moment this tab closes, and only the gift's page can make another (gift 1000001). */
    findItAgain: "Lose this link and the gift's page makes you a new one, as long as nobody has opened it.",
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
  goesBackToThem: (funder: string | null) =>
    sentence(`The same goes back to ${funder ?? "them"} for each day without it that is not caught up the next day. Nobody else ever profits from a missed day.`),
  comesBackToYou: sentence("The same comes back to you for each day without it that is not caught up the next day. Nobody else ever profits from a missed day."),
  openBy: (date: string, funder: string | null) => `Open it by ${date}: after 14 days unopened, it goes back to ${funder ?? "the person who offered it"}.`,

  createToOpen: "Create your account to open it. Nothing to install.",
  /** An opened gift, read by somebody with no account: it may be theirs, and it may not, so it says "if". */
  signInToSee: "Sign in if this gift is yours.",
  openMyGift: "Open my gift",
  opening: "Opening",
  missingKey: "This link is missing its key. Ask for the link again.",
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
  /**
   * From any device, for the account that made the gift. Only the key's fingerprint was kept, so the lost link cannot
   * be handed back: a new one is made and the old one stops opening the gift. Said before the gesture, never after.
   */
  linkAgainTitle: "The link",
  /** A link just made is copied for the first time, so nothing about it is "again" (ui review, 19 Sep 2026). */
  copyLink: "Copy the link",
  linkAgainWhy: "Lost the link, or sent it from another device? Get a new one. The link you had stops working the moment you do.",
  getLinkAgain: "Get the link again",
  gettingLink: "Making a new link",
  linkAgainDone: "Here is the new link. The one you had before no longer opens this gift.",
  linkAgainFailed: "The link could not be made just now. Nothing was changed: the link you had still works.",

  /**
   * Taking a gift back before anybody opened it. The contract has always allowed it and no screen offered it, so a
   * funder who never sent the link waited fourteen days (gift 1000001, 19 Sep 2026). Irreversible, so the amount is
   * said before and after, with the date after, and the link's death is said in the same breath.
   */
  takeBack: "Take this gift back",
  /**
   * Whose gift it is, on the card itself: on a phone the decision sits at the foot of a long page, and the name at
   * the top of it is three screens away (ui review, 19 Sep 2026).
   */
  takeBackFor: (recipient: string | null) => (recipient ? `Take back the gift for ${recipient}` : "Take this gift back"),
  /** Straight away, because the contract sends it inside the same call, and the screen waits for that call to settle. */
  takeBackReview: (amount: string) => `${amount} comes back to your account straight away. This cannot be undone.`,
  takeBackAndLink: "Its link stops working, and nobody can open it after this.",
  takeBackConfirm: (amount: string) => `Take back ${amount}`,
  takingBack: "Taking it back",
  takenBack: (amount: string, when: string) => `${amount} came back to your account on ${when}.`,
  takenBackLink: "The link no longer opens it, and nothing is left in the gift.",
  takeBackFailed: "That did not go through, and nothing was changed. The gift is where it was.",
  shareLink: "Share",
  shareLinkText: (recipient: string | null) => (recipient ? `${recipient}, this is for you.` : "This is for you."),
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

  nextReading: (moment: string) => `Next reading: ${moment} your time.`,
  yoursSoFar: "Yours so far",
  theirsSoFar: "Theirs so far",
  cameBackToYou: "Came back to you",
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
  takeReview: "It goes into your account, and it stays yours: from there you can send it to your bank. Nothing to pay.",
  notNow: "Not now",
  taking: "Taking it",
  taken: (amount: string, when: string, giftId: string, take: number) => `${amount} is in your account, ${when}. Reference: gift ${giftId}, take ${take}.`,
  sendToBank: "Send it to my bank",

  finished: (range: string) => `This gift is finished. ${range}.`,
  cameBack: (count: number, amount: string) => `${days(count)} came back to you: ${amount}.`,
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
 * The living card: what a gift's page leads with at each moment of its life (document J, 19 Sep 2026).
 *
 * Four things and no more, in this order: the state in one sentence, the figure that counts now with a label saying
 * what it is, the next moment with its date, and one action or none. What was agreed and how it is checked are
 * folded under their own names, because by the time they matter they have already been read.
 *
 * The rule that shapes every sentence here: **the headline never carries a figure the label and the figure below it
 * carry.** That is the whole defect this replaces, where a milestone page said its target three times, its amount
 * three times and its date three times on one screen.
 *
 * Three voices, and they are not the same question at the same moment: "is it for me?" against "did they see it?",
 * "did I get it?" against "did they get it?". A reader who is neither reads the third person throughout (D99).
 */
export const GIFT_LIVE = {
  /** Nobody has opened the link yet. */
  unopened: {
    yours: (funder: string | null) => (funder ? `${funder} put this in your name.` : "This is in your name."),
    theirs: (recipient: string | null) => (recipient ? `${recipient} has not opened it yet.` : "Nobody has opened it yet."),
    reading: (funder: string | null, recipient: string | null) =>
      `${funder ?? "Somebody"} put this in ${recipient ?? "somebody"}'s name.`,
    /** Under the money, what makes it theirs: the promise's rule, so the headline's "in your name" is not said again. */
    promise: {
      yours: { days: "Yours day by day", climb: (target: number) => `Yours at ${target}`, stamp: "Yours with the proof" },
      theirs: { days: "Theirs day by day", climb: (target: number) => `Theirs at ${target}`, stamp: "Theirs with the proof" },
    },
    /** To the funder: the day it comes back to them if nobody opens it (14 days after funding, both contracts). */
    openByTheirs: (date: string) => `If not by ${date}, it comes back to you.`,
  },
  /** Opened, and the source it counts is not connected yet: the one moment the whole agreement is read. */
  notConnected: {
    yours: (source: string) => `Connect ${source} and it starts.`,
    theirs: (recipient: string | null, source: string) =>
      `${recipient ?? "They"} opened it, and ${source} is not connected yet.`,
    /** Opened and nothing started: it goes back 14 days after it was opened (both contracts), said to each side. */
    connectBy: (date: string, funder: string | null) => `By ${date}, or it goes back to ${funder ?? "the person who offered it"}.`,
    connectByTheirs: (date: string) => `If not by ${date}, it comes back to you.`,
    label: { yours: "In your name", theirs: "In their name" },
  },
  /**
   * A habit being counted, day by day. The question is "did yesterday count?", which is the question the morning
   * message answers on the phone, in these same words: one wording for one fact, wherever it is read. The money it
   * carries there is the figure here, so it is not in the sentence.
   */
  counting: {
    counted: "Yesterday counted.",
    wentBack: (funder: string | null) => `Yesterday went back to ${funder ?? "the person who offered it"}. Today still counts.`,
    wentBackToYou: "Yesterday came back to you. Today still counts.",
    /** A gift settled before Viky kept a record of each day: the totals are true, the last day is not known. */
    running: "It is counting.",
    nothingYet: "Nothing has been counted yet.",
    label: { yours: "Yours so far", theirs: "Theirs so far" },
  },
  /** A rating climbing towards its target: how far is left, and where they stand today. */
  climbing: {
    toGo: (left: number) => `${left} to go.`,
    reachedAlready: "Reached. The next reading settles it.",
    notReadYet: { yours: "Your first reading starts the climb.", theirs: "Their first reading starts the climb." },
    label: { yours: "Where you are", theirs: "Where they are" },
  },
  /** Something granted once, waiting for the proof that it was. */
  awaitingProof: {
    yours: "Share the page that proves it, and the gift is yours.",
    theirs: (recipient: string | null) => `${recipient ? `${recipient} has` : "They have"} not shared the proof yet.`,
    /** A proof the person shows from their own account (D162): the gesture is "show", never "share a page". */
    shownYours: (source: string) => `Show it from your own ${source} account, and it is yours.`,
    shownTheirs: (recipient: string | null) => `${recipient ? `${recipient} has` : "They have"} not shown it yet.`,
    label: { yours: "In your name", theirs: "In their name" },
  },
  /** The first reading stood above what a climb may start from, so nothing can be earned: the reason, and the money. */
  startTooHigh: {
    yours: (reading: number) => `You were already at ${reading} when it started, so there is nothing to climb.`,
    theirs: (recipient: string | null, reading: number) =>
      `${recipient ? `${recipient} was` : "They were"} already at ${reading} when it started, so there is nothing to climb.`,
    label: (funder: string | null) => `Goes back to ${funder ?? "the person who offered it"}`,
    labelToFunder: "Comes back to you",
    /** When the money moves: at the gift's own deadline, by itself. */
    on: (date: string) => `On ${date}, when the time is up.`,
    /** The one action: the person asks for a new gift, the funder makes one. */
    ask: (funder: string | null) => (funder ? `Ask ${funder} for a new one` : "Ask for a new one"),
    askMessage: (funder: string | null) =>
      `${funder ? `${funder}, could` : "Could"} you make me a new gift on Viky? I was already past the target when this one started.`,
    asked: "Copied. Send it the way you usually talk.",
    offerAgain: "Make a new gift",
  },
  /** Reached, or finished with something earned: the money, theirs, at its largest. */
  won: {
    yours: "It is yours.",
    /** "They did it", the founder's words for the funder's moment (decision B, 23 Sep 2026). */
    theirs: (recipient: string | null) => `${recipient ?? "They"} did it.`,
    label: { yours: "Yours", theirs: "Theirs" },
    reachedOn: (date: string) => `Reached on ${date}.`,
    finishedOn: (date: string) => `Finished on ${date}.`,
  },
  /** The deadline passed, or the days ran out, with nothing earned: what goes back, and to whom. */
  over: {
    yours: "The time is up.",
    /** The funder's question is "what do I get back?": the headline says why, the figure says what. */
    theirs: (recipient: string | null) => `${recipient ?? "They"} did not make it in time.`,
    label: { yours: (funder: string | null) => `Back to ${funder ?? "the person who offered it"}`, theirs: "Back to you" },
    byItself: { yours: "Nothing to do: it goes back by itself.", theirs: "Nothing to do: it comes back to you by itself." },
    backOn: (date: string) => `Back on ${date}.`,
  },
  /** Taken back before anybody opened it: where the money went, and when. */
  cameBack: {
    yours: (funder: string | null) => `${funder ?? "The person who offered it"} took it back before it was opened.`,
    theirs: "It is in your account again.",
    label: { yours: "Taken back", theirs: "Came back" },
    on: (date: string) => `On ${date}.`,
  },
  /** What came back to the funder, said beside the money that is theirs, in the meta voice (the mockup's right column). */
  cameBackTo: (funder: string | null) => (funder ? `Came back to ${funder}` : "Came back"),
  cameBackToYou: "Came back to you",
  /**
   * Where the row of days stands, under it, in the meta voice (the mockup of 19 Sep 2026). The row keeps one size
   * whatever the count and scrolls rather than shrinking, so this line says which day is in view and that there is
   * more of it to the right.
   */
  dayOfDays: (day: number, total: number) => `Day ${day} of ${total}`,
  scrollForTheRest: "Scroll for the rest",
  /** The line above the name, to a reader nobody gave the names to: neither "your" nor anybody's. */
  aGift: "A gift",
  /** The card's title, to a reader given no name for the person it is for. */
  forSomebody: "For somebody",
  /** The two folds, each under its own name, and each already read by the time it is folded. */
  agreed: "What was agreed",
  checked: "How this is checked",
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
  atDeadlineYours: (by: string, funder: string | null) => `Reach it ${by} and it is yours. If not, it goes back to ${funder ?? "them"}.`,
  atDeadlineTheirs: (by: string) => `If they reach it ${by} it is theirs. If not, it comes back to you.`,
} as const;

/**
 * Offering a milestone gift (C2): the same flow as FUND, where a milestone asks different things. What a condition,
 * its cadences and its reading are called comes from the register (src/conditions.ts, src/milestone-conditions.ts);
 * `source` below is always the register's word, never one written here.
 */
export const MILESTONE_FUND = {
  detail: {
    /** While the source is being asked, and then how many it answered with: the list may run past the sheet. */
    searching: "Asking",
    /** The route hands back twelve at most, so at twelve the list may go on: say so rather than count. */
    found: (count: number) => (count >= 12 ? "The first twelve. Choose one below, or add a word to narrow it." : `${count} found. Choose one below.`),
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
    /**
     * What the recipient is asked for depends on who named the account (D27, D104 bis): one the funder named binds on its
     * first reading and asks nothing of the profile, and only an account they name themselves carries a code. This
     * screen promised a code either way until 19 Sep 2026, which was false for every gift made with a name.
     */
    next: (recipient: string, source: string, target: number, days: number, time: string, namedByFunder: boolean) => [
      namedByFunder
        ? `${recipient} opens the link and starts the first reading of that ${source} account. That reading is where they start.`
        : `${recipient} opens the link, names their ${source} account and puts a short code in its name, once. That first reading is where they start.`,
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
  checking: "Reading your rating",
  connectTitle: (source: string) => `Connect ${source}`,
  givenName: (source: string, username: string) => `Your ${source} name, as it was given: ${username}.`,
  /** The funder named the account, so there is nothing to prove and nothing to touch in a profile (D27). */
  nothingToDo: (source: string) => `Nothing to install, no password, and nothing to change on ${source}: the gift already knows the account it reads.`,
  startReading: (source: string) => `Start reading my ${source}`,
  /** How long they then have is in what was agreed, unfolded on this one moment (V4): it is not said twice. */
  connectNow: "Connect now: only what you reach after connecting counts.",
  firstReading: "If you have already reached it when you connect, this gift cannot count it, so connect before you play.",
  getCode: "Get my code",
  proveTitle: (username: string) => `Prove ${username} is yours`,
  added: "I added it",
  removeAfter: "You can take the code out right after. It works for an hour.",
  newCode: "Get a new code",
  startTooHighMine: (start: number, target: number, funder: string | null) =>
    `You had already reached ${target} when you connected: you were at ${start}, so this gift cannot count it. Ask ${funder ?? "the person who sent it"} for a new one. It goes back to them at the end.`,
  startTooHighTheirs: (start: number, target: number, recipient: string | null) =>
    `${recipient ?? "They"} had already reached ${target} when they connected, at ${start}, so this gift cannot count it. It comes back to you at the end.`,
  opened: "It is yours to earn.",
  take: (amount: string) => `Take ${amount}`,
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
  /** A gift that pays at a target, when the condition behind it could not be read: true of every milestone. */
  whenYouReachIt: "It becomes yours when you reach it.",
  fromCondition: (name: string) => `${name}. It becomes yours as you go.`,
  fromMilestone: (name: string) => `${name}. It becomes yours when you reach it.`,
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

/**
 * The judges page. It is the one page that names contracts, and the one place a stranger is invited to check us
 * rather than believe us, so its words are here like every other word a person reads.
 *
 * The note at the head of the verification is the founder's own, written as dictated on 18 Sep 2026: the key that
 * signs is ours, the owner can replace it, and here is how anybody checks that a reading had a proof behind it. It
 * promises nothing about where that key is held, because nothing has changed about where it is held.
 */
export const JUDGES = {
  ourKey: "The key that signs is ours. The owner can replace it.",
  andSo: "So here is how anybody checks, without us, that a reading really had a proof behind it.",
  fromNothing: "From nothing, on any machine with Node and pnpm. No key, no account, no permission from us:",
  copy: "Copy",
  copied: "Copied",
  copyRefused: "This browser would not let the page copy it. Select the line and copy it by hand.",
} as const;

/**
 * The public catalogue, "What Viky can check" (design audit of 16 Sep 2026, section 5).
 *
 * The chooser offers only what is proved, which leaves the question it raises unanswered anywhere: so what can Viky
 * check, and what is it working on? This page answers it without promising anything, because every line of it is the
 * register's own and each condition carries its state in words.
 */
/** The nature of a condition, in two words exactly (the founder, 22 Sep 2026): the meta voice, capitals, nowhere but three places. */
export const CONDITION_NATURE = { read: "READ FOR YOU", shown: "SHOWN BY THEM" } as const;

/**
 * A proof the person shows from their own account (D162): one button, and what happens around it. The source's
 * name comes from the register, never from here.
 */
export const SHOW_PROOF = {
  title: (source: string) => `Show it from your ${source} account`,
  whatHappens: (source: string) =>
    `A verification tab opens. You sign in to ${source} there, in your own browser, and what that page shows is proved without Viky ever seeing your password. Viky keeps the score it proves and nothing else.`,
  button: "Show it",
  opening: "Opening the verification",
  waiting: "Waiting for the proof",
  shown: (score: string) => `Shown: ${score}. It is yours.`,
  refusals: {
    notConfigured: "Showing a proof is not open yet. Nothing was changed.",
    belowTarget: "What you showed is under what this gift is for.",
    tooOld: "That proof took too long. Show it again.",
    cancelled: "Stopped before the proof came back. Nothing was changed.",
    unavailable: "The proof could not be checked right now. Try again in a moment.",
  },
} as const;

export const CATALOGUE = {
  title: "What Viky can check",
  intro:
    "A gift pays on what a source says in public about what somebody did. Here is everything Viky reads, everything it is trying, and what nobody can read at all. When you offer a gift, only what is open is shown to you.",
  states: "What each state means",
  /** The word of a line being built, on the public page: the frontier's own, and not a fifth state (D169). */
  beingBuilt: "Being built",
  frontier: "What has no public page",
  frontierIntro: "People ask for these. No source lets anybody check them, and the wall is not on our side.",
  limits: "What each of these proves, and what it does not, is written out on the same page as our own limits:",
} as const;

/**
 * What is read in, and how it is changed (D152). The sheet is the only place that names a currency in words: on a
 * screen the sign does it, and several currencies share a sign, which is why a name and a code stand beside it here.
 */
export const MONEY = {
  /** The key's own name for whoever cannot see it: what it does, and what is being read now. */
  readInAnother: (currency: string) => `Read in another currency, ${currency} now`,
  title: "Read money in",
  /** The two families of the list: what this device suggests, then everything else by name. */
  whereYouAre: "Where you are",
  everything: "All currencies",
  /** Said once, at the foot of the sheet, rather than on every line: one rate, one day, one sentence. */
  atTheRate: (date: string) => `About, at the European Central Bank's rate of ${date}.`,
  /** Said instead when no rate could be read: the list is still true, the figures beside it would not be. */
  noRate: "The exchange rate could not be read today, so these are shown in dollars.",
} as const;

/** Me: the account, in the order the structure gives it. */
export const ME = {
  title: "You",
  currency: "Money shown in",
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
  /** When the browser offers us no prompt of its own, which is where it keeps the same thing (D138). */
  installByHand: "If nothing opens, use your browser's menu: Add to Home screen, or Install.",
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
      a: "Money is put in someone's name, tied to what they do, for a number of days. Each day they do it, that day's share becomes theirs. A day they miss can still be caught up the next day; if it is not, it comes back to whoever paid, by itself, the morning after.",
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
  /** The balance at the head of the way out, and what it is for (out.html, 19 Sep 2026). */
  keepOrTakeOut: "Yours to keep, or to take out",
  aboutLine: (figure: string, day: string) => `About ${figure}, at the rate of ${day}.`,
  whereTo: "Where do you want it?",
  /** The label over the figure each way leads with: what would reach the person, said as the estimate it is. */
  youWouldGet: "You would get about",
  /**
   * The gap between the two ways, on the one that leaves the most, in the person's words (the founder, 20 Sep 2026:
   * near a quarter of their money separated the two cards and nothing said so).
   */
  moreThan: (gap: string, otherTitle: string) => `${gap} more than to ${otherTitle.toLowerCase()}.`,
  /** The fold under the cards where each service's published figures and their sources are kept for whoever asks. */
  whereFrom: "Where these figures come from",
  rateLine: (source: string, day: string) => `The rate: ${source}, ${day}.`,
  /**
   * The balance while a gesture is being confirmed. It is where you are, not what you are deciding, so it is said in
   * the meta voice and the amount being sent takes the display size (the founder, 19 Sep 2026).
   */
  yourMoneyNow: (held: string) => `Your money: ${held}`,
  rateNote: (about: string) => about,
  readyLine: (name: string, amount: string) => `${amount} of it is ready to send to ${name}.`,
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

  review: (amount: string, name: string, payout: string | undefined) =>
    `You will get at least ${amount} to send.${payout ? ` ${payout}` : ""} Nothing leaves your account yet.`,
  /**
   * The card service buys the chain's own coin, so what a person gets there is a quantity of it and not dollars. The
   * money they are spending leads, the quantity follows, and neither is left to be guessed (D104).
   */
  reviewGetting: (dollars: string, exact: string, name: string) =>
    `You are sending ${dollars} of your money, and you will get at least ${exact} to send, which is the quantity ${name} asks for.`,
  reviewPayout: (name: string, euros: string, fee: string, net: string) =>
    `${name} will turn that into about ${euros}, minus its ${fee} fee: about ${net} on your bank account.`,
  reviewCard: (name: string) => `What ${name} pays onto your card is shown on their page.`,
  reviewDollars: (dollars: string) => `That is $${dollars} of your money.`,
  priceHolds: "This price holds for 4 minutes.",
  priceRefreshed: "The price was refreshed.",
  getReady: (amount: string) => `Get ${amount} ready`,
  gettingReady: (amount: string) => `Getting ${amount} ready. A few seconds.`,

  ready: (amount: string) => `Ready: ${amount}`,
  /**
   * What the service's two decimals leave behind. It is always under a hundredth of what that service buys, by
   * construction (`readyFor` floors to two decimals), so it is said as the money it is on a dollar rail and as a
   * fraction of what the service buys on the other: never as a number with nothing to hold on to (D104).
   */
  staysDollars: "Less than $0.01 stays in your account.",
  staysQuantity: (name: string) => `Less than 0.01 of what ${name} buys stays in your account.`,
  step2: (name: string) => `Step 2 of 3: Place your order with ${name}`,
  order: (amount: string, name: string) => `Order ${amount} on ${name}`,
  giveThisCode: (name: string) => `When ${name} asks where you are sending from, give them this code`,
  copy: "Copy",
  copied: "Copied",
  copyRefused: "Your browser would not let us copy it. Press and hold the code, then choose Copy.",
  itIsYours: (name: string) => `${name} will ask you to confirm the money is yours: it is.`,
  sixHours: (name: string) => `Once you place the order, ${name} gives you six hours to send it.`,

  step3: "Step 3 of 3: Send it",
  pasteTheCode: (name: string) => `Paste the code ${name} gives you to send to`,
  amountFixed: "Amount",
  /**
   * The exact quantity the card service asks for, said once under the action it belongs to. A person decides on the
   * dollars above it; this is what they paste or check on the service's own page, so it can never be dropped.
   */
  exactQuantity: (name: string, exact: string) => `${name} asks for the exact quantity: ${exact}. It is the same money, counted the way ${name} counts it.`,
  send: (amount: string, name: string) => `Send ${amount} to ${name}`,
  codeRefusals: {
    shape: (name: string) => `That is not a code ${name} gives. It starts with 0x and is 42 characters long.`,
    own: (name: string) => `That is your own code. Paste the one ${name} shows you to send to.`,
  },
  /**
   * The review before sending: the star of the screen is what the gesture moves, so the amount is the figure, at
   * display size, and this sentence carries what is left to know (the founder, 19 Sep 2026). D104's rule stands, the
   * money still leads what a person decides on; it leads as a figure now rather than inside the sentence, and it is
   * said once on the screen rather than twice.
   */
  confirmTo: (name: string) => `To ${name}. This cannot be undone.`,
  confirmCard: "Sending costs a small amount of what you hold, said afterwards with its figure.",
  codeYouPasted: "The code you pasted:",
  sendButton: "Send",
  sending: (amount: string, name: string) => `Sending ${amount} to ${name}`,

  sent: (amount: string, name: string, when: string, reference: string) => `Sent ${amount} to ${name} on ${when}. Reference: ${reference}.`,
  sentPays: (name: string, pays: string, bank: boolean) => (bank ? `${name} pays your bank ${pays}.` : `${name} pays ${pays}.`),
  pasteFirst: (name: string) => `Paste the code from ${name} to send it.`,
  sendingCost: (cost: string) => `Sending cost ${cost}.`,
  follow: (name: string) => `Open ${name} to follow it`,

  closedTitle: "Your session closed while you were away",
  closedBody: "Nothing moved and nothing was taken. Your money is exactly where it was, and nothing about it expires.",
  closedWhere: (amount: string, name: string) => `You were at step 2 of 3: ${amount} is ready to send to ${name}.`,
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
  readyLine: (name: string, amount: string) => `${amount} of it is ready to send to ${name}.`,
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
