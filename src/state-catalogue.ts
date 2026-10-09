/**
 * Every state of both journeys, in one place, so the design pass can be directed from what exists rather
 * than from memory.
 *
 * It is a measurement, not a description. Every sentence quoted here must appear, word for word, in the file
 * named beside it, and `test/state-catalogue.test.ts` fails if one does not. A state with nothing quoted is
 * a state where no words exist yet, and saying so is the point: the gaps are what a design pass is for.
 *
 * Nothing here reaches a person using Viky. The page that renders it is the operator's, and it is labelled
 * as example data, because none of these amounts or names belong to anybody.
 */

export type CatalogueState = Readonly<{
  /** Short name, the way the two of us would refer to it out loud. */
  name: string;
  /** What puts a person here. */
  when: string;
  /** What is on the screen today, word for word. Empty when nothing is written yet. */
  says: readonly string[];
  /** What is missing, undecided, or knowingly wrong. */
  gap?: string;
}>;

export type CatalogueScreen = Readonly<{
  screen: string;
  /** The file the sentences are checked against. */
  file: string;
  states: readonly CatalogueState[];
}>;

export const FUNDER_JOURNEY: readonly CatalogueScreen[] = [
  {
    screen: "Offering a gift",
    file: "src/sentences.ts",
    states: [
      {
        name: "Who is it for?",
        when: "step 1 of 5: the first name of the person it is for, and the funder's name as they know them",
        says: ["Who is it for?", "Their first name", "Your name, as they know you", "Both names show on the gift, to them and to whoever opens its link.", "Viky never writes to them. You send them the link yourself, once the gift is ready."],
      },
      {
        name: "A name refused",
        when: "a name left empty once the field was left, longer than a card holds, or not a name",
        says: ["Write their first name.", "Write your name, as they know you.", "40 characters at most.", "Letters, spaces, dots, apostrophes or hyphens only."],
      },
      {
        name: "What will they do?",
        when: "step 2 of 5: the conditions that work from end to end, nothing chosen for them, Continue shut until one is",
        says: ["What will they do?"],
        gap: "the conditions themselves are the register's words (src/conditions.ts); only the Duolingo lesson is live until C2.",
      },
      {
        name: "The condition's own detail",
        when: "step 3 of 5: the name a source reads, checked by a public read before any money moves, and what counts as a day",
        says: ["Checking the name"],
        gap: "the title, the name's question, its help, its three refusals (shape, no such profile, source not answering) and the daily target are the register's words.",
      },
      {
        name: "How much, and for how long?",
        when: "step 4 of 5: the amount in dollars with the account's currency beside it, the days, and what one day is worth",
        says: ["How much, and for how long?", "How much, in dollars", "At least $1.00.", "For how many days", "7 at least, 90 at most.", "And each day they miss, the same comes back to you.", "Whole days, like 7.", "7 days at least.", "90 days at most."],
        gap: "the amount opens at 25 dollars, what one smallest card payment covers (D72). The floor that exists is the rail's: nothing under 25 EUR can be paid in at all (D62).",
      },
      {
        name: "Check this over",
        when: "step 5 of 5, before anything is signed or paid: every term with a way to change it, the risk of the link, and what paying costs",
        says: [
          "Check this over",
          "What they will do",
          "Goes in their name",
          "A day earned",
          "What counts as a day",
          "First day counted",
          "A day they miss can still be caught up the next day. If it is not, it comes back to you by itself the morning after, at about",
          "show on the gift, to whoever opens its link.",
          "The link you will get opens the gift for whoever opens it first. Send it only to",
          "If nobody opens it within 14 days, it all comes back to you, and the same if it is opened and never connected.",
          "Paying with",
          "Arrives in your account",
          "Stays yours",
          "Use the payment that arrived",
          "Not now",
        ],
      },
      {
        name: "One account, and then you can pay",
        when: "the check reached with no account on this device",
        says: ["One account, and then you can pay", "The money is held in your name until they earn it, so it needs somewhere of yours to be held."],
      },
      {
        name: "The two ways in",
        when: "the account is short: one card per way in, ordered by the country, each with its floor, its fee and its source (D101)",
        says: ["Paying with", "takes nothing under", "What arrives is what the gift holds, so nothing is changed afterwards and nothing is left over.", "What arrives is changed into what the gift holds"],
      },
      {
        name: "Waiting for the payment",
        when: "the card service's page has been opened and nothing has arrived",
        says: ["Pick: Buy.", "Send to: the code below.", "Whose it is: your own.", "You never have to understand them.", "Before you pay, check what you pasted starts with", "You can leave this page: the gift is kept, and Viky picks it up when you come back.", "Set up a different gift instead"],
        gap: "the card service's page cannot be prefilled, so every one of these is a thing the person must do by hand. A partner rail would delete this whole state.",
      },
      {
        name: "The payment arrived",
        when: "a card payment is in the account: turned into dollars, then the gift is made, or the screen says it falls short",
        says: ["Your payment arrived", "Getting it ready, a few seconds.", "less than the", "Pay", "more", "The price changed and nothing was changed. Viky will try again in a moment."],
      },
      {
        name: "The session closed while paying",
        when: "the passkey session idled out before the gift was made, often while the card payment was still on its way",
        says: ["Your session closed while you were paying", "is kept on this device, and whatever you paid stays in your account.", "Sign in again and Viky picks up where it stopped: your payment becomes the gift as soon as it is here."],
      },
      {
        name: "A gift waiting, nobody signed in",
        when: "the page was opened again after the session closed, with the gift kept on this device",
        says: ["A gift is waiting for your payment", "set up on this device and not made yet.", "Sign in to pick it up", "Whatever you paid stays in your account."],
      },
      {
        name: "It is in their name",
        when: "the gift exists on chain: the amount, the reference and the date, the link, and what happens next",
        says: ["Reference: gift", "Copy the link", "Share", "Whoever opens this link takes the gift, so send it only to", "What happens next", "See this gift"],
        gap: "whoever holds this link takes the gift. The check says so before paying; the real lock is the source's name when the funder filled it in (D58).",
      },
      {
        name: "The copy failed",
        when: "the browser refused the clipboard",
        says: ["Your browser would not let us copy it. Press and hold the link above, then choose Copy."],
      },
      {
        name: "Making the gift refused",
        when: "the route refused, with its own typed sentence, and the page waits for a gesture rather than repeating it",
        says: ["Try again"],
      },
    ],
  },
  {
    screen: "Gifts, and what is moving on Home",
    file: "src/sentences.ts",
    states: [
      { name: "None yet", when: "this account is neither funder nor recipient of anything", says: ["No gift yet. Offer one, or open a link someone sent you."] },
      { name: "Two groups on Gifts, never one list", when: "the account is on both sides of at least one gift", says: ["Given", "Received"] },
      { name: "One card for a gift, everywhere", when: "a gift is listed on Home or on Gifts", says: ["For you", "For whoever opens the link", "Not opened yet.", "Taken back before it was opened.", "Open"] },
      { name: "Could not be loaded", when: "the list itself failed", says: ["Your gifts could not be loaded."] },
    ],
  },
  {
    screen: "The two ways in and the two ways out, in the rails' own words",
    file: "src/rails.ts",
    states: [
      {
        name: "What each rail keeps, takes and delivers",
        when: "the check offers a way in, or the way out offers a way out: every figure on those cards is that service's own",
        says: [
          "most payments take 30 to 60 minutes, and sometimes several hours",
          "To your bank account.",
          "To your card.",
          "Identity check before your first payout, once.",
          "Ramp's own asset list",
          "Mercuryo's own list of currencies and help centre",
        ],
      },
    ],
  },
  {
    screen: "The register of conditions",
    file: "src/conditions.ts",
    states: [
      { name: "Opened, not connected", when: "claimed, but nothing bound yet: the card says what to connect, in the register's words", says: ["Opened. Connect Duolingo to start counting."] },
      { name: "What will they do?", when: "the funder chooses a condition; only what is live is offered", says: ["A Duolingo lesson each day"] },
      {
        name: "Which course counts",
        when: "the funder gave the account name and the source answered with several courses (U1)",
        says: ["Which course counts?", "Only this course earns a day. Experience won in another course does not count."],
      },
      {
        name: "The account stopped learning that course",
        when: "the gift counts one course and the profile no longer carries it: nothing can be counted, and the whole amount goes back",
        says: ["any more, so no day can be counted. Ask for a new gift"],
      },
    ],
  },
];

