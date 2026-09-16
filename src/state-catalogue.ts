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
    screen: "Making a gift",
    file: "app/components/FundGift.tsx",
    states: [
      {
        name: "Signed out",
        when: "the page is open with no account on this device",
        says: ["Sign in first."],
      },
      {
        name: "Who it is for",
        when: "signed in, first question of three",
        says: ["Who is it for, and for what", "Their Duolingo name, if you know it", "Viky never writes to them. You send them the link yourself, once the gift is ready."],
      },
      {
        name: "How much, and for how long",
        when: "the second question, once there is somebody to give to",
        says: [
          "How much, and for how long",
          "How much, in dollars",
          "For how many days, seven at least",
          "XP a day to earn one day",
          "Each day they reach it, this becomes theirs",
          "And each day they miss, the same comes back to you.",
        ],
        gap: "the amount opens at 25 dollars, what one smallest card payment covers (D72), and there is no hard floor on the field itself. The floor that exists is the rail's: nothing under 25 EUR can be paid in at all (D62).",
      },
      {
        name: "Checking it over",
        when: "the third screen, before anything is signed or paid",
        says: [
          "Check this over",
          "In their name",
          "Theirs for each day earned",
          "First day counted",
          "A day they miss comes back to you by itself, the morning after.",
          "What they can do with it",
          "Paying for it",
        ],
      },
      {
        name: "Not enough money yet, the rail step",
        when: "the account holds less than the gift is worth",
        says: [
          "Choose Buy, not sell.",
          "Pay in EUR, at least",
          "When they ask whose it is, choose your own, non-custodial, not an exchange or a platform.",
          "Choose to receive MON.",
          "Choose the Monad network.",
          "Paste your identifier where they ask where to send it.",
          "Before you pay, check what you pasted starts and ends like this:",
        ],
        gap: "the rail's page cannot be pre-filled, so every one of these is a thing the person must do by hand. A partner rail would delete this whole state.",
      },
      {
        name: "Waiting for the payment",
        when: "the rail's page has been opened and nothing has arrived",
        says: ["Waiting for your payment. You can leave this page", "Copy my identifier again"],
      },
      {
        name: "Something arrived",
        when: "a balance appeared but is not yet converted",
        says: ["Something arrived and is being made ready.", "Your payment arrived. Getting it ready, a few seconds."],
      },
      {
        name: "Converting and giving",
        when: "there is enough, and the gift is being made",
        says: ["Your money is here. Putting it behind the goal.", "Ready. Putting it behind the goal.", "Putting it in their name"],
      },
      {
        name: "The session closed mid-way",
        when: "the passkey session idled out before the gift was made, often while the card payment was still on its way",
        says: [
          "Your session closed while you were paying",
          "Nothing is lost. The gift you set up is kept on this device, and whatever you paid stays in your account.",
          "Your session closed. Sign in again to finish.",
        ],
      },
      {
        name: "Back after the session closed",
        when: "the same account signs in on this page again, with a gift set up and not yet made",
        says: ["gift is still set up, and it goes ahead as soon as your payment is here.", "Set up a different gift instead", "Use the payment that arrived"],
        gap: "the gift is kept on one device. Coming back on another phone finds the payment in the account and no gift set up: the funder sets it up again, and the check offers to use the payment that arrived.",
      },
      {
        name: "A gift waiting, nobody signed in",
        when: "the page was reloaded after the session closed, so the first step is all there is",
        says: ["A gift is waiting for your payment", "Sign in to pick it up"],
      },
      {
        name: "Made, and the link to send",
        when: "the gift exists on chain",
        says: ["It is in their name.", "Copy the link"],
        gap: "whoever holds this link takes the gift. The screen says so; the real lock is the Duolingo name when the funder filled it in (D58).",
      },
      {
        name: "The copy failed",
        when: "the browser refused the clipboard",
        says: ["Your browser would not let us copy it. Press and hold the link above, then choose Copy."],
      },
      {
        name: "Something went wrong",
        when: "any refusal we did not name",
        says: ["Something went wrong. Nothing was taken. Please try again."],
      },
    ],
  },
  {
    screen: "What I give, on the home page",
    file: "app/components/MyGifts.tsx",
    states: [
      { name: "None yet", when: "this account is neither funder nor recipient of anything", says: ["No gift yet."] },
      { name: "Two blocks, never one list", when: "the account is on both sides of at least one gift", says: ["What I receive", "What I give"] },
      { name: "Not opened", when: "nobody has claimed the link", says: ["Not opened yet."] },
      { name: "Opened, no goal", when: "claimed, but no Duolingo account bound", says: ["Opened. Name the Duolingo account to start counting."] },
      { name: "Taken back", when: "the funder cancelled before it was opened", says: ["Taken back before it was opened."] },
      { name: "Could not be loaded", when: "the list itself failed", says: ["Your gifts could not be loaded."] },
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
    file: "app/components/YourMoney.tsx",
    states: [
      {
        name: "The account holds something",
        when: "anything at all is in the account, from a gift taken or a payment left over",
        says: ["In your account", "Earnings add up here from one gift to the next, so a small gift is waiting rather than gone."],
      },
      {
        name: "The account holds nothing",
        when: "there is no money",
        says: [],
        gap: "the block is hidden rather than shown empty, which is right for somebody who has never had money here and wrong for somebody who has just spent theirs: they see nothing where a figure was.",
      },
    ],
  },
  {
    screen: "Their money",
    file: "app/components/CashOut.tsx",
    states: [
      { name: "What is theirs", when: "the gift has earned anything", says: ["Yours to take out"] },
      {
        name: "The session closed while they were away",
        when: "the passkey session timed out during the journey, which takes longer than the session lasts",
        says: [
          "Your session closed while you were away",
          "Nothing moved and nothing was taken.",
          "Sessions close on their own after",
        ],
        gap: "expected rather than exceptional: a session lasts ten quiet minutes and placing an order with a payout service takes longer. It used to do nothing at all, the button silently returning, with nothing on screen to read (D80).",
      },
      {
        name: "Moving it to another account of theirs",
        when: "they hold something",
        says: [
          "Send it to another account of mine",
          "Exactly what you type leaves your account, to the last decimal",
          "How much leaves",
          "Your account holds",
          "Paste the account's identifier",
          "is in the other account now.",
        ],
      },
      {
        name: "Sending the network's own coin",
        when: "what is leaving is MON rather than a coin that moves on a signature",
        says: ["is the network's own coin, so nobody can send it for you"],
        gap: "this is the one movement Viky cannot make for somebody, and the screen says so instead of smoothing it over. An authorization is a feature of a token contract and the network's own coin is not one, so the person's own account sends it and the fee comes out of the same coin. What that fee actually was is said afterwards, with the figure, because it was their money that paid it.",
      },
      {
        name: "More than the account holds",
        when: "the amount typed is above the balance, or is not an amount the coin can carry",
        says: [],
        gap: "the refusal is written in src/send-amount.ts rather than on the screen, because the screen shows whichever one applies: the balance it does hold, six decimals at most, or an amount above zero. The button stays shut until the amount is one that can leave (D75).",
      },
      {
        name: "Choosing how to be paid",
        when: "they hold something",
        says: ["Ways to be paid", "What it buys:", "Read from"],
        gap: "two services are named, never one, because neither covers everybody: the euro one refuses Senegal and Ivory Coast outright, which is where the pilot's gifts are aimed, and the card one makes no card payout in France or the rest of the EEA (D77). Each carries where it pays, its source, and the date that source was read. Nobody is asked where they live, and no list of countries is held in the code, because both lists move.",
      },
      {
        name: "Neither one pays where they live",
        when: "the person reads both and neither fits",
        says: ["If neither of these pays where you live"],
      },
      {
        name: "Changing it for what that service buys",
        when: "a way out is chosen",
        says: ["How much to change", "See what you would get"],
        gap: "the amount is theirs to choose, like the amount that leaves. What comes back lands in their own account and nowhere else: the router never pays a payout service, because a transfer made by a contract is one no deposit detector is known to read (D76).",
      },
      {
        name: "Sending the changed money on to the service",
        when: "the money has been changed and an order is waiting for it",
        says: ["Place your order with "],
        gap: "the order is placed for what actually arrived, never for what was quoted, because a payout service expects exactly the quantity it was ordered for (D75). Viky does not read that figure back off their page: the person reads it, and the amount field takes it to the last decimal.",
      },
      {
        name: "The way out cannot run",
        when: "the router is not configured, or its table is not migrated",
        says: [],
        gap: "answered by the route rather than the screen, and always by name: NOT_CONFIGURED, never a shrug. A missing table used to arrive as an untyped error and reach the person as 'Something went wrong', which is what the first real attempt met (D80). The router is deployed and production is configured, but neither corridor has moved real money yet.",
      },
    ],
  },
];

