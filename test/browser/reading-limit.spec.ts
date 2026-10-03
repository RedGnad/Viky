import { expect, test, type Page } from "@playwright/test";
import { TERMS, aWindow, climb, daily, photographer, serve } from "./gift-fixtures";
import { DAY, gift, json, makeAnAccount, neverAskedToBeTold, now } from "./gift-kit";

/**
 * The month's limit of readings is reached (the founder, 3 Oct 2026): said in place, plainly and without alarm, where a
 * reading or a proof would have gone. Viky asks an outside service for each attested reading and for each proof a
 * person shows, and holds itself to that service's monthly allowance (src/attested-calls.ts).
 *
 * What is real: the product's pages against the server under test, the sign-in with a passkey, every press. What is
 * stood in for: the gift, which a new account does not have, so its page is answered here as the gift route answers
 * it once the limit is reached, and the reading a press asks for.
 *
 * VIKY_LIMIT_CAPTURES=<folder> also photographs each state at 390 by 844.
 */
const shot = photographer(process.env.VIKY_LIMIT_CAPTURES);

const card = (page: Page) => page.locator("section.gift-card-placed");
const said = (page: Page) => card(page).locator(".gift-state-closed");
/** The sentence that names where to write is there when the build has an address to name, and absent otherwise. */
const WRITE = "( Write to \\S+@\\S+ and we'll sort it out\\.)?";
const READING = "Viky can't check this right now: we've reached our monthly limit of readings\\. Nothing is lost\\.";
/** Tomorrow at 06:00 UTC: the end of a window, which the page says in the clock of the device. */
const until = () => (Math.floor(now() / DAY) + 1) * DAY + 6 * 3_600;

test.describe("the month's limit of readings, said in place", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  test("a habit: the card says why nothing is read and until when the day can still be counted, and nothing is asked", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "43";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    let counts = 0;
    await serve(page, GIFT, () => daily(GIFT, "recipient", { limit: { readings: true, proofs: false, countableUntil: until() } }), TERMS.daily);
    await page.route(`**/api/gift/${GIFT}/count`, (route) => {
      counts += 1;
      return route.fulfill(json({ kind: "already", giftId: GIFT, reason: "counted_today" }));
    });
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);

    await expect(said(page)).toHaveCount(1);
    await expect(said(page)).toHaveText(new RegExp(`^${READING} Your day can still be counted until (today|tomorrow), \\d{1,2} [A-Z][a-z]{2}, at \\d{1,2}:\\d{2}\\.${WRITE}$`));
    // No next reading is announced, in words or as an hour beside the money: none will go.
    await expect(card(page)).not.toContainText("Next reading");
    await expect(card(page).locator(".gift-back")).toHaveCount(0);
    await shot(page, "01-habit-limit-reached");
    // And none is offered: the count is gone from how the gift is checked.
    await page.getByText("How this is checked").click();
    await expect(page.getByRole("button", { name: "Count now" })).toHaveCount(0);
    expect(counts).toBe(0);
  });

  test("the person who gave it reads the same, without an hour that is not theirs", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "44";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await serve(page, GIFT, () => daily(GIFT, "funder", { limit: { readings: true, proofs: false, countableUntil: until() } }), TERMS.daily);
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    await expect(said(page)).toHaveText(new RegExp(`^${READING}${WRITE}$`));
    await shot(page, "02-habit-limit-reached-funder");
  });

  test("a climb: the same sentence without a day, and the page stops reading each minute", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "1999943";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    let counts = 0;
    await serve(page, GIFT, () => climb(GIFT, "recipient", { limit: { readings: true, proofs: false, countableUntil: null } }), TERMS.climb);
    await page.route(`**/api/gift/${GIFT}/count`, (route) => {
      counts += 1;
      return route.fulfill(json({ kind: "notYet", giftId: GIFT, rating: 1462, target: 1500, attested: false }));
    });
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    await expect(said(page)).toHaveText(new RegExp(`^${READING}${WRITE}$`));
    await expect(card(page).locator(".gift-updated")).toHaveCount(0);
    await page.waitForTimeout(1_500);
    expect(counts, "no reading is asked while the limit stands").toBe(0);
    await shot(page, "03-climb-limit-reached");
  });

  test("a reading the limit refuses under a press says the sentence there, with the hour in the device's clock", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "45";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    // The page was opened before the limit was reached: nothing says it yet, and the count is offered.
    await serve(page, GIFT, () => daily(GIFT, "recipient"), TERMS.daily);
    await page.route(`**/api/gift/${GIFT}/count`, (route) =>
      route.fulfill(json({ kind: "refused", giftId: GIFT, code: "LIMIT_REACHED", message: "Viky can't check this right now: we've reached our monthly limit of readings. Nothing is lost.", countableUntil: until() })),
    );
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    await expect(said(page)).toHaveCount(0);
    await page.getByText("How this is checked").click();
    await page.getByRole("button", { name: "Count now" }).click();
    await expect(page.locator("#gift-count-refused")).toHaveText(new RegExp(`^${READING} Your day can still be counted until (today|tomorrow), \\d{1,2} [A-Z][a-z]{2}, at \\d{1,2}:\\d{2}\\.${WRITE}$`));
    await shot(page, "04-habit-refused-under-a-press");
  });

  test("a proof a person shows: said before they start, in the button's place, and nothing is opened", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "1999944";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    let sessions = 0;
    const enrolment = () => gift(GIFT, "recipient", { conditionId: "university-enrollment-shown", target: 1, asked: "enrolled at that university", deadlineMs: (now() + 20 * DAY) * 1000, limit: { readings: false, proofs: true, countableUntil: null } });
    await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) => route.fulfill(json(enrolment())));
    await page.route(`**/api/gift/${GIFT}/consent`, (route) =>
      route.fulfill(json({ giftId: GIFT, state: null, reading: "no_agreement", opened: true, finished: false, terms: { what: "your enrolment" }, until: "the gift's last day", texts: { yes: "yes", stop: "stop" } })),
    );
    await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
    await page.route("**/api/proof/session", (route) => {
      sessions += 1;
      return route.fulfill(json({ code: "LIMIT_REACHED", error: "Viky can't take a new proof right now: we've reached our monthly limit. Nothing was taken." }, 409));
    });
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    const place = page.locator("[data-proof-limit]");
    await expect(place).toHaveText(new RegExp(`Viky can't take a new proof right now: we've reached our monthly limit\\. Nothing was taken\\.${WRITE}$`));
    await expect(place.getByRole("button")).toHaveCount(0);
    // The readings' sentence is not said here: this gift waits for a proof, not for a reading.
    await expect(said(page)).toHaveCount(0);
    expect(sessions).toBe(0);
    await shot(page, "05-proof-limit-reached");
  });
});