export const RECIPIENT_JOURNEY: readonly CatalogueScreen[] = [
  {
    screen: "A gift's page",
    file: "src/sentences.ts",
    states: [
      // The nine moments of document J (V4, D172 to D175), each as its two people and a reader read it.
      { name: "Jamais ouvert", when: "nobody has opened the link: the promise with the first name, the day it goes back, and opening it", says: ["put this in your name.", "has not opened it yet.", "Yours day by day", "or it goes back to", "If not by", "Open my gift", "It creates your account with your fingerprint, face or screen lock. 18 or older.", "I already have an account", "This link is missing its key. Ask for the link again."] },
      { name: "Ouvert, pas relié", when: "opened, and nothing started: the one gesture, the agreement unfolded, and the day it goes back", says: ["and it starts.", "is not connected yet.", "or it goes back to", "Connect now: only what you reach after connecting counts."] },
      { name: "En cours, quotidien", when: "a daily gift counting: the last day judged, in words; no action", says: ["Yesterday counted.", "Today still counts.", "Next reading:", "Yours so far", "Theirs so far"] },
      { name: "En cours, progression", when: "a climb under way: how far is left, where they are today, and and the live line of the reading while the page is open; no action", says: ["to go.", "Today", "Checked just now"] },
      { name: "En cours, obtenu ou pas", when: "something granted once, waiting for its proof: the one gesture as the state", says: ["Share the page that proves it, and the gift is yours.", "account, and it is yours.", "not shown it yet."] },
      { name: "Départ trop haut", when: "the first reading stood above the highest start the funder accepted", says: ["when it started, so there is nothing to climb.", "when the time is up.", "for a new one", "Make a new gift"] },
      { name: "Atteint", when: "reached, or a habit finished with days earned: the money, theirs, used from Home", says: ["It is yours.", "did it.", "Reached on", "Finished on"] },
      { name: "Échéance passée", when: "the time ran out with nothing earned: what goes back, and to whom", says: ["The time is up.", "did not make it in time.", "Nothing to do: it goes back by itself.", "Back on"] },
      { name: "Repris", when: "the funder took it back before it was opened", says: ["took it back before it was opened.", "It is in your account again.", "Taken back"] },
      { name: "R4, the code", when: "the recipient named the account themselves", says: ["Copy the code", "This code has expired.", "Get a new code", "Check my profile", "Come back here and press:", "Keep the name I had"] },
      { name: "R5, named by the funder", when: "the funder gave the source's name", says: ["Start counting", "to check the name. Nothing counts until it is right."] },
      { name: "A reader", when: "somebody who is neither of the two people: signed in, or with no account at all", says: ["This gift is not yours.", "Sign in if this gift is yours."] },
      { name: "The session closed", when: "somebody was signed in on the page and the session went", says: ["Your session closed while you were away", "Nothing moved and nothing was taken."] },
      { name: "The link again", when: "the funder wants to send the link of a gift nobody has opened a second time", says: ["Get the link again"] },
      {
        name: "Taking out, while a daily gift runs",
        when: "days already earned on a daily gift that has not ended",
        says: [],
        gap: "the contract lets the person take them at any time; the page offers it only at the end, because the founder's table of 23 Sep 2026 gives a gift that runs no action (D172).",
      },
      {
        name: "The date a milestone gift was taken back",
        when: "a milestone gift the funder took back before it was opened",
        says: [],
        gap: "the page says it was taken back and not when: the milestone status carries no time of the cancel, only the daily gift's record does.",
      },
      { name: "No such gift", when: "the identifier matches nothing", says: ["This gift could not be found."] },
    ],
  },
  {
    screen: "The days of a gift",
    file: "src/sentences.ts",
    states: [
      { name: "Every day in words", when: "counting has started, so the days have dates", says: ["earned", "back to them", "back to you", "catch up", "not judged yet", "today", "to come"] },
      {
        name: "Drawn from the totals",
        when: "a settled day with no row in the keeper's record, settled before the record existed",
        says: ["Days settled before the record", "drawn from the totals"],
        gap: "those days are drawn earned first and then returned, because the contract gives counts and not the order; every day settled since the record exists is drawn at its date (D86).",
      },
      {
        name: "A day settled by somebody else",
        when: "anybody may call drain or finalise on the contract; a day settled by a transaction Viky did not relay",
        says: [],
        gap: "no row is written for it, because the keeper reads the receipts of its own relays only; the day falls back to the counts. Reading the contract's events for every gift needs the event index.",
      },
    ],
  },
  {
    screen: "A milestone gift's page",
    file: "src/sentences.ts",
    states: [
      { name: "Before the first reading", when: "a milestone gift opened and not connected: its clock has not started", says: ["of connecting"] },
      { name: "Before the deadline", when: "a milestone gift connected and read", says: ["To reach", "Started at", "If not"] },
      { name: "Reached or not", when: "the keeper read it reached, or the deadline passed (the moments of the gift's page say it since V4)", says: ["Reached on", "did not make it in time."] },
      { name: "Opening, connecting and taking a milestone gift", when: "the recipient's gestures on a milestone gift (C2)", says: ["Get my code", "Check my profile", "into your account"] },
      {
        name: "Connecting an account the funder named",
        when: "a milestone gift whose funder gave the account: one button, no code, nothing to change on the source (D27)",
        says: ["Nothing to install, no password, and nothing to change on", "Start reading my"],
      },
      { name: "Already there when it was connected", when: "the first reading was already at the rating the gift is for (D91)", says: ["had already reached", "cannot count it"] },
      {
        name: "A Chess.com name changed after connecting",
        when: "the recipient renamed the account on Chess.com, which it allows every ninety days",
        says: [],
        gap: "the account route follows a new name once a proof shows it is the same player, and no screen offers it yet: the readings fail as a name that no longer answers until it is given.",
      },
      {
        name: "A real milestone gift",
        when: "a gift held by the milestone contract on mainnet",
        says: [],
        gap: "none exists until MilestoneGift is deployed and its first gift made (C2); until then the page is drawn from simulated data and rehearsed on a fork.",
      },
    ],
  },
  {
    screen: "A milestone gift's page, in the register's words",
    file: "src/milestone-conditions.ts",
    states: [
      {
        name: "The source closed the account",
        when: "Chess.com closed the account a gift reads, which its public profile says (U1): no gesture is offered beside the sentence, and the gift goes back at the deadline",
        says: ["Chess.com has closed this account, so this gift can no longer be earned."],
      },
      {
        name: "Where the code goes",
        when: "the recipient has a code to put in their name, and the register says where that field is",
        says: ["Add it to your first name on Chess.com: Settings, Profile, Details. Save."],
      },
    ],
  },
  {
    screen: "Money in the account, on the home page",
    file: "src/sentences.ts",
    states: [
      {
        name: "The account holds something",
        when: "anything at all is in the account, of any of the three coins, from a gift taken, a change, or a payment left over",
        says: ["Yours", "Spend or withdraw", "Offer a gift"],
      },
      {
        name: "Something is ready to send to a payout service",
        when: "a change left the coin that service buys in the account",
        says: ["of it is ready to send to"],
      },
      {
        name: "The account holds nothing",
        when: "there is no money of any kind",
        says: [],
        gap: "the block is hidden rather than shown empty, which is right for somebody who has never had money here and wrong for somebody who has just spent theirs: they see nothing where a figure was.",
      },
    ],
  },
  {
    screen: "The display currency",
    file: "src/display-currency.ts",
    states: [
      {
        name: "The rate could not be read",
        when: "the source has not answered for three days, on an account whose currency is not the dollar",
        says: ["Shown in dollars: the exchange rate could not be read today."],
      },
    ],
  },
  {
    screen: "Their money",
    file: "src/sentences.ts",
    states: [
      { name: "What is there", when: "the way out is opened, from the home page, with anything in the account", says: ["Spend or withdraw", "Yours"] },
      {
        name: "The two ways out",
        when: "nothing is ready yet: a card per service, with where it pays, what it keeps, and where that was read",
        says: ["Send to my bank", "Send to my card", "Send to another Viky account of mine", ", read "],
      },
      {
        name: "Where is your bank or card",
        when: "the country of the connection and the region of the device disagree (R1): one question, and nothing ordered until it is answered",
        says: ["Where is your bank or card?"],
      },
      {
        name: "A way out that pays nobody there",
        when: "a rail's own list has no payout in the country in force: it is put second and said plainly, never removed",
        says: ["lists no payout in"],
      },
      {
        name: "Step 1, how much",
        when: "a way out was chosen",
        says: ["Step 1 of 3: Get it ready", "How much do you want to send to your bank?", "with two decimals at most", "See what you will get"],
      },
      {
        name: "Step 1, the review before getting it ready",
        when: "the price answered",
        says: ["To send, at least", "On your bank, about", "Nothing leaves your account yet.", "This amount holds for 4 minutes.", "Get "],
      },
      {
        name: "Ready, with steps 2 and 3",
        when: "the account holds the coin the chosen service buys, whether it was changed a moment ago or found on a reload",
        says: [
          "Ready: ",
          "stays in your account.",
          "Step 2 of 3: Place your order with",
          "asks where you are sending from, give them this code",
          "will ask you to confirm the money is yours: it is.",
          "Step 3 of 3: Send it",
          "Paste the code",
        ],
      },
      {
        name: "The card branch",
        when: "the chosen service pays onto a card, so what leaves is the chain's own coin, sent by the person's own account",
        says: ["gives you six hours to send it.", "Sending costs a small amount of what you hold, said afterwards with its figure.", "Sending cost"],
      },
      { name: "The review before sending", when: "a code was pasted and the button pressed", says: ["This cannot be undone.", "The code you pasted:"] },
      { name: "Sent", when: "the send is final", says: ["Reference:", "to follow it"] },
      {
        name: "Refusals, under the element in cause",
        when: "an amount, a price or a code is refused",
        says: [
          "Two decimals at most, like 9.99.",
          "That is more than your $",
          "The amount changed before you confirmed. Nothing was taken.",
          "The amount kept changing and Viky stopped after three tries. Nothing was taken. Try again in a minute.",
          "Viky cannot pay out yet. Nothing was taken.",
          "It starts with 0x and is 42 characters long.",
        ],
      },
      {
        name: "The session closed while they were away",
        when: "the passkey session timed out on this screen, which the thirty minutes make rarer and a first payout with an identity check can still exceed",
        says: ["Your session closed while you were away", "Nothing moved and nothing was taken. Your money is exactly where it was, and nothing about it expires.", "You were at step 2 of 3:"],
      },
      { name: "To another Viky account of mine", when: "the secondary path, under the two cards", says: ["Paste that account's code", "How much to send", "to your other account"] },
    ],
  },
];

