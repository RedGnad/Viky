import type { Session } from "./capture-connected";

/**
 * The states themselves, in the order they run inside one browser.
 *
 * Order is not cosmetic. A recipient opening a link before having any account is only visible before an account
 * exists in that browser, so it runs first. The account is then made where a real funder makes it, on the funding
 * journey's account step. Everything after starts signed in.
 *
 * Every `path` is the way a person gets there from the home page, which is what captures.md records. The script
 * may take a shorter road to the same screen (signing in again on the account page after a direct navigation),
 * but what it photographs is reached by the clicks the path names.
 */

export type Scenario = { name: string; run: (s: Session) => Promise<void> };

const exact = (value: string) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\$]/g, "\\$&")}$`);

const TODAY = Math.floor(Date.now() / 86_400_000);
const GIFT_ID = "3";
const CLAIM_TOKEN = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
const ESCROW = "0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233";
const DEPOSIT = "0x000000000000000000000000000000000000dEaD";
const HASH = `0x${"7599b203".repeat(8)}`;
/** The gift's read, with or without the link's key: since 17 Sep the page sends the key so the two names come back. */
const GIFT_READ = new RegExp(`/api/gift/${GIFT_ID}(\\?.*)?$`);

/** A gift as GET /api/gift/[id] describes it, starting from nobody having opened it. */
function gift(over: Record<string, unknown> = {}) {
  return {
    giftId: GIFT_ID,
    youAreTheRecipient: false,
    catchUpSeconds: 108_000,
    escrow: ESCROW,
    goalAccount: { username: null, source: null, bound: false, code: null, codeExpiresAt: null },
    goalType: 1,
    dailyTarget: 10,
    durationDays: 7,
    amountDisplay: "$7.00",
    perDayDisplay: "$1.00",
    opened: false,
    connected: false,
    cancelled: false,
    finished: false,
    creditedDays: 0,
    missedDays: 0,
    daysLeft: 7,
    earned: "0",
    earnedDisplay: "$0.00",
    alreadyTheirsDisplay: "$0.00",
    returnedDisplay: "$0.00",
    todayDayIndex: 0,
    startDay: 0,
    endDay: 0,
    withdrawNonce: "0",
    recorded: [],
    ...over,
  };
}

/**
 * One gift whose day row holds every state the row can show at once: finished (earned or returned, which the row
 * does not tell apart), catchable, going back, today, and still to come. The catch-up window is widened to two
 * days so the catchable day stays catchable whatever the hour of the run; the real window is thirty hours.
 */
const EVERY_DAY = {
  opened: true,
  connected: true,
  goalAccount: { username: "ama_learns", source: "recipient", bound: true, code: null, codeExpiresAt: null },
  startDay: TODAY - 5,
  endDay: TODAY + 1,
  durationDays: 7,
  creditedDays: 2,
  missedDays: 1,
  catchUpSeconds: 172_800,
  todayDayIndex: 6,
  daysLeft: 1,
  earned: "2000000",
  earnedDisplay: "$2.00",
  alreadyTheirsDisplay: "$2.00",
  returnedDisplay: "$1.00",
};

/** A card as GET /api/gifts/mine describes it on the home page. */
function card(over: Record<string, unknown> = {}) {
  return {
    giftId: GIFT_ID,
    role: "recipient",
    goalType: 1,
    goalUsername: null,
    usernameSource: null,
    recipientName: "Léa",
    funderName: "Maman",
    catchUpSeconds: 108_000,
    fundedAt: Math.floor(Date.now() / 1000) - 5 * 86_400,
    startDay: TODAY - 5,
    endDay: TODAY + 1,
    amountDisplay: "$7.00",
    perDayDisplay: "$1.00",
    durationDays: 7,
    creditedDays: 2,
    missedDays: 1,
    opened: true,
    counting: true,
    finished: false,
    cancelled: false,
    earnedDisplay: "$2.00",
    theirsDisplay: "$2.00",
    returnedDisplay: "$1.00",
    ...over,
  };
}

const HOME = "Signed in, on the home page";

/** The way to the check, as a person clicks it. */
const TO_THE_CHECK = "Léa and Maman, Continue, A Duolingo lesson each day, Continue, ama_learns, Continue, Continue (the check)";

/** The public read of a Duolingo name, answered as Duolingo answers for a name that exists. */
async function nameCheck(s: Session): Promise<void> {
  await s.api("GET", /\/api\/duolingo\/profile\?/, () => ({ status: 200, body: { username: "ama_learns" } }), "GET /api/duolingo/profile");
}

/** From the first question to the check, with the terms every funder scenario uses. */
async function toTheCheck(s: Session): Promise<void> {
  await s.page.getByLabel("Their first name").fill("Léa");
  await s.page.getByLabel("Your name, as they know you").fill("Maman");
  await s.click(exact("Continue"));
  await s.page.getByLabel("A Duolingo lesson each day").check();
  await s.click(exact("Continue"));
  await s.page.getByLabel("Their Duolingo name, if you know it").fill("ama_learns");
  await s.click(exact("Continue"));
  await s.text("How much, and for how long?");
  await s.click(exact("Continue"));
  await s.text("Check this over");
}

export const SCENARIOS: Scenario[] = [
  // ---------------------------------------------------------------------------------------------------------
  // Before any account exists in this browser.
  {
    name: "recipient: the link, opened with no account at all",
    run: async (s) => {
      await s.reset();
      await s.api("GET", GIFT_READ, () => ({ status: 200, body: gift() }), "GET /api/gift/[id]");
      await s.goto(`/g/${GIFT_ID}?t=${CLAIM_TOKEN}`);
      await s.text("Create your account to open it. Nothing to install.");
      await s.shot("recipient", "link opened, no account", "Opened from the link the funder sent (a link, not a click from home), with no account on this device");
    },
  },
  {
    name: "funder: the account step, and making the account there",
    run: async (s) => {
      await s.reset();
      await nameCheck(s);
      await s.goto("/");
      await s.click("Offer a gift");
      await s.text("Who is it for?");
      await toTheCheck(s);
      await s.click(exact("Continue"));
      await s.text("One account, and then you can pay");
      await s.shot("funder", "account step", `Not signed in, on the home page: Offer a gift, ${TO_THE_CHECK}, Continue`);
      await s.budgetSignIn();
      await s.click("Create my account");
      await s.text("Check this over", 40_000);
      await s.forgetKept();
    },
  },

  // ---------------------------------------------------------------------------------------------------------
  // Home.
  {
    name: "home: no gift",
    run: async (s) => {
      await s.reset();
      await s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine");
      await s.signIn();
      await s.text("No gift yet. Offer one, or open a link someone sent you.");
      await s.shot("home", "signed in, no gift", `${HOME}`);
    },
  },
  {
    name: "home: gifts in progress",
    run: async (s) => {
      await s.reset({ AUSD: 2_000_000n, USDC: 0n, MON: 0n });
      await s.api(
        "GET",
        "/api/gifts/mine",
        () => ({
          status: 200,
          body: {
            gifts: [
              card(),
              card({ giftId: "4", role: "funder", amountDisplay: "$25.00", perDayDisplay: "$3.57", creditedDays: 3, missedDays: 0, earnedDisplay: "$10.71", theirsDisplay: "$10.71", returnedDisplay: "$0.00" }),
            ],
          },
        }),
        "GET /api/gifts/mine",
      );
      await s.signIn();
      await s.text("Counting: 2 of 7 days done, 1 missed.");
      await s.shot("home", "signed in, gifts in progress", `${HOME}, with one gift received and one given, both counting, and $2.00 in the account`);
    },
  },
  {
    name: "home: finished gifts",
    run: async (s) => {
      await s.reset({ AUSD: 6_000_000n, USDC: 0n, MON: 0n });
      await s.api(
        "GET",
        "/api/gifts/mine",
        () => ({
          status: 200,
          body: {
            gifts: [
              card({ finished: true, counting: false, creditedDays: 6, missedDays: 1, earnedDisplay: "$6.00", theirsDisplay: "$6.00", returnedDisplay: "$1.00" }),
              card({ giftId: "4", role: "funder", finished: true, counting: false, amountDisplay: "$25.00", perDayDisplay: "$3.57", creditedDays: 5, missedDays: 2, earnedDisplay: "$17.85", theirsDisplay: "$17.85", returnedDisplay: "$7.14" }),
            ],
          },
        }),
        "GET /api/gifts/mine",
      );
      await s.signIn();
      await s.text(/Finished: 6 of 7 days done, 1 missed\./);
      await s.shot("home", "signed in, gifts finished", `${HOME}, with one gift received and one given, both finished, and $6.00 in the account`);
    },
  },

  // ---------------------------------------------------------------------------------------------------------
  // Funder.
  {
    name: "funder: who, what, their name, how much, check, waiting, session closed, picked up",
    run: async (s) => {
      await s.reset();
      await s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine");
      await nameCheck(s);
      // The session closes by itself after thirty quiet minutes on a money screen; the page's clock is driven so
      // those minutes pass in a moment, which is the only honest way to photograph what they leave.
      await s.page.clock.install({ time: Date.now() });
      await s.signIn();
      await s.click("Offer a gift");
      await s.text("Who is it for?");
      await s.shot("funder", "who", `${HOME}: Offer a gift`);
      await s.page.getByLabel("Their first name").fill("Léa");
      await s.page.getByLabel("Your name, as they know you").fill("Maman");
      await s.click(exact("Continue"));
      await s.text("What will they do?");
      await s.shot("funder", "what will they do", `${HOME}: Offer a gift, Léa and Maman, Continue`);
      await s.page.getByLabel("A Duolingo lesson each day").check();
      await s.click(exact("Continue"));
      await s.page.getByLabel("Their Duolingo name, if you know it").fill("ama_learns");
      await s.text("Their Duolingo, and what counts as a day");
      await s.shot("funder", "their duolingo and what counts as a day", `${HOME}: Offer a gift, Léa and Maman, Continue, A Duolingo lesson each day, Continue, ama_learns typed`);
      await s.click(exact("Continue"));
      await s.text("How much, and for how long?");
      await s.shot("funder", "how much", `${HOME}: ${TO_THE_CHECK.replace(", Continue, Continue (the check)", "")}`);
      await s.click(exact("Continue"));
      await s.text("Check this over");
      await s.shot("funder", "check, paying by card", `${HOME}: Offer a gift, ${TO_THE_CHECK}`);

      await s.click("Pay 25 EUR by card");
      await s.text("Waiting for your 25 EUR payment");
      await s.shot("funder", "waiting for the payment", `${HOME}: Offer a gift, ${TO_THE_CHECK}, Pay 25 EUR by card (the card service opens in a new tab, closed here)`);

      await s.page.clock.runFor(31 * 60_000);
      await s.text("Your session closed while you were paying");
      await s.shot("funder", "session closed while waiting", "On the waiting screen, thirty-one quiet minutes later (the page's clock driven forward)");

      await s.page.reload();
      await s.settle();
      await s.text("A gift is waiting for your payment");
      await s.shot("funder", "picked up after a reload, before signing in", "On the session-closed screen, reload the page");
      await s.budgetSignIn();
      await s.click("Sign in to pick it up");
      await s.text("Waiting for your 25 EUR payment", 40_000);
      await s.shot("funder", "picked up after a reload, signed in", "After the reload: Sign in to pick it up");
      await s.forgetKept();
    },
  },
  {
    name: "funder refusals: names, their duolingo name, the days",
    run: async (s) => {
      await s.reset();
      await s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine");
      await s.api("GET", /\/api\/duolingo\/profile\?/, () => ({ status: 404, body: { error: "No public Duolingo profile goes by that name.", code: "NO_SUCH_PROFILE" } }), "GET /api/duolingo/profile, no such name");
      await s.signIn();
      await s.click("Offer a gift");
      await s.page.getByLabel("Their first name").focus();
      await s.page.getByLabel("Your name, as they know you").focus();
      await s.page.getByLabel("Their first name").focus();
      await s.settle();
      await s.text("Write their first name.");
      await s.shot("funder", "who, both names refused", `${HOME}: Offer a gift, into each name field and out again, empty`);
      await s.page.getByLabel("Their first name").fill("Léa");
      await s.page.getByLabel("Your name, as they know you").fill("Maman");
      await s.click(exact("Continue"));
      await s.page.getByLabel("A Duolingo lesson each day").check();
      await s.click(exact("Continue"));
      await s.page.getByLabel("Their Duolingo name, if you know it").fill("ama learns!");
      await s.settle();
      await s.text(/A Duolingo name has letters/);
      await s.shot("funder", "their duolingo name, the wrong shape", `${HOME}: Offer a gift, Léa and Maman, a Duolingo lesson each day, "ama learns!" typed`);
      await s.page.getByLabel("Their Duolingo name, if you know it").fill("nobody_here_at_all");
      await s.click(exact("Continue"));
      await s.text(/No public Duolingo profile goes by that name/);
      await s.shot("funder", "their duolingo name, nobody by that name", `${HOME}: Offer a gift, Léa and Maman, a Duolingo lesson each day, "nobody_here_at_all", Continue`);
      await s.page.getByLabel("Their Duolingo name, if you know it").fill("");
      await s.click(exact("Continue"));
      await s.page.getByLabel("For how many days").fill("6");
      await s.settle();
      await s.text("7 days at least.");
      await s.shot("funder", "how much, too few days", `${HOME}: Offer a gift, Léa and Maman, a Duolingo lesson each day, no name, Continue, 6 days typed`);
      await s.forgetKept();
    },
  },
  {
    name: "funder: payment arrived",
    run: async (s) => {
      await s.reset({ AUSD: 0n, USDC: 0n, MON: 50_000_000_000_000_000_000n });
      await s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine");
      await nameCheck(s);
      // The first quote values the payment on the check; the second, the conversion itself, is held unanswered, so the
      // screen stays on "getting it ready" and nothing is ever signed or sent.
      let quotes = 0;
      await s.page.route(new URL("/api/fund/quote", s.base).href, async (route) => {
        quotes += 1;
        if (quotes > 1) return;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ output: "28510000", minOut: "28400000", to: DEPOSIT, data: "0x", value: "0" }) });
      });
      await s.signIn();
      await s.click("Offer a gift");
      await toTheCheck(s);
      await s.text("A card payment is in your account: about $28.51.");
      await s.shot("funder", "check, a payment arrived", `${HOME}, with 50 MON arrived: Offer a gift, ${TO_THE_CHECK} (the value is the exchange's quote, replaced)`);
      await s.click("Use the payment that arrived");
      await s.text("Getting it ready, a few seconds.", 30_000);
      await s.shot("funder", "payment arrived, getting it ready", "On that screen: Use the payment that arrived (the exchange quote is held unanswered, so nothing is signed or sent)");
      await s.forgetKept();
    },
  },
  {
    name: "funder: enough in the account, gift created with its link",
    run: async (s) => {
      await s.reset({ AUSD: 30_000_000n, USDC: 0n, MON: 0n });
      await s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine");
      await nameCheck(s);
      await s.api(
        "POST",
        "/api/gift/create",
        () => ({ status: 200, body: { giftId: GIFT_ID, claimUrl: `${s.base}/g/${GIFT_ID}?t=${CLAIM_TOKEN}`, funded: true } }),
        "POST /api/gift/create",
      );
      await s.signIn();
      await s.click("Offer a gift");
      await toTheCheck(s);
      await s.text("It comes from your account, which holds $30.00.");
      await s.shot("funder", "check, enough in the account", `${HOME}, with $30.00 in the account: Offer a gift, ${TO_THE_CHECK}`);
      await s.click("Put $25.00 in Léa's name");
      await s.text("$25.00 is in Léa's name.", 40_000);
      await s.shot("funder", "gift created with the link", `${HOME}, with $30.00 in the account: Offer a gift, ${TO_THE_CHECK}, Put $25.00 in Léa's name`);
      await s.forgetKept();
    },
  },

  // ---------------------------------------------------------------------------------------------------------
  // Recipient, from the link to counting.
  {
    name: "recipient: signed in on the link, claim, name Duolingo, code, counting",
    run: async (s) => {
      await s.reset();
      let current = gift();
      await s.api("GET", GIFT_READ, () => ({ status: 200, body: current }), "GET /api/gift/[id]");
      await s.api("POST", "/api/gift/claim", () => {
        current = gift({ opened: true, youAreTheRecipient: true });
        return { status: 200, body: { giftId: GIFT_ID, opened: true } };
      }, "POST /api/gift/claim");
      await s.api("POST", `/api/gift/${GIFT_ID}/account`, () => {
        current = gift({ opened: true, youAreTheRecipient: true, goalAccount: { username: "ama_learns", source: "recipient", bound: false, code: "K7PX2M", codeExpiresAt: new Date(Date.now() + 3_600_000).toISOString() } });
        return { status: 200, body: { giftId: GIFT_ID, username: "ama_learns", code: "K7PX2M", expiresAt: new Date(Date.now() + 3_600_000).toISOString() } };
      }, "POST /api/gift/[id]/account");
      await s.api("POST", `/api/gift/${GIFT_ID}/bind`, () => {
        current = gift({ opened: true, connected: true, youAreTheRecipient: true, startDay: TODAY + 1, endDay: TODAY + 7, goalAccount: { username: "ama_learns", source: "recipient", bound: true, code: null, codeExpiresAt: null } });
        return { status: 200, body: { kind: "bound", giftId: GIFT_ID, totalXp: 1200, hash: HASH } };
      }, "POST /api/gift/[id]/bind");

      await s.goto(`/g/${GIFT_ID}?t=${CLAIM_TOKEN}`);
      await s.budgetSignIn();
      await s.page.getByRole("button", { name: /^Sign in$/ }).first().click();
      await s.page.getByRole("button", { name: "Open my gift" }).waitFor({ state: "visible", timeout: 40_000 });
      await s.settle();
      await s.shot("recipient", "link opened, signed in, before opening", "Opened from the link the funder sent, with an account already on this device: Sign in");

      await s.click("Open my gift");
      await s.page.getByLabel("Your Duolingo username").waitFor({ state: "visible", timeout: 30_000 });
      await s.shot("recipient", "name their Duolingo", "On the link, signed in: Open my gift");

      await s.page.getByLabel("Your Duolingo username").fill("ama_learns");
      await s.click(exact("Continue"));
      await s.text("Prove ama_learns is yours");
      await s.shot("recipient", "code to add", "After opening it: type the Duolingo username, Continue");

      await s.click("I added it");
      await s.text("Counting starts tomorrow.", 30_000);
      await s.shot("recipient", "counting started", "On the code screen: I added it");
    },
  },
  {
    name: "recipient: every day state, then taking what is earned",
    run: async (s) => {
      await s.reset();
      let current = gift({ ...EVERY_DAY, youAreTheRecipient: true });
      await s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [card()] } }), "GET /api/gifts/mine");
      await s.api("GET", GIFT_READ, () => ({ status: 200, body: current }), "GET /api/gift/[id]");
      await s.api("POST", "/api/gift/withdraw", () => {
        current = gift({ ...EVERY_DAY, youAreTheRecipient: true, earned: "0", earnedDisplay: "$0.00" });
        return { status: 200, body: { giftId: GIFT_ID, sent: true, amount: "2000000", hash: HASH } };
      }, "POST /api/gift/withdraw");
      await s.signIn();
      await s.page.locator(`a[href="/g/${GIFT_ID}"]`).first().click();
      await s.settle();
      await s.page.getByRole("list", { name: "Every day of this gift" }).waitFor({ state: "visible", timeout: 30_000 });
      // "Every day of this gift" is the list's accessible name, not text on the screen, so it is found by its role.
      await s.shot("recipient", "every day state", `${HOME}: the gift under "What I receive"`, {
        scrollTo: s.page.getByRole("list", { name: "Every day of this gift" }),
      });
      await s.page.getByRole("button", { name: "Take $2.00" }).waitFor({ state: "visible" });
      await s.shot("recipient", "take what is earned", `${HOME}: the gift under "What I receive"`, { scrollTo: /^Take \$2\.00$/ });
      await s.click("Take $2.00");
      await s.text("$2.00 is now in your account.", 30_000);
      await s.shot("recipient", "earned money taken", 'On the gift: Take $2.00', { scrollTo: "$2.00 is now in your account." });
    },
  },

  // ---------------------------------------------------------------------------------------------------------
  // The funder's own view of a gift.
  {
    name: "donor page",
    run: async (s) => {
      await s.reset();
      await s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [card({ role: "funder" })] } }), "GET /api/gifts/mine");
      await s.api("GET", GIFT_READ, () => ({ status: 200, body: gift({ ...EVERY_DAY, youAreTheRecipient: false }) }), "GET /api/gift/[id]");
      await s.signIn();
      await s.page.locator(`a[href="/g/${GIFT_ID}"]`).first().click();
      await s.settle();
      await s.text("This gift is being earned by the person you sent it to.", 30_000);
      await s.shot("donor", "a gift being earned", `${HOME}: the gift under "What's moving"`);
    },
  },

  // ---------------------------------------------------------------------------------------------------------
  // The way out.
  ...withdrawal(),

  // ---------------------------------------------------------------------------------------------------------
  // Account, legal, judges.
  {
    name: "gifts and me: the two other destinations, then help, legal, privacy, judges",
    run: async (s) => {
      await s.reset({ AUSD: 2_000_000n, USDC: 0n, MON: 0n });
      await s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [card(), card({ giftId: "4", role: "funder", amountDisplay: "$25.00", perDayDisplay: "$3.57", creditedDays: 3, missedDays: 0, earnedDisplay: "$10.71", theirsDisplay: "$10.71", returnedDisplay: "$0.00", goalUsername: "ama_learns" })] } }), "GET /api/gifts/mine");
      await s.api("GET", "/api/account/preferences", () => ({ status: 200, body: { displayCurrency: null } }), "GET /api/account/preferences");
      await s.signIn();
      await s.page.getByRole("link", { name: "Gifts", exact: true }).first().click();
      await s.settle();
      await s.text(exact("Received"));
      await s.shot("gifts", "gifts, given and received", `${HOME}: Gifts in the bar`);
      await s.page.getByRole("link", { name: "Me", exact: true }).first().click();
      await s.settle();
      await s.text(/Signed in on this device until/);
      await s.shot("me", "me, signed in", `${HOME}: Me in the bar`);
      await s.page.getByText("Need your code for a payout service?").first().click();
      await s.settle();
      await s.shot("me", "me, the code unfolded", "On Me: Need your code for a payout service?", { scrollTo: "Copy your code" });
      const link = (href: string) => s.page.locator(`a[href="${href}"]`).first();
      for (const [href, state] of [["/help", "help"], ["/legal", "legal"], ["/privacy", "privacy"], ["/judges", "judges, signed in"]] as const) {
        await link(href).click();
        await s.settle();
        await s.shot("me", state, `${HOME}: Me, ${state.split(",")[0]}`);
        await s.page.goBack();
        await s.settle();
      }
    },
  },
  {
    name: "signed out: home, me and gifts",
    run: async (s) => {
      await s.reset();
      await s.goto("/");
      await s.text("The money is already in their name");
      await s.shot("home", "signed out", "The door with no session: the promise, the two ways in, how it works, and the two documents the law asks for");
      await s.goto("/me");
      await s.text("Create my account");
      await s.shot("me", "me, signed out", "The address /me with no session");
      await s.goto("/gifts");
      await s.text("Sign in to see your gifts.");
      await s.shot("gifts", "gifts, signed out", "The address /gifts with no session");
    },
  },
];

