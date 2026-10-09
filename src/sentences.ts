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

/**
 * A source named from the funder's side, "their university", said to the person it is for: "your university". Every
 * other source is a proper name and is said as it is.
 */
function yourOwn(source: string): string {
  return source.startsWith("their ") ? source.slice("their ".length) : source;
}

function spokenTo(source: string): string {
  return source.startsWith("their ") ? `your ${yourOwn(source)}` : source;
}

/**
 * The month's limit of readings is reached (the founder, 3 Oct 2026): said in place, where a reading or a proof would
 * have gone, short, and in the quiet colour of the labels (`.limit-said`); the red is kept for a press it refuses. Viky asks an outside service for each attested
 * reading and for each proof a person shows, and that service counts them by the month (src/attested-calls.ts).
 * `until` is the real end of the window of the day that can still be counted, in the reader's own clock; a gift that
 * is not counted by days has none, and reads that nothing is lost instead. `email` is where to write, and the
 * sentence that names it is left out where none is set.
 */
/**
 * A day's ceiling of attested readings is reached (the founder, 3 Oct 2026; src/attested-calls.ts): Viky holds itself
 * to a number of them a day, for one gift and for all, so that a reading that keeps failing cannot spend the month.
 * Nothing was read. Readings resume with the next UTC day, which the browser says in the reader's own clock
 * (src/client/limit.ts); a place with no clock says "tomorrow".
 *
 * It said "Nothing is lost." until 8 Oct 2026, which the contract does not promise: the ceiling holds no day. A day
 * not read stays open until its catch-up window closes and then goes back to the funder like a missed day. So the
 * sentence says when reading resumes, and the browser adds until when the open day can still be counted, as it does
 * for the month's limit (`LIMIT.dayYours`): the two hours are what the person can act on.
 */
export const CEILING = {
  reading: (resumes: string | null) => `Viky has read this as often as it does in one day. It resumes ${resumes ?? "tomorrow"}.`,
} as const;

/**
 * A month's reserve is used up (the founder, 3 Oct 2026). Viky asks an outside service for each attested reading and
 * for each proof a person shows, and that service gives two reserves a month (src/attested-calls.ts): the readings Viky
 * takes by itself, and the proofs people show.
 *
 * One sentence in the open, in the quiet colour of the labels: which service is not checked, named by the gift's own
 * source, and the day it starts again, which is the cycle's own first day. Everything else is folded under "What you
 * can do": until when the open day can still be counted, that what is already theirs is taken out as usual, what the
 * empty reserve does not touch, and where to write. A sentence of that length is not left in the open (rule 4).
 *
 * The same sentence is said before a gift is paid for, on the card and in the choice of what they will do: a
 * condition whose reserve is empty says so, and stays offered beside those that work.
 */
export type Reserve = "readings" | "proofs";
export const LIMIT = {
  /** The two sentences said in the open, each kept apart so that each is measured for itself (rule 4). */
  service: (source: string, reserve: Reserve) => `Viky can't check ${source} right now: this month's ${reserve} are used up.`,
  startsAgain: (again: string) => `It starts again on ${again}.`,
  /** `yours`: said to the person the gift is for, whose source is then theirs to read ("your university"). */
  said: (source: string, reserve: Reserve, again: string, yours = false): string => `${LIMIT.service(yours ? spokenTo(source) : source, reserve)} ${LIMIT.startsAgain(again)}`,
  /** The fold's name, and what it holds, a line each. */
  can: "What you can do",
  /** Under a press that was refused, with the limit's sentence: until when the open day can still be counted. */
  dayYours: (until: string) => `Your day can still be counted until ${until}.`,
  dayTheirs: (name: string | null, until: string) => `${name ? `${name}'s` : "Their"} day can still be counted until ${until}.`,
  /** The fold, each a label and its value (the founder, 4 Oct 2026): a fold holds lines, never paragraphs. */
  lines: {
    /** The label carries the words and the value the hour alone: a long value left the label one word a line. */
    dayYours: (until: string): readonly [string, string] => ["Your day counts until", until],
    dayTheirs: (name: string | null, until: string): readonly [string, string] => [name ? `${name}'s day counts until` : "Their day counts until", until],
    takeYours: ["What is already yours", "taken out as usual"] as readonly [string, string],
    takeTheirs: ["What is already theirs", "taken out as usual"] as readonly [string, string],
    /** What an empty reserve does not touch: the gifts that draw on the other one. */
    untouched: { readings: ["Gifts proved by a document", "not touched"], proofs: ["Gifts Viky reads by itself", "not touched"] } as Record<Reserve, readonly [string, string]>,
    write: (email: string): readonly [string, string] => ["To reopen it sooner", email],
  },
  /** Beside a condition in a list, where a sentence has no room: four words (rule 5). */
  backOn: (again: string) => `Back on ${again}`,
  /** Whether a sentence is the one said in the open, wherever a screen prints what it was answered to a press: it is then set in the red. */
  isSaid: (text: string | null | undefined) => Boolean(text && /^Viky can't check .+ right now: this month's (readings|proofs) are used up\./.test(text)),
} as const;

/** The three destinations of the bar and the rail, and the mark. */
export const NAV = {
  mark: "Viky",
  home: "Home",
  gifts: "Gifts",
  me: "Me",
  back: "Back",
  /** The way back's name for a screen reader, by where it leads: it is drawn as an arrow alone (3 Oct 2026). */
  backTo: { "/": "Back to Home", "/gifts": "Back to my gifts", "/me": "Back to Me" },
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
  /**
   * The four lines of "How this is checked", on the sheet where a condition is chosen (the founder, 4 Oct 2026):
   * where it is read from, when, what counts, what the person has to do. The values are each condition's own
   * (src/conditions.ts, `checked`), and "Read" is the value the gift's page prints for the same condition.
   */
  checked: { from: "Read from", when: "Read", counts: "What counts", they: "They must" },
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
  /** Over those lengths when they are not a row of days: what the length sets (the founder, 29 Sep 2026). */
  lengthFor: { stamp: "Time to show it", climb: "Time to reach it" },
  /** Under the action, for a gift counted by days: what one day of it is worth, and where the rest goes. */
  /** Under the row of days, what one mark is worth (D226): the figure in the title face, then this. */
  aDay: "a day",
  /** Under the action, the other half of the promise, which the row's figure no longer carries (D226). */
  missedBack: "What's missed comes back to you.",
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
  /**
   * What Done says when something is still to answer, instead of going grey with no word (the founder, 28 Sep 2026):
   * the first thing missing, and pressing it takes the person there.
   */
  unanswered: {
    condition: "Choose what they will do.",
    name: "Their name is still to fill in.",
    cadence: "Choose which one.",
    standing: "Reading where they stand today.",
    target: "Set the goal they reach.",
    course: "Choose the course.",
    scale: "Choose the grading scale.",
  },
  /** The chooser's first face from six conditions (D224): a tile per family, and the way back to them from a family's list. */
  families: "All families",
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
  /** The one thing to fill in, so it comes first (the founder's mockup of 3 Oct 2026); empty, the gift is from nobody. */
  nameLabel: (recipient: string) => (recipient.trim() ? `Your name, as ${recipient} knows you` : "Your name, as they know you"),
  // An example of a giver's name, and never a parent's (the founder, 4 Oct 2026): Viky is for adults on both sides.
  namePlaceholder: "Sam",
  /**
   * Lines that add up, in the one money the gift was typed in (the mockup of 3 Oct 2026, src/pay-sum.ts). The company is
   * not named on a line (the founder, 20 Sep 2026): it is named under the button, where the card goes to it.
   */
  rows: {
    gift: (recipient: string) => (recipient.trim() ? `${recipient}'s gift` : "The gift"),
    fromAccount: "From your Viky money",
    fee: "Card fee",
    // What the card brings beyond the gift and its fee: "Stays in your Viky money" was not understood (the founder,
    // 4 Oct 2026). The line stays, so the sum adds up.
    stays: "Change, kept in your account",
    viky: "Viky takes",
  },
  nothing: "nothing",
  about: "about",
  /** When the service publishes its share as a ceiling and the ceiling is what applies at this amount. */
  upTo: (amount: string) => `up to ${amount}`,
  youPay: "You pay",
  /**
   * The rate's source, named, and why its day can be a Friday on a Sunday: the European Central Bank sets one each
   * working day and none at the weekend (the founder, 20 Sep 2026: a line that looked stale becomes a proof of care).
   */
  atTheRate: (day: string) => `At the European Central Bank's rate of ${day}. It sets one each working day.`,
  /** Said before the action, because it is what pressing it does: nothing was asked of this person until now. */
  passkeyMakesTheAccount: "Your face or your fingerprint creates your account when you press pay. Nothing was asked of you until now.",
  /** The same, where a code can be used on the sheet as well (9 Oct 2026): either press makes the account. */
  passkeyMakesTheAccountEitherWay: "Your face or your fingerprint creates your account when you press pay or use the code.",
  /**
   * For a passkey made on another device, which this one does not know of: pay would make a second account. It said
   * "I already have an account", which declares a state: a button says what its press does (the founder, 4 Oct 2026).
   */
  alreadyHaveAccount: "Sign in",
  /** The sheet the card is paid in, and what its frame is called when read aloud. */
  card: { title: "Pay by card", frame: "Card payment" },
  /**
   * Rampnow in a frame of our own, one payment for one gift (the founder, 3 Oct 2026, src/rampnow-frame.ts). Its page
   * beside stays the fallback.
   *
   * A button says what the press does and never declares a state (the founder, 4 Oct 2026). When only the person knows
   * a fact, the screen asks it as a question, and the answers are actions: "Did you pay by card?", "Yes, finish my
   * payment", "No, pay now".
   */
  rampnow: {
    /** The frame said the payment failed, and nothing left: said on the screen that waits, where paying starts again. */
    failed: "The payment did not go through. Nothing was taken.",
    /** The frame's address could not be had: its page beside is the way. */
    notShowing: "If the payment does not show, open its page instead.",
    openPage: "Open the card page",
    /** Under the frame while no payment is known: the one way out, and the page beside for a sign-in the frame refuses. */
    goBackWithoutPaying: "Go back without paying",
    /** The same place, when the frame was opened on a payment already started: back to the screen that waits, which keeps it. */
    goBack: "Go back",
    cantSignIn: "Can't sign in here?",
    /** Under the frame once a payment is known: no way out, and why. */
    keepOpen: "Keep this window open: Rampnow is finishing your payment.",
    /**
     * Under the frame from the moment a payment was started (the founder, 5 Oct 2026): Rampnow's own page shows an
     * error of its own at a step it does not know, and the payment is not lost for it.
     */
    foundAgain: "If this window shows an error, your payment is found again from Home.",
    /** Five minutes without the money: a way out, to the screen that waits. */
    late: "This is taking longer than usual.",
    lateOut: "Close this window",
    /** On the screen that waits, a payment known: where it is, since when, and the one way back to it. */
    atRampnow: "Your payment is at Rampnow.",
    needsItsPage: "It finishes on Rampnow's page, which has to be open for it.",
    since: (minutes: number) => `Started ${ago(minutes)}.`,
    finish: "Finish my payment",
    /** On the screen that waits, nothing known of a payment: the question, what makes it asked, and its two answers. */
    didYouPay: "Did you pay by card?",
    started: (minutes: number) => `A card payment was started ${ago(minutes)}.`,
    yesFinish: "Yes, finish my payment",
    noPayNow: "No, pay now",
    /** On Home and on Gifts, where "not made yet" stood: one sentence, and one button that leads to the screen that waits. */
    giftStarted: (amount: string, recipient: string, minutes: number) => `${amount}${forThem(recipient)}: a card payment was started ${ago(minutes)}.`,
  },
  yourCode: "Your code",
  /**
   * The one line under the pay sheet's button (the mockup of 3 Oct 2026): who takes the card, what it asks before
   * taking it, and the terms, with no box to tick. What it asks is that service's own (`WayIn.asks`, the founder,
   * 5 Oct 2026): "with your ID the first time" was said of every one of them, and one asks for more than that.
   * Elsewhere a button that pays by card keeps `cardTerms` under it.
   */
  cardLine: {
    before: (partner: string, asks: string) => `${partner} takes your card and asks for ${asks}. By paying you are 18 or older and accept `,
    link: (partner: string) => `${partner}'s terms`,
    after: ".",
  },
  /**
   * Under every button or link that pays by card, for the payer alone (the founder, 29 Sep 2026): no box to tick and no
   * screen more. The partner is the one the card goes to, and its terms are linked on its own site.
   */
  cardTerms: {
    before: "By paying by card, you confirm you are 18 or older and accept ",
    link: (partner: string) => `${partner}'s terms`,
    after: ".",
  },
  /** In the card's place, where no card partner serves the payer's country (the founder's words, 29 Sep 2026). */
  cardNotOffered: (country: string | null) =>
    `Card payment isn't available ${country ? `in ${country}` : "where you are"}. You can pay with money already in your Viky account, and anyone who uses Viky can send money to yours.`,
  /** The button while nothing says yet what pays: the gift is not filled in, or what the account holds is not read. */
  pay: "Pay",
  /** Under the button while the account is being read (the founder, 5 Oct 2026): the button names no way until then. */
  readingAccount: "Reading what your account holds.",
  /** The reading failed: what happened, and the small button under it reads again. Never the card in its place. */
  accountUnread: "What your account holds could not be read.",
  readAgain: "Read it again",
  payByCard: (amount: string) => `Pay ${amount} by card`,
  payFromAccount: (amount: string, recipient: string) => `Put ${amount} in ${their(recipient)} name`,
  /**
   * Above that action, for an account the judge code credited and only for it (D295). It says how a funder pays by
   * card as the build and this browser really do it (the founder, 4 Oct 2026): it said "inside this sheet, once our
   * payment partner is embedded" after the frame was switched on. In a frame, with the limit the judges page gives
   * it; in a sheet of Viky's own; or on the card service's page in a tab, which is also where the frame is never shown.
   */
  fromJudgeCredit: (how: "frame" | "sheet" | "tab", service: string) =>
    how === "frame"
      ? `Paid from your judge credit. A funder pays by card through ${service}, in a frame inside Viky that has to stay open until the money arrives.`
      : how === "sheet"
        ? `Paid from your judge credit. A funder pays by card through ${service}, in a sheet inside Viky.`
        : `Paid from your judge credit. A funder pays by card on ${service}'s page, in a tab of its own.`,
  /**
   * The judge code in the pay sheet, as a code is asked at a checkout (D297, the founder's choice A of 28 Sep 2026).
   * The card stays the sheet's one action (the founder, 9 Oct 2026: a code is visible, never put forward in the
   * card's place). When the link that brought the person carried a code, its field comes first, above what the card is
   * asked, open and filled in, under the question as its name and with a small button; otherwise the question is a
   * small key under the card's button, which opens the field where it stands.
   */
  code: {
    have: "Have a code?",
    /** The action once the credit is all the account holds and it covers the gift: what pays is said on the button. */
    payWithCredit: (amount: string) => `Pay ${amount} with your credit`,
    label: "Code",
    use: "Use the code",
    using: "Checking the code",
    given: (amount: string) => `${amount} from your judge credit is in your account.`,
    /** The gift brought to what the account holds once a judge's credit is in, said as it is done (D300, choice B). */
    adjusted: (amount: string) => `Your gift is now ${amount}, what your account holds.`,
    failed: "The code could not be checked just now.",
  },
  paying: "One moment",
  /** The quiet second button of the mockup: everything only some readers need, one press away. */
  whatHappens: "What happens to my money",
  /**
   * That fold: short lines, a label and its value, four at most and never a paragraph (the founder, 4 Oct 2026). What
   * comes back to the giver and when, by the kind of gift; the card's fee is its third line, with the service's name.
   */
  fold: {
    missedDay: ["A missed day", "back to you"],
    notReached: ["Not reached in time", "back to you"],
    notShown: ["Not shown in time", "back to you"],
    notOpened: ["Not opened in 14 days", "back to you"],
  },
  notMade: "That did not go through, and nothing was taken. Try again.",
  /** The wait, while the gift is being made: what is happening, how long, and what closing the page costs. */
  putting: (amount: string, recipient: string) => `Putting ${amount} in ${their(recipient)} name.`,
  /** Two lines under the ring since 2 Oct 2026: how long, then what happens if the page goes. */
  takesSeconds: "It takes a few seconds.",
  mayClose: "You can close this page: the gift will be in your gifts, with its link.",
  /** The card, small, under the wait: what is being made, in one line. */
  mini: (condition: string, amount: string, days: number) => `${condition} · ${amount} for ${days} ${days === 1 ? "day" : "days"}`,
} as const;

