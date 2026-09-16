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

export const SCENARIOS: Scenario[] = [
  // ---------------------------------------------------------------------------------------------------------
  // Before any account exists in this browser.
  {
    name: "recipient: the link, opened with no account at all",
    run: async (s) => {
      await s.reset();
      await s.api("GET", `/api/gift/${GIFT_ID}`, () => ({ status: 200, body: gift() }), "GET /api/gift/[id]");
      await s.goto(`/g/${GIFT_ID}?t=${CLAIM_TOKEN}`);
      await s.text("Create your account to open it. Nothing to install.");
      await s.shot("recipient", "link opened, no account", "Opened from the link the funder sent (a link, not a click from home), with no account on this device");
    },
  },
  {
    name: "funder: the account step, and making the account there",
    run: async (s) => {
      await s.reset();
      await s.goto("/");
      await s.click("Offer a gift");
      await s.text("Who is it for, and for what");
      await s.page.getByLabel("Their Duolingo name, if you know it").fill("ama_learns");
      await s.click(exact("Continue"));
      await s.text("How much, and for how long");
      await s.click(exact("Continue"));
      await s.text("Check this over");
      await s.click(exact("Continue"));
      await s.text("One account, and then you can pay");
      await s.shot("funder", "account step", "Not signed in, on the home page: Offer a gift, type a Duolingo name, Continue, Continue, Continue");
      await s.budgetSignIn();
      await s.click("Create my account");
      await s.text("Check this over", 40_000);
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
      await s.text("No gift yet.");
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
      await s.text(/Finished: 6 of 7 days done\./);
      await s.shot("home", "signed in, gifts finished", `${HOME}, with one gift received and one given, both finished, and $6.00 in the account`);
    },
  },

  // ---------------------------------------------------------------------------------------------------------
  // Funder.
  {
    name: "funder: who, how much, check, waiting, session closed, picked up",
    run: async (s) => {
      await s.reset();
      await s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine");
      await s.signIn();
      await s.click("Offer a gift");
      await s.text("Who is it for, and for what");
      await s.shot("funder", "who", `${HOME}: Offer a gift`);
      await s.page.getByLabel("Their Duolingo name, if you know it").fill("ama_learns");
      await s.click(exact("Continue"));
      await s.text("How much, and for how long");
      await s.shot("funder", "how much", `${HOME}: Offer a gift, type a Duolingo name, Continue`);
      await s.click(exact("Continue"));
      await s.text("Check this over");
      await s.shot("funder", "check", `${HOME}: Offer a gift, type a Duolingo name, Continue, Continue`);

      await s.click("Add money and give");
      await s.text("Nothing has arrived yet. This is what your gift will hold.");
      await s.shot("funder", "waiting for the payment", `${HOME}: Offer a gift, type a Duolingo name, Continue, Continue, Add money and give (the card service opens in a new tab, closed here)`);

      await s.click("Close it now");
      await s.text("Your session closed while you were paying");
      await s.shot("funder", "session closed while waiting", "On the waiting screen: Close it now (what ten quiet minutes do on their own)");

      await s.page.reload();
      await s.settle();
      await s.text("A gift is waiting for your payment");
      await s.shot("funder", "picked up after a reload, before signing in", "On the session-closed screen, reload the page");
      await s.click("Sign in to pick it up");
      await s.budgetSignIn();
      await s.page.getByRole("button", { name: /^Sign in$/ }).first().click();
      await s.text(/Welcome back\. Your \$25\.00 gift is still set up/, 40_000);
      await s.shot("funder", "picked up after a reload, signed in", "After the reload: Sign in to pick it up, Sign in");
      await s.forgetKept();
    },
  },
  {
    name: "funder: payment arrived",
    run: async (s) => {
      await s.reset({ AUSD: 0n, USDC: 0n, MON: 50_000_000_000_000_000_000n });
      await s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine");
      // Held unanswered, so the screen stays on "getting it ready" and nothing is ever signed or sent.
      await s.page.route(new URL("/api/fund/quote", s.base).href, () => undefined);
      await s.signIn();
      await s.click("Offer a gift");
      await s.page.getByLabel("Their Duolingo name, if you know it").fill("ama_learns");
      await s.click(exact("Continue"));
      await s.click(exact("Continue"));
      await s.text("A card payment has already arrived in your account");
      await s.shot("funder", "payment arrived", `${HOME}, with 50 MON arrived: Offer a gift, type a Duolingo name, Continue, Continue`);
      await s.click("Use the payment that arrived");
      await s.text("Your payment arrived. Getting it ready, a few seconds.", 30_000);
      await s.shot("funder", "payment arrived, getting it ready", "On that screen: Use the payment that arrived (the exchange quote is held unanswered, so nothing is signed or sent)");
      await s.forgetKept();
    },
  },
  {
    name: "funder: gift created with its link",
    run: async (s) => {
      await s.reset({ AUSD: 30_000_000n, USDC: 0n, MON: 0n });
      await s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine");
      await s.api(
        "POST",
        "/api/gift/create",
        () => ({ status: 200, body: { giftId: GIFT_ID, claimUrl: `${s.base}/g/${GIFT_ID}?t=${CLAIM_TOKEN}`, funded: true } }),
        "POST /api/gift/create",
      );
      await s.signIn();
      await s.click("Offer a gift");
      await s.page.getByLabel("Their Duolingo name, if you know it").fill("ama_learns");
      await s.click(exact("Continue"));
      await s.click(exact("Continue"));
      await s.click("Put it in their name");
      await s.text("It is in their name.", 40_000);
      await s.shot("funder", "gift created with the link", `${HOME}, with $30.00 in the account: Offer a gift, type a Duolingo name, Continue, Continue, Put it in their name`);
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
      await s.api("GET", `/api/gift/${GIFT_ID}`, () => ({ status: 200, body: current }), "GET /api/gift/[id]");
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
      await s.api("GET", `/api/gift/${GIFT_ID}`, () => ({ status: 200, body: current }), "GET /api/gift/[id]");
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
      await s.api("GET", `/api/gift/${GIFT_ID}`, () => ({ status: 200, body: gift({ ...EVERY_DAY, youAreTheRecipient: false }) }), "GET /api/gift/[id]");
      await s.signIn();
      await s.page.locator(`a[href="/g/${GIFT_ID}"]`).first().click();
      await s.settle();
      await s.text("This gift is being earned by the person you sent it to.", 30_000);
      await s.shot("donor", "a gift being earned", `${HOME}: the gift under "What I give"`);
    },
  },

  // ---------------------------------------------------------------------------------------------------------
  // The way out.
  ...withdrawal(),

  // ---------------------------------------------------------------------------------------------------------
  // Account, legal, judges.
  {
    name: "account, legal, privacy, judges",
    run: async (s) => {
      await s.reset();
      await s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine");
      await s.signIn();
      await s.click("Account, help and legal");
      await s.text("You are signed in.");
      await s.shot("account", "account, signed in", `${HOME}: Account, help and legal`);
      // These three are cards whose whole text is the link, so their accessible names are longer than the label
      // ("Legal who runs Viky and under what terms"). Found by where they lead instead.
      const card = (href: string) => s.page.locator(`a[href="${href}"]`).first();
      await card("/legal").click();
      await s.settle();
      await s.shot("account", "legal", `${HOME}: Account, help and legal, Legal`);
      await s.page.goBack();
      await s.settle();
      await card("/privacy").click();
      await s.settle();
      await s.shot("account", "privacy", `${HOME}: Account, help and legal, Privacy`);
      await s.page.goBack();
      await s.settle();
      await card("/judges").click();
      await s.settle();
      await s.shot("account", "judges, signed in", `${HOME}: Account, help and legal, For judges`);
    },
  },
];