/** Everything that is not a gift and not money: the third destination. */
export const ACCOUNT_SCREEN: readonly CatalogueScreen[] = [
  {
    screen: "You",
    file: "src/sentences.ts",
    states: [
      { name: "The third destination", when: "reached from the bar or the rail, signed in", says: ["You", "Money shown in", "Signed in on this device", "Sign out", "Need your code for a payout service?", "Help", "Privacy", "Legal notice", "For judges"] },
      { name: "Without an account", when: "reached from the bar or the rail with nobody signed in", says: ["You", "Not signed in on this device.", "Sign in"] },
      { name: "Help", when: "somebody is stuck", says: ["Five questions, answered in the words the screens use."] },
    ],
  },
];

/**
 * The one door into an account (the art direction brief of 17 Sep 2026, section 7). The appearance is no longer one of
 * these screens: there is nothing to choose, because the app follows the device from the first pixel.
 */
export const DOOR_SCREEN: readonly CatalogueScreen[] = [
  {
    screen: "The door, in the header",
    file: "src/sentences.ts",
    states: [
      { name: "Closed", when: "on the page without an account and on You, with nobody signed in", says: ["Sign in"] },
      {
        name: "Open, on a device that remembers no passkey",
        when: "the header's entry was pressed: nothing is asked of the browser until Sign in is pressed there",
        says: ["Your face or your fingerprint, and nothing to remember.", "Create my account", "Sign in", "Not now"],
      },
      {
        name: "Open, after a passkey that did not answer",
        when: "this device remembers a passkey and its sheet was waved away",
        says: ["Your face or your fingerprint, and nothing to remember.", "Create my account", "Try again", "Not now"],
      },
    ],
  },
];

export const JOURNEYS: ReadonlyArray<{ who: string; screens: readonly CatalogueScreen[] }> = [
  { who: "The person who gives", screens: FUNDER_JOURNEY },
  { who: "The person the gift is for", screens: RECIPIENT_JOURNEY },
  { who: "Both of them", screens: [...ACCOUNT_SCREEN, ...DOOR_SCREEN] },
];

/** Every state, flattened, for counting and for the tests. */
export function everyState(): ReadonlyArray<{ who: string; screen: string; file: string; state: CatalogueState }> {
  return JOURNEYS.flatMap(({ who, screens }) =>
    screens.flatMap((s) => s.states.map((state) => ({ who, screen: s.screen, file: s.file, state }))),
  );
}