/** Home: the money, the one action, the way out, and what is moving. */
/**
 * Under the card on the landing: five posters, then the phone and one last way to the card (the founder, 5 Oct 2026,
 * on a living mockup, over D282's four blocks with a drawing each; second pass the same day). A poster is a title in
 * the hero's own size with a character held in it, and short lines under it: each line one fact, a sentence of eleven
 * words at most, three lines at most. `characterAfter` is the word of the title the character stands after: it is held
 * to that word and never starts a line.
 *
 * Every sentence is true of the code. The escrow allocates the money in the recipient's name when the gift is paid
 * for, releases a day's share on a verified day, which they can then take out, sends every missed day back to the
 * funder by itself and pays nobody else (`contracts/GiftEscrowV3.sol`). Progress is read from the service or the
 * certificate's own page, by Viky or from the person's own account: never from a picture somebody sends. No reading
 * counts before the person it is for has signed their yes (`src/consent-guard.ts`); what the funder is shown is the
 * result and never anything else of the account (`src/consent-terms.ts`); and they can stop the reading or end the
 * gift and keep what they earned. The account is a passkey: the device's own check, a fingerprint, a face or its
 * code, which never leaves the device. The app is the website, installable.
 *
 * "Nothing is counted until they agree" and not "nothing is read": the card reads a public profile's name, and where
 * a rating stands, while the gift is being prepared (app/kit/offer/WillSheet.tsx), before anybody has agreed.
 */
export const LANDING_STORY = {
  blocks: [
    {
      key: "theirs",
      title: "Theirs from day one.",
      characterAfter: "day",
      lines: ["The money is in their name the moment you pay.", "It becomes theirs to spend as they make progress."],
    },
    {
      key: "checked",
      title: "Checked, not claimed.",
      characterAfter: "Checked,",
      lines: ["Viky reads the result where it happens.", "No screenshots. Nobody's word to take."],
    },
    {
      key: "back",
      title: "A missed day comes back to you.",
      characterAfter: "day",
      lines: ["By itself. You never have to ask.", "Nobody profits from a missed day, not even Viky."],
    },
    {
      key: "yes",
      title: "They say yes first.",
      characterAfter: "yes",
      lines: ["Nothing is counted until they agree.", "You see the result, never the rest of their account.", "They can stop anytime and keep what they earned."],
    },
    {
      key: "key",
      title: "You are the key.",
      characterAfter: "You",
      lines: ["Your fingerprint, your face or your phone's code opens your account.", "It stays on your phone. Viky never sees it.", "No password to invent. Nothing to download."],
    },
  ],
  /** The band of names under "Checked, not claimed.", for somebody who moves through the page by its regions. */
  read: "What Viky reads",
  phone: {
    title: "On your phone, like an app.",
    body: "Viky opens in the browser. Add it to your home screen and it opens like your other apps.",
  },
  last: { title: "Back someone's goal today." },
  /** What the posters are, for somebody who moves through the page by its regions. */
  region: "What Viky promises",
  /**
   * At the foot of the landing, small and readable (the founder, 5 Oct 2026): it stood under the sentence that goes
   * through what a gift can wait for, after a sentence that said the "Checked, not claimed." poster again.
   */
  notAffiliated: "Not affiliated with the schools, races or services named.",
} as const;

/**
 * What the owner of a mark asks of a page that names it. ETS, for the TOEFL: this notice "at the bottom of each web
 * page", "in a legible print size and color" (ets.org/legal/trademarks.html, read on 5 Oct 2026).
 */
export const TRADEMARKS = {
  ets: { name: "TOEFL", notice: "TOEFL is a registered trademark of ETS. This product is not endorsed or approved by ETS." },
} as const;

export const HOME = {
  /** The promise, as the rendered mockups of 19 Sep 2026 write it: three short lines in the title face. */
  promise: "Send money that motivates.",
  promiseBody:
    "Put money behind someone's goal. It becomes theirs as they make verified progress, and whatever they do not earn comes back to you. Nobody profits from anyone failing.",
  /**
   * The one sentence under the title, and there is no third (the drawn card, section 6): what it costs a visitor to
   * try. The founder took its last sentence off on 24 Sep 2026 (D221); what happens to what nobody earns is the
   * card's to say.
   */
  promiseUnder: "Back their goal. They earn it day by day.",
  /**
   * The sentence under the card since D285: the start, then one thing a gift can wait for at a time (`landingGoals`).
   * The line that stood under it left on 5 Oct 2026: where each is read is the "Checked, not claimed." poster's to
   * say, and who Viky is not affiliated with is said at the foot of the page (`LANDING_STORY.notAffiliated`).
   */
  waitsFor: {
    lead: "Their gift can wait for",
    all: "Their gift can wait for a certificate, a grade or a year at university, a score, a rating, a Rubik's Cube time, a goal kept each day, or a race they finish.",
  },
  offer: "Offer a gift",
  finish: "Finish the gift you set up",
  howItWorks: "How it works",
  steps: [
    "You choose who it is for, what they will do, how much, and for how long.",
    "They connect what they do. Each day they reach the goal, that day's share becomes theirs.",
    "Each day they miss comes back to you, by itself. Nobody profits from anyone failing.",
  ],
  /**
   * The name of the one amount, on Home and on Me as on the screen that takes money out (the founder, 4 Oct 2026): one
   * figure, one name. It said "In your account" over money part of which is still in the person's gifts.
   */
  yours: "Yours",
  /** Under the amount at display size: what is approximate, when the rate was read, and the dollars themselves. */
  /**
   * The balance's own action (the founder, 29 Sep 2026): a first outside tester read "Use your money" as "use it to make
   * a gift". Both verbs, since the ways out lead with gift cards and phone credit, which are spent, not withdrawn.
   */
  takeItOut: "Spend or withdraw",
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
   * made here, in one line, and its own action is "Create my account".
   */
  open: "Sign in",
  how: "Your face or your fingerprint, and nothing to remember.",
  /** The same words as the account's other door (app/components/AccountPanel.tsx): one action, one name (5 Oct 2026). */
  create: "Create my account",
  again: "Try again",
  notNow: "Not now",
  busy: "One moment",
  title: "Sign in or create account",
} as const;

/**
 * The two pages a wrong address or a failure used to leave to the framework's own (the audit of 1 Oct 2026): one
 * sentence each, and the way back to Viky.
 */
export const LOST = {
  missing: "This page does not exist.",
  failed: "This page could not be shown. Nothing was changed.",
  home: "Back to Viky",
} as const;

/**
 * The account's door where the account is made elsewhere, or where the device did not say it can make one (the
 * founder, 1 Oct 2026). "This gift's link" on a gift, whose key is in the link itself; never the site's name in its
 * place, and never "computer" on a phone. Nothing here promises that a press leaves the app: the press is offered,
 * and what to do when it opens nothing is said.
 */
