import { expect, test, type Page } from "@playwright/test";
import { TERMS, aWindow, climb, daily, photographer, serve } from "./gift-fixtures";
import { DAY, gift, json, makeAnAccount, neverAskedToBeTold, now } from "./gift-kit";

/**
 * A month's reserve is used up (the founder, 3 Oct 2026). Viky asks an outside service for each attested reading and
 * for each proof a person shows, and holds itself to that service's monthly allowance (src/attested-calls.ts). One
 * sentence says it in the open, in the one red of the product: which service is not checked, by the gift's own
 * source, and the day it starts again. What the person can do is folded under its own name. And a condition whose
 * reserve is empty says so before a gift is paid for, on the card and in the choice of what they will do.
 *
 * What is real: the product's pages against the server under test, the sign-in with a passkey, every press. What is
 * stood in for: the gift, which a new account does not have, so its page is answered here as the gift route answers
 * it once a reserve is empty; the reading a press asks for; and the reserves the conditions route answers.
 *
 * VIKY_LIMIT_CAPTURES=<folder> also photographs each state at 390 by 844, and VIKY_DECIDE_NIGHT=1 walks them after dark.
 */
const shot = photographer(process.env.VIKY_LIMIT_CAPTURES);

const AGAIN = "23 Oct";
const card = (page: Page) => page.locator("section.gift-card-placed");
const said = (page: Page) => card(page).locator("[data-limit-said]");
const fold = (page: Page) => card(page).locator("[data-limit-can]");
const lines = (page: Page) => fold(page).locator(".gift-fold-body p");
const sentence = (source: string, reserve: "readings" | "proofs") => `Viky can't check ${source} right now: this month's ${reserve} are used up. It starts again on ${AGAIN}.`;
const UNTIL = "(today|tomorrow), \\d{1,2} [A-Z][a-z]{2}, at \\d{1,2}:\\d{2}\\.";
/** The line that names where to write is there when the build has an address to name, and absent otherwise. */
const WRITE = /^Write to \S+@\S+: we can reopen it sooner\.$/;
/** The one red (src/design-tokens.ts, LIMIT_RED): Material's error role at tone 40 by day, at tone 80 after dark. */
const RED = process.env.VIKY_DECIDE_NIGHT === "1" ? "rgb(242, 184, 181)" : "rgb(179, 38, 30)";
/** Tomorrow at 06:00 UTC: the end of a window, which the page says in the clock of the device. */
const until = () => (Math.floor(now() / DAY) + 1) * DAY + 6 * 3_600;
const readingsEmpty = (countableUntil: number | null) => ({ limit: { readings: true, proofs: false, countableUntil, again: AGAIN } });

/** What the fold holds once opened: the lines given, in their order, then where to write when the build names an address. */
async function folded(page: Page, expected: Array<string | RegExp>): Promise<void> {
  await expect(fold(page)).not.toHaveAttribute("open", "");
  await fold(page).locator("summary").click();
  await expect(fold(page).locator("summary")).toHaveText("What you can do");
  const texts = await lines(page).allTextContents();
  const withoutTheAddress = texts.filter((text) => !WRITE.test(text));
  expect(texts.length - withoutTheAddress.length, "the address is said once at most, and last").toBeLessThanOrEqual(1);
  if (texts.length > withoutTheAddress.length) expect(texts[texts.length - 1]).toMatch(WRITE);
  expect(withoutTheAddress.length).toBe(expected.length);
  expected.forEach((line, index) => (typeof line === "string" ? expect(withoutTheAddress[index]).toBe(line) : expect(withoutTheAddress[index]).toMatch(line)));
}

