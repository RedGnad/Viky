import { expect, test, type Page } from "@playwright/test";
import { answerTheChain, json, makeAnAccount, profile, shot as capture, sizesFor, type Profile } from "./gift-kit";

/**
 * Your mobile money, the third way out (the founder, 2 Oct 2026), as a person in Senegal meets it: the card first, the
 * operator, the number, the name, the figure on the number with what stays in the account, one button; the wait with
 * the time Switch publishes; arrived, or failed and the money coming back.
 *
 * The account is a virtual passkey; the chain and every route are answered here, Switch included, and nothing is sent
 * anywhere. What is checked is the screen: what it says, what it sends to the routes, and what it never shows.
 *
 * VIKY_MOBILE_CAPTURES=<folder> also photographs each state, at 390 by 844 and at 1440 by 900; with
 * VIKY_MOBILE_PHONE_ONLY=1, at 390 alone.
 */
const SHOTS = process.env.VIKY_MOBILE_CAPTURES;
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);
const RATES = { date: "2026-10-02", usdPerEur: 1.1225, eurPerUsd: 1 / 1.1225, xofPerUsd: 655.957 / 1.1225, eurPer: { USD: 1.1225, EUR: 1 }, readAtMs: Date.now() };
const REFERENCE = "61f9a35a-e535-4f04-ba50-3058b4c856c4";
const EXIT_ROUTER = "0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223";

const OFFER = {
  offered: true,
  country: "SN",
  currency: "XOF",
  settlement: "5-10 minutes",
  minimumUnits: "10000000",
  maximumUnits: "100000000000",
  // The smallest payout as a quote prices it, with the margin: $10.00 at 589.21703 francs, two thousandths over.
  leastLocal: 5904,
  operators: [
    { code: "ORANGE", name: "Orange" },
    { code: "WAVE", name: "Wave" },
  ],
  numberRule: "^[0-9]{9,40}$",
  nameRule: "^(?=.*[A-Za-z])[A-Za-z0-9\\s\\-'&().,;]{2,100}$",
  rate: 587.1333,
  mostUnits: "200000000",
};

/** Switch's quotes of 3 Oct 2026, one rate both ways, and an exchange that keeps two thousandths of what it takes. */
const FRANCS = 589.21703;
const afterTheExchange = (units: bigint) => (units * 998n) / 1000n;
const EXIT = `0x${"e1".repeat(32)}`;

type World = {
  ending?: "arrived" | "failed";
  mostUnits?: string;
  held?: bigint;
  /** Switch does not answer the first quotes for an amount. */
  quotesRefused?: number;
  /** The payout cannot be opened the first times it is asked: the cut after the money was changed. */
  startsRefused?: number;
  /** The payout the way out finds again when it is opened. */
  latest?: Record<string, unknown> | null;
  /** The day's rates name the franc, so the account reads in it; without it the franc has no rate and the dollar is read. */
  readsInFrancs?: boolean;
};

type Asked = { started: () => unknown; starts: () => number; sent: () => unknown; priced: () => unknown; changes: () => number; refusedForMore: () => number; seen: () => string[]; holdings: { ausd: bigint; usdc: bigint; mon: bigint } };

const followed = (phase: string) => ({ reference: REFERENCE, phase, status: phase === "arrived" ? "COMPLETED" : phase === "failed" ? "FAILED" : "PROCESSING", network: "ORANGE", operator: "Orange", settlement: "5-10 minutes", numberEnd: "4567", local: 8802.4, currency: "XOF", units: "14938469", country: "SN" });

/**
 * A person in Senegal, with every route answered here as the server answers it. The exchange refuses to be asked for
 * more than the account holds, as its route does: the stand-in of before answered anything, which is how an amount
 * the balance could not pay was photographed as priced.
 */