const linkOf = (gift: boolean) => (gift ? "this gift's link" : "this page's link");
const BROWSER_NAME = { safari: "Safari", chrome: "Chrome", browser: "your browser" } as const;
/** The apps a person knows by another name than the one the test gives them. */
const APP_NAME: Readonly<Record<string, string>> = { twitter: "X", gsa: "the Google app", messenger: "Messenger" };
export const ACCOUNT_DOOR = {
  /**
   * The small line of the box, under a line that already says where to go (the founder, 1 Oct 2026): why here cannot,
   * and nothing about an account that "cannot be made", which the line above it contradicted. Named when the app is
   * known ("Instagram's own window"), "This app's own window" otherwise.
   */
  insideApp: (app: Readonly<{ key: string; name: string | null }>) => {
    const name = APP_NAME[app.key] ?? app.name;
    return `${name ? `${name.charAt(0).toUpperCase()}${name.slice(1)}'s` : "This app's"} own window cannot create an account.`;
  },
  browserCannot: "This browser cannot create an account.",
  /** The line above the box on a gift, in that state only: the way on, by the name the button carries. */
  continueIn: (browser: keyof typeof BROWSER_NAME | null) => `To open it, continue in ${browser ? BROWSER_NAME[browser] : "Chrome or Safari"}. Nothing to install.`,
  openIn: (browser: keyof typeof BROWSER_NAME) => `Open in ${BROWSER_NAME[browser]}`,
  /** After a press that opened nothing: where the app's own menu is, without quoting a label that changes with the app and the phone's language. */
  stayed: { iphone: "Nothing opened? Press \u22EF at the top, then choose to open it in your browser.", android: "Nothing opened? Press \u22EE at the top, then choose to open it in your browser." },
  openItIn: (gift: boolean) => `Open ${linkOf(gift)} in Chrome or Safari.`,
  copy: (gift: boolean) => `Copy ${linkOf(gift)}`,
  copied: (browser: keyof typeof BROWSER_NAME | null) => (browser ? `Copied. Paste it in ${BROWSER_NAME[browser]}.` : "Copied."),
  copyRefused: "This browser would not copy it. Press and hold the link, then choose Copy.",
  linkLabel: "The link",
  how: "Your face or your fingerprint, and nothing to remember.",
  /**
   * Said wherever an account is made, to the person who offers and to the person a gift is for (the founder, 4 Oct
   * 2026): Viky is for adults, on both sides. It was said at the card payment alone.
   */
  adult: "By creating an account you confirm you are 18 or older.",
  /** Two lines: what the computer lacks, then what to do. */
  computer: (gift: boolean) => ["This computer did not find a fingerprint reader or Windows Hello.", `Use a security key, or open ${linkOf(gift)} on your phone.`],
  ifItKeepsFailing: {
    iphone: (gift: boolean) => `If it keeps failing on this iPhone: in Settings, turn on AutoFill Passwords and Passkeys, and open ${linkOf(gift)} in Safari.`,
    android: (gift: boolean) => `If it keeps failing on this phone: set a screen lock on it, and open ${linkOf(gift)} in Chrome.`,
  },
  /** An iPhone below iOS 18: the passkey an account is made from does not exist there (Mera's authenticator table). */
  outdated: "Update your iPhone to create your account. Viky needs iOS 18 or later.",
  /**
   * On any address but Viky's own (the audit of 1 Oct 2026): a passkey belongs to the address it was made on for good,
   * so an account made on another one could never be opened on viky.cash. Signing in to one made there stays.
   */
  madeOnTheMainSite: "Accounts are created on viky.cash.",
  createThere: "Create my account on viky.cash",
  samePasskey: "The same passkey you made your account with.",
  another: "A second account would not hold what the first one does.",
  /**
   * On a computer, before the press (the founder, 5 Oct 2026; research D, P4 and P5). Where the key goes is chosen in
   * the system's own sheet and the page is not told, so what can be said first is which choice follows the person:
   * Google's own help says a key saved in Windows Hello or in a Chrome profile stays on that computer and cannot be
   * recovered (support.google.com/chrome/answer/13168025, read 5 Oct 2026). "Passkey" is the system sheet's own word,
   * and under ninety characters, as every sentence in the open is: what a key kept here cannot do is said after the
   * press, by the notice, when it is the case.
   */
  onAComputer: "Save your passkey with Apple or Google. Kept on this computer alone, it stays on it.",
  /**
   * After it, on a computer: where the key is kept, when the browser said (src/account/key-kept.ts). A key bound to
   * this computer is said with what follows from it; a key that may follow is named by its store and nothing is
   * promised of it, since which phones a store reaches is not something the browser tells. Nothing where it said nothing.
   */
  keyKept: (kept: Readonly<{ follows: boolean; where: string | null; apart: boolean }>): string | null => {
    if (kept.follows) return kept.where ? `Your passkey is kept in ${kept.where}.` : null;
    if (kept.apart) return "Your passkey is kept on your security key. Your account opens with it alone.";
    return `Your passkey is kept ${kept.where ? `in ${kept.where}, ` : ""}on this computer only. It does not follow you to your phone.`;
  },
  /** The notice that says so once, on Home: read, and not shown again on this device. */
  gotIt: "Got it",
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
  /** A climb whose figures this reader is not shown: where it stands goes only where the names go (29 Sep 2026). */
  milestoneUnderWay: "Under way.",
  milestoneEnded: "It has ended.",
  milestoneReached: (target: number) => `Reached ${target}.`,
  milestoneMissed: (target: number) => `Did not reach ${target} in time.`,
  /**
   * Something had or not, on the card: its target on the contract is 1, or a count nobody reads, and is never printed
   * (the audit of 1 Oct 2026: "Target 1. Not read yet."). What is said is where its one proof stands.
   */
  hadOrNot: {
    waiting: "Not proved yet.",
    checking: "Shown. Viky is checking it.",
    refused: "Checked: it did not show what the gift asks.",
    /** Shown, held, and never reviewed before the contract stopped taking it (the audit of 8 Oct 2026): ours. */
    unread: "Shown. Viky did not check it in time.",
    building: "Waiting for the university's page to be set up.",
    proved: "Proved.",
    missed: "Not proved in time.",
  },
  /** "$25.00, by 1 Oct 2026" once started; "$25.00, within 30 days of connecting" before. */
  milestoneAmount: (total: string, by: string) => `${total}, ${by}`,
  milestoneStartTooHigh: (start: number, target: number) => `Already at ${target} when it was connected (${start}): it goes back at the end.`,
} as const;

/** "Léa's", for a name the funder typed. */
/**
 * A recipient named or not (D299): a card can be paid for without a name, a gift for whoever opens the link (the
 * founder, 20 Sep 2026), so every sentence that names them says it without one too, never "for ," or "'s gift".
 */
const their = (name: string) => (name.trim() ? `${name}'s` : "their");
const forThem = (name: string) => (name.trim() ? ` for ${name}` : "");
/** How long ago, in whole minutes, then in whole hours: "less than a minute ago", "4 minutes ago", "3 hours ago". */
const ago = (minutes: number) => {
  if (minutes < 1) return "less than a minute ago";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
};
const onlyTo = (name: string) => (name.trim() ? name : "the person it is for");

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
    funderHelp: "Like Sam, or Tom: the gift says who it is from.",
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
    firstDay: (source: string, sameDay = false) => `The day ${sameDay ? "" : "after "}they connect ${source}`,
    ends: (days: number) => `${days} days after that`,
    missed: (time: string) =>
      `A day they miss can still be caught up the next day. If it is not, it comes back to you by itself the morning after, at about ${time} your time.`,
    namesSeen: (recipient: string, funder: string) => `${recipient} and ${funder} show on the gift, to whoever opens its link.`,
    linkRisk: (recipient: string) => `The link you will get opens the gift for whoever opens it first. Send it only to ${onlyTo(recipient)}.`,
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
    why: "The money is held in your name until they earn it, so it needs somewhere of yours to be held.",
  },

  waiting: {
    /** The amount as the screen's own button writes it, "€30.00": one writing on one screen (the founder, 4 Oct 2026). */
    title: (amount: string | undefined) => (amount ? `Waiting for your ${amount} payment` : "Waiting for your payment"),
    /**
     * The wait's head: two short lines, a label and its value, where "In your account now: …" and "Your gift: … for
     * Boo, 30 days." stood as sentences (the founder, 4 Oct 2026).
     */
    lines: { gift: "Your gift", account: "In your account" },
    giftSaid: (amount: string, recipient: string, days?: number) => `${amount}${forThem(recipient)}${days ? `, ${days} days` : ""}`,
    /**
     * A card paid through Rampnow: two short steps where four sentences stood. On its page beside, the person comes
     * back; in its frame, the window stays open until the money lands, which is the frame's own limit.
     */
    steps: {
      payBeside: (service: string) => `Pay by card on ${service}'s page.`,
      comeBack: "Come back here: your gift starts by itself.",
      pay: "Pay by card.",
      keepOpen: "Keep the window open until the money lands: your gift starts by itself.",
    },
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
    thenChanged: "When it lands, you confirm one step that turns it into what the gift holds.",
    thenChangedRest: "A little stays behind for it.",
    /** The same for a dollar coin, changed by the screen itself: nothing to confirm, nothing stays behind (the founder, 1 Oct 2026). */
    codeLabel: (name: string) => `The code to give ${name}`,
    copy: "Copy the code",
    copied: "Copied",
    copyRefused: "Your browser would not let us copy it. Press and hold the code, then choose Copy.",
    startsEnds: (start: string, end: string) => `Before you pay, check what you pasted starts with ${start} and ends with ${end}.`,
    leave: "You can leave this page: the gift is kept, and Viky picks it up when you come back.",
    stay: "Keep this page open: this device would not keep the gift.",
    openAgain: (name: string) => `Open ${name} again`,
    /** The same two, for a card paid inside Viky (the founder, 1 Oct 2026): no page to name, the card payment itself. */
    openCard: "Pay by card",
    openCardAgain: "Open the card payment again",
    /** The first time, when the page was not opened by the pay press (D296): the code is on this screen first. */
    openFirst: (name: string) => `Open ${name}`,
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
    /** What is still to pay, written as every button of this screen writes an amount: "€5.00" (the founder, 4 Oct 2026). */
    short: (arrived: string, amount: string, more: string, held: string) =>
      `${arrived} arrived, less than the ${amount} for this gift. Pay ${more} more, or make the gift ${held}.`,
    payMore: (more: string) => `Pay ${more} more`,
    makeIt: (held: string) => `Make it ${held}`,
    priceMoved: "The price changed and nothing was changed. Viky will try again in a moment.",
    /**
     * Under the ring, when a call did not answer once the payment is in the account (the founder, 5 Oct 2026;
     * src/after-paying.ts). What is known and nothing else: the check did not answer, the payment is not lost, and the
     * wait goes on. It stands where the sentence of a request that did nothing could come out
     * (src/generic-failure.ts), which after a payment may be false.
     */
    notAnswered: "The check did not answer. Your payment is not lost, and the wait goes on.",
  },

  closed: {
    title: "Your session closed while you were paying",
    kept: (amount: string, recipient: string) => `Nothing is lost. Your ${amount} gift${forThem(recipient)} is kept on this device, and whatever you paid stays in your account.`,
    keptWhileOpen: (amount: string, recipient: string) =>
      `Nothing is lost. Your ${amount} gift${forThem(recipient)} is kept while this page stays open, and whatever you paid stays in your account.`,
    signInAgain: "Sign in again and Viky picks up where it stopped: your payment becomes the gift as soon as it is here.",
  },

  waitingGift: {
    title: "A gift is waiting for your payment",
    which: (amount: string, recipient: string) => `${amount}${forThem(recipient)}, set up on this device and not made yet.`,
    whichUnnamed: (amount: string) => `${amount}, set up on this device and not made yet.`,
    signIn: "Sign in to pick it up",
    staysInAccount: "Whatever you paid stays in your account.",
  },

  made: {
    title: (amount: string, recipient: string) => `${amount} is in ${their(recipient)} name.`,
    /**
     * The day's share and the days are two figures side by side, each with a label (the founder's rule 5 of 1 Oct
     * 2026); the whole amount is the title's. One sentence said the three, and when the first day counts.
     */
    about: "about ",
    aDay: "A day",
    days: (count: number) => (count === 1 ? "Day" : "Days"),
    firstDay: (source: string, sameDay = false) => `First day counted the day ${sameDay ? "" : "after "}they connect ${source}.`,
    reference: (when: string, giftId: string) => `Made ${when}. Reference: gift ${giftId}.`,
    linkTitle: "The link",
    copy: "Copy the link",
    copied: "Copied",
    share: "Share",
    copyRefused: "Your browser would not let us copy it. Press and hold the link above, then choose Copy.",
    onlyThem: (recipient: string) => `Whoever opens this link takes the gift, so send it only to ${onlyTo(recipient)}.`,
    nextTitle: "What happens next",
    /**
     * Because the link is lost the moment this tab closes, and only the gift's page can make another (gift 1000001).
     * A line of the fold, after the pay sheet's own lines about a missed day and a link nobody opens (the founder,
     * 4 Oct 2026: a fold holds lines, never paragraphs).
     */
    lostLink: ["A lost link", "this gift's page makes a new one"] as readonly [string, string],
    seeIt: "See this gift",
  },

  failures: {
    other: "That did not go through, and nothing was taken. Try again.",
    /** A gift that could not be made once the money is in the account: true of somebody whose card was charged. */
    notMade: "The gift was not made. Your money is in your account.",
    signInFirst: "Sign in first.",
    tryAgain: "Try again",
  },
} as const;

/** "1 day", "2 days". */
const days = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

/**
 * A gift's page, flows R1 to R12, read by the person it is for or by the funder (R11). What depends on the source is in
 * the register (`recipient` words); the names are the ones given when the gift was offered, and a gift made before
 * them keeps the sentence it had.
 */