/** The way out, rebuilt on flows W1 to W13, with the figures of the first real conversion of 16 Sep where a figure was needed. */
function withdrawal(): Scenario[] {
  const WAY = `${HOME}, with money in the account: Take it out`;
  const QUOTE = {
    shown: "$9.995586",
    sells: "USDC on Monad",
    name: "Ramp",
    payout: { currency: "EUR", worth: 8.66, smallest: 6.51, largest: 14737.99 },
    ticket: "capture-ticket",
  };
  const PREPARED = {
    id: "0123456789abcdef01234567",
    shown: "$9.995586",
    signed: false,
    authorization: {
      to: "0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223",
      value: "10000000",
      validAfter: "0",
      validBefore: String(Math.floor(Date.now() / 1000) + 900),
      nonce: `0x${"11".repeat(32)}`,
    },
  };
  /** The ECB's rates of 16 Sep 2026, as the rates route answers them, read at the time of the run. */
  const RATES = { rates: { date: "2026-09-16", usdPerEur: 1.1537, eurPerUsd: 1 / 1.1537, xofPerUsd: 655.957 / 1.1537, readAtMs: Date.now() } };
  const before = { AUSD: 20_994_751n, USDC: 0n, MON: 0n };
  const after = { AUSD: 10_994_751n, USDC: 9_999_586n, MON: 0n };

  const gifts = (s: Session) => s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine");
  const rates = (s: Session) => s.api("GET", "/api/rates", () => ({ status: 200, body: RATES }), "GET /api/rates");
  const currency = (s: Session, chosen: "EUR" | "XOF" | null) =>
    s.api("GET", "/api/account/preferences", () => ({ status: 200, body: { displayCurrency: chosen } }), "GET /api/account/preferences");
  const quoteOk = (s: Session) => s.api("POST", "/api/exit/quote", () => ({ status: 200, body: QUOTE }), "POST /api/exit/quote");
  /** From home to the review of step 1, which every refusal after the price starts from. */
  const toReview = async (s: Session) => {
    await s.signIn();
    await s.click("Take it out");
    await s.click("Send to my bank");
    await s.page.getByLabel("How much do you want to send to your bank?").fill("10");
    await s.click("See what you will get");
    await s.text("You will get at least 9.99 to send.");
  };

  return [
    {
      name: "withdrawal: the base screen, dollars",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await rates(s);
        await currency(s, null);
        await s.signIn();
        await s.click("Take it out");
        await s.text("Send to my bank");
        await s.shot("withdrawal", "base", `${WAY}`);
      },
    },
    {
      name: "withdrawal: the base screen, read in euros",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await rates(s);
        await currency(s, "EUR");
        await s.signIn();
        await s.click("Take it out");
        await s.text(/rate of 16 Sep\b/);
        await s.shot("withdrawal", "base, read in euros", `${WAY}, on an account whose display currency is the euro`);
      },
    },
    {
      name: "withdrawal: step 1, the review, ready with steps 2 and 3, copied, pasted, the review before sending, sent",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await rates(s);
        await currency(s, null);
        await quoteOk(s);
        await s.api("POST", "/api/exit/prepare", () => ({ status: 200, body: PREPARED }), "POST /api/exit/prepare");
        await s.api("POST", "/api/exit/relay", () => {
          s.holdings = after;
          return { status: 200, body: { paid: true, hash: HASH } };
        }, "POST /api/exit/relay");
        await s.api("POST", "/api/send", () => {
          s.holdings = { AUSD: after.AUSD, USDC: 0n, MON: 0n };
          return { status: 200, body: { sent: true, reference: "7599b203", sentAtMs: Date.now() } };
        }, "POST /api/send");

        await s.signIn();
        await s.click("Take it out");
        await s.click("Send to my bank");
        await s.page.getByLabel("How much do you want to send to your bank?").waitFor({ state: "visible" });
        await s.shot("withdrawal", "step 1, how much", `${WAY}, Send to my bank`);

        await s.page.getByLabel("How much do you want to send to your bank?").fill("10");
        await s.click("See what you will get");
        await s.text("You will get at least 9.99 to send.");
        await s.shot("withdrawal", "step 1, the review", `${WAY}, Send to my bank, type 10, See what you will get`);

        await s.click("Get 9.99 ready");
        await s.text("Ready: 9.99", 40_000);
        await s.shot("withdrawal", "ready, steps 2 and 3", `${WAY}, Send to my bank, type 10, See what you will get, Get 9.99 ready`);

        await s.click(exact("Copy"));
        await s.text(exact("Copied"));
        await s.shot("withdrawal", "the code copied", "On the ready screen: Copy", { scrollTo: /^Copied$/ });

        await s.page.getByLabel("Paste the code Ramp gives you to send to").fill(DEPOSIT);
        await s.shot("withdrawal", "step 3, the code pasted", "On the ready screen: paste the code Ramp gives", { scrollTo: "Step 3 of 3: Send it" });

        await s.click("Send 9.99 to Ramp");
        await s.text("Send 9.99 to Ramp. This cannot be undone.");
        await s.shot("withdrawal", "the review before sending", "After pasting: Send 9.99 to Ramp", { scrollTo: "This cannot be undone." });

        await s.click(exact("Send"));
        await s.text(/^Sent 9\.99 to Ramp on /, 40_000);
        await s.shot("withdrawal", "sent", "On the review: Send");
      },
    },
    {
      name: "withdrawal: reloaded with 9.99 ready, resumed at step 2",
      run: async (s) => {
        await s.reset(after);
        await gifts(s);
        await rates(s);
        await currency(s, null);
        await s.signIn();
        await s.text("9.99 of it is ready to send to Ramp.");
        await s.shot("withdrawal", "home with 9.99 ready", `${HOME}, after a change left 9.99 ready for Ramp`);
        await s.click("Take it out");
        await s.text("Ready: 9.99");
        await s.shot("withdrawal", "resumed at step 2", `${WAY}, after a change left 9.99 ready: the steps open on the second`);
      },
    },
    {
      name: "withdrawal: the card branch, resumed at step 2",
      run: async (s) => {
        // Above the eleven the account cannot spend (the reserve), 138.436143573911778147 of the chain's own coin.
        await s.reset({ AUSD: 0n, USDC: 0n, MON: 11_000_000_000_000_000_000n + 138_436_143_573_911_778_147n });
        await gifts(s);
        await rates(s);
        await currency(s, "XOF");
        // What 138.43 is worth, as the price answers it: about $3.24 at the rate measured on 14 Sep 2026.
        await s.api("POST", "/api/fund/quote", () => ({ status: 200, body: { output: "3240000", minOut: "3230000", to: ESCROW, data: "0x", value: "0" } }), "POST /api/fund/quote");
        await s.signIn();
        await s.click("Take it out");
        await s.text("Ready: 138.43");
        await s.text(/about \$3\.24/);
        await s.shot("withdrawal", "the card branch, ready", `${WAY}, with only what the card service buys in the account, on an account whose display currency is the CFA franc`);
      },
    },
    {
      name: "withdrawal refusal: more than the account holds",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await rates(s);
        await currency(s, null);
        await s.signIn();
        await s.click("Take it out");
        await s.click("Send to my bank");
        await s.page.getByLabel("How much do you want to send to your bank?").fill("25");
        await s.text("That is more than your $20.99.");
        await s.shot("withdrawal", "refused, more than the account holds", `${WAY}, Send to my bank, type 25`, { scrollTo: "That is more than your $20.99." });
      },
    },
    {
      name: "withdrawal refusal: the price moved",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await rates(s);
        await currency(s, null);
        await quoteOk(s);
        await s.api("POST", "/api/exit/prepare", () => ({ status: 409, body: { error: "The rate moved, so this would have paid you less than you were shown. Nothing was taken.", code: "RATE_MOVED" } }), "POST /api/exit/prepare");
        await toReview(s);
        await s.click("Get 9.99 ready");
        await s.text("The price changed before you confirmed. Nothing was taken.");
        await s.shot("withdrawal", "refused, the price moved", `${WAY}, Send to my bank, type 10, See what you will get, Get 9.99 ready`, { scrollTo: "See the new price" });
      },
    },
    {
      name: "withdrawal refusal: the price kept changing, three times",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await rates(s);
        await currency(s, null);
        await quoteOk(s);
        await s.api("POST", "/api/exit/prepare", () => ({ status: 200, body: PREPARED }), "POST /api/exit/prepare");
        await s.api("POST", "/api/exit/relay", () => ({
          status: 409,
          body: { error: "The exchange's price moved while you were signing. Nothing was taken. Viky will ask for a new one.", code: "QUOTE_STALE" },
        }), "POST /api/exit/relay");
        await toReview(s);
        await s.click("Get 9.99 ready");
        await s.text("The price kept changing and Viky stopped after three tries.", 60_000);
        await s.shot("withdrawal", "refused, the price kept changing", `${WAY}, Send to my bank, type 10, See what you will get, Get 9.99 ready (asked again twice by itself)`, { scrollTo: /^Try again$/ });
      },
    },
    {
      name: "withdrawal refusal: the session closed",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await rates(s);
        await currency(s, null);
        await quoteOk(s);
        await s.api("POST", "/api/exit/prepare", () => ({ status: 401, body: { error: "Account authentication is required", code: "SIGN_IN_REQUIRED" } }), "POST /api/exit/prepare");
        await toReview(s);
        await s.click("Get 9.99 ready");
        await s.text("Your session closed while you were away", 30_000);
        await s.shot("withdrawal", "the session closed", `${WAY}, Send to my bank, type 10, See what you will get, Get 9.99 ready, with the server session expired`);
      },
    },
    {
      name: "withdrawal: the session closed on its own, with 9.99 ready",
      run: async (s) => {
        await s.reset(after);
        await gifts(s);
        await rates(s);
        await currency(s, null);
        // A direct navigation opens the page with no signing session, which is what a session closing on its own leaves.
        await s.goto("/cash-out");
        await s.text("Sign in to see your money");
        await s.shot("withdrawal", "session closed on its own", "The way out opened with no session (what thirty quiet minutes leave), with 9.99 ready");
      },
    },
    {
      name: "withdrawal: to another Viky account of mine",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await rates(s);
        await currency(s, null);
        await s.signIn();
        await s.click("Take it out");
        await s.click("Send to another Viky account of mine");
        await s.page.getByLabel("Paste that account's code").waitFor({ state: "visible" });
        await s.shot("withdrawal", "to another Viky account of mine", `${WAY}, Send to another Viky account of mine`);
      },
    },
  ];
}
