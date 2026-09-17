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
          "Paying for it",
          "Arrives in your account",
          "Stays yours",
          "says most payments take 30 to 60 minutes, and sometimes several hours.",
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
        name: "Waiting for the payment",
        when: "the card service's page has been opened and nothing has arrived",
        says: ["Pick: Buy.", "Receive: MON.", "Network: Monad.", "Send to: the code below.", "Whose it is: your own.", "You never have to understand them.", "Before you pay, check what you pasted starts with", "You can leave this page: the gift is kept, and Viky picks it up when you come back.", "Set up a different gift instead"],
        gap: "the card service's page cannot be prefilled, so every one of these is a thing the person must do by hand. A partner rail would delete this whole state.",
      },
      {
        name: "The payment arrived",
        when: "a card payment is in the account: turned into dollars, then the gift is made, or the screen says it falls short",
        says: ["Your payment arrived", "Getting it ready, a few seconds.", "less than the", "Pay", "EUR more", "The price changed and nothing was changed. Viky will try again in a moment."],
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
    screen: "The register of conditions",
    file: "src/conditions.ts",
    states: [
      { name: "Opened, not connected", when: "claimed, but nothing bound yet: the card says what to connect, in the register's words", says: ["Opened. Connect Duolingo to start counting."] },
      { name: "What will they do?", when: "the funder chooses a condition; only what is live is offered", says: ["A Duolingo lesson each day"] },
    ],
  },
];