export const GIFT_PAGE = {
  aboutViky: "About Viky",
  backToGifts: "Back to my gifts",
  loading: "One moment",
  /** A connected condition (D188): the gesture running, the door shut, and a gesture that did not go through. */
  working: "One moment",
  connectNotOpen: "Connecting is not open yet. Nothing was changed.",
  connectFailed: "That did not go through, and nothing was changed. Try again.",
  /**
   * Why a source sent the person back with no connection (the audit of 8 Oct 2026), by the reason the return carries
   * (src/connect-return.ts). Before, each of these read "That did not go through", which told nobody what to do.
   */
  connectRefusedThere: (source: string) => `${source} did not accept the connection. Nothing was changed.`,
  connectWithoutActivities: (source: string) => `${source} was not allowed to read your activities. Connect again and allow it.`,
  connectOtherAccount: "You are signed in to Viky under another account than this gift's. Nothing was changed.",
  connectTookTooLong: "That took too long, so nothing was changed. Connect again.",
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
  /**
   * "What was agreed" and "How this is checked", as lines (the founder, 4 Oct 2026): a fold holds a label and its
   * value, four at most, never a paragraph. What left with the sentences: that a missed day can be caught up the next
   * day (the row of days says it of the day it is true of), that nobody else profits from one (the landing says it),
   * and the date a gift was made.
   */
  lines: {
    days: "Days",
    /** On the third daily contract the first day is the day of the connection; before it, the day after. */
    fromConnecting: (count: number, sameDay = false) => `${days(count)}, from the day ${sameDay ? "" : "after "}it is connected`,
    missedDay: "A missed day",
    backTo: (who: string | null) => `back to ${who ?? "them"}`,
    backToYou: "back to you",
    canEnd: (name: string | null) => `${name ?? "The person it is for"} can end it`,
    theRest: "the rest comes back to you",
    yoursAlready: "Yours already",
    fromHome: "use it from Home",
    made: "Made",
    madeOn: (date: string, giftId: string) => `${date}, gift ${giftId}`,
    /** Its value is the condition's own word for when it is read (src/conditions.ts, `reads`). */
    read: "Read",
    nothingToInstall: "Nothing to install",
    fromProfile: "read from your public profile",
    olderDays: "Days settled before the record",
    fromTotals: "drawn from the totals",
  },
  openBy: (date: string, funder: string | null) => `Open it by ${date}: after 14 days unopened, it goes back to ${funder ?? "the person who offered it"}.`,

  createToOpen: "Create your account to open it. Nothing to install.",
  /** An opened gift, read by somebody with no account: it may be theirs, and it may not, so it says "if". */
  signInToSee: "Sign in if this gift is yours.",
  openMyGift: "Open my gift",
  opening: "Opening",
  missingKey: "This link is missing its key. Ask for the link again.",
  /** Said when the page cannot sign the opening here. The key after the link's `#` is never sent in its place. */
  cannotOpenHere: "This page is out of date. Load it again to open your gift. Nothing was changed.",
  readingWhose: (funder: string | null, recipient: string | null) =>
    `It is between ${funder ?? "the person who offered it"} and ${recipient ?? "the person it is for"}.`,

  continue: "Continue",
  checking: "Checking the name",
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
   * A gift of the second version of the contracts (the audit of 1 Oct 2026): its link is found again, not replaced. The
   * key that opens the gift is in what was signed, so the link sent before is this one, and it still works.
   */
  linkFindWhy: "Lost the link, or sent it from another device? Find it again here. It is the same link: the one you sent still works.",
  linkFind: "Find the link again",
  linkFound: "Here is the link. It is the one you had: it still opens this gift.",
  linkFindFailed: "The link could not be found just now. Nothing was changed: the link you sent still works.",

  /**
   * Taking a gift back before anybody opened it. The contract has always allowed it and no screen offered it, so a
   * funder who never sent the link waited fourteen days (gift 1000001, 19 Sep 2026). Irreversible, so the amount is
   * said before and after, with the date after, and the link's death is said in the same breath.
   */
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
  copyRefused: "Your browser would not let us copy it. Press and hold the code, then choose Copy.",
  expired: "This code has expired.",
  /**
   * The first and the last of the three steps of the code (the founder, 4 Oct 2026); the second is the source's own,
   * where the code goes there (`codeStep`).
   */
  steps: { copy: "Copy the code.", back: "Come back here and press:" },
  newCode: "Get a new code",
  /** What the press does: it reads the profile, to find the code there. It said "I added it" until 4 Oct 2026. */
  iAddedIt: "Check my profile",
  reading: "Reading your profile",
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

  notNow: "Not now",

  finished: (range: string) => `This gift is finished. ${range}.`,
  cameBack: (count: number, amount: string) => `${days(count)} came back to you: ${amount}.`,

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
    /**
     * Under the figure, to the person it is for, while the gift still holds some of what they earned (D208): the
     * figure says how much, so this says only where it goes. True because the way out on Home takes it first.
     */
    takeFromHome: "It is yours already. Use it from Home whenever you like.",
    label: { yours: "Yours so far", theirs: "Theirs so far" },
  },
  /** A rating climbing towards its target: how far is left, and where they stand today. */
  climbing: {
    toGo: (left: number) => `${left} to go.`,
    reachedAlready: "Reached. The next reading settles it.",
    notReadYet: { yours: "Your first reading starts the climb.", theirs: "Their first reading starts the climb." },
    /** Under today's reading, as the mockup of 19 Sep 2026 has it ("1429 today"). */
    label: { yours: "Today", theirs: "Today" },
    /**
     * The one live line under today's figure (the founder, 29 Sep 2026): the page reads the source every minute while it
     * is in front, and says where that stands, the seconds counting up, and a failure in the same place.
     */
    checking: (source: string) => `Checking ${source}…`,
    checkedJustNow: "Checked just now",
    checkedSecondsAgo: (seconds: number) => `Checked ${seconds} s ago`,
    checkedMinutesAgo: (minutes: number) => `Checked ${minutes} min ago`,
    checkFailed: "Could not check just now. Trying again in a minute.",
    tooManyChecks: "Checked too often for now. Trying again in a minute.",
    /** Outside the card, in the ground's voice: being told when the target is reached, and how when the phone refused. */
    /** "When", not "the moment": the message leaves when Viky sees the target reached, which can be hours after the game. */
    alert: { yours: (target: string) => `Get a message when you reach ${target}.`, theirs: (target: string) => `Get a message when they reach ${target}.` },
    alertOn: { yours: (target: string) => `Viky will tell you when you reach ${target}.`, theirs: (target: string) => `Viky will tell you when they reach ${target}.` },
    /**
     * A gift had or not (the founder, 1 Oct 2026): nothing is reached by degrees, so the two things to be told are the
     * day it is theirs and the day its time runs out. True of the code: every path that reaches one tells its
     * subscribers (`tellReached`), and the settling pass tells them when it expires (src/milestone-pass.ts).
     */
    alertHadOrNot: { yours: "Get a message when it is yours, or when the time is up.", theirs: "Get a message when it is theirs, or when the time is up." },
    alertHadOrNotOn: { yours: "Viky will tell you when it is yours, or when the time is up.", theirs: "Viky will tell you when it is theirs, or when the time is up." },
    turnOn: "Turn on",
    turnOff: "Turn off",
    alertRefused: "Your phone is not letting Viky tell you. Turn notifications on for Viky in your phone's settings.",
    /** Beside a first proof held for review (the founder, 29 Sep 2026): the answer is what the person is waiting for. */
    reviewAlert: "Get a message when it is checked.",
    reviewAlertOn: "Viky will tell you when it is checked.",
    alertInstall: "Add Viky to your Home Screen first, then open this page from there.",
  },
  /** Something granted once, waiting for the proof that it was. */
  awaitingProof: {
    yours: "Share the page that proves it, and the gift is yours.",
    theirs: (recipient: string | null) => `${recipient ? `${recipient} has` : "They have"} not shared the proof yet.`,
    /** A proof the person shows from their own account (D162): the gesture is "show", never "share a page". */
    shownYours: (source: string) => `Show it from your own ${yourOwn(source)} account, and it is yours.`,
    shownTheirs: (recipient: string | null) => `${recipient ? `${recipient} has` : "They have"} not shown it yet.`,
    /**
     * Where a proof stands once there is one, or once the last day has passed (the audit of 1 Oct 2026: the title stayed
     * "Show it" and the funder read "has not shown it yet" over a proof held, refused, waited for or late).
     */
    checkingYours: "Shown. Viky is checking it.",
    checkingTheirs: (recipient: string | null) => `${recipient ?? "They"} showed it. Viky is checking it.`,
    refused: "It was checked and did not show what the gift asks.",
    /**
     * A proof held for review that nobody reviewed before the contract stopped taking it (the audit of 8 Oct 2026).
     * True of the pass (src/milestone-pass.ts): the review is closed with this reason and the gift goes back to the
     * person who paid. It says whose failure it is, and nothing of what the page showed, which nobody read.
     */
    unreadYours: "Viky did not check your proof in time.",
    unreadTheirs: (recipient: string | null) => `Viky did not check ${recipient ? `${recipient}'s` : "their"} proof in time.`,
    buildingYours: "Your university's page is being set up. Then you show it here.",
    buildingTheirs: (recipient: string | null) => `${recipient ? `${recipient}'s` : "Their"} university page is being set up.`,
    /**
     * Past the last day. True of the contract: what a source dates itself (a certificate granted, a test taken, a race
     * run) may be proved for fourteen days more if its date is in time, and then the gift goes back. The state is the
     * headline and what follows from it is the line under it (1 Oct 2026): they were one headline of two sentences.
     */
    late: "The last day has passed.",
    lateNextYours: (until: string) => `What you had by then can still be proved until ${until}.`,
    lateNextTheirs: (until: string) => `If nothing from before it is proved by ${until}, it comes back to you.`,
    lateNextReading: (until: string) => `What was had by then can still be proved until ${until}.`,
    /**
     * Past the last day, for something shown: the day it is shown is the day that counts, so nothing shown now can
     * pay. The contract still waits the same fourteen days before the gift goes back.
     */
    ended: "The last day passed without it.",
    endedNextYours: (funder: string | null, after: string) => `It goes back to ${funder ?? "the person who offered it"} after ${after}.`,
    endedNextTheirs: (after: string) => `It comes back to you after ${after}.`,
    label: { yours: "In your name", theirs: "In their name" },
  },
  /** The first reading stood above what a climb may start from, so nothing can be earned: the reason, and the money. */
  startTooHigh: {
    yours: (reading: number) => `You were already at ${reading} when it started, so there is nothing to climb.`,
    theirs: (recipient: string | null, reading: number) =>
      `${recipient ? `${recipient} was` : "They were"} already at ${reading} when it started, so there is nothing to climb.`,
    label: (funder: string | null) => `Goes back to ${funder ?? "them"}`,
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
    label: { yours: (funder: string | null) => `Back to ${funder ?? "them"}`, theirs: "Back to you" },
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
  cameBackTo: (funder: string | null) => (funder ? `Back to ${funder}` : "Gone back"),
  cameBackToYou: "Back to you",
  /**
   * Where the row of days stands, under it, in the meta voice (the mockup of 19 Sep 2026). The row keeps one size
   * whatever the count and scrolls rather than shrinking, so this line says which day is in view. That there is more
   * of it is said by the row's own fade and by nothing else since 1 Oct 2026: a label is four words at most (rule 5).
   */
  dayOfDays: (day: number, total: number) => `Day ${day} of ${total}`,
  /** The next reading as a figure beside the money, where nothing has gone back yet: the hour, and what it is. */
  nextReading: "Next reading",
  /**
   * A gift read as the day goes (the founder's mockup of 3 Oct 2026, the day on the third daily contract). There is
   * no next reading to announce: the page looked as it opened. What stands in its place is how long is left, at the
   * reader's own clock, and once today is counted, what today added. What is waited for and what was seen are the
   * register's words (src/conditions.ts, `asItGoes`), since they name what the person does.
   */
  asItGoes: {
    counted: "Today counted.",
    /** `day` begins the sentence: "Yesterday", or a date when the open day is older. */
    catchUp: (day: string) => `${day} can still be caught up.`,
    leftToday: "Left today",
    leftFor: (day: string) => `Left for ${day}`,
    today: "Today",
    plus: (amount: string) => `+ ${amount}`,
    /** The same as a sentence, once what has gone back takes the right column. */
    leftTodayLine: (left: string) => `${left} left today.`,
    leftForLine: (left: string, day: string) => `${left} left for ${day}.`,
    yesterday: "yesterday",
    thisDay: "today",
    /** The wheel beside the state has no word on the screen: this is its name, for a reader that speaks the page. */
    looking: "Looking for today's lesson",
    /** A look or a reading that failed on our side: the day stays open, and until when it can still be counted. */
    notReadNow: (source: string) => `${source} could not be read just now.`,
    stillOpenUntil: (until: string) => `The day stays open: it can still be counted until ${until}.`,
    /** Past the last day, every day settled, in the hours before the gift is closed. */
    over: "Its days are over.",
  },
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
  /** The target as a number, or in words where the contract's number is not what is read (a grade, "14.50 out of 20"). */
  /** "by 17 Oct 2026" once the first reading has started the clock; "within 30 days of connecting" before (D46). */
  byDate: (date: string) => `by ${date}`,
  withinDays: (days: number) => `within ${days} ${days === 1 ? "day" : "days"} of connecting`,
  /** Something had or not: what it asks in the register's words, and never the contract's 1. */
  /** Dated as the contract dates it: what was granted in time can be shown for two weeks more, then it goes back. */
  /**
   * "What was agreed" of a milestone, as lines (the founder, 4 Oct 2026): what is to be reached or what the gift is
   * for, when, and where the money goes if not.
   */
  lines: {
    toReach: "To reach",
    onSource: (target: number | string, source: string) => `${target} on ${source}`,
    isFor: "For",
    when: "When",
    ifNot: "If not",
    twoWeeksLater: (back: string) => `${back}, two weeks later`,
    startedAt: "Started at",
  },
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
    /** Any rating above today's counts; the proposal is a real climb, and says what it is (the founder, 28 Sep 2026). */
    smallest: (suggested: number) => `Any rating above it counts. ${suggested} is about five wins from there.`,
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
  },
  made: {
    terms: (amount: string, goal: string, days: number, source: string) => `${amount} when they reach ${goal}, within ${days} ${days === 1 ? "day" : "days"} of connecting ${source}.`,
    allOrNothing: "All of it, at once, or all of it back to you.",
    /**
     * What the recipient is asked for depends on who named the account (D27, D104 bis): one the funder named binds on its
     * first reading and asks nothing of the profile, and only an account they name themselves carries a code. This
     * screen promised a code either way until 19 Sep 2026, which was false for every gift made with a name.
     */
  },
  failures: {
    standingMoved: "Choose the rating again",
  },
  // A line listed while it is being built (D311): the same two words the public catalogue prints of it.
  building: "Being built",
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
  getCode: "Get my code",
  proveTitle: (username: string) => `Prove ${username} is yours`,
  added: "Check my profile",
  removeAfter: "You can take the code out right after. It works for an hour.",
  newCode: "Get a new code",
  /**
   * A first reading above the most the funder said it may start from (the audit, 29 Sep 2026): nothing was recorded,
   * the gift has not started, and it can still start lower. Two lines under the state, each short (1 Oct 2026); the
   * day it goes back unstarted is the dated line under them, which this sentence used to say a second time.
   */
  startAboveCapMine: (reading: number, cap: number) => [
    `You are at ${reading}, above the ${cap} this gift may start from.`,
    `Nothing was recorded and it has not started. It starts with a reading at ${cap} or below.`,
  ],
  startAboveCapTheirs: (reading: number, cap: number, recipient: string | null) => [
    `${recipient ? `${recipient} is` : "They are"} at ${reading}, above the ${cap} you set as the most it may start from.`,
    "Nothing was recorded and it has not started.",
  ],
  startTooHighMine: (start: number, target: number, funder: string | null) =>
    `You had already reached ${target} when you connected: you were at ${start}, so this gift cannot count it. Ask ${funder ?? "the person who sent it"} for a new one. It goes back to them at the end.`,
  startTooHighTheirs: (start: number, target: number, recipient: string | null) =>
    `${recipient ?? "They"} had already reached ${target} when they connected, at ${start}, so this gift cannot count it. It comes back to you at the end.`,
  opened: "It is yours to earn.",
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
/**
 * The recipient's agreement to what Viky reads for a gift, and the stop (the founder, 29 Sep 2026). What is read is
 * the register's (src/consent-terms.ts); these are the words around it. The yes is signed at the gesture that asks for
 * a reading, so it has no screen of its own; the stop is as easy, one line and a sheet.
 */
