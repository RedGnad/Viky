import { expect, test, type Locator, type Page } from "@playwright/test";
import { DAY, gift, json, makeAnAccount, neverAskedToBeTold, now, profile, shot as capture, sizesFor, type Who } from "./gift-kit";

/**
 * The path of a university gift (the founder's two mockups of 11 Oct 2026): its stops in a row, on the gift's card for
 * the student and for the one who pays, under the university chosen, and on the judges page. What is held here is what
 * a browser draws at each stop: which stops, which one the gift is at, what is written under it, and the words of the
 * card that follow it.
 *
 * The gift is the test's own, answered as the gift route answers it; the pages, the sign-in and every press are real.
 * The first gift at a university is walked whole, since it is the one that has the two stops that happen once: being
 * set up, their turn, being checked, theirs. It keeps those stops once its university has moved on.
 *
 * VIKY_PATH_CAPTURES=<folder> also photographs each state, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_PATH_CAPTURES;
const SIZES = sizesFor(SHOTS);
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);
/** The same picture by day and after dark: the path is drawn in the tokens of each. */
async function shotDayAndNight(page: Page, size: string, name: string) {
  await shot(page, size, name);
  if (!SHOTS) return;
  await page.emulateMedia({ colorScheme: "dark" });
  await shot(page, size, `${name}-after-dark`);
  await page.emulateMedia({ colorScheme: "light" });
}

const GIFT = "1999987";
const LAST_DAY_MS = (now() + 50 * DAY) * 1000;

type Path = { provider: "none" | "unpinned" | "ready" | "seconds"; results: boolean; waitedOnSetUp?: boolean; readByAPerson?: boolean };
/** The first gift at its university, at each of its four stops, as the status says it (src/milestone-status.ts). */
const BEING_SET_UP = { review: { status: "building" }, university: { provider: "none", results: false } satisfies Path };
const THEIR_TURN = { review: null, university: { provider: "unpinned", results: false, waitedOnSetUp: true } satisfies Path };
const BEING_CHECKED = { review: { status: "pending" }, university: { provider: "unpinned", results: false, waitedOnSetUp: true, readByAPerson: true } satisfies Path };
const THEIRS = {
  review: null,
  university: { provider: "ready", results: false, waitedOnSetUp: true, readByAPerson: true } satisfies Path,
  reached: true,
  reachedAtMs: Date.now(),
  finished: true,
  earned: "120000000",
  earnedDisplay: "$120.00",
  phase: "reached",
};

/** The list a chooser is answered: one university for each thing a provider can be to a gift on enrolment. */
const LIST = [
  { pair: "ucad-sn", title: "Université Cheikh Anta Diop", issuer: "Senegal", country: "SN", ready: ["enrolment"], path: { enrolment: "seconds" }, scale: null },
  { pair: "uac-bj", title: "Université d'Abomey-Calavi", issuer: "Benin", country: "BJ", ready: [], path: { enrolment: "unpinned" }, scale: null },
  { pair: "ugb-sn", title: "Université Gaston Berger", issuer: "Senegal", country: "SN", ready: [], scale: null },
  { pair: "unilag-ng", title: "University of Lagos", issuer: "Nigeria", country: "NG", ready: [], scale: null },
];

/** A gift on enrolment made an hour ago, so the day its university is set up by is still to come. */
const enrolment = (who: Who, over: Record<string, unknown> = {}) =>
  gift(GIFT, who, { conditionId: "university-enrollment-shown", target: 1, asked: "enrolled at that university", amount: "120000000", amountDisplay: "$120.00", deadlineMs: LAST_DAY_MS, createdAtChain: now() - 3_600, claimedAtChain: now() - 1_800, ...over });

async function answer(page: Page, status: () => unknown) {
  await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) => route.fulfill(json(status())));
  await page.route(`**/api/gift/${GIFT}/consent`, (route) =>
    route.fulfill(json({ giftId: GIFT, state: null, reading: "no_agreement", opened: true, finished: false, terms: { what: "your enrolment" }, until: "the gift's last day", texts: { yes: "yes", stop: "stop" } })),
  );
  await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
  // Seen before: the gift's arrival is not played again over the picture.
  await page.route(`**/api/gift/${GIFT}/reached-seen`, (route) => route.fulfill(json({ seen: true })));
  await page.route(/\/api\/proof\/session(\?.*)?$/, (route) => route.fulfill(json({ open: null })));
}