/** Everything that is not a gift and not money, which is what keeps the rest of the product menu-free. */
export const ACCOUNT_SCREEN: readonly CatalogueScreen[] = [
  {
    screen: "Account",
    file: "app/account/page.tsx",
    states: [
      { name: "The one page off the journeys", when: "reached from the single link at the foot of any screen", says: ["Account", "Lost your phone?", "Privacy", "Legal", "For judges"] },

      {
        name: "Help",
        when: "somebody is stuck",
        says: [],
        gap: "there is no help beyond the lost-phone paragraph. What a person actually gets stuck on is not known yet, because nobody outside has used this.",
      },
    ],
  },
];

/** The one control that changes the whole product's appearance, and the only one of its kind. */
export const APPEARANCE_SCREEN: readonly CatalogueScreen[] = [
  {
    screen: "How it looks, on the Account page",
    file: "app/components/ThemeSwitch.tsx",
    states: [
      {
        name: "Following the phone",
        when: "nobody has chosen, which is where everyone starts",
        says: ["How it looks", "Day", "Night", "Follow my phone", "Viky follows your phone, so it turns dark when everything else does."],
      },
      {
        name: "A choice of their own",
        when: "somebody picked day or night",
        says: ["Viky stays this way, whatever your phone is set to."],
      },
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