export const CONSENT = {
  failed: "Viky reads nothing until you agree, and your agreement could not be signed. Try again.",
  stopFailed: "Your stop could not be signed. Nothing changed. Try again.",
  /** "How this is checked", as lines (the founder, 4 Oct 2026): what is read, and who agreed to it and when. */
  lines: {
    reads: (what: string) => `Viky reads ${what}`,
    youAgreed: (date: string) => `you agreed on ${date}`,
    theyAgreed: (name: string, date: string) => `${name} agreed on ${date}`,
    theyStopped: (name: string, date: string) => `${name} stopped it on ${date}`,
    notYet: (name: string) => `${name} has not said yes yet`,
    theyCanStop: "They can stop",
    notReadComesBack: "what is not read comes back to you",
    nothingRead: "Nothing is read",
    untilTheyAgree: (name: string) => `until ${name} agrees`,
  },
  stoppedLine: (what: string, date: string) => `Viky stopped reading ${what} on ${date}.`,
  /** A gift that began before agreements existed: read as before until its person answers (the founder, 29 Sep 2026). */
  askLine: (what: string) => `Viky reads ${what} for this gift. Do you agree?`,
  nothingRead: "Viky reads nothing for this gift until you agree.",
  stop: "Stop",
  agree: "Agree",
  sheetTitle: (what: string) => `Stop Viky reading ${what}?`,
  /** The sheet's three sentences, the middle one said louder (the mockup): what stopping costs. */
  sheetNow: "Viky stops now, on all your devices.",
  sheetMilestone: (target: string | null, by: string, amount: string, funder: string) => `If ${target ?? "it"} is not read ${by}, the ${amount} goes back to ${funder}.`,
  sheetDaily: (funder: string) => `Each day that is not read goes back to ${funder}.`,
  sheetAgainBefore: "You can agree again before then.",
  sheetAgainAnyTime: "You can agree again at any time.",
  stopReading: "Stop reading",
  keepGoing: "Keep going",
  working: "One moment",
  someone: "The person it is for",
  theFunder: "the person who offered it",
  meTitle: "What Viky reads",
  meLine: (what: string, whose: string) => `${what}, for ${whose}`,
  meGift: (funder: string | null) => (funder ? `${funder}'s gift` : "a gift"),
  meNothing: "Nothing, today.",
  meStopped: (date: string) => `Stopped on ${date}.`,
} as const;

/**
 * The person a gift is for ends it (the audit of 1 Oct 2026, section 3.6, in the founder's words). Only a gift of the
 * second version of the contracts can be ended, and there the rest goes back in the ending's own transaction, so the
 * sentences say "goes back" and never "as the days pass".
 *
 * The words of an ending: ended, keep, goes back, came back, given back. Never gave up, quit, failed or lost.
 */
export const END_GIFT = {
  working: "One moment",
  failed: "The gift could not be ended. Nothing was changed. Try again.",
  /** The funder's side, in the fold "What was agreed", before as after. */
  /**
   * The gift's page once it is ended (the founder's mockup you-decide.html of 1 Oct 2026, fourth frame): the day as a
   * label, who ended it as the headline, and the two amounts as two figures. Three sentences said this before.
   */
  endedOn: (date: string) => `Ended ${date}`,
  endedYours: "You ended this gift.",
  endedTheirs: (name: string | null) => `${name ?? "They"} ended this gift.`,
  endedReading: "This gift was ended.",
  label: { yours: "Yours", theirs: "Theirs" },
  /** The card of Home and of Gifts, in a line. */
  card: { yours: "You ended this gift.", theirs: "They ended this gift." },
} as const;

/**
 * The step in progress, named under a button once its wait has passed ten seconds (the founder, 3 Oct 2026;
 * app/kit/Waiting.tsx). Each says what this page is waiting on at that moment and nothing it cannot know: a request it
 * sent, or the person's own passkey, never a guess at where a server is inside a request.
 */
export const WAITS = {
  passkey: "Waiting for your face or your fingerprint.",
  opening: "Writing down that you opened it. It can take a few more seconds.",
  agreeing: "Writing down your yes.",
  firstReading: (source: string) => `Asking ${source} for your profile, and certifying its answer.`,
  recordingStart: "Writing down the first reading.",
  counting: (source: string) => `Asking ${source}, certifying its answer, then writing it down.`,
  naming: (source: string) => `Asking ${source} for that name.`,
  takingBack: "Bringing it back into your account.",
  newLink: "Making the new link.",
  choice: "Writing down your choice.",
  ending: "Ending the gift, and sending each of you your part.",
  signingOut: "Closing your session.",
  account: "Waiting for your face or your fingerprint, then opening your session.",
  code: "Checking the code, then sending its credit to your account.",
  price: (who: string) => `Asking ${who} for its price.`,
  operator: "Asking which operator this number is with.",
  amount: "Asking what your money gives right now.",
  changing: "Changing your money. It can take a few more seconds.",
  proof: "Reading the result and certifying it. This can take a minute.",
  registration: "Asking the WCA for the competitors list.",
  connecting: (source: string) => `Asking ${source} for your activity.`,
  erasing: "Erasing the connection.",
} as const;

/** The name of a fold that holds what a block says beyond its first sentence (app/kit/Said.tsx, the founder's rule 4). */
export const KIT = {
  how: "How it works",
} as const;

/**
 * "You decide" (the founder, 1 Oct 2026, the mockup you-decide.html): the standing controls of the person a gift is
 * for, under the card. Three round buttons with two words each, and the sheets they open. A round button never
 * carries a sentence; what there is to say is said in its sheet, after the press.
 */
export const YOU_DECIDE = {
  title: "You decide",
  /** "Notifications" since 3 Oct 2026 (the founder, on gift 4): it read "Messages", which is what a chat is called. */
  notifications: "Notifications",
  on: "On",
  off: "Off",
  sees: (funder: string | null) => (funder ? `${funder} sees` : "They see"),
  things: { 1: "One thing", 2: "Two things" },
  stop: "Stop",
  anytime: "Anytime",
  onABreak: "On a break",
  /** The sheet "Stop" opens: two choices of the same weight, the one that can be undone first. */
  yourCall: "Your gift, your call.",
  takeABreak: "Take a break",
  breakHelp: {
    daily: "Viky stops reading. Start again when you like.",
    milestone: "Viky stops reading. Start again before the last day.",
    connected: "Viky stops reading and erases the connection.",
  },
  startAgain: "Start again",
  endTheGift: "End the gift",
  chipYours: (amount: string) => `${amount} yours`,
  chipBack: (amount: string, funder: string | null) => `${amount} back to ${funder ?? "them"}`,
  keepGoing: "Keep going",
  /** The break, confirmed: what it costs is the founder's three sentences of 29 Sep 2026, the middle one said louder. */
  breakTitle: "Take a break?",
  /** The ending, confirmed: two figures and a label where a sentence stood. */
  endTitle: "End the gift?",
  yours: "Yours",
  backTo: (funder: string | null) => `Back to ${funder ?? "them"}`,
  cannotBeUndone: "This can't be undone",
  notNow: "Not now",
  /** What the person who offered the gift sees: their page, small, and the agreement's own words for it. */
  seesTitle: (funder: string | null, things: 1 | 2) => `${funder ?? "The person who offered it"} sees ${things === 1 ? "one thing" : "two things"}.`,
  theirPage: (funder: string | null) => (funder ? `${funder}'s page` : "Their page"),
  seesLine: (funder: string | null, sees: string) => `${funder ?? "The person who offered it"} sees: ${sees}.`,
  gotIt: "Got it",
  /** The funder's own round button, while nobody has opened the gift (app/kit/FunderControls.tsx). */
  takeBack: "Take back",
  unopened: "Unopened",
} as const;

/**
 * The moment a gift is reached (the founder, 29 Sep 2026), over whatever screen the person arrives on, once for the
 * person it is for and once for the funder. The first says what is now theirs and gives the one action, taking it; the
 * second says they did it, and what that means for the money.
 */
export const REACHED_MOMENT = {
  fromFunder: (funder: string | null) => (funder?.trim() ? `A gift from ${funder}` : "A gift for you"),
  giftOf: (recipient: string | null) => (recipient?.trim() ? `${their(recipient)} gift` : "Your gift"),
  youDidIt: "You did it.",
  theyDidIt: "They did it.",
  reached: (what: string, when: string) => `${what}: reached on ${when}.`,
  theyReached: (recipient: string | null, when: string) => `${recipient?.trim() ? recipient : "They"} reached it on ${when}.`,
  theirsNow: "What you put in their name is theirs now, and none of it comes back.",
  inYourName: "In your name",
  yours: "Yours",
  inTheirName: "In their name",
  theirs: "Theirs",
  seeTheGift: "See the gift",
  close: "Close",
  seeItAgain: "See it again",
} as const;

/**
 * An amount led by the reader's currency (src/display-currency.ts, `ledAmount`): "about" before the converted figure.
 * The line of exact dollars under it is gone from every screen (the founder, 4 Oct 2026): the person does not need
 * the dollars.
 */
export const LED_AMOUNT = {
  about: "about",
} as const;