/** The path as it reads: each stop's label, what is written under it, and whether it is passed, stood on or to come. */
async function pathIn(scope: Locator): Promise<string[]> {
  const stops = scope.locator("ol.university-path li.university-stop");
  const read: string[] = [];
  for (let index = 0; index < (await stops.count()); index += 1) {
    const stop = stops.nth(index);
    const label = ((await stop.locator(".university-stop-label").textContent()) ?? "").trim();
    // A day is said as the device reads it: held as "a day", so the test is true on any date.
    const time = ((await stop.locator(".university-stop-time").textContent()) ?? "").trim().replace(/^by \d{1,2} [A-Z][a-z]{2}$/, "by a day");
    read.push(`${label}${time ? ` (${time})` : ""}: ${await stop.getAttribute("data-state")}`);
  }
  return read;
}
const expectPath = (scope: Locator, stops: string[]) => expect.poll(() => pathIn(scope), { timeout: 20_000 }).toEqual(stops);
/** The column the character stands in, counted from one; nothing when no character is drawn. */
const seatOf = (scope: Locator) => scope.locator("ol.university-path .university-path-seat");

test.describe("a university gift draws its path", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const size of SIZES) {
    test(`the student follows the first gift at their university through its four stops (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(180_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      let state: Record<string, unknown> = BEING_SET_UP;
      await answer(page, () => enrolment("recipient", state));
      await neverAskedToBeTold(device.context);
      await makeAnAccount(device);
      const main = page.locator("main");

      // 1. Being set up: the character over the first small stop, the day it is done by under it, nothing to press.
      await page.goto(`/g/${GIFT}`);
      await expectPath(main, ["Set up (by a day): now", "Shown: toCome", "Checked (once, 1 day): toCome", "Yours: toCome"]);
      await expect(seatOf(main)).toHaveCSS("grid-column-start", "1");
      await expect(page.getByText("Viky is setting up your university.", { exact: true })).toBeVisible();
      await expect(page.getByText(/^You are the first from it here, so this happens once\. Then you show your page, any day until \d{1,2} [A-Z][a-z]{2}\.$/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Show it", exact: true })).toHaveCount(0);
      await expect(page.getByText(/within (an|the) hour/)).toHaveCount(0);
      await shotDayAndNight(page, size.name, "1-student-being-set-up");
      // What there is to be told while it is set up: the day it is ready.
      await page.locator('[data-decide="messages"]').click();
      const messages = page.getByRole("dialog", { name: "Notifications" });
      await expect(messages.getByText("Get a message when it is ready.", { exact: true })).toBeVisible();
      await expect(messages.getByRole("button", { name: "Turn on", exact: true })).toBeVisible();
      await shot(page, size.name, "1b-student-message-when-ready");
      await messages.getByRole("button", { name: "Close" }).click();

      // 2. Their turn: the stop passed stays on the path, and the block under the card says the first time is longer.
      state = THEIR_TURN;
      await page.goto(`/g/${GIFT}`);
      await expectPath(main, ["Set up: done", "Shown (by you): now", "Checked (once, 1 day): toCome", "Yours: toCome"]);
      await expect(seatOf(main)).toHaveCSS("grid-column-start", "2");
      await expect(page.getByText("Show it from your own university account.", { exact: true })).toBeVisible();
      await expect(page.getByText(/^Any day until \d{1,2} [A-Z][a-z]{2}\.$/)).toBeVisible();
      await expect(page.locator("[data-first-time]")).toHaveText("The first time at a university, it takes a few minutes.");
      await expect(page.getByRole("button", { name: "Show it", exact: true })).toBeVisible();
      await shot(page, size.name, "2-student-their-turn");

      // 3. Being checked: a person at Viky reads this one, within a day.
      state = BEING_CHECKED;
      await page.goto(`/g/${GIFT}`);
      await expectPath(main, ["Set up: done", "Shown: done", "Checked (within a day): now", "Yours: toCome"]);
      await expect(seatOf(main)).toHaveCSS("grid-column-start", "3");
      await expect(page.getByText("Shown. Viky is checking it.", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("You are the first from your university here: a person at Viky reads this one.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Show it", exact: true })).toHaveCount(0);
      await shotDayAndNight(page, size.name, "3-student-being-checked");

      // 4. Theirs: every stop passed, the character over the last, and the two small stops still on the path.
      state = THEIRS;
      await page.goto(`/g/${GIFT}`);
      await expectPath(main, ["Set up: done", "Shown: done", "Checked: done", "Yours: now"]);
      await expect(seatOf(main)).toHaveCSS("grid-column-start", "4");
      await shotDayAndNight(page, size.name, "4-student-yours");
      await device.context.close();
    });

    test(`the one who pays follows the same stops, in their own words (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(180_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      // Nobody has opened it yet: the gift stands where it would stand opened.
      let state: Record<string, unknown> = { ...BEING_SET_UP, opened: false, connected: false, claimedAtChain: 0, phase: "unopened" };
      await answer(page, () => enrolment("funder", state));
      await neverAskedToBeTold(device.context);
      await makeAnAccount(device);
      const main = page.locator("main");

      await page.goto(`/g/${GIFT}`);
      await expectPath(main, ["Set up (by a day): now", "Shown: toCome", "Checked (once, 1 day): toCome", "Theirs: toCome"]);
      await expect(seatOf(main)).toHaveCSS("grid-column-start", "1");
      await shot(page, size.name, "5-payer-being-set-up-unopened");

      state = BEING_SET_UP;
      await page.goto(`/g/${GIFT}`);
      await expectPath(main, ["Set up (by a day): now", "Shown: toCome", "Checked (once, 1 day): toCome", "Theirs: toCome"]);
      await expect(page.getByText("Viky is setting up their university.", { exact: true })).toBeVisible();
      await expect(page.getByText(/^First gift at this university: it is set up once\. The money is in their name, and comes back to you on \d{1,2} [A-Z][a-z]{2} if it is not proved\.$/)).toBeVisible();
      await shot(page, size.name, "6-payer-being-set-up");

      state = THEIR_TURN;
      await page.goto(`/g/${GIFT}`);
      await expectPath(main, ["Set up: done", "Shown (by them): now", "Checked (once, 1 day): toCome", "Theirs: toCome"]);
      await expect(page.getByRole("button", { name: "Show it", exact: true })).toHaveCount(0);
      await shot(page, size.name, "7-payer-their-turn");

      state = BEING_CHECKED;
      await page.goto(`/g/${GIFT}`);
      await expectPath(main, ["Set up: done", "Shown: done", "Checked (within a day): now", "Theirs: toCome"]);
      await expect(page.getByText("They are the first from their university here: a person at Viky reads this one.", { exact: true })).toBeVisible();
      await shot(page, size.name, "8-payer-being-checked");

      state = THEIRS;
      await page.goto(`/g/${GIFT}`);
      await expectPath(main, ["Set up: done", "Shown: done", "Checked: done", "Theirs: now"]);
      await shot(page, size.name, "9-payer-theirs");

      // The card in the list of gifts draws the same path, and says no day: a list holds no clock to know it by.
      await page.unroute("**/api/gifts/mine");
      await page.route("**/api/gifts/mine", (route) =>
        route.fulfill(
          json({
            account: "",
            gifts: [
              { giftId: GIFT, role: "funder", goalType: 40, goalUsername: null, usernameSource: null, recipientName: "Boo", funderName: "Mom", catchUpSeconds: 108_000, days: [], fundedAt: now() - 3_600, startDay: 0, endDay: 0, amountDisplay: "$120.00", perDayDisplay: "$0.00", durationDays: 30, creditedDays: 0, missedDays: 0, opened: true, counting: true, finished: false, cancelled: false, earnedDisplay: "$0.00", theirsDisplay: "$0.00", returnedDisplay: "$0.00", milestone: enrolment("funder", BEING_SET_UP) },
            ],
          }),
        ),
      );
      await page.goto("/gifts");
      const card = page.locator(`a[href="/g/${GIFT}"]`);
      await expectPath(card, ["Set up: now", "Shown: toCome", "Checked (once, 1 day): toCome", "Theirs: toCome"]);
      await expect(seatOf(card)).toHaveCSS("grid-column-start", "1");
      // And it says what the gift's own page says, in the reader's words.
      await expect(card.getByText("Viky is setting up their university.", { exact: true })).toBeVisible();
      await expect(card.getByText(/Waiting for the university/)).toHaveCount(0);
      await shotDayAndNight(page, size.name, "9b-payer-card-in-gifts");
      await device.context.close();
    });

    test(`a university already set up shows the road alone, and a gift on results starts at Results (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(180_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      let status: () => unknown = () => enrolment("recipient", { university: { provider: "seconds", results: false } satisfies Path });
      await answer(page, () => status());
      await neverAskedToBeTold(device.context);
      await makeAnAccount(device);
      const main = page.locator("main");

      // Every gift after the first: two stops, and the second one in seconds. Nothing says the first time is longer.
      await page.goto(`/g/${GIFT}`);
      await expectPath(main, ["Shown (by you): now", "Yours (in seconds): toCome"]);
      await expect(page.getByRole("button", { name: "Show it", exact: true })).toBeVisible();
      await expect(page.locator("[data-first-time]")).toHaveCount(0);
      await shot(page, size.name, "10-student-university-ready");

      // Ready, its rule written again at each pass: the same road, and no time is promised.
      status = () => enrolment("recipient", { university: { provider: "ready", results: false } satisfies Path });
      await page.goto(`/g/${GIFT}`);
      await expectPath(main, ["Shown (by you): now", "Yours: toCome"]);

      // A provider nobody has shown from yet: the check stays, the setting up is behind.
      status = () => enrolment("recipient", { university: { provider: "unpinned", results: false } satisfies Path });
      await page.goto(`/g/${GIFT}`);
      await expectPath(main, ["Shown (by you): now", "Checked (once, 1 day): toCome", "Yours: toCome"]);
      await shot(page, size.name, "11-student-first-proof-at-a-university-set-up");

      // A gift on the year's results: Results first, and the character waits there.
      status = () =>
        gift(GIFT, "recipient", { conditionId: "university-year-passed-shown", target: 1, asked: "passed the year at that university", amount: "120000000", amountDisplay: "$120.00", deadlineMs: (now() + 300 * DAY) * 1000, university: { provider: "unpinned", results: true } satisfies Path });
      await page.goto(`/g/${GIFT}`);
      await expectPath(main, ["Results (end of year): now", "Shown: toCome", "Checked (once, 1 day): toCome", "Yours: toCome"]);
      await expect(page.getByText("Waiting for your results.", { exact: true })).toBeVisible();
      await shot(page, size.name, "12-student-results");
      await device.context.close();
    });

    test(`a stop passed while the page stands is the hop of a day earned, and nothing moves under reduced motion (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(180_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      let state: Record<string, unknown> = THEIR_TURN;
      await answer(page, () => enrolment("recipient", state));
      // The person is back from the verification page with its session open: the page asks what became of it.
      await page.unroute(/\/api\/proof\/session(\?.*)?$/);
      await page.route(/\/api\/proof\/session(\?.*)?$/, (route) =>
        route.fulfill(json({ open: state === THEIR_TURN ? { sessionId: "session_path", conditionId: "university-enrollment-shown", requestUrl: "https://example.org/verify", secondsLeft: 1_500 } : null })),
      );
      let verdict: (() => Promise<void>) | null = null;
      await page.route("**/api/proof/verify", (route) => {
        // Held until the test lets it: the proof is the first from its university, so a person reads it.
        verdict = async () => {
          state = BEING_CHECKED;
          await route.fulfill(json({ kind: "held", sessionId: "session_path", giftId: GIFT, message: "First proof from this university: checked within a day.", attested: false }));
        };
      });
      // Every movement the character's seat is given is written down, and stopped where it starts, so the test can
      // look at it image by image.
      await device.context.addInitScript(`(() => {
        window.__hops = [];
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (frames, options) {
          const running = animate.call(this, frames, options);
          if (this.classList && this.classList.contains("university-path-character")) {
            running.pause();
            window.__hops.push({ frames, options, running });
          }
          return running;
        };
      })()`);
      await neverAskedToBeTold(device.context);
      await makeAnAccount(device);
      const main = page.locator("main");

      await page.goto(`/g/${GIFT}`);
      await expectPath(main, ["Set up: done", "Shown (by you): now", "Checked (once, 1 day): toCome", "Yours: toCome"]);
      await expect.poll(() => verdict !== null, { timeout: 30_000 }).toBe(true);
      // Arriving on the page is no hop: the character is where the gift is, from the first image.
      expect(await page.evaluate("window.__hops.length")).toBe(0);

      await verdict!();
      await expectPath(main, ["Set up: done", "Shown: done", "Checked (within a day): now", "Yours: toCome"]);
      await expect(seatOf(main)).toHaveCSS("grid-column-start", "3");
      await expect.poll(() => page.evaluate("window.__hops.length")).toBe(1);
      // One stop back at its first image, up by the share of its height a day earned rises by, in that movement's time.
      const hop = (await page.evaluate(`(() => {
        const one = window.__hops[0];
        const seat = document.querySelector(".university-path-seat").getBoundingClientRect();
        const body = document.querySelector(".university-path-character").getBoundingClientRect();
        return { first: one.frames[0].transform, top: one.frames[1].transform, last: one.frames[2].transform, duration: one.options.duration, column: seat.width, height: body.height };
      })()`)) as { first: string; top: string; last: string; duration: number; column: number; height: number };
      expect(hop.duration).toBe(300);
      expect(hop.first).toBe(`translate(${-hop.column}px, 0)`);
      expect(hop.top).toBe(`translate(calc(${-hop.column}px / 2), ${-0.38 * hop.height}px)`);
      expect(hop.last).toBe("translate(0, 0)");
      // Image by image: over the stop it left, at the top of the hop, landed.
      for (const [name, at] of [["20-hop-1-leaving-shown", 0], ["20-hop-2-at-the-top", 170], ["20-hop-3-landing", 280]] as const) {
        await page.evaluate(`window.__hops[0].running.currentTime = ${at}`);
        await shot(page, size.name, name);
      }
      await page.evaluate("window.__hops[0].running.finish()");
      await shot(page, size.name, "20-hop-4-on-checked");
      await device.context.close();

      // Reduced motion: the character is simply over the next stop.
      const still = await profile(browser, baseURL, size.viewport);
      await still.page.emulateMedia({ reducedMotion: "reduce" });
      state = THEIR_TURN;
      verdict = null;
      await answer(still.page, () => enrolment("recipient", state));
      await still.page.unroute(/\/api\/proof\/session(\?.*)?$/);
      await still.page.route(/\/api\/proof\/session(\?.*)?$/, (route) =>
        route.fulfill(json({ open: state === THEIR_TURN ? { sessionId: "session_path", conditionId: "university-enrollment-shown", requestUrl: "https://example.org/verify", secondsLeft: 1_500 } : null })),
      );
      await still.page.route("**/api/proof/verify", (route) => {
        verdict = async () => {
          state = BEING_CHECKED;
          await route.fulfill(json({ kind: "held", sessionId: "session_path", giftId: GIFT, message: "First proof from this university: checked within a day.", attested: false }));
        };
      });
      await still.context.addInitScript(`(() => {
        window.__hops = 0;
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (frames, options) {
          if (this.classList && this.classList.contains("university-path-character")) window.__hops += 1;
          return animate.call(this, frames, options);
        };
      })()`);
      await neverAskedToBeTold(still.context);
      await makeAnAccount(still);
      await still.page.goto(`/g/${GIFT}`);
      await expect.poll(() => verdict !== null, { timeout: 30_000 }).toBe(true);
      await verdict!();
      await expect(seatOf(still.page.locator("main"))).toHaveCSS("grid-column-start", "3");
      expect(await still.page.evaluate("window.__hops")).toBe(0);
      await still.context.close();
    });

    test(`under the university chosen, the path the gift will take, before anything has started (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const device = await profile(browser, baseURL, size.viewport, { passkey: false });
      const { page } = device;
      await page.route(/\/api\/portals\?all=1$/, (route) => route.fulfill(json({ results: LIST })));
      const sheet = page.locator("dialog.sheet[open]");
      await page.goto("/");
      await page.locator("main section").first().getByRole("button").first().click();
      const change = sheet.getByRole("button", { name: /^Change/i });
      if (await change.isVisible().catch(() => false)) await change.click();
      const line = sheet.getByRole("button", { name: /At university/ });
      if (!(await line.isVisible().catch(() => false))) {
        const all = sheet.getByRole("button", { name: /All families/i });
        if (await all.isVisible().catch(() => false)) await all.click();
        await sheet.getByRole("button", { name: /School & studies/ }).click();
      }
      await line.click();
      const lines = sheet.getByRole("group", { name: "Universities" }).locator("label");
      const chosen = sheet.locator("[data-university-chosen]");
      const modes = sheet.getByRole("group", { name: "What will they show?" });

      // The list of a gift on enrolment: "Ready today" in the sun wherever a student can show their page today, a
      // first proof read there or not, and "Ready in 2 days" where nothing is set up. No line is left without a time.
      await expect(lines).toHaveText(["Université Cheikh Anta DiopSenegalReady today", "Université d'Abomey-CalaviBeninReady today", "Université Gaston BergerSenegalReady in 2 days", "University of LagosNigeriaReady in 2 days"]);
      await shot(page, size.name, "14-chooser-list-enrolment");

      // Nothing set up yet: the four stops, every one to come, and no character.
      await lines.filter({ hasText: "University of Lagos" }).click();
      await expectPath(chosen, ["Set up (once, 2 days): toCome", "Shown: toCome", "Checked (once, 1 day): toCome", "Theirs: toCome"]);
      await expect(seatOf(chosen)).toHaveCount(0);
      await expect(chosen.locator("[data-university-when]")).toHaveText("First gift at this university: the next ones skip the two small stops. The money waits in their name meanwhile.");
      await shotDayAndNight(page, size.name, "15-chooser-first-gift");

      // The same university for a year passed: Results first, no setting up drawn.
      await modes.getByText("The year passed", { exact: true }).click();
      await expectPath(chosen, ["Results (end of year): toCome", "Shown: toCome", "Checked (once, 1 day): toCome", "Theirs: toCome"]);
      await expect(chosen.locator("[data-university-when]")).toHaveText("The money waits in their name meanwhile.");
      await shot(page, size.name, "16-chooser-results");
      await chosen.getByRole("button", { name: /Change/ }).click();
      await expect(lines).toHaveText(["Université Cheikh Anta DiopSenegal", "Université d'Abomey-CalaviBenin", "Université Gaston BergerSenegal", "University of LagosNigeria"]);
      await shot(page, size.name, "17-chooser-list-results");
      await modes.getByText("Enrolled", { exact: true }).click();

      // Set up, its first proof still to be read: three stops.
      await lines.filter({ hasText: "Abomey-Calavi" }).click();
      await expectPath(chosen, ["Shown: toCome", "Checked (once, 1 day): toCome", "Theirs: toCome"]);
      await expect(chosen.locator("[data-university-when]")).toHaveText("First student from this university: the next ones skip the small stop. The money waits in their name meanwhile.");
      await shot(page, size.name, "18-chooser-first-proof");
      await chosen.getByRole("button", { name: /Change/ }).click();

      // Ready: the road alone, in seconds, and nothing under it.
      await lines.filter({ hasText: "Cheikh Anta Diop" }).click();
      await expectPath(chosen, ["Shown: toCome", "Theirs (in seconds): toCome"]);
      await expect(chosen.locator("[data-university-when]")).toHaveCount(0);
      await shot(page, size.name, "19-chooser-ready");
      await device.context.close();
    });

    test(`the judges page draws the first gift and every gift after, each over the pass that ran it (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const device = await profile(browser, baseURL, size.viewport, { passkey: false });
      const { page } = device;
      await page.goto("/judges");
      // The universities are a fold of their own since 12 Oct 2026: a judge opens it by its title.
      await page.locator("#universities > details > summary").click();
      const block = page.locator('[data-minute="universities"]');
      await expect(block.getByText("A university is set up once, by its first gift.", { exact: true })).toBeVisible();
      await expect(block.getByText("Its first proof is read by hand. Viky then fixes the rule that reads its page, and every later proof is paid on sign-in.", { exact: true })).toBeVisible();
      const first = block.locator('[data-toulouse="first"]');
      await expect(first.getByText("The first gift", { exact: true })).toBeVisible();
      await expectPath(first, ["Set up (once, 2 days): toCome", "Shown: toCome", "Checked (once, 1 day): toCome", "Theirs: toCome"]);
      await expect(first).toContainText("Toulouse, 7 Oct 2026: a real student showed their enrolment, and the gift paid once the proof had been read by hand.");
      const after = block.locator('[data-toulouse="on-the-fixed-rule"]');
      await expect(after.getByText("Every gift after", { exact: true })).toBeVisible();
      await expectPath(after, ["Shown: toCome", "Theirs (in seconds): toCome"]);
      await expect(after).toContainText("Toulouse, 9 Oct 2026: a student showed their enrolment, and the gift paid 20 seconds after they signed in to their university's portal, with no review.");
      // No character on this page: nothing has started, on either path.
      await expect(seatOf(block)).toHaveCount(0);
      await expect(block.getByRole("link", { name: "the gift paid" })).toHaveCount(2);
      // No hour is promised for setting a university up (the rule of 11 Oct 2026), and that is asked of this block.
      // It was asked of the whole page until 12 Oct 2026: elsewhere the page now says "within the hour" of the pass a
      // scheduler calls every hour, which is another promise and a true one.
      await expect(block.getByText(/within (an|the) hour/)).toHaveCount(0);
      await block.scrollIntoViewIfNeeded();
      await page.evaluate(`document.querySelector('[data-minute="universities"]').scrollIntoView({ block: "center" })`);
      await shotDayAndNight(page, size.name, "13-judges-universities");
      await device.context.close();
    });
  }
});