export const RECIPIENT_JOURNEY: readonly CatalogueScreen[] = [
  {
    screen: "Opening a gift",
    file: "app/components/GiftPage.tsx",
    states: [
      { name: "Not signed in", when: "the link is open with no account on this device", says: ["Sign in to see your gift.", "Create your account to open it. Nothing to install."] },
      { name: "The link has no key", when: "the link was cut short or retyped", says: ["This link is missing its key. Ask for the link again."] },
      { name: "No such gift", when: "the identifier matches nothing", says: ["This gift could not be found."] },
      { name: "Naming the Duolingo account", when: "opened, nothing bound yet", says: ["Your Duolingo username", "No password, no sign-in: your lessons are read from your public profile. Next, a short code proves the profile is yours."] },
      { name: "Proving the profile with a code", when: "the recipient named the account themselves", says: ["In Duolingo, open Profile, then Settings, then Name, and add this code to your name for a minute:", "You can remove the code right after.", "Keep the name I had"] },
      { name: "The funder already named it", when: "the funder filled the Duolingo name in", says: ["That is not my Duolingo name"], gap: "no code is asked for here, which is right, and the screen used to tell people to remove a code they were never given (D39)." },
      { name: "Bound, before the first day", when: "the account is connected and counting starts tomorrow", says: ["Everything you learn from now on already counts toward tomorrow, the first day."] },
      { name: "Already read today", when: "a reading was already counted for today", says: ["Viky already read your Duolingo today. Come back tomorrow.", "Nothing to do right now"] },
      { name: "Read, nothing new", when: "the reading worked but the day is not earned", says: ["Read. Nothing new to count yet."] },
      { name: "A day was earned", when: "the reading cleared the daily target", says: ["One more day is yours."] },
      { name: "Finished", when: "the gift is over", says: ["This gift is finished."] },
      { name: "Taken back", when: "cancelled before it was opened", says: ["This gift was taken back before it was opened."] },
    ],
  },
  {
    screen: "The days of a gift",
    file: "app/components/DayRow.tsx",
    states: [
      {
        name: "The whole gift in one row",
        when: "counting has started, so there is a window",
        says: ["Yours so far", "Theirs so far", "Gone back", "Came back to you"],
      },
      {
        name: "A day finished",
        when: "the day is settled, earned or returned",
        says: [],
        gap: "it says finished and not which of the two, and that is deliberate. The contract publishes earned and returned as totals and settles days in order, so the counts do not determine the sequence: earning days one and three then missing two reads exactly like earning one and two then missing three. The totals are printed beside the row; the split per day waits for the event index.",
      },
      {
        name: "A day still catchable",
        when: "a day behind whose window has not closed",
        says: [],
        gap: "the mark and the spoken label carry it, with the deadline in the reader's own time. There is no visible sentence on the cell itself, which is right at this size and wrong if the row is ever the only thing on screen.",
      },
      {
        name: "A day about to come back",
        when: "its window has closed and nothing has drained it yet",
        says: [],
        gap: "the state exists and is spoken as going back to the person who sent it. Naming them needs a first name, and nothing in Viky collects one from either side, so D58's 'returned to [name]' cannot be kept yet.",
      },
      {
        name: "Today",
        when: "the day in progress, which nobody can have missed",
        says: [],
        gap: "marked with its own outline and mark. This is the state whose absence made a recipient on day three read '1 of 7 done, 0 missed' and conclude the product was broken (D50).",
      },
      { name: "Still to come", when: "any day after today inside the window", says: [], gap: "drawn faintly, with no sentence of its own, because there is nothing to say about it yet." },
    ],
  },
  {
    screen: "Money in the account, on the home page",
    file: "src/sentences.ts",
    states: [
      {
        name: "The account holds something",
        when: "anything at all is in the account, of any of the three coins, from a gift taken, a change, or a payment left over",
        says: ["In your account", "Yours to keep, to put behind another goal, or to take out.", "Take it out"],
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
      { name: "What is there", when: "the way out is opened, from the home page, with anything in the account", says: ["Take your money out", "Your money"] },
      {
        name: "The two ways out",
        when: "nothing is ready yet: a card per service, with where it pays, what it keeps, and where that was read",
        says: ["Send to my bank", "Send to my card", "Send to another Viky account of mine", "Read from"],
      },
      {
        name: "Step 1, how much",
        when: "a way out was chosen",
        says: ["Step 1 of 3: Get it ready", "How much do you want to send to your bank?", "with two decimals at most", "See what you will get"],
      },
      {
        name: "Step 1, the review before getting it ready",
        when: "the price answered",
        says: ["You will get at least", "Nothing leaves your account yet.", "This price holds for 4 minutes.", "Get "],
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
          "The price changed before you confirmed. Nothing was taken.",
          "The price kept changing and Viky stopped after three tries. Nothing was taken. Try again in a minute.",
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
      { name: "The third destination", when: "reached from the bar or the rail, signed in", says: ["You", "Money shown in", "How it looks", "Signed in on this device until", "Sign out", "Need your code for a payout service?", "Help", "Privacy", "Legal notice", "For judges"] },
      { name: "Help", when: "somebody is stuck", says: ["Five questions, answered in the words the screens use."] },
    ],
  },
];

/** The one control that changes the whole product's appearance, on You. */
export const APPEARANCE_SCREEN: readonly CatalogueScreen[] = [
  {
    screen: "How it looks, on You",
    file: "src/sentences.ts",
    states: [
      { name: "Following the phone", when: "nobody has chosen, which is where everyone starts", says: ["Day", "Night", "Follow my phone"] },
    ],
  },
];

export const JOURNEYS: ReadonlyArray<{ who: string; screens: readonly CatalogueScreen[] }> = [
  { who: "The person who gives", screens: FUNDER_JOURNEY },
  { who: "The person the gift is for", screens: RECIPIENT_JOURNEY },
  { who: "Both of them", screens: [...ACCOUNT_SCREEN, ...APPEARANCE_SCREEN] },
];

/** Every state, flattened, for counting and for the tests. */
export function everyState(): ReadonlyArray<{ who: string; screen: string; file: string; state: CatalogueState }> {
  return JOURNEYS.flatMap(({ who, screens }) =>
    screens.flatMap((s) => s.states.map((state) => ({ who, screen: s.screen, file: s.file, state }))),
  );
}