/** The way out, with the figures of the first real conversion of 16 Sep where a figure was needed. */
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
  const before = { AUSD: 20_994_751n, USDC: 0n, MON: 0n };
  const after = { AUSD: 10_994_751n, USDC: 9_999_586n, MON: 0n };

  /** From home to a quote on screen, which every refusal after the quote starts from. */
  const toQuote = async (s: Session) => {
    await s.signIn();
    await s.click("Take it out");
    await s.click("Use Ramp");
    await s.page.getByLabel("How much to change").fill("10");
    await s.click("See what you would get");
  };
  const quoteOk = (s: Session) => s.api("POST", "/api/exit/quote", () => ({ status: 200, body: QUOTE }), "POST /api/exit/quote");
  const gifts = (s: Session) => s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine");

  return [
    {
      name: "withdrawal: the base screen with AUSD alone, and the choice of rail",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await s.signIn();
        await s.click("Take it out");
        await s.text("Ways to be paid");
        await s.shot("withdrawal", "base, AUSD alone", `${WAY}`);
        await s.shot("withdrawal", "choice of rail", `${WAY}, then scroll to "Ways to be paid"`, { scrollTo: "Ways to be paid" });
      },
    },
    {
      name: "withdrawal: the base screen with AUSD and USDC",
      run: async (s) => {
        await s.reset(after);
        await gifts(s);
        await s.signIn();
        await s.click("Take it out");
        await s.text("Also in your account:");
        await s.shot("withdrawal", "base, AUSD and USDC", `${WAY}, after a change has left USDC in the account`);
      },
    },
    {
      name: "withdrawal: change, quote, changed, identifier, exact amount, sent",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await quoteOk(s);
        await s.api("POST", "/api/exit/prepare", () => ({ status: 200, body: PREPARED }), "POST /api/exit/prepare");
        await s.api("POST", "/api/exit/relay", () => {
          s.holdings = after;
          return { status: 200, body: { paid: true, hash: HASH } };
        }, "POST /api/exit/relay");
        await s.api("POST", "/api/send", () => {
          s.holdings = { AUSD: after.AUSD, USDC: 0n, MON: 0n };
          return { status: 200, body: { sent: true, hash: HASH } };
        }, "POST /api/send");

        await s.signIn();
        await s.click("Take it out");
        await s.click("Use Ramp");
        await s.page.getByLabel("How much to change").waitFor({ state: "visible" });
        await s.shot("withdrawal", "change, before the quote", `${WAY}, Use Ramp`);

        await s.page.getByLabel("How much to change").fill("10");
        await s.click("See what you would get");
        await s.text("You would get at least $9.995586 of USDC on Monad.");
        await s.shot("withdrawal", "quote shown", `${WAY}, Use Ramp, type 10, See what you would get`);

        await s.click(/^Change \$/);
        await s.text("Your money is changed and it is in your own account.", 40_000);
        await s.shot("withdrawal", "changed", `${WAY}, Use Ramp, type 10, See what you would get, Change $10.00`);

        await s.click("Copy your identifier");
        await s.text("Copied and ready to paste.");
        await s.shot("withdrawal", "identifier step", "After the change: Copy your identifier", { scrollTo: "Copied and ready to paste." });

        await s.page.getByPlaceholder("Paste the identifier they give you").fill(DEPOSIT);
        await s.click("Send it to Ramp");
        await s.page.getByLabel("How much leaves").waitFor({ state: "visible" });
        await s.shot("withdrawal", "send with the exact amount", "After the change: paste the identifier Ramp gives, Send it to Ramp");

        await s.click(/^Send \$/);
        await s.text(/^Sent\./, 40_000);
        await s.shot("withdrawal", "sent", "On the send: Send $9.999586");
      },
    },
    {
      name: "withdrawal refusal: not enough",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await s.api("POST", "/api/exit/quote", () => ({ status: 409, body: { error: "That is more than you have.", code: "NOT_ENOUGH" } }), "POST /api/exit/quote");
        await toQuote(s);
        await s.text("That is more than you have.");
        await s.shot("withdrawal", "refused, not enough", `${WAY}, Use Ramp, type 10, See what you would get`, { scrollTo: "That is more than you have." });
      },
    },
    {
      name: "withdrawal refusal: the rate moved",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await quoteOk(s);
        await s.api("POST", "/api/exit/prepare", () => ({
          status: 409,
          body: { error: "The rate moved, so this would pay you less than you were shown. Nothing was taken. Ask for a new quote.", code: "RATE_MOVED" },
        }), "POST /api/exit/prepare");
        await toQuote(s);
        await s.click(/^Change \$/);
        await s.text(/The rate moved/);
        await s.shot("withdrawal", "refused, the rate moved", `${WAY}, Use Ramp, type 10, See what you would get, Change $10.00`, { scrollTo: /The rate moved/ });
      },
    },
    {
      name: "withdrawal refusal: the exchange refuses, three times",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await quoteOk(s);
        await s.api("POST", "/api/exit/prepare", () => ({ status: 200, body: PREPARED }), "POST /api/exit/prepare");
        await s.api("POST", "/api/exit/relay", () => ({
          status: 409,
          body: { error: "The exchange's price moved while you were signing. Nothing was taken. Viky will ask for a new one.", code: "QUOTE_STALE" },
        }), "POST /api/exit/relay");
        await toQuote(s);
        await s.click(/^Change \$/);
        await s.text(/The exchange's price moved/, 60_000);
        await s.shot("withdrawal", "refused, the exchange refused three times", `${WAY}, Use Ramp, type 10, See what you would get, Change $10.00 (asked again twice by itself)`, {
          scrollTo: /The exchange's price moved/,
        });
      },
    },
    {
      name: "withdrawal refusal: the session closed",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await quoteOk(s);
        await s.api("POST", "/api/exit/prepare", () => ({ status: 401, body: { error: "Account authentication is required", code: "SIGN_IN_REQUIRED" } }), "POST /api/exit/prepare");
        await toQuote(s);
        await s.click(/^Change \$/);
        await s.text("Your session closed while you were away", 30_000);
        await s.shot("withdrawal", "refused, the session closed", `${WAY}, Use Ramp, type 10, See what you would get, Change $10.00, with the server session expired`);
      },
    },
    {
      name: "withdrawal: the session closing on its own, seen from the way out",
      run: async (s) => {
        await s.reset(before);
        await gifts(s);
        await s.signIn();
        await s.click("Take it out");
        await s.click("Close it now");
        await s.settle();
        await s.shot("withdrawal", "session closed on its own", `${WAY}, Close it now (what ten quiet minutes do on their own)`);
      },
    },
    {
      name: "withdrawal: sending the network's own coin",
      run: async (s) => {
        await s.reset({ AUSD: 0n, USDC: 0n, MON: 138_436_143_573_911_778_147n });
        await gifts(s);
        // The home page offers "Take it out" only when the account holds AUSD, so somebody holding only the
        // network's own coin has no link to the way out at all. Reached the only way they could: by its address.
        await s.goto("/cash-out");
        await s.budgetSignIn();
        await s.page.getByRole("button", { name: /^Sign in$/ }).first().click();
        await s.text("Yours to take out", 30_000);
        await s.click(/Send it to another account of mine|Send MON to another account of mine/);
        await s.text("is the network's own coin, so nobody can send it for you");
        await s.shot(
          "withdrawal",
          "send MON, the network's own coin",
          "Typed the address /cash-out, because home offers no way out when the account holds no AUSD; Sign in, Send it to another account of mine",
        );
      },
    },
  ];
}