async function inSenegal(device: Profile, world: World = {}): Promise<Asked> {
  const { page, context } = device;
  const ending = world.ending ?? "arrived";
  // What the account holds, changed as the money moves, so every screen shows what is left.
  const holdings = { ausd: world.held ?? 15_000_000n, usdc: 0n, mon: 0n };
  await answerTheChain(context, holdings);
  await page.route("**/api/gifts/earned", (route) => route.fulfill(json({ gifts: [] })));
  // The franc at its fixed rate to the euro, where the account is to read in it.
  const eurPer = world.readsInFrancs ? { ...RATES.eurPer, XOF: 655.957 } : RATES.eurPer;
  await page.route("**/api/rates", (route) => route.fulfill(json({ rates: { ...RATES, eurPer, readAtMs: Date.now() }, currencies: ["USD", "EUR", "XOF"] })));
  await page.route("**/api/account/preferences", (route) => route.fulfill(json({ country: "sn", displayCurrency: "XOF" })));
  await page.route("**/api/rails/where**", (route) =>
    route.fulfill(json({ country: "sn", ask: false, fromConnection: "sn", fromDevice: "sn", waysOut: { Ramp: "does-not", Mercuryo: "does-not" }, waysIn: {}, card: { offered: false, country: "sn" }, out: { bank: null, cardSmallest: null } })),
  );
  await page.route("**/api/mobile-money/offer**", (route) => route.fulfill(json({ ...OFFER, mostUnits: world.mostUnits ?? OFFER.mostUnits })));
  // Money changed and not yet sent on: read by the server from what it wrote down, said here as the server says it.
  let changed: { exitTx: string; units: string; local: number; currency: string } | null = null;
  // What the account can send now, as the server works it out: what the exchange guarantees for all of the balance,
  // less the margin, at Switch's quote, cut down to the franc.
  await page.route("**/api/mobile-money/payable**", (route) => {
    const floor = afterTheExchange(holdings.ausd);
    const payable = floor - (floor * 2n) / 1000n;
    const mostLocal = payable >= 10_000_000n ? Math.floor((Number(payable) / 1e6) * FRANCS) : Math.min(Math.floor((Number(payable) / 1e6) * OFFER.rate), OFFER.leastLocal - 1);
    return route.fulfill(json({ leastLocal: OFFER.leastLocal, mostLocal, by: "balance", spendUnits: holdings.ausd.toString(), changed }));
  });
  let refusedForMore = 0;
  await page.route("**/api/exit/quote", (route) => {
    const asked = BigInt((JSON.parse(route.request().postData() ?? "{}") as { amount?: string }).amount ?? "0");
    if (asked > holdings.ausd) {
      refusedForMore += 1;
      return route.fulfill(json({ error: "That is more than you have.", code: "NOT_ENOUGH" }, 409));
    }
    return route.fulfill(json({ shown: (Number(afterTheExchange(asked)) / 1e6).toFixed(6), sells: "USDC", name: "Ramp", ticket: `ticket-${asked}` }));
  });
  let quoted: unknown = null;
  let quotes = 0;
  await page.route("**/api/mobile-money/quote", (route) => {
    quoted = JSON.parse(route.request().postData() ?? "{}");
    quotes += 1;
    if (quotes <= (world.quotesRefused ?? 0)) return route.fulfill(json({ error: "The mobile money service did not answer just now. Nothing was taken: try again in a minute.", code: "PAYOUT_SERVICE_SILENT" }, 503));
    const local = (quoted as { local?: number }).local ?? 0;
    // Switch's quote for exactly the francs typed: the dollars it takes, at its own rate.
    return route.fulfill(json({ local, currency: "XOF", sourceUnits: String(Math.ceil((local / FRANCS) * 1e6)), at: "2026-10-03T10:15:00.000Z" }));
  });
  let changes = 0;
  let made = 0n;
  await page.route("**/api/exit/prepare", (route) => {
    const ticket = String((JSON.parse(route.request().postData() ?? "{}") as { ticket?: string }).ticket ?? "");
    const value = BigInt(ticket.replace("ticket-", "") || "0");
    made = afterTheExchange(value);
    return route.fulfill(json({ id: "terms-1", shown: (Number(made) / 1e6).toFixed(6), signed: false, authorization: { to: EXIT_ROUTER, value: value.toString(), validAfter: "0", validBefore: String(Math.floor(Date.now() / 1000) + 600), nonce: `0x${"11".repeat(32)}` } }));
  });
  await page.route("**/api/exit/relay", (route) => {
    // The money is changed: it leaves the balance's own coin and comes back in the one Switch takes.
    changes += 1;
    holdings.ausd -= (made * 1000n) / 998n;
    holdings.usdc += made;
    changed = { exitTx: EXIT, units: made.toString(), local: Math.floor((Number(made) / 1e6) * FRANCS), currency: "XOF" };
    return route.fulfill(json({ paid: true, hash: EXIT }));
  });
  let started: unknown = null;
  let starts = 0;
  await page.route("**/api/mobile-money/start", (route) => {
    starts += 1;
    started = JSON.parse(route.request().postData() ?? "{}");
    if (starts <= (world.startsRefused ?? 0)) return route.fulfill(json({ error: "The mobile money service did not answer just now. Nothing was taken: try again in a minute.", code: "PAYOUT_SERVICE_SILENT" }, 503));
    return route.fulfill(json({ reference: REFERENCE, depositAddress: "0x3131b6f6a32751C9d99C1710e357A6C4297d17Bc", depositUnits: holdings.usdc.toString(), expiresAt: new Date(Date.now() + 1_800_000).toISOString(), local: 8802.4, currency: "XOF" }));
  });
  let sent: unknown = null;
  await page.route("**/api/send", (route) => {
    sent = JSON.parse(route.request().postData() ?? "{}");
    holdings.usdc = 0n;
    changed = null;
    return route.fulfill(json({ sent: true, reference: "S-1", sentAtMs: Date.now() }));
  });
  await page.route("**/api/mobile-money/deposited", (route) => route.fulfill(json({ noted: true })));
  let looks = 0;
  await page.route("**/api/mobile-money/status**", (route) => {
    looks += 1;
    return route.fulfill(json(followed(looks < 2 ? "waiting" : ending)));
  });
  // The payout the way out still owes the account a screen for, until its end was seen.
  const seen: string[] = [];
  let latest = world.latest ?? null;
  await page.route("**/api/mobile-money/latest", (route) => route.fulfill(json({ payout: latest })));
  await page.route("**/api/mobile-money/seen", (route) => {
    seen.push(String((JSON.parse(route.request().postData() ?? "{}") as { reference?: string }).reference));
    latest = null;
    return route.fulfill(json({ noted: true }));
  });
  await makeAnAccount(device);
  return { started: () => started, starts: () => starts, sent: () => sent, priced: () => quoted, changes: () => changes, refusedForMore: () => refusedForMore, seen: () => seen, holdings };
}