test.describe("a month's reserve used up, said in place", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  test("a habit: the card names the service and the day it starts again, folds what can be done, and asks nothing", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "43";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    let counts = 0;
    await serve(page, GIFT, () => daily(GIFT, "recipient", readingsEmpty(until())), TERMS.daily);
    await page.route(`**/api/gift/${GIFT}/count`, (route) => {
      counts += 1;
      return route.fulfill(json({ kind: "already", giftId: GIFT, reason: "counted_today" }));
    });
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);

    await expect(said(page)).toHaveCount(1);
    await expect(said(page)).toHaveText(sentence("Duolingo", "readings"));
    // Small and red: one line of help in size, and the only red on the page.
    await expect(said(page)).toHaveCSS("color", RED);
    await expect(said(page)).toHaveCSS("font-size", "13px");
    // No next reading is announced, in words or as an hour beside the money: none will go.
    await expect(card(page)).not.toContainText("Next reading");
    await expect(card(page).locator(".gift-back")).toHaveCount(0);
    await shot(page, "01-recipient");
    // What they can do, folded: the open day's real deadline, what is theirs, what is not touched, where to write.
    await folded(page, [new RegExp(`^Your day can still be counted until ${UNTIL}$`), "What is already yours can be taken out as usual.", "Gifts proved by a document someone shows are not touched."]);
    await shot(page, "02-recipient-what-you-can-do");
    // And no count is offered: it is gone from how the gift is checked.
    await page.getByText("How this is checked").click();
    await expect(page.getByRole("button", { name: "Count now" })).toHaveCount(0);
    expect(counts).toBe(0);
  });

  test("the person who gave it reads the same sentence, and the fold speaks of the other person's day and money", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "44";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await serve(page, GIFT, () => daily(GIFT, "funder", readingsEmpty(until())), TERMS.daily);
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    await expect(said(page)).toHaveText(sentence("Duolingo", "readings"));
    await expect(said(page)).toHaveCSS("color", RED);
    await shot(page, "03-funder");
    await folded(page, [new RegExp(`^Boo's day can still be counted until ${UNTIL}$`), "What is already theirs can be taken out as usual.", "Gifts proved by a document someone shows are not touched."]);
    await shot(page, "04-funder-what-you-can-do");
  });

  test("a climb: the sentence names its own source, the fold has no day, and the page stops reading each minute", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "1999943";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    let counts = 0;
    await serve(page, GIFT, () => climb(GIFT, "recipient", readingsEmpty(null)), TERMS.climb);
    await page.route(`**/api/gift/${GIFT}/count`, (route) => {
      counts += 1;
      return route.fulfill(json({ kind: "notYet", giftId: GIFT, rating: 1462, target: 1500, attested: false }));
    });
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    await expect(said(page)).toHaveText(sentence("Chess.com", "readings"));
    await expect(card(page).locator(".gift-updated")).toHaveCount(0);
    await page.waitForTimeout(1_500);
    expect(counts, "no reading is asked while the reserve is empty").toBe(0);
    await folded(page, ["What is already yours can be taken out as usual.", "Gifts proved by a document someone shows are not touched."]);
    await shot(page, "05-climb");
  });

  test("a reading the limit refuses under a press says the sentence there, then the hour in the device's clock", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "45";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    // The page was opened before the reserve was empty: nothing says it yet, and the count is offered.
    await serve(page, GIFT, () => daily(GIFT, "recipient"), TERMS.daily);
    await page.route(`**/api/gift/${GIFT}/count`, (route) => route.fulfill(json({ kind: "refused", giftId: GIFT, code: "LIMIT_REACHED", message: sentence("Duolingo", "readings"), countableUntil: until() })));
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    await expect(said(page)).toHaveCount(0);
    await expect(fold(page)).toHaveCount(0);
    await page.getByText("How this is checked").click();
    await page.getByRole("button", { name: "Count now" }).click();
    const refused = page.locator("#gift-count-refused");
    await expect(refused).toHaveText(new RegExp(`^Viky can't check Duolingo right now: this month's readings are used up\\. It starts again on ${AGAIN}\\. Your day can still be counted until ${UNTIL}$`));
    await expect(refused).toHaveCSS("color", RED);
    await shot(page, "06-refused-under-a-press");
  });

  test("a proof a person shows: the card says the proofs are used up, nothing is offered to press, and nothing is opened", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "1999944";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    let sessions = 0;
    const enrolment = () =>
      gift(GIFT, "recipient", {
        conditionId: "university-enrollment-shown",
        target: 1,
        asked: "enrolled at that university",
        deadlineMs: (now() + 20 * DAY) * 1000,
        limit: { readings: false, proofs: true, countableUntil: null, again: AGAIN },
      });
    await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) => route.fulfill(json(enrolment())));
    await page.route(`**/api/gift/${GIFT}/consent`, (route) =>
      route.fulfill(json({ giftId: GIFT, state: null, reading: "no_agreement", opened: true, finished: false, terms: { what: "your enrolment" }, until: "the gift's last day", texts: { yes: "yes", stop: "stop" } })),
    );
    await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
    await page.route("**/api/proof/session", (route) => {
      sessions += 1;
      return route.fulfill(json({ code: "LIMIT_REACHED", error: "not reached" }, 409));
    });
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    // Said to the person the gift is for: the university is theirs.
    await expect(said(page)).toHaveText(sentence("your university", "proofs"));
    await expect(said(page)).toHaveCSS("color", RED);
    // Nothing to press that would open a proof: the place of the button is empty while the reserve is.
    await expect(page.getByRole("button", { name: "Show it" })).toHaveCount(0);
    await expect(page.getByText(/^A verification page opens/).filter({ visible: true })).toHaveCount(0);
    // The other reserve is the one not touched.
    await folded(page, ["What is already yours can be taken out as usual.", "Gifts that Viky reads by itself are not touched."]);
    expect(sessions).toBe(0);
    await shot(page, "07-proof-shown");
  });

  test("before the payment: the card to fill says it under what they will do, and the choice marks the conditions that wait", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    // The conditions route as it answers, with the readings used up and the proofs of people still there.
    await page.route("**/api/conditions", async (route) => {
      const answered = await route.fetch();
      const body = (await answered.json()) as Record<string, unknown>;
      return route.fulfill(json({ ...body, reserves: { readings: true, proofs: false, again: AGAIN } }));
    });
    await page.goto("/");
    const offer = page.locator("[data-limit-said]").filter({ visible: true });
    await expect(offer).toHaveCount(1);
    await expect(offer).toHaveText(sentence("Duolingo", "readings"));
    await expect(offer).toHaveCSS("color", RED);
    await offer.scrollIntoViewIfNeeded();
    await shot(page, "08-card-to-fill", false);

    // In the choice: a family Viky reads by itself says when it is back on each line, and every line stays offered.
    await page.getByRole("button", { name: /what they will do/i }).first().click();
    const sheet = page.locator("dialog.sheet[open]");
    await sheet.getByRole("button", { name: /^Learn/ }).click();
    const learn = sheet.locator('div[role="group"] > button');
    const back = sheet.locator("[data-limit-back]").filter({ visible: true });
    await expect(back.first()).toHaveText(`Back on ${AGAIN}`);
    await expect(back.first()).toHaveCSS("color", RED);
    expect(await back.count()).toBeGreaterThan(0);
    for (const line of await learn.all()) await expect(line).toBeEnabled();
    await shot(page, "09-choice-readings-wait", false);
    // A family proved by a document someone shows still works: nothing is said on its lines.
    await sheet.getByRole("button", { name: /All families/i }).click();
    await sheet.getByRole("button", { name: /School & studies/ }).click();
    const school = sheet.locator('div[role="group"] > button');
    const shown = school.filter({ hasText: "SHOWN BY THEM" });
    expect(await shown.count()).toBeGreaterThan(0);
    for (const line of await shown.all()) await expect(line.locator("[data-limit-back]")).toHaveCount(0);
    await shot(page, "10-choice-shown-still-offered", false);
    // Chosen all the same, a condition whose reserve is empty says the whole sentence over its questions.
    await sheet.getByRole("button", { name: /All families/i }).click();
    await sheet.getByRole("button", { name: /^Learn/ }).click();
    await learn.filter({ has: page.locator("[data-limit-back]") }).first().click();
    await expect(sheet.locator("p[data-limit-said]")).toHaveText(/^Viky can't check .+ right now: this month's readings are used up\. It starts again on 23 Oct\.$/);
    await shot(page, "11-condition-chosen", false);
  });
});
