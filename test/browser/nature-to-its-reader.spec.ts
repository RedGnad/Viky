import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { daily, serve } from "./gift-fixtures";
import { DAY, gift, json, makeAnAccount, neverAskedToBeTold, now, profile, sizesFor } from "./gift-kit";

/**
 * The label under a card's condition speaks to whoever reads the card (the founder, 11 Oct 2026). On their own list a
 * person read "SHOWN BY THEM" on the gift they are the one to show. The person a gift is for now reads "SHOWN BY YOU"
 * and "CONNECTED BY YOU"; "READ FOR YOU" is true of every reader and does not change; the one who made the gift keeps
 * "BY THEM". The chooser and the catalogue, read by the one who gives, are held in ./nature.spec.ts as they were.
 *
 * The gifts are the test's own, answered as the routes answer them; the pages, the sign-in and every press are real.
 *
 * VIKY_NATURE_CAPTURES=<folder> also photographs each card of the list of gifts received and of the list of gifts
 * given, brought into the window as a person scrolls to it, and a connected gift's own page as each of its two people
 * reads it, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_NATURE_CAPTURES;
const SIZES = sizesFor(SHOTS);

const SHOWN = "1999961";
const CONNECTED = "1999962";
const READ = "1999963";
const listCard = (page: Page, giftId: string) => page.locator(`a[href="/g/${giftId}"]`);

async function shot(page: Page, size: string, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(SHOTS, `${name}-${size}.png`) });
}
/** Each card of the list, in the middle of the window, as a person scrolls to it: a card comes up when it is reached. */
async function shotEachCard(page: Page, size: string, name: string) {
  if (!SHOTS) return;
  for (const [giftId, what] of [[SHOWN, "shown"], [CONNECTED, "connected"], [READ, "read"]] as const) {
    await listCard(page, giftId).evaluate((card) => card.scrollIntoView({ block: "center", behavior: "instant" }));
    await shot(page, size, `${name}-${what}`);
  }
}

const STRAVA = 4;
const DUOLINGO = 1;
const NAMES = { recipientName: "Boo", funderName: "Mom" };
type Role = "recipient" | "funder";

/** A daily gift as a list holds it: seven days at a dollar, two counted. */
function listedDaily(giftId: string, role: Role, goalType: number) {
  const today = Math.floor(now() / DAY);
  return {
    giftId,
    role,
    goalType,
    goalUsername: goalType === DUOLINGO ? "boo_learns" : null,
    usernameSource: goalType === DUOLINGO ? "funder" : null,
    ...NAMES,
    catchUpSeconds: 108_000,
    days: [
      { day: today - 2, outcome: "earned" },
      { day: today - 1, outcome: "earned" },
    ],
    fundedAt: now() - 3 * DAY,
    startDay: today - 2,
    endDay: today + 4,
    amountDisplay: "$7.00",
    perDayDisplay: "$1.00",
    durationDays: 7,
    creditedDays: 2,
    missedDays: 0,
    opened: true,
    counting: true,
    finished: false,
    cancelled: false,
    earnedDisplay: "$2.00",
    theirsDisplay: "$2.00",
    returnedDisplay: "$0.00",
    takeable: "0",
  };
}

/** An enrolment gift as a list holds it: shown by the person, not proved yet. */
function listedShown(role: Role) {
  const milestone = gift(SHOWN, role, { conditionId: "university-enrollment-shown", target: 1, asked: "enrolled at that university", amount: "5000000", amountDisplay: "$5.00", names: NAMES, deadlineMs: (now() + 20 * DAY) * 1000 });
  return { ...listedDaily(SHOWN, role, 40), days: [], startDay: 0, endDay: 0, amountDisplay: "$5.00", perDayDisplay: "$0.00", durationDays: 30, creditedDays: 0, earnedDisplay: "$0.00", theirsDisplay: "$0.00", milestone };
}

async function lists(page: Page, role: Role) {
  await page.unroute("**/api/gifts/mine");
  await page.route("**/api/gifts/mine", (route) => route.fulfill(json({ account: "", gifts: [listedShown(role), listedDaily(CONNECTED, role, STRAVA), listedDaily(READ, role, DUOLINGO)] })));
}

const NATURES = /^(READ FOR YOU|SHOWN BY (YOU|THEM)|CONNECTED BY (YOU|THEM))$/;
/** What the three cards of a list say under their conditions, in the order shown, enrolment, Strava, Duolingo. */
async function saidOnTheList(page: Page): Promise<string[]> {
  const said: string[] = [];
  for (const giftId of [SHOWN, CONNECTED, READ]) {
    await expect(listCard(page, giftId)).toBeVisible();
    said.push(...(await listCard(page, giftId).getByText(NATURES).allTextContents()));
  }
  return said;
}

/** A Strava gift's own page, counting, as the gift route answers it. */
async function connectedPage(page: Page, role: Role) {
  const today = Math.floor(Date.now() / 86_400_000);
  const counting = { goalType: STRAVA, dailyTarget: 3, version: 3, connected: true, startDay: today - 2, endDay: today + 4, goalAccount: { username: null, source: "funder", bound: true, code: null, codeExpiresAt: null } };
  const terms = { reads: "your activities on Strava, each morning, for the day before: whether they add up to the kilometres", funderSees: "for each day, whether it counted", what: "your activities", things: 1 };
  await serve(page, CONNECTED, () => daily(CONNECTED, role, counting), terms as never);
  await page.route("**/api/connect/strava/status*", (route) => route.fulfill(json({ connected: true, since: new Date().toISOString(), bound: true, configured: true })));
}

const pageNature = (page: Page) => page.locator("section.gift-card-placed").getByText(NATURES);

test.describe("the label under a card's condition speaks to whoever reads the card", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const size of SIZES) {
    test(`the person a gift is for reads "by you", on the lists and on the gift's own page (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(180_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      await neverAskedToBeTold(device.context);
      await lists(page, "recipient");
      await connectedPage(page, "recipient");
      await makeAnAccount(device);

      await page.goto("/gifts");
      expect(await saidOnTheList(page)).toEqual(["SHOWN BY YOU", "CONNECTED BY YOU", "READ FOR YOU"]);
      await expect(page.getByText(/BY THEM$/).filter({ visible: true })).toHaveCount(0);
      await shotEachCard(page, size.name, "1-received");
      await page.goto("/");
      expect(await saidOnTheList(page)).toEqual(["SHOWN BY YOU", "CONNECTED BY YOU", "READ FOR YOU"]);
      await expect(page.getByText(/BY THEM$/).filter({ visible: true })).toHaveCount(0);

      await page.goto(`/g/${CONNECTED}`);
      await expect(pageNature(page)).toHaveText("CONNECTED BY YOU");
      await shot(page, size.name, "2-received-a-connected-gift-page");
      await device.context.close();
    });

    test(`the one who made the gift keeps "by them", on the lists and on the gift's own page (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(180_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      await neverAskedToBeTold(device.context);
      await lists(page, "funder");
      await connectedPage(page, "funder");
      await makeAnAccount(device);

      await page.goto("/gifts");
      expect(await saidOnTheList(page)).toEqual(["SHOWN BY THEM", "CONNECTED BY THEM", "READ FOR YOU"]);
      await expect(page.getByText(/BY YOU$/).filter({ visible: true })).toHaveCount(0);
      await shotEachCard(page, size.name, "3-given");

      await page.goto(`/g/${CONNECTED}`);
      await expect(pageNature(page)).toHaveText("CONNECTED BY THEM");
      await shot(page, size.name, "4-given-a-connected-gift-page");
      await device.context.close();
    });
  }
});