/** The mobile money card, opened from the way out, with the three fields that are the person's own filled in. */
async function openTheCard(page: Page, operator: "Orange" | "Wave" = "Orange"): Promise<void> {
  await page.locator("section", { has: page.getByRole("heading", { name: "Your mobile money" }) }).first().getByRole("button", { name: "Send to my mobile money" }).click();
  await page.getByRole("radio", { name: operator }).check();
  await page.getByLabel("Number").fill("771234567");
  await page.getByLabel("Name on the account").fill("Awa Ndiaye");
}

const NEVER_SAID = /USDC|wallet|address|token|chain|exchange|network|UTC|cannot be priced/i;

test.describe("your mobile money", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(120_000);

  // VIKY_MOBILE_PHONE_ONLY=1 photographs at 390 alone.
  for (const size of sizesFor(SHOTS).filter((one) => !process.env.VIKY_MOBILE_PHONE_ONLY || one.name === "390")) {
    test(`the card, the amount it opens on sent at the first press, the wait and arrived (${size.name})`, async ({ browser, baseURL }) => {
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      const asked = await inSenegal(device);
      await page.clock.install();
      await page.goto("/cash-out");
      // The card, first, with the operators Switch pays in Senegal and the time it publishes.
      const card = page.locator("section", { has: page.getByRole("heading", { name: "Your mobile money" }) }).first();
      await expect(card).toBeVisible();
      await expect(card.getByText("To your Orange or Wave number, within 5 to 10 minutes.", { exact: true })).toBeVisible();
      // How it works, folded: what the person gets, in how long, what it costs, what it takes (4 Oct 2026). The cost
      // is the rate shown before sending, with nobody's name on it (5 Oct 2026).
      await card.locator(".said-fold summary").click();
      await expect(card.locator(".said-fold dl.said-lines > div")).toHaveText([
        "You getmoney on your Orange or Wave number",
        "Timewithin 5 to 10 minutes",
        "Costthe rate shown before you send",
        "You needthe number and its holder's name",
      ]);
      await shot(page, size.name, "1a-how-it-works");
      await card.locator(".said-fold summary").click();
      await expect(page.getByText(NEVER_SAID)).toHaveCount(0);
      // The smallest payout is said on the card, in the country's money, and it is the one the form opens on.
      await expect(card.locator("[data-mobile-from]")).toHaveText("From 5 904 FCFA at a time.");
      await shot(page, size.name, "1-the-card");

      await openTheCard(page);
      // The amount is in francs, and it opens on what $15.00 really sends once changed, the cost included: 8 802 F,
      // where the balance at the published rate said 8 806 FCFA and could not be paid.
      await expect(page.getByLabel("How much")).toHaveValue("8802");
      await expect(page.getByText("From 5 904 FCFA to 8 802 FCFA at a time.", { exact: true })).toBeVisible();
      await page.clock.fastForward(1_000);
      // Priced without the field being touched: Switch's quote for those francs, and the dollars they take second.
      await expect(page.getByText("about 8 802 FCFA", { exact: true })).toBeVisible();
      expect(asked.priced()).toEqual({ country: "SN", local: 8802 });
      // What leaves the balance and what stays, said as the balance above says its money, and adding up as they
      // are shown: $15.00 less $14.96. No hour of a rate (the founder, 10 Oct 2026).
      await expect(page.getByText("$14.96 from your balance. $0.04 stays with you.", { exact: true })).toBeVisible();
      await expect(page.getByText(/at the rate of/)).toHaveCount(0);
      expect(asked.refusedForMore(), "the exchange was never asked for more than the account holds").toBe(0);
      const send = page.getByRole("button", { name: "Send to my Orange" });
      await expect(send).toBeEnabled();
      await expect(page.getByText(NEVER_SAID)).toHaveCount(0);
      await shot(page, size.name, "2a-the-form-opens-on-what-can-be-sent");
      await send.scrollIntoViewIfNeeded();
      await shot(page, size.name, "2b-the-figure-and-the-button");

      // The amount the field opened on leaves at the first press.
      await send.click();
      await expect(page.getByRole("heading", { name: "On its way" })).toBeVisible();
      await expect(page.getByText("To your Orange number ending 4567. It usually takes 5 to 10 minutes.", { exact: true })).toBeVisible();
      // What the routes were asked: the change's own transaction, the payout's fields, and the deposit, exactly.
      expect(asked.started()).toEqual({ exitTx: EXIT, country: "SN", network: "ORANGE", number: "771234567", holderName: "Awa Ndiaye" });
      expect(asked.sent()).toMatchObject({ coin: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", to: "0x3131b6f6a32751C9d99C1710e357A6C4297d17Bc", value: "14938469" });
      expect(asked.changes()).toBe(1);
      await shot(page, size.name, "3-on-its-way");

      await page.clock.fastForward(6_000);
      await expect(page.getByRole("heading", { name: "Arrived" })).toBeVisible();
      await expect(page.getByText("8 802 FCFA", { exact: true })).toBeVisible();
      await expect(page.getByText("On your Orange number ending 4567.", { exact: true })).toBeVisible();
      // Its end was shown on a screen somebody is looking at: the server is told, once.
      await expect.poll(() => asked.seen()).toEqual([REFERENCE]);
      await shot(page, size.name, "4-arrived");
      await device.context.close();
    });

    test(`somebody who reads in francs: the screen says what arrives and what stays, with no dollar and no second figure in francs (${size.name})`, async ({ browser, baseURL }) => {
      // The founder, 10 Oct 2026: one currency on the screens that spend the balance, the one the person reads in. Read
      // in the money the payout arrives in, the francs that arrive are the one amount: what leaves the balance, the
      // same dollars said in francs at the day's rate, stood under it as a second figure at another rate.
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      await inSenegal(device, { readsInFrancs: true });
      await page.clock.install();
      await page.goto("/cash-out");
      await openTheCard(page);
      await page.clock.fastForward(1_000);
      // The francs that arrive, at Switch's quote, and what stays: the balance of 8 766 above, less the 8 747 that
      // leave it, both as the balance says its money.
      await expect(page.getByText("about 8 802 FCFA", { exact: true })).toBeVisible();
      await expect(page.locator("[data-mobile-figure] p").nth(1)).toHaveText(/^19\sFCFA stays with you\.$/);
      await expect(page.getByText(/from your balance|at the rate of/)).toHaveCount(0);
      expect(await page.locator("main").innerText(), "no dollar beside the francs").not.toMatch(/\$\s?\d/);
      await page.getByRole("button", { name: "Send to my Orange" }).scrollIntoViewIfNeeded();
      await shot(page, size.name, "13-read-in-francs");
      await device.context.close();
    });

    test(`more than can be sent is said under the field in francs, and the balance moving is said the same way (${size.name})`, async ({ browser, baseURL }) => {
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      const asked = await inSenegal(device);
      await page.clock.install();
      await page.goto("/cash-out");
      await openTheCard(page);
      // An amount over what the balance sends: said as soon as it is typed, in the country's money, with no press.
      await page.getByLabel("How much").fill("9000");
      await expect(page.locator("#mobile-amount-refusal")).toHaveText("At most 8 802 FCFA with what you have.");
      await page.clock.fastForward(1_000);
      await expect(page.locator("[data-mobile-figure]")).toHaveText("");
      expect(asked.priced(), "an amount that cannot be sent is not priced").toBeNull();
      await expect(page.getByText(NEVER_SAID)).toHaveCount(0);
      await page.getByLabel("How much").scrollIntoViewIfNeeded();
      await shot(page, size.name, "5a-more-than-can-be-sent");
      // The balance moved under the screen, $1.05 gone elsewhere: the amount the field opened on now costs more than
      // is held. The exchange refuses it, the screen reads again what can be sent, and says that.
      asked.holdings.ausd = 13_950_000n;
      await page.getByLabel("How much").fill("8802");
      await page.clock.fastForward(1_000);
      await expect(page.locator("#mobile-amount-refusal")).toHaveText("At most 8 186 FCFA with what you have.");
      expect(asked.refusedForMore(), "the exchange refused once, and that was said as a bound, not as a failure").toBe(1);
      await expect(page.getByText(NEVER_SAID)).toHaveCount(0);
      await shot(page, size.name, "5b-the-balance-moved");
      // And the button still answers: the press says the same bound, and starts nothing.
      await page.getByRole("button", { name: "Send to my Orange" }).click();
      await expect(page.locator("#mobile-amount-refusal")).toHaveText("At most 8 186 FCFA with what you have.");
      expect(asked.changes(), "nothing was changed").toBe(0);
      await device.context.close();
    });

    test(`failed, and the money comes back; and Switch silent on a price is said, then a press asks again (${size.name})`, async ({ browser, baseURL }) => {
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      await inSenegal(device, { ending: "failed" });
      await page.clock.install();
      await page.goto("/cash-out");
      await openTheCard(page, "Wave");
      await page.clock.fastForward(1_000);
      await page.getByRole("button", { name: "Send to my Wave" }).click();
      await expect(page.getByRole("heading", { name: "On its way" })).toBeVisible();
      await page.clock.fastForward(6_000);
      await expect(page.getByRole("heading", { name: "It did not go through" })).toBeVisible();
      await expect(page.getByText("It did not reach the number. The money comes back to your account.", { exact: true })).toBeVisible();
      await shot(page, size.name, "6-failed");
      await device.context.close();

      // Switch does not answer the first quote: its own sentence stands where the figure would, and the button still
      // answers. The press asks for the price again, gets it, and sends: it used to do nothing.
      const other = await profile(browser, baseURL, size.viewport);
      const asked = await inSenegal(other, { quotesRefused: 1 });
      await other.page.clock.install();
      await other.page.goto("/cash-out");
      await openTheCard(other.page);
      await other.page.clock.fastForward(1_000);
      await expect(other.page.locator("[data-mobile-figure]")).toHaveText("The mobile money service did not answer just now. Nothing was taken: try again in a minute.");
      await expect(other.page.getByText(NEVER_SAID)).toHaveCount(0);
      const send = other.page.getByRole("button", { name: "Send to my Orange" });
      await expect(send).toBeEnabled();
      await send.scrollIntoViewIfNeeded();
      await shot(other.page, size.name, "7-switch-silent-on-a-price");
      await send.click();
      await expect(other.page.getByRole("heading", { name: "On its way" })).toBeVisible();
      expect(asked.changes()).toBe(1);
      await other.context.close();
    });

    test(`a payout on its way is found again on coming back, and its end is shown once (${size.name})`, async ({ browser, baseURL }) => {
      // The founder, 5 Oct 2026: its reference lived in the open screen only, so "Back", a closed tab or a reload lost
      // "On its way", "Arrived" and the failure alike. It is read from the server's ledger for the account.
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      const asked = await inSenegal(device, { latest: followed("waiting") });
      await page.clock.install();
      await page.goto("/cash-out");
      // The way out opens on it, with the same card as after the press that sent it, and no form.
      await expect(page.getByRole("heading", { name: "On its way" })).toBeVisible();
      await expect(page.getByText("To your Orange number ending 4567. It usually takes 5 to 10 minutes.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Send to my mobile money" })).toHaveCount(0);
      expect(asked.seen(), "on its way is not seen finished").toEqual([]);
      await shot(page, size.name, "8a-found-again-on-its-way");
      // Still followed from here: it arrives, the amount is said, and the server is told its end was shown.
      await page.clock.fastForward(6_000);
      await expect(page.getByRole("heading", { name: "On its way" })).toBeVisible();
      await page.clock.fastForward(6_000);
      await expect(page.getByRole("heading", { name: "Arrived" })).toBeVisible();
      await expect(page.getByText("8 802 FCFA", { exact: true })).toBeVisible();
      await expect.poll(() => asked.seen()).toEqual([REFERENCE]);
      await shot(page, size.name, "8b-found-again-arrived");
      // "Back" leads to the rest of the way out, and it is not shown again on the next visit.
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(page.getByRole("button", { name: "Send to my mobile money" })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("button", { name: "Send to my mobile money" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Arrived" })).toHaveCount(0);
      await device.context.close();

      // One that failed while the person was away: said on coming back, as it would have been on the open screen.
      const other = await profile(browser, baseURL, size.viewport);
      const failed = await inSenegal(other, { latest: followed("failed") });
      await other.page.goto("/cash-out");
      await expect(other.page.getByRole("heading", { name: "It did not go through" })).toBeVisible();
      await expect(other.page.getByText("It did not reach the number. The money comes back to your account.", { exact: true })).toBeVisible();
      await expect.poll(() => failed.seen()).toEqual([REFERENCE]);
      await shot(other.page, size.name, "8c-found-again-failed");
      await other.context.close();

      // On its way and put away with "Back": the rest of the way out is reachable, and it is there again on return.
      const third = await profile(browser, baseURL, size.viewport);
      await inSenegal(third, { latest: followed("waiting") });
      await third.page.goto("/cash-out");
      await third.page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(third.page.getByRole("button", { name: "Send to my mobile money" })).toBeVisible();
      await third.page.reload();
      await expect(third.page.getByRole("heading", { name: "On its way" })).toBeVisible();
      await third.context.close();
    });

    test(`a cut after the money was changed: the card sends those dollars and changes nothing more (${size.name})`, async ({ browser, baseURL }) => {
      // The founder, 5 Oct 2026: money is never changed twice. The payout cannot be opened at the first try, after
      // the money was changed. A new press used to price again and change other dollars.
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      const asked = await inSenegal(device, { startsRefused: 1 });
      await page.clock.install();
      await page.goto("/cash-out");
      await openTheCard(page);
      await page.clock.fastForward(1_000);
      await page.getByRole("button", { name: "Send to my Orange" }).click();
      // What the person sees: the service's own sentence, and in place of the amount the dollars already changed.
      await expect(page.locator('main [role="alert"]')).toHaveText("The mobile money service did not answer just now. Nothing was taken: try again in a minute.");
      await expect(page.locator("[data-mobile-changed]")).toContainText("about 8 802 FCFA");
      await expect(page.locator("[data-mobile-changed]")).toContainText("From $14.93 already changed. Nothing more is changed.");
      await expect(page.getByLabel("How much")).toHaveCount(0);
      // What was filled in is still there.
      await expect(page.getByLabel("Number")).toHaveValue("771234567");
      expect(asked.changes()).toBe(1);
      await expect(page.getByText(NEVER_SAID)).toHaveCount(0);
      await page.locator("[data-mobile-changed]").scrollIntoViewIfNeeded();
      await shot(page, size.name, "9a-cut-after-the-change");
      // The next press starts from those dollars: the same change, no second one, and the payout leaves.
      await page.clock.fastForward(2_000);
      await page.getByRole("button", { name: "Send to my Orange" }).click();
      await expect(page.getByRole("heading", { name: "On its way" })).toBeVisible();
      expect(asked.changes(), "never changed twice").toBe(1);
      expect(asked.starts()).toBe(2);
      expect(asked.started()).toMatchObject({ exitTx: EXIT });
      expect(asked.sent()).toMatchObject({ value: "14938469" });
      await device.context.close();

      // The same after a closed tab: the card opens on the dollars already changed, read from the server.
      const other = await profile(browser, baseURL, size.viewport);
      const again = await inSenegal(other, { startsRefused: 1 });
      await other.page.clock.install();
      await other.page.goto("/cash-out");
      await openTheCard(other.page);
      await other.page.clock.fastForward(1_000);
      await other.page.getByRole("button", { name: "Send to my Orange" }).click();
      await expect(other.page.locator("[data-mobile-changed]")).toBeVisible();
      await other.page.reload();
      await other.page.locator("section", { has: other.page.getByRole("heading", { name: "Your mobile money" }) }).first().getByRole("button", { name: "Send to my mobile money" }).click();
      await expect(other.page.locator("[data-mobile-changed]")).toContainText("From $14.93 already changed. Nothing more is changed.");
      await expect(other.page.getByLabel("How much")).toHaveCount(0);
      await shot(other.page, size.name, "9b-after-a-reload-the-same-dollars");
      await other.page.getByRole("radio", { name: "Orange" }).check();
      await other.page.getByLabel("Number").fill("771234567");
      await other.page.getByLabel("Name on the account").fill("Awa Ndiaye");
      await other.page.getByRole("button", { name: "Send to my Orange" }).click();
      await expect(other.page.getByRole("heading", { name: "On its way" })).toBeVisible();
      expect(again.changes(), "never changed twice").toBe(1);
      await other.context.close();
    });

    test(`a press says what is missing under each field, and the button is never only grey (${size.name})`, async ({ browser, baseURL }) => {
      // The founder, 4 Oct 2026: operator not chosen, a number or a name off the rule, an amount out of bounds all left
      // a disabled button and no sentence.
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      const asked = await inSenegal(device);
      await page.goto("/cash-out");
      await page.locator("section", { has: page.getByRole("heading", { name: "Your mobile money" }) }).first().getByRole("button", { name: "Send to my mobile money" }).click();
      const send = page.getByRole("button", { name: /^Send to my/ });
      await expect(send).toBeEnabled();
      await expect(page.locator('main [role="alert"]')).toHaveCount(0);
      await send.click();
      // Nothing filled in: each field says what it is missing, in the sentences the route itself refuses with.
      await expect(page.locator("#mobile-operator-refusal")).toHaveText("Choose your operator from the list.");
      // An empty field is asked for; a field filled in and refused keeps the route's own sentence (5 Oct 2026).
      await expect(page.locator("#mobile-number-refusal")).toHaveText("Enter your number.");
      await expect(page.locator("#mobile-holder-refusal")).toHaveText("Enter the name on the account.");
      await expect(page.locator("#mobile-amount-refusal")).toHaveCount(0);
      await expect(send).toBeEnabled();
      expect(asked.started(), "nothing started").toBeNull();
      // No red: the mark and the page's own ink, as every refusal but the month's limit.
      const ink = await page.evaluate("getComputedStyle(document.querySelector('#mobile-number-refusal')).color");
      const text = await page.evaluate("getComputedStyle(document.querySelector('main h2')).color");
      expect(ink).toBe(text);
      await send.scrollIntoViewIfNeeded();
      await shot(page, size.name, "10a-a-press-with-nothing-filled");
      await page.locator("#mobile-operator-refusal").scrollIntoViewIfNeeded();
      await shot(page, size.name, "10b-what-each-field-is-missing");
      await page.getByLabel("Number").fill("12 34");
      await expect(page.locator("#mobile-number-refusal")).toHaveText("That number is not one this operator takes. Digits only, as your operator gives it.");
      await page.getByLabel("Name on the account").fill("7");
      await expect(page.locator("#mobile-holder-refusal")).toHaveText("Write the name on the account, as your operator has it.");
      await page.getByLabel("Number").fill("");
      await page.getByLabel("Name on the account").fill("");
      // An amount past a bound says the bound, in the country's money.
      await page.getByLabel("How much").fill("100");
      await expect(page.locator("#mobile-amount-refusal")).toHaveText("At least 5 904 FCFA at a time.");
      await page.getByLabel("How much").fill("900000");
      await expect(page.locator("#mobile-amount-refusal")).toHaveText("At most 8 802 FCFA with what you have.");
      await page.getByLabel("How much").fill("");
      await expect(page.locator("#mobile-amount-refusal")).toHaveText("Write how much, in figures.");
      // Each refusal leaves as its field is put right, and a number typed with the country's prefix passes Switch's
      // rule, 9 to 40 digits, once the plus and the spaces are taken off.
      await page.getByRole("radio", { name: "Wave" }).check();
      await expect(page.locator("#mobile-operator-refusal")).toHaveCount(0);
      await page.getByLabel("Number").fill("+221 77 123 45 67");
      await expect(page.locator("#mobile-number-refusal")).toHaveCount(0);
      await page.getByLabel("Name on the account").fill("Awa Ndiaye");
      await expect(page.locator("#mobile-holder-refusal")).toHaveCount(0);
      await page.getByLabel("How much").fill("8800");
      await expect(page.locator('main [role="alert"]')).toHaveCount(0);
      await device.context.close();
    });

    test(`a balance under the country's smallest payout: said in place of the form, with what the person has (${size.name})`, async ({ browser, baseURL }) => {
      // The field used to open empty between two bounds the wrong way round, over a button that did nothing.
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      await inSenegal(device, { held: 500_000n });
      await page.goto("/cash-out");
      await page.locator("section", { has: page.getByRole("heading", { name: "Your mobile money" }) }).first().getByRole("button", { name: "Send to my mobile money" }).click();
      await expect(page.locator("[data-mobile-under-minimum]")).toHaveText("Mobile money pays from 5 904 FCFA at a time here, and you have 292 FCFA.");
      await expect(page.getByLabel("How much")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Send to my/ })).toHaveCount(0);
      await expect(page.getByText(/From .* to .* at a time/)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Back", exact: true })).toBeVisible();
      await shot(page, size.name, "11-a-balance-under-the-minimum");
      await device.context.close();
    });

    test(`the day's ceiling met: said in place of the form, nothing to fill in (${size.name})`, async ({ browser, baseURL }) => {
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      await inSenegal(device, { mostUnits: "5000000" });
      await page.goto("/cash-out");
      await page.getByRole("button", { name: "Send to my mobile money" }).click();
      await expect(page.getByText("You have sent $500.00 to mobile money today, the most for a day. It opens again tomorrow.", { exact: true })).toBeVisible();
      await expect(page.getByLabel("How much")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Send to my/ })).toHaveCount(0);
      await shot(page, size.name, "12-the-day-is-full");
      await device.context.close();
    });
  }
});
