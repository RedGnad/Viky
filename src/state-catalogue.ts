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
        name: "Choosing what the gift is",
        when: "signed in, filling the form",
        says: ["Who is it for, and for what", "How much", "XP a day", "For how many days", "Their email or phone", "Their Duolingo name, if you know it"],
        gap: "no minimum and no suggested amount are offered yet. D62 settles them: a hard floor of 25 EUR and a suggested 50 EUR, with a line saying the recipient can be paid out from about $21 earned and that earnings add up across gifts.",
      },
      {
        name: "Not enough money yet, the rail step",
        when: "the account holds less than the gift is worth",
        says: [
          "Choose Buy, not sell.",
          "Pay in EUR, and type how much.",
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
        says: ["Waiting for your payment. Keep this page open.", "Copy my identifier again"],
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
        when: "the passkey session idled out before the gift was made",
        says: ["Your session closed. Sign in again to finish."],
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
    screen: "The gifts I have given",
    file: "app/components/MyGifts.tsx",
    states: [
      { name: "None yet", when: "this account is neither funder nor recipient of anything", says: [], gap: "the sentence is 'No gift yet.' and lives in the page, not here." },
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
    file: "app/components/GiftPage.tsx",
    states: [
      { name: "Days counted", when: "always, once counting has started", says: ["Days done", "Days missed"] },
      { name: "Earned", when: "the day was credited", says: [], gap: "D58 settles four day states: earned, returned to the funder by name, still catchable until a local time, and a day not yet judged. Only the totals exist today; the four states are not built." },
      { name: "Returned", when: "the day was drained and sent back", says: ["Came back to you"], gap: "the funder's name is not in it yet." },
      { name: "Still catchable", when: "yesterday is unearned and its window has not closed", says: [], gap: "the deadline is shown in the reader's own time elsewhere; the day itself has no state." },
      { name: "Not yet judged", when: "today, which nobody can have missed yet", says: [], gap: "the wording is the reviewer's to choose. 'Not yet read' speaks to nobody (D58)." },
    ],
  },
  {
    screen: "Their money",
    file: "app/components/CashOut.tsx",
    states: [
      { name: "What is theirs", when: "the gift has earned anything", says: ["Yours to take out"] },
      { name: "Moving it to another account of theirs", when: "they hold something", says: ["Send it to another account of mine", "Paste your other account's identifier", "Sent. It is in your other account now."] },
      {
        name: "Paying out to a card",
        when: "they want money rather than a balance",
        says: [],
        gap: "not built. It waits on ExitRouter being reviewed, deployed and wired. When it is: it needs a bank card and a one-off identity check at the partner, it cannot pay out below about $21, it is closed in the United Kingdom and in 59 countries, and it goes to a card in euros or dollars, never a bank account (D59, D60, D62).",
      },
      {
        name: "Below the payout floor",
        when: "they hold something, but less than the smallest order the rail takes",
        says: [],
        gap: "the refusal exists in the route (BELOW_PAYOUT_MINIMUM) and has no screen. It must say that earnings add up across gifts, so a small gift is waiting rather than lost.",
      },
    ],
  },
];

export const JOURNEYS: ReadonlyArray<{ who: string; screens: readonly CatalogueScreen[] }> = [
  { who: "The person who gives", screens: FUNDER_JOURNEY },
  { who: "The person the gift is for", screens: RECIPIENT_JOURNEY },
];

/** Every state, flattened, for counting and for the tests. */
export function everyState(): ReadonlyArray<{ who: string; screen: string; file: string; state: CatalogueState }> {
  return JOURNEYS.flatMap(({ who, screens }) =>
    screens.flatMap((s) => s.states.map((state) => ({ who, screen: s.screen, file: s.file, state }))),
  );
}