export const LINK_PREVIEW = {
  named: (funder: string, amount: string) => `${funder} put ${amount} in your name`,
  someone: (amount: string) => `Someone put ${amount} in your name`,
  /** The words a funder who gave no name shares the link with: the amount, in their own currency. */
  unnamedShare: (amount: string) => `This is for you: ${amount} in your name`,
  /** A converted amount in the title: the gift is held in dollars, so the funder's currency is never exact. */
  about: (figure: string) => `about ${figure}`,
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
/** An amount that opens a sentence: "About €3.05 is yours." where it is a conversion, the dollars as they are. */
const opening = (amount: string) => amount.charAt(0).toUpperCase() + amount.slice(1);

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
    earned: (amount: string) => `Yesterday counted. ${opening(amount)} is yours.`,
    /** A day counted the day it was done (the third daily contract): told within the quarter of an hour. */
    earnedToday: (amount: string) => `Today counted. ${opening(amount)} is yours.`,
    returnedTo: (funder: string) => `Yesterday went back to ${funder}. Today still counts.`,
    returned: "Yesterday went back. Today still counts.",
    reached: (amount: string) => `You reached it. ${opening(amount)} is yours.`,
    expiredTo: (amount: string, funder: string) => `The time is up. ${opening(amount)} went back to ${funder}.`,
    expired: (amount: string) => `The time is up. ${opening(amount)} went back.`,
    /** A first proof's review, decided (the founder, 29 Sep 2026): the answer the person was waiting for. */
    reviewRefused: "Your page was checked: it does not show what this gift is for. Open the gift to see why.",
    reviewNotYet: "Your page was checked and it works. The result is not there yet: show it again once it is.",
    /** A proof nobody reviewed before the contract stopped taking it (the audit of 8 Oct 2026): sent as the gift goes back. */
    reviewUnreadTo: (amount: string, funder: string) => `Viky did not check your proof in time. ${opening(amount)} went back to ${funder}.`,
    reviewUnread: (amount: string) => `Viky did not check your proof in time. ${opening(amount)} went back.`,
  },
  funder: {
    /** "Léa did yesterday's lesson.": the second half is the register's, so no sentence here names a source. */
    didIt: (name: string, yesterday: string, amount: string) => `${name} did ${yesterday}. ${opening(amount)} is theirs.`,
    countedNamed: (name: string, amount: string) => `${name} counted yesterday. ${opening(amount)} is theirs.`,
    counted: (amount: string) => `Yesterday counted. ${opening(amount)} is theirs.`,
    countedTodayNamed: (name: string, amount: string) => `${name} counted today. ${opening(amount)} is theirs.`,
    countedToday: (amount: string) => `Today counted. ${opening(amount)} is theirs.`,
    returned: (amount: string) => `Yesterday came back to you: ${amount}.`,
    reachedNamed: (name: string, amount: string) => `${name} reached it. ${opening(amount)} is theirs.`,
    reached: (amount: string) => `It is reached. ${opening(amount)} is theirs.`,
    expired: (amount: string) => `The time is up. ${opening(amount)} came back to you.`,
    reviewRefusedNamed: (name: string) => `${name}'s page was checked: it does not show what the gift is for.`,
    reviewRefused: "The page shown was checked: it does not show what the gift is for.",
    reviewNotYetNamed: (name: string) => `${name}'s page was checked and it works. The result is not there yet.`,
    reviewNotYet: "The page shown was checked and it works. The result is not there yet.",
    reviewUnreadNamed: (name: string, amount: string) => `Viky did not check ${name}'s proof in time. ${opening(amount)} came back to you.`,
    reviewUnread: (amount: string) => `Viky did not check their proof in time. ${opening(amount)} came back to you.`,
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
export const CONDITION_NATURE = { read: "READ FOR YOU", shown: "SHOWN BY THEM", connected: "CONNECTED BY THEM" } as const;

/**
 * A proof the person shows from their own account (D162): one button, and what happens around it. The source's
 * name comes from the register, never from here.
 */

/**
 * "Which university?" asked as a list (D247), and as the founder set it on 26 Sep 2026 (D264): the names alone, grouped
 * by country, no sentence about checking in the chooser, and under the list one invitation to the page where a student
 * adds their own. How a university is checked is said on the gift's page, folded, where the proof is shown.
 */
/**
 * The scale a grade is typed on (the founder, 28 Sep 2026): the university's own once its first results page has been
 * reviewed, or, before, the one the funder chooses. True of the code: a scale the page does not confirm refuses the gift
 * at the review, nothing is paid, and the contract returns the amount at the deadline.
 */
export const GRADE_SCALE = {
  question: "How does their university grade?",
  choices: { "20": "Out of 20", "4": "Out of 4", "100": "Out of 100", letters: "In letters" } as Record<string, string>,
  /** One line, under the question: their first results page confirms the scale, and a wrong one pays nothing. */
  help: "Their university must grade this way, or it cannot pay.",
  fixed: (words: string) => `Their university grades ${words}.`,
  letter: "The grade they reach",
  letterHelp: "That letter or a better one.",
} as const;

export const UNIVERSITY_CHOICE = {
  /** The one field (the founder, 29 Sep 2026): the whole list is searched, every country at once. */
  search: "Search universities",
  /** The chip that narrows the list to one country: what it is called when read aloud, and its sheet's title. */
  country: "Which country",
  /** What the chip says: every country, the default (the founder, 30 Sep 2026), or the one chosen. */
  everywhere: "All countries",
  inCountry: (country: string) => `In ${country}`,
  /** Read aloud while the list is read; the eye sees empty lines instead of a sentence (the founder, 29 Sep 2026). */
  reading: "Reading the list",
  unreadable: "The list could not be read right now. Close this and try again in a moment.",
  nothing: "No university by that name in the list yet.",
  /**
   * The two groups of the list (the UI pass of 8 Oct 2026): where a student can show today, then every other, whose
   * heading says how many they are and how fast one is added. The line that said it under the heading is gone: the
   * heading says it, and the gift's page says it again when it matters. `count` is src/university-choice.ts's.
   */
  ready: "Ready today",
  more: (count: string) => `${count} more, added on request within two days`,
  /** The same heading where no university of the list shown is ready: there is nothing to be "more" than. */
  moreAlone: (count: string) => `${count} ${count === "1" ? "university" : "universities"}, added on request within two days`,
  /** Beside the university chosen, which folds the list away so what comes after it is in reach. */
  change: "Change",
  /** The one line under the list: a question, and the link that answers it. */
  notListed: "Yours isn't here?",
  addYours: "Add your university",
} as const;

export const SHOW_PROOF = {
  title: (source: string) => `Show it from your ${yourOwn(source)} account`,
  whatHappens: (source: string) =>
    `A verification page opens. You sign in to ${spokenTo(source)} there, and what that page shows is proved without Viky ever seeing your password.`,
  /**
   * What is kept of it, said per condition (the founder, 29 Sep 2026: "Viky keeps the score it proves" was false for an
   * enrolment). True of the register (src/condition-privacy.ts): under the verdict rule the number is kept nowhere and
   * only whether the target was reached is attested; otherwise the number read is kept.
   */
  kept: {
    "university-enrollment-shown": "Viky keeps only whether you are enrolled.",
    "university-year-passed-shown": "Viky keeps only whether the year is passed.",
    "university-grade-shown": "Viky keeps only whether your grade reaches the one this gift is for.",
    "toefl-mybest-shown": "Viky keeps only whether your score reaches the one this gift is for.",
  } as Readonly<Record<string, string>>,
  keptVerdict: "Viky keeps only whether it reaches what this gift is for.",
  keptNumber: "Viky keeps what it proves and nothing else.",
  button: "Show it",
  preparing: "Preparing the verification",
  /** The link the person presses themselves, named after where they sign in: it opens the verification page in a new tab. */
  signInTo: (source: string) => `Sign in to ${spokenTo(source)}`,
  /**
   * While the verification page is open in its own tab (the founder, 9 Oct 2026). It said "Waiting for the proof. Come
   * back to this page when you are done there.", and on 8 Oct a student came back to Viky 69 seconds in, which closed
   * the session. The verification page says "Keep this page open." and brings the person back to the gift by itself
   * once the proof is made (`setRedirectUrl`, app/api/proof/session/route.ts): both screens now say the same thing.
   */
  waiting: "Sign in there and stay on that page. It brings you back here.",
  /** While the page asks the server what became of the proof: no link is offered until the answer, since it may be dead. */
  checking: "Checking for your proof",
  stopWaiting: "Stop waiting",
  shown: (score: string) => `Shown: ${score}. It is yours.`,
  /**
   * Under the target (D185): said with the number, to the person who showed it and to nobody else, since the number
   * is kept nowhere; nothing was relayed, and the gift stays theirs to earn until its deadline.
   */
  notThereYet: (score: string) => `Shown: ${score}. It is under what this gift is for, so nothing was recorded and nothing is lost: show it again once it is there.`,
  /**
   * A page that does not carry what the pattern names (D193): said by the refusal's own name, then this. True of the
   * contract: nothing was signed, and the money goes back to the funder at the deadline and not before.
   */
  nothingLost: "Nothing was counted and nothing is lost: this gift stays yours to earn until its deadline, and only then does the money go back.",
  /**
   * A first proof from a university read through a witness with no pin yet (D312): checked on what is sure, held for
   * the operator's review, nothing relayed. True of `pnpm portal:pin`: the operator reads it and settles or refuses.
   */
  held: "First proof from this university: checked within an hour.",
  /**
   * A university chosen for a sense it has no provider for yet (D313): the operator was asked when the gift was made and
   * builds it within two days. Nothing can be shown until then, and nothing is lost: the contract holds the money.
   */
  building: "Your university's page is being set up within two days. Then you show it here.",
  /** The review found the page does not show what the gift is for (D312): nothing relayed, the contract untouched. */
  reviewRefused: "This university's page did not show what this gift is for, so nothing was counted. The money stays where it is.",
  refusals: {
    notConfigured: "Showing a proof is not open yet. Nothing was changed.",
    tooOld: "That proof took too long. Show it again.",
    /**
     * The verification ended on Reclaim's side with no proof (src/shown-verification.ts, `RECLAIM_STOPPED`): said as
     * what happened, with the one thing there is to do. It promises nothing about the month's count, which is Reclaim's.
     */
    stopped: "The verification stopped before it made a proof. Show it again.",
    /** A session answered from another page of the gift, or closed since: what the gift says now is read first. */
    over: "That verification is over. Show it again.",
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
  /** The truth beside "Open", line by line (D184): nothing has passed on it yet, said by the line's own nature. */
  nobodyYet: { read: "Nobody has been read on it yet.", shown: "Nobody has shown one yet.", connected: "Nobody has connected one yet." },
  /** The count of real proofs a line has, for the judges' page: never "tested", never "used by", a number or nothing. */
  realProofs: (count: number | null) => (count === null ? "real proofs not read" : count === 1 ? "1 real proof" : `${count} real proofs`),
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
  /** While the session closes, before the landing is painted (D258). */
  leaving: "Signing out",
  anotherAccount: "Use another account",
  /** What a screen reader calls the row of Me's round controls. Nothing is printed above them (the founder, 2 Oct 2026). */
  controls: "Your account",
  /** The two words of Me's round controls (the founder's rule 6 of 1 Oct 2026): the sentences above are their sheets' and the door's. */
  otherAccount: "Other account",
  installShort: "Install",
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

/**
 * The ceilings on what the relayer pays for (D204). Every sentence here is a refusal, said once, true of the counts in
 * `viky_relay_counts` and of the smallest amount `relayCeilings()` names.
 */
export const RELAY_CEILING = {
  hour: (who: "account" | "connection", minutes: number) =>
    `That is as many actions as Viky sends for one ${who} in an hour. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
  day: (who: "account" | "connection") => `That is as many actions as Viky sends for one ${who} in a day. Try again tomorrow.`,
  /** Everybody's count together: said as what it is, and that nothing of theirs moved. */
  dayAll: "Viky has sent as many actions as it sends in a day, for everybody. Nothing of yours was changed. Try again tomorrow.",
  judgeTries: "That is as many judge codes as Viky takes from one connection in a day. Try again tomorrow.",
  tooSmallToSend: (least: string) => `Viky sends ${least} or more at a time. Below that, send everything you have at once.`,
  tooSmallToTakeOut: (least: string) => `Viky takes out ${least} or more at a time. Below that, take out everything that is yours at once.`,
  topUpTooSoon: "Viky readied this account for a cancel less than a minute ago. Try again in a moment.",
  topUpsForGift: "Viky has already readied this account twice to cancel this gift. Nothing was changed.",
} as const;


/** The help page: five questions, each answered with a sentence the product already keeps true. */
export const HELP = {
  title: "Help",
  intro: "Five questions, answered in the words the screens use.",
  questions: [
    {
      q: "Where is my money?",
      a: "In your account, on Home, under the amount. What a gift earns lands there the moment you take it, and stays yours from one gift to the next. Use it from Home whenever the account holds anything.",
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
      // With its condition (the founder, 5 Oct 2026): the promise holds for a key a store copies, and not for a key
      // one computer holds alone. Google's help for Chrome says of a passkey saved in Windows Hello that
      // "synchronization or backup aren't supported", and of one saved in a Chrome profile that it cannot be recovered
      // "if your computer is lost or the Chrome profile is deleted" (support.google.com/chrome/answer/13168025, read
      // 5 Oct 2026).
      a: "Your account lives in your passkey, not with Viky. If your passkey is kept by Apple, Google or a password manager, sign in on the new phone the same way you did on the old one, and everything is there. A passkey kept only in Windows Hello or in one Chrome profile stays on that computer and does not come back on another device. There is nothing to write down and nothing we could send you.",
    },
    {
      q: "A payout service asks for a code.",
      a: 'It asks where the money is sent from. Your code is on this page, under "Need your code for a payout service?", with a button that copies it.',
    },
  ],
} as const;

/**
 * "Spend or withdraw", once "Use your money" (D270, the founder's decision of 26 Sep 2026; the mockups use.html and use-france.html): the way
 * out said as uses, every sentence Viky's own, and never a word of crypto, which only the partner's own page may say.
 * A partner is named, once, before the person goes to it.
 */
export const USE_MONEY = {
  yours: "Yours",
  /** The line under the title: where the person lives, the account's own fact that orders the uses (D274). */
  forWhereYouLive: (country: string) => `You live in ${country}`,
  forYourNumber: "Where do you live?",
  change: "Change",
  /**
   * "How it works", on each card: four lines, a label and its value (the founder, 4 Oct 2026). What the person gets,
   * in how long, what it costs, what it takes. A line whose value nobody published is not drawn (the time a card
   * payout takes). One sentence stays in the open on the card: `line`.
   */
  how: { get: "You get", time: "Time", cost: "Cost", need: "You need" },
  phone: {
    name: "Your phone",
    nature: "From your balance",
    line: "Credit or mobile data on your number, from your own phone company.",
    get: "credit or data on your number",
    time: "usually a minute",
    cost: "the price shown before you pay",
    need: "your number, no ID",
    action: "Top up my phone",
  },
  bank: {
    name: "Your bank",
    nature: "You would get about",
    need: "your ID, once, and your own account",
    action: "Send to my bank",
  },
  card: {
    name: "Your card",
    nature: "You would get about",
    line: "Onto your Visa or Mastercard.",
    get: "money on your Visa or Mastercard",
    need: "your ID, once, and your own card",
    action: "Send to my card",
  },
  mobile: {
    name: "Your mobile money",
    nature: "From your balance",
    cost: "the rate shown before you send",
    need: "the number and its holder's name",
    action: "Send to my mobile money",
  },
  /**
   * The mobile money card (the founder, 2 Oct 2026): the operators and the time are Switch's own, read for the
   * country while the person looks.
   */
  mobileLine: (operators: string, delay: string) => `To your ${operators} number, within ${delay}.`,
  mobileGet: (operators: string) => `money on your ${operators} number`,
  mobileTime: (delay: string) => `within ${delay}`,
  giftcard: {
    name: "A gift card",
    nature: "A code, sent here",
    line: "Shops, games and more, from Bitrefill.",
    get: "a code for the shop you choose",
    time: "usually within a minute",
    cost: "the price shown before you pay",
    need: "nothing: no sign-up, no ID",
    action: "Choose a card",
  },
  /**
   * How the bank service pays in the person's country, by its own published method (the audit of 1 Oct 2026): a
   * transfer in euros to an IBAN was said to an account in the United States, which it pays in dollars. The time is
   * the one it publishes for a transfer in euros, and is said of no other method.
   */
  bankBy: (method: string, currency: string): Readonly<{ line: string; get: string; time: string | null }> => {
    if (method === "SEPA") return { line: "A transfer in euros to your IBAN, within two working days.", get: "euros on your IBAN", time: "within two working days" };
    if (method === "CARD") return { line: "Onto your card.", get: "money on your card", time: null };
    const named: Readonly<Record<string, string>> = { USD: "dollars", BRL: "reais", MXN: "pesos" };
    return { line: `A transfer in ${named[currency] ?? currency} to your bank account.`, get: `${named[currency] ?? currency} on your bank account`, time: null };
  },
  /** The card service's smallest payout, as it publishes it today, said on its card before anything is changed. */
  cardFrom: (figure: string) => `From ${figure} at a time.`,
  /** Mobile money's smallest payout in the country, in its own money, said on its card before the form is opened. */
  mobileFrom: (figure: string) => `From ${figure} at a time.`,
  /** No bank and no card reaches the person's country: said, rather than left to be found out (the audit of 1 Oct 2026). */
  noWayOutThere: (country: string) => `No way to take money out reaches ${country} yet. It stays yours here.`,
  keepHere: "Or keep it here: it stays yours from one gift to the next.",
  /**
   * The line under the title, built from the cards shown for the country and in their order (the founder, 29 Sep 2026):
   * never a way that is not offered there. The bank and the card are one transfer when both are offered.
   */
  ways: { giftcard: "a gift card", phone: "credit for your phone", mobile: "cash on your mobile money", bank: "a transfer to your bank", card: "a transfer to your card", bankOrCard: "a transfer to your bank or card" },
  nothingHere: "Nothing works for a number there yet. It stays yours here.",
} as const;

/**
 * Where the person lives, a fact of the account (D274, the founder's decision of 27 Sep 2026): asked once in Me, from
 * the countries where at least one way out works, and read by "Spend or withdraw" and the gift cards.
 */
export const WHERE_YOU_LIVE = {
  question: "Where do you live?",
  why: "It decides which ways to use your money Viky offers you, and in which order.",
  keep: "Keep this country",
  label: "Where you live",
  youLive: (country: string) => `You live in ${country}.`,
  change: "Change",
  reading: "Reading the countries",
  choose: "Choose a country",
  search: "Search a country",
  noMatch: "No country by that name.",
  unreadable: "The list of countries could not be read right now. Try again in a moment.",
} as const;

export const CASH_OUT = {
  title: "Spend or withdraw",
  yourMoney: "Your money",
  /** The balance at the head of the way out, and what it is for (out.html, 19 Sep 2026). */
  keepOrTakeOut: "Yours to keep, or to take out",
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
  /** The fold's lines: what a service keeps with the day it was read, and the rate's source with its day. */
  keptAndRead: (fee: string, read: string) => `${fee}, read ${read}`,
  rate: "Rate",
  rateOf: (source: string, day: string) => `${source}, ${day}`,
  /**
   * The balance while a gesture is being confirmed. It is where you are, not what you are deciding, so it is said in
   * the meta voice and the amount being sent takes the display size (the founder, 19 Sep 2026).
   */
  yourMoneyNow: (held: string) => `Your money: ${held}`,
  rateNote: (about: string) => about,
  readyLine: (name: string, amount: string) => `${amount} of it is ready to send to ${name}.`,
  readyLabel: (name: string) => `Ready to send to ${name}`,
  /**
   * What the gifts made out to this account still hold for it (D208). It is counted in the figure above and in every
   * way's figure, and it is taken into the account first, the moment a way is chosen.
   */
  inYourGifts: (amount: string) => `${amount} of it is still in your gifts. It comes out first: you confirm once per gift.`,
  gathering: "Taking what your gifts hold into your account.",
  gatherFailed: "What your gifts hold could not be taken out just now. Nothing was lost: it is still yours, in the gift.",
  /**
   * Dollars a card payment delivered and no gift took (the founder, 3 Oct 2026): they are money in the account like
   * the rest, never a withdrawal under way, and they are turned into what a gift holds the moment a way is chosen.
   */
  readying: "Getting your money ready, a few seconds.",
  notReadied: "Part of your money could not be made ready just now. It is still in your account.",
  worthAbout: (dollars: string) => `about $${dollars}`,
  worthLater: "Its value in dollars will show in a moment.",
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
  asking: "Asking for the amount",
  refusals: {
    shape: "Two decimals at most, like 9.99.",
    tooMuch: (max: string) => `That is more than your $${max}.`,
    sendAllOfIt: "Send all of it",
  },

  /**
   * The review of step 1, in figures side by side since 2 Oct 2026 (the founder's rule 5: money is said in figures):
   * what will be ready to send, and what the bank account receives, each under a label of four words. One sentence
   * said three amounts before. What the service takes on the way is one line under them.
   */
  reviewToSend: "To send, at least",
  reviewOnBank: "On your bank, about",
  reviewOfYours: "Of your money",
  reviewTurns: (name: string, worth: string, fee: string) => `${name} will turn that into about ${worth}, minus its ${fee} fee.`,
  reviewQuantity: (name: string) => `It is the quantity ${name} asks for.`,
  nothingLeavesYet: "Nothing leaves your account yet.",
  /**
   * The card service buys the chain's own coin, so what a person gets there is a quantity of it and not dollars. The
   * money they are spending leads, the quantity follows, and neither is left to be guessed (D104).
   */
  reviewCard: (name: string) => `What ${name} pays onto your card is shown on their page.`,
  /**
   * What stays in the account the first time money goes out this way (D53): an account that holds none of it can send
   * nothing. Said in dollars, with "about", and without naming what it is counted in (the audit of 1 Oct 2026).
   */
  reviewKept: (dollars: string) => `About ${dollars} of it stays in your account, which it needs to be able to send.`,
  reviewDollars: (dollars: string) => `That is $${dollars} of your money.`,
  /** "Amount", never "price" (the audit of 1 Oct 2026): a person taking their money out is buying nothing. */
  priceHolds: "This amount holds for 4 minutes.",
  priceRefreshed: "The amount was refreshed.",
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
  /**
   * What to do on the service's own page, which opens with nothing chosen (the audit of 1 Oct 2026): the bank
   * service's page opens on selling, the card service's on buying, so only the second is told to press Sell. The two
   * words are the service's own for what is sold and where, quoted as it prints them.
   */
  onTheirPage: (name: string, sells: string, quantity: string, opensOnSelling: boolean) => {
    const [coin, network] = sells.split(" on ");
    return `On ${name}'s page, ${opensOnSelling ? "pick" : "tap Sell. Pick"} ${coin}, the one marked ${network}, and type ${quantity}.`;
  },
  /** One gesture where there were two, with the code copied before the page that asks for it opens. */
  copyAndOpen: (name: string) => `Copy my code and open ${name}`,
  /** Two lines under the action that opens the service: what opens, then what to come back with. */
  comeBack: (name: string) => [`${name} opens in a new tab and uses its own words.`, "Come back to this tab with the code it gives you."],
  /** The way back to money already made ready, from the first screen, now that it no longer opens by itself. */
  continueReady: (name: string) => `Continue with ${name}`,
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
    viky: (name: string) => `That code is Viky's own, not ${name}'s: money sent there could never be taken back out. Paste the one ${name} shows you.`,
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
  /** In dollars, with "about" (the audit of 1 Oct 2026): it used to be said in the coin it was paid in. */
  sendingCost: (dollars: string, underACent: boolean) => (underACent ? "Sending cost less than $0.01." : `Sending cost about ${dollars}.`),
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
      viky: "That code is Viky's own, not an account's: money sent there could never be taken back out. Paste the other account's.",
    },
  },

  failures: {
    notConfigured: "Viky cannot pay out yet. Nothing was taken.",
    rateMoved: "The amount changed before you confirmed. Nothing was taken.",
    seeTheNewPrice: "See the new amount",
    keptChanging: "The amount kept changing and Viky stopped after three tries. Nothing was taken. Try again in a minute.",
    tryAgain: "Try again",
    expired: "That amount has expired. Ask for a new one.",
    underWay: "You already have a payout waiting to finish. Give it a few minutes, then try again.",
    notSent: (name: string) => `${name} did not receive it and nothing left your account. Try again.`,
    other: "Viky could not finish this, and nothing was taken. Your money is where it was.",
  },
} as const;

/** The home page's card about money in the account, which is where the way out begins (W1). */
export const YOUR_MONEY = {
  label: "Yours",
  /**
   * The balance's own action (the founder, 29 Sep 2026): a first outside tester read "Use your money" as "use it to make
   * a gift". Both verbs, since the ways out lead with gift cards and phone credit, which are spent, not withdrawn.
   */
  takeItOut: "Spend or withdraw",
} as const;

/** The account's own code, on the account page, where another account or a payout service asks for it (decision 11). */
export const YOUR_CODE = {
  title: "Your code",
  use: "Give it where a payout service asks where the money is sent from, or to another Viky account of yours that sends money here.",
  copy: "Copy your code",
  copied: "Copied",
} as const;

/**
 * Your phone, the third way out (D238): three screens, where, how much, done. Every amount on them is the order's
 * own, priced by Bitrefill before anything moves (docs/SCREEN-CLAIMS.md).
 */
/**
 * Your mobile money (the founder, 2 Oct 2026): the operator, the number, the name on the account, how much, the figure
 * it gives with the moment it was priced, one button; then the wait, said with the time Switch publishes; then arrived,
 * or that it failed and the money comes back. No word of the coin, no page of anybody else's.
 */
export const MOBILE_OUT = {
  title: "Your mobile money",
  operator: "Operator",
  number: "Number",
  numberHelp: "Digits only, as your operator gives it.",
  holder: "Name on the account",
  holderHelp: "As your operator has it.",
  amount: "How much",
  amountHelp: (least: string, most: string) => `From ${least} to ${most} at a time.`,
  /** Under the amount after a press, in the country's money: what is missing, or the bound it is past. */
  amountMissing: "Write how much, in figures.",
  amountUnder: (least: string) => `At least ${least} at a time.`,
  amountOver: (most: string) => `At most ${most} at a time.`,
  /** The same bound when it is the balance that holds it, the cost of changing it included (the founder, 5 Oct 2026). */
  amountOverHeld: (most: string) => `At most ${most} with what you have.`,
  /** In place of the form when the balance is under the country's smallest payout: the minimum, and what the person has. */
  underMinimum: (least: string, have: string) => `Mobile money pays from ${least} at a time here, and you have ${have}.`,
  about: (figure: string) => `about ${figure}`,
  /** The dollars second (the founder, 3 Oct 2026): what leaves the balance for it, and when it was priced. */
  fromBalance: (dollars: string, when: string) => `${dollars} from your balance, at the rate of ${when}.`,
  /**
   * In place of the amount when dollars were already changed and have not been sent on, as after a payout cut before
   * they left (the founder, 5 Oct 2026): the card sends those, and says that it changes nothing more. It does not say
   * what they were changed for: a withdrawal to a bank left half way leaves the same dollars.
   */
  fromChanged: (dollars: string) => `From ${dollars} already changed. Nothing more is changed.`,
  pricing: "Pricing it",
  send: (operator: string) => `Send to my ${operator}`,
  steps: { changing: "Changing it", placing: "Placing it", sending: "Sending it" },
  waitingTitle: "On its way",
  waiting: (operator: string, end: string, delay: string) => `To your ${operator} number ending ${end}. It usually takes ${delay}.`,
  /** The same payout found again where the country's time cannot be read: where it goes, and nothing about how long. */
  waitingSent: (operator: string, end: string) => `To your ${operator} number ending ${end}.`,
  arrivedTitle: "Arrived",
  arrived: (operator: string, end: string) => `On your ${operator} number ending ${end}.`,
  failedTitle: "It did not go through",
  failed: "It did not reach the number. The money comes back to your account.",
  expiredTitle: "Nothing was sent",
  expired: "The time to send it ran out. Your money is still in your account.",
  checkAgain: "Check again",
  back: "Back",
  failedSend: "That did not go through. Nothing was taken.",
} as const;

export const PHONE_OUT = {
  /** Beside an amount whose face value alone is more than the person holds (src/out-of-reach.ts). */
  outOfReach: "More than you have",
  cardTitle: "Your phone",
  cardLine: "Airtime or data, bought for you on Bitrefill and sent to the number. In Senegal: Orange, Tigo and Expresso.",
  whatFor: "Credit or data?",
  kinds: { credit: "Credit", data: "Mobile data" } as const,
  noneOfKind: (kind: string) => `No ${kind.toLowerCase()} for this number on Bitrefill. Choose the other.`,
  choose: "Top up a phone",
  whereTitle: "Which phone?",
  number: "The number, with its country code",
  // No example of a number (the founder, 9 Oct 2026): it was one country's. What every number starts with.
  numberHelp: "Start with + and your country code. This phone remembers it for next time. Viky erases its own copy once the top-up arrives or is refunded.",
  find: "Find the phone company",
  finding: "Looking",
  whichCompany: "Which phone company?",
  howMuchTitle: "How much?",
  howMuch: (currency: string) => `How much, in ${currency}`,
  aboutDollars: (dollars: string) => `About ${dollars} from your balance.`,
  range: (min: string, max: string, currency: string) => `Between ${min} and ${max} ${currency}.`,
  getPrice: "See the price",
  pricing: "Asking the price",
  priced: (local: string, operator: string) => `${local} to the phone, through ${operator}.`,
  costs: (dollars: string, left: string, fee?: string) => (fee ? `It takes ${dollars}, including ${fee} in fees, and ${left} stays with you.` : `It takes ${dollars}, and ${left} stays with you.`),
  confirm: "Top it up",
  confirming: "Topping it up",
  doneTitle: "Done",
  delivered: (local: string, operator: string) => `${local} is on the phone, through ${operator}.`,
  onItsWayTitle: "On its way",
  onItsWay: "The phone company usually takes a minute. You can leave this page: it will arrive, or your money comes back.",
  refundedTitle: "It did not go through",
  refunded: (dollars: string) => `The phone company did not take it, so your ${dollars} came back to you.`,
  refundPending: (dollars: string) => `The phone company did not take it. Your ${dollars} is on its way back to you.`,
  again: "Top up another phone",
  back: "Back",
  checkAgain: "Check again",
  failed: "That did not work. Nothing was taken.",
} as const;

/**
 * /add-your-university (D246, two pages since D269): how a student adds their university from home in about ten minutes, on
 * the Reclaim account kept for students. The login is never written here or anywhere in the repository: the page
 * sends the student back to whoever sent them. What they send at the end is three things, and what Viky never
 * receives is said as plainly.
 */
export const ADD_UNIVERSITY = {
  title: "Add your university",
  /**
   * The head of the page, for somebody who is paying and whom nobody sent here (the founder's words, 9 Oct 2026; the
   * audit of that day): the page opened on a student's ten-minute procedure, and a payer who followed "Yours isn't
   * here?" read that it was theirs to do. Three lines, and the procedure under a fold named by whom it is for.
   */
  forAPayer: ["Offer the gift anyway.", "We set your university up within two days.", "You have nothing else to do."],
  forTheStudent: "Are you the student?",
  intro: "About ten minutes, from home. You make two checks on Reclaim with its AI option, one for the page of your student portal that says you are enrolled and one for your results, each described in a sentence, then send a few things. A gift can then pay when a student of your university shows they are enrolled, passed the year, or reached a grade.",
  /**
   * The AI option, the one that works today (the founder, 29 Sep 2026, D311, D312): Reclaim's manual builder is broken,
   * and an AI check is accepted. It names no request when it is made; Reclaim's agent writes one the first time a
   * student shows the page, and Viky reads that first proof and records it before any gift is paid on it.
   */
  steps: [
    {
      title: "Get the login",
      body: "Ask the person who sent you here for the login of Viky's student account on Reclaim. Reclaim is the service that checks a page of your student portal for Viky.",
    },
    {
      title: "Start a new check on Reclaim, with its AI option",
      body: "Sign in at dev.reclaimprotocol.org with that login, create a new provider, which is Reclaim's word for one page it knows how to check, and choose the AI option. Give it the link of the page where you sign in to your student portal.",
    },
    {
      title: "First check: the page that says you are enrolled",
      body: "Say in one sentence what it should show, and nothing else: your status for this year, such as Enrolled or Inscrit, and the academic year. Not your student number, not your name. Publish it.",
    },
    {
      title: "Second check: your results",
      body: "Make a second provider the same way, and say in one sentence to show the overall lines only: the decision (Passed, Admis), the overall average or grade (14.50 / 20, a GPA of 3.2), and the academic year. Not each subject's mark. Publish it.",
    },
    {
      title: "Send us what you made",
      body: "Send the person who sent you here: your university's full name, the link to its student portal, the ID Reclaim shows for each of the two checks (36 letters, numbers and dashes each), and how your university grades: out of 20, a GPA out of 4, or letters.",
    },
  ],
  neverTitle: "What Viky never receives",
  never: "Your password, or any mark but the overall result the check shows. You type your password on your university's own page, in Reclaim's window, only when you show a page. That result is read only when a gift on it is shown, and Viky keeps whether it was reached, not the mark. This page sends nothing anywhere.",
  nextTitle: "What happens next",
  next: "Gifts on your university work as soon as its check is recorded: the first time a student shows a page, Viky reads what the check read and records it, and every gift after that is checked the same way.",
} as const;

/**
 * A gift card, on the Bitrefill way (D271): a sheet to choose the card, an amount, done. The card's own line on where
 * it works is Bitrefill's, never ours; the code is shown here and in the history under it, and nowhere else.
 */
export const GIFT_CARD_OUT = {
  /** Beside an amount whose face value alone is more than the person holds (src/out-of-reach.ts). */
  outOfReach: "More than you have",
  title: "A gift card",
  chooseTitle: "Which card?",
  chooseHelp: (country: string) => `The cards Bitrefill lists for ${country}, the ones for ${country} first. Some are for online shops abroad, and each says where it works.`,
  choose: "Choose a card",
  change: "Choose another card",
  reading: "Reading the cards",
  none: (country: string) => `Bitrefill lists no card for ${country} yet.`,
  noCountry: "Say where your number is from first: the cards depend on the country.",
  howMuch: (currency: string) => `How much, in ${currency}`,
  range: (min: string, max: string, currency: string) => `Between ${min} and ${max} ${currency}.`,
  aboutDollars: (dollars: string) => `About ${dollars} from your balance.`,
  getPrice: "See the price",
  pricing: "Asking the price",
  priced: (local: string, name: string) => `${local} on a ${name} card.`,
  costs: (dollars: string, left: string, fee?: string) => (fee ? `It takes ${dollars}, including ${fee} in fees, and ${left} stays with you.` : `It takes ${dollars}, and ${left} stays with you.`),
  confirm: "Buy the card",
  confirming: "Buying the card",
  doneTitle: "Your card",
  onItsWayTitle: "On its way",
  onItsWay: "The code usually comes within a minute. It will be here and in your gift cards below, or your money comes back.",
  refundedTitle: "It did not go through",
  refunded: (dollars: string) => `Bitrefill did not deliver it, so your ${dollars} came back to you.`,
  refundPending: (dollars: string) => `Bitrefill did not deliver it. Your ${dollars} is on its way back to you.`,
  code: "Code",
  pin: "PIN",
  link: "Where to use it",
  instructions: "How to use it",
  expires: (date: string) => `Use it before ${date}.`,
  history: "Your gift cards",
  historyLine: (name: string, local: string, when: string) => `${name}, ${local}, ${when}`,
  checkAgain: "Check again",
  back: "Back",
  failed: "That did not work. Nothing was taken.",
} as const;

/**
 * "Finish a marathon" on the gift's page and in the sheet (D273): the race chosen, the bib before the start, the
 * result read after the finish, and the one line the page shows, the name, the bib and the time.
 */
export const WCA_PROOF = {
  whichCompetition: "Which competition?",
  whichEvent: "Which event?",
  readingCompetitions: "Reading the WCA's competitions",
  competitionsUnreadable: "The competitions could not be read right now. Close this and try again in a moment.",
  competitionLine: (city: string, country: string, day: string) => `${city}, ${country}. Starts ${day}.`,
  whoLabel: "Your WCA ID, or your name as on the competitors list",
  whoHelp: (competition: string) => `Before the ${competition}, Viky checks you are on its competitors list in that event. After it, Viky reads your result from the WCA's public results.`,
  whoShape: "A WCA ID is four figures, four letters and two figures, like 2019SCHO04; otherwise your name as on the competitors list.",
  checkRegistration: "Check my registration",
  checking: "Checking the competitors list",
  registered: (name: string, competition: string) => `${name} is on the competitors list of the ${competition}.`,
  /** Where the gift stands, as one line of "What was agreed": the result once it is read, the list before. */
  lines: {
    read: "Read",
    result: (name: string, best: string) => `${name}, best single ${best}`,
    list: "Competitors list",
    notYet: "not checked yet",
  },
  beforeTheDay: "Compete. After the competition, come back here to read your result.",
  readMyResult: "Read my result",
  reading: "Reading the WCA's results",
  line: (name: string, event: string, best: string) => `Read on the WCA's results: ${name}, ${event}, best single ${best}.`,
  failed: "That did not work. Nothing was changed.",
} as const;

export const MARATHON_PROOF = {
  whichRace: "Which race?",
  whichDistance: "Which distance?",
  /** The filter over the list, one chip: everything, or one country (the founder, 27 Sep 2026). */
  countryAll: "Country · all",
  countryFilter: "Country",
  readingRaces: "Reading the races",
  racesUnreadable: "The races could not be read right now. Close this and try again in a moment.",
  /** A race's line starts with its distances (the founder, 4 Oct 2026): the list said none, and they are the choice. */
  raceLine: (distances: string, town: string, country: string, day: string) => `${distances}. ${town}, ${country}. Starts ${day}.`,
  distanceAll: "Distance · all",
  distanceFilter: "Distance",
  bibLabel: "Your bib number",
  bibHelp: (race: string) => `The number on your bib for the ${race}, before the start. After the finish, Viky reads your line on the timing company's results page.`,
  bibClosed: (race: string) => `The ${race} has started and no bib was entered before it, so this gift cannot be read. What was put in it goes back at the deadline.`,
  bibShape: "A bib number is one to six figures.",
  saveBib: "Keep my bib number",
  saving: "Keeping it",
  bibSet: (bib: string, race: string, distance: string) => `Bib ${bib}, ${race}, ${distance.toLowerCase()}.`,
  /** Where the gift stands, as one line of "What was agreed": the result once it is read, the bib before. */
  lines: {
    read: "Read",
    result: (runner: string, time: string) => `${runner}, ${time}`,
    bib: "Bib",
    bibOf: (bib: string, race: string) => `${bib}, ${race}`,
    noBib: "not entered yet",
  },
  beforeTheRace: "Run. After the finish, come back here to read your result.",
  /** Until the start, a bib typed wrong can be entered again (the audit of 1 Oct 2026). */
  changeBib: "Change my bib number",
  bibChangeHelp: (race: string) => `The number on your bib for the ${race}. It can be changed until the start.`,
  afterTheRace: "The race has been run. Read your line on the timing company's results page.",
  readMyResult: "Read my result",
  reading: "Reading the results page",
  line: (runner: string, bib: string, time: string) => `Read on the timing company's page: ${runner}, bib ${bib}, ${time}.`,
  failed: "That did not work. Nothing was changed.",
} as const;
