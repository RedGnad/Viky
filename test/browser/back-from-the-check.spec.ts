import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TERMS, daily, serve } from "./gift-fixtures";
import { DAY, agreement, gift, json, makeAnAccount, neverAskedToBeTold, now, profile, shot as capture, sizesFor } from "./gift-kit";

/**
 * Back from the verification, on a gift's page (the founder, 10 Oct 2026, on what he saw on 9 Oct and on an animated
 * mockup). The person came back to the "Show it" block with "Checking for your proof" in small; at the payment the
 * block said "Shown: ..." in small, the page read the gift again, the character was another drawing with no movement,
 * the title changed, "Reached on ..." pushed the amount down, and the moment opened.
 *
 * Walked here: the card says it is being checked, with the wheel, and no block stands under it; when the gift is paid
 * its character jumps and is the circle when it comes down; the words change where they stand as it lands, and nothing
 * on the card moves; the moment opens after. And the general rule: a day counted on the open page makes the same jump
 * from the triangle it was, and under reduced motion the final state is simply there.
 *
 * And the founder's three corrections of the same day. The jump's height gives way to the room above the character:
 * at its top it stays under the line over it. "Shown." is said only to a person the verification page brought back
 * with a proof made, by a mark in the address that the page reads once and takes out of the bar; a page loaded again
 * on a session still open says "Checking for your proof". And under the card nothing changes until the moment covers
 * the page.
 *
 * What is real: the product's page against the server under test, a real account, every press. What is stood in for:
 * the gift, the session routes and the verdict, as in ./shown-proof-reload.spec.ts. What this does not show: the very
 * first image of a page the server read with the session open (here the browser asks for it, a moment after), and
 * Reclaim's own page bringing the person back.
 *
 * Every animation the page starts is slowed, so the order of what happens is read without racing it; the clock that
 * times the landing is the page's own animations, slowed with the rest.
 *
 * VIKY_RETURN_CAPTURES=<folder> also photographs the frames of the founder's board, at 390 by 844 and at 1440 by 900,
 * each with every animation held at its own time.
 */
const SHOTS = process.env.VIKY_RETURN_CAPTURES;
const SIZES = sizesFor(SHOTS);
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);
const SLOW = 8;
/** Every animation a page starts from now on runs `SLOW` times slower: the cues that time the landing with them. */
const SLOWED = `(() => { const animate = Element.prototype.animate; Element.prototype.animate = function (...given) { const made = animate.apply(this, given); made.playbackRate = ${1 / SLOW}; return made; }; })()`;
const VERIFY_PAGE = "https://share.reclaimprotocol.org/verify/?template=return";

const card = (page: Page) => page.locator("section.gift-card-placed");
const state = (page: Page) => card(page).locator(".gift-state");
const waitLine = (page: Page) => card(page).locator("[data-waiting]");
const moment = (page: Page) => page.locator("dialog.reached-moment");
/**
 * How far under its card's top edge the amount stands, by the two boxes themselves, read once nothing moves the amount
 * (its swell changes its box for a moment). An expression: a function sent to the page loses its name on the way.
 */
const AMOUNT = `document.querySelector('section.gift-card-placed [data-turns="amount"]')`;
const amountTop = async (page: Page) => {
  await expect.poll(() => page.evaluate(`${AMOUNT}.getAnimations().length`), { timeout: 30_000 }).toBe(0);
  return page.evaluate(`Math.round((${AMOUNT}.getBoundingClientRect().top - document.querySelector('section.gift-card-placed').getBoundingClientRect().top) * 100) / 100`) as Promise<number>;
};
const cardHeight = (page: Page) => page.evaluate(`document.querySelector('section.gift-card-placed').offsetHeight`) as Promise<number>;
/**
 * Where the card itself stands on the page, read once it stands still (a page that has just arrived is still rising):
 * what stands above it must not push it either.
 */
const CARD_TOP = `Math.round((document.querySelector('section.gift-card-placed').getBoundingClientRect().top + window.scrollY) * 100) / 100`;
const cardTop = async (page: Page) => {
  let last = Number.NaN;
  await expect
    .poll(async () => {
      const now = (await page.evaluate(CARD_TOP)) as number;
      const still = now === last;
      last = now;
      return still;
    }, { intervals: [250], timeout: 30_000 })
    .toBe(true);
  return last;
};

/** The line over the character on the card, and the character's own moving part. */
const ABOVE = `document.querySelector('section.gift-card-placed .gift-shape').previousElementSibling`;
const FIGURE = `document.querySelector('.had-or-not [data-part="figure"]')`;
/**
 * The jump as the page plays it, in pixels: how far it rises, how much taller it is drawn at its top, the room between
 * the character at rest and the line over it, and what the jump's own rise would have been.
 */
const RISE = `(() => { const figure = ${FIGURE}; const svg = figure.closest("svg"); const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width; const box = figure.getBBox(); const frames = figure.getAnimations().flatMap((one) => one.effect.getKeyframes()); const units = Math.max(...frames.map((frame) => { const found = /translateY\\(-([\\d.]+)px\\)/.exec(String(frame.transform)); return found ? Number(found[1]) : 0; })); const stretch = Math.max(...frames.map((frame) => { const found = /scale\\([\\d.]+, ([\\d.]+)\\)/.exec(String(frame.transform)); return found ? Number(found[1]) : 1; })); const restTop = svg.getBoundingClientRect().top + (box.y - svg.viewBox.baseVal.y) * scale; const round = (value) => Math.round(value * 100) / 100; return { risePx: round(units * scale), stretchPx: round((stretch - 1) * box.height * scale), roomPx: round(restTop - ${ABOVE}.getBoundingClientRect().bottom), ownPx: round(0.38 * box.height * scale), heightPx: round(box.height * scale) }; })()`;
/** How far under the line over it the circle's top stands, at the stretch of the jump's highest image. */
const CIRCLE_TOP_UNDER_THE_LINE = `(() => { const circle = document.querySelector('.had-or-not [data-part="body"] circle'); const svg = circle.closest("svg"); const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width; const box = circle.getBoundingClientRect(); return (box.top + box.bottom) / 2 - circle.r.baseVal.value * scale * 1.08 - ${ABOVE}.getBoundingClientRect().bottom; })()`;
const seeItAgain = (page: Page) => page.locator("button", { hasText: "See it again" });
const youDecide = (page: Page) => page.locator('[data-decide="messages"]');

/** The animations that time the landing, and the confetti of the moment: the two clocks a frame is held on. */
const LANDING = "document.documentElement.getAnimations()";
const RAIN = "[...document.querySelectorAll('.confetti-piece')].flatMap((piece) => piece.getAnimations())";
/** Holds every animation where it is once `clock` has run `ms` of its own time, and says what time that was. */
const holdAt = (page: Page, clock: string, ms: number) =>
  page.evaluate(
    `new Promise((done, refuse) => { const asked = performance.now(); let seen = false; const tick = () => { const running = ${clock}; const at = running.length ? Math.max(...running.map((one) => Number(one.currentTime ?? 0))) : -1; if (running.length) seen = true; if (at >= ${ms}) { document.getAnimations().forEach((one) => one.pause()); done(at); } else if (!running.length && (seen || performance.now() - asked > 5000)) refuse(new Error("the clock this frame is held on is not running: asked for ${ms} ms of it")); else requestAnimationFrame(tick); }; tick(); })`,
  ) as Promise<number>;
const letGo = (page: Page) => page.evaluate(`document.getAnimations().forEach((one) => { if (one.playState === "paused") one.play(); })`);

const GIFT = "1999971";
const enrolment = (over: Record<string, unknown> = {}) =>
  gift(GIFT, "recipient", { conditionId: "university-enrollment-shown", target: 1, asked: "enrolled at that university", amount: "5000000", amountDisplay: "$5.00", deadlineMs: (now() + 20 * DAY) * 1000, ...over });
const paid = () => enrolment({ reached: true, reachedAtMs: Date.now(), finished: true, earned: "5000000", earnedDisplay: "$5.00", phase: "reached" });

/** The gift, its session open as the person comes back, and a verdict the test holds until it lets the chain pay. */
async function backFromTheCheck(page: Page) {
  let reached = false;
  const looks: Route[] = [];
  const yes = agreement(GIFT, "your enrolment");
  await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) => route.fulfill(json(reached ? paid() : enrolment())));
  await page.route(`**/api/gift/${GIFT}/consent`, yes.handle);
  await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
  await page.route(`**/api/gift/${GIFT}/reached-seen`, (route) => route.fulfill(json({ seen: false })));
  await page.route(/\/api\/proof\/session(\?.*)?$/, (route) =>
    route.fulfill(json(route.request().method() === "GET" ? { open: reached ? null : { sessionId: "session_return", conditionId: "university-enrollment-shown", requestUrl: VERIFY_PAGE, secondsLeft: 1_500 } } : { sessionId: "session_return", requestUrl: VERIFY_PAGE, secondsLeft: 1_800 })),
  );
  // The look is held: the chain takes its seconds to pay, and the page waits on this one answer.
  await page.route("**/api/proof/verify", (route) => void looks.push(route));
  return {
    looks: () => looks.length,
    /** The chain paid: the verdict is given, and the gift read again is reached. */
    pay: async () => {
      reached = true;
      await looks[0].fulfill(json({ kind: "reached", giftId: GIFT, metricValue: "1", shown: "Enrolled", observedAt: now(), hash: `0x${"ab".repeat(32)}` }));
    },
  };
}

test.describe("back from the verification, on the gift's page", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const size of SIZES) {
    test(`the card says it is checked, its character jumps and becomes the circle, the words change in place, then the moment (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(180_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      await neverAskedToBeTold(device.context);
      const check = await backFromTheCheck(page);
      await makeAnAccount(device);
      await page.addInitScript(SLOWED);
      // The address the verification page brings the person back to once a proof is made (src/shown-return.ts).
      await page.goto(`/g/${GIFT}?shown=1`);

      // Back, with the session open: the card says where the proof stands, with the wheel, and no block under it.
      await expect(state(page)).toHaveText("Shown. Viky is checking it.");
      // The mark is read once: it is out of the address bar, so a page loaded again does not say it a second time.
      await expect.poll(() => new URL(page.url()).search).toBe("");
      await expect(waitLine(page)).toHaveText("Keep this page open.");
      await expect(waitLine(page).locator(".working-ring")).toBeVisible();
      await expect.poll(check.looks).toBe(1);
      await expect(page.getByText("Show it from your university account")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Show it$/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /^Sign in to/ })).toHaveCount(0);
      await expect(page.getByText(/Checking for your proof|^Shown: /)).toHaveCount(0);
      await expect(card(page).locator(".gift-action")).toBeHidden();
      await expect(card(page).locator(".gift-meta").first()).toHaveText("In your name");
      await expect(card(page).locator('.had-or-not svg[data-character="today"]')).toBeVisible();
      const top = await amountTop(page);
      const height = await cardHeight(page);
      const stands = await cardTop(page);
      await shot(page, size.name, "1-back-checking");

      // The chain pays. The character is told at once and jumps as the triangle it was; the card still says what it said.
      await check.pay();
      const jumping = card(page).locator('.had-or-not[data-change="earned"] svg[data-character="earned"][data-from="today"]');
      await expect(jumping).toBeVisible();
      await expect(state(page)).toHaveText("Shown. Viky is checking it.");
      await expect(waitLine(page)).toHaveText("Keep this page open.");
      await expect(moment(page)).toHaveCount(0);
      // The jump's height gives way to the room above the character: at its top, drawn taller as it is there, it stays
      // under the line that says what the gift is for. It still jumps, and never higher than the jump's own rise.
      const rise = (await page.evaluate(RISE)) as { risePx: number; stretchPx: number; roomPx: number; ownPx: number; heightPx: number };
      expect(rise.risePx).toBeGreaterThan(4);
      expect(rise.risePx + rise.stretchPx, "its top travels no further than the room above it").toBeLessThanOrEqual(rise.roomPx + 0.5);
      expect(rise.risePx).toBeLessThanOrEqual(rise.ownPx + 0.5);
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true });
        writeFileSync(join(SHOTS, `the-jump-measured-${size.name}.json`), `${JSON.stringify(rise, null, 2)}\n`);
      }
      if (SHOTS) {
        // It gathers, then it is at the top, where the triangle is going and the circle is coming: both partly there.
        // (The fade runs on the standard curve, which is most of the way through by its middle.)
        await holdAt(page, LANDING, 100);
        await shot(page, size.name, "2-it-gathers");
        await letGo(page);
        await holdAt(page, LANDING, 250);
        for (const part of ["was", "body"]) {
          const opacity = Number(await page.evaluate(`getComputedStyle(document.querySelector('.had-or-not [data-part="${part}"]')).opacity`));
          expect(opacity, part).toBeGreaterThan(0);
          expect(opacity, part).toBeLessThan(1);
        }
        // At the top of its jump the circle is under the line over it: it passes over no line. Read from the circle's
        // own middle and its radius, drawn taller as it is there: the box the browser gives a turning drawing is the
        // turned rectangle around it, wider and taller than what is seen.
        expect((await page.evaluate(CIRCLE_TOP_UNDER_THE_LINE)) as number).toBeGreaterThanOrEqual(-0.5);
        await shot(page, size.name, "3-at-the-top-it-becomes-the-circle");
        await letGo(page);
        // It lands, and the words that stood are going out where they stand.
        await holdAt(page, LANDING, 400);
        await expect(state(page)).toHaveText("Shown. Viky is checking it.");
        await shot(page, size.name, "4-it-lands-the-words-change-in-place");
        await letGo(page);
      }

      // Landed: the card says it, in the same places, and the moment has not opened yet.
      await expect(state(page)).toHaveText("It is yours.");
      await expect(moment(page)).toHaveCount(0);
      await expect(card(page).locator(".gift-next")).toHaveText(/^Reached on \d{1,2} [A-Z][a-z]{2} \d{4}\.$/);
      await expect(waitLine(page)).toHaveCount(0);
      await expect(card(page).locator(".gift-meta").first()).toHaveText("Yours");
      // No character appears at the head of the page as the card's own lands: the head stays as it was.
      expect(await page.evaluate(`document.querySelectorAll("main [data-reacts]").length`)).toBe(0);
      // Under the card nothing has changed yet: the controls of the person it is for are there, "See it again" is not.
      await expect(youDecide(page)).toHaveCount(1);
      await expect(seeItAgain(page)).toHaveCount(0);
      if (SHOTS) {
        // Taken while the landing's own clock still runs: the measures below wait for stillness, and it would have run out.
        await holdAt(page, LANDING, 800);
        expect(await page.evaluate(`getComputedStyle(document.querySelector('.had-or-not [data-part="was"]')).opacity`)).toBe("0");
        await shot(page, size.name, "5-landed");
        await letGo(page);
      }
      // Read once nothing moves, by the boxes themselves; the moment may have opened over the page by then, which
      // changes nothing of where the card and its amount stand under it.
      expect(await amountTop(page), "the amount is where it was: nothing pushed it").toBe(top);
      expect(await cardHeight(page), "and the card is as tall as it was").toBe(height);
      expect(await cardTop(page), "and stands where it stood").toBe(stands);
      // The circle alone is drawn now, the triangle it carried out of sight.
      expect(await page.evaluate(`getComputedStyle(document.querySelector('.had-or-not [data-part="body"]')).opacity`)).toBe("1");

      // The moment, after the landing, unchanged: the confetti, and the amount that turns "yours".
      await expect(moment(page)).toBeVisible({ timeout: 30_000 });
      await expect(moment(page).getByRole("heading", { name: "You did it." })).toBeVisible();
      // Once the moment is fully there over the page, the page under it is the reached gift's, changed unseen.
      await expect(seeItAgain(page)).toHaveCount(1, { timeout: 30_000 });
      await expect(youDecide(page)).toHaveCount(0);
      if (SHOTS) {
        await holdAt(page, RAIN, 1_220);
        await shot(page, size.name, "6-the-moment");
        await letGo(page);
      }
      // The moment closed, the page is the one a later visit would draw.
      await moment(page).getByRole("button", { name: "See the gift" }).click();
      await expect(moment(page)).toHaveCount(0);
      await expect(seeItAgain(page)).toBeVisible();
      await expect(state(page)).toHaveText("It is yours.");
      await shot(page, size.name, "7-after-the-moment");
      await device.context.close();
    });
  }

  for (const size of SIZES) {
    test(`a page loaded again on a session still open says what it is doing, and never "Shown." (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      await neverAskedToBeTold(device.context);
      const check = await backFromTheCheck(page);
      await makeAnAccount(device);
      await page.addInitScript(SLOWED);
      // No mark: nothing says a proof was made. The session is open, so the page asks what became of it.
      await page.goto(`/g/${GIFT}`);
      await expect(state(page)).toHaveText("Checking for your proof");
      await expect(waitLine(page)).toHaveText("Keep this page open.");
      await expect.poll(check.looks).toBe(1);
      await expect(page.getByText(/Shown\./)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Show it$/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /^Sign in to/ })).toHaveCount(0);
      await expect(card(page).locator(".gift-action")).toBeHidden();
      const top = await amountTop(page);
      await shot(page, size.name, "1b-loaded-again-checking");
      // A proof was there all the same: paid, the character jumps and the card says it, where the words stood.
      await check.pay();
      await expect(card(page).locator('.had-or-not[data-change="earned"]')).toBeVisible();
      await expect(state(page)).toHaveText("It is yours.");
      await expect(page.getByText(/Shown\./)).toHaveCount(0);
      expect(await amountTop(page), "nothing pushed the amount").toBe(top);
      await expect(moment(page)).toBeVisible({ timeout: 30_000 });
      await device.context.close();
    });
  }

  test("under reduced motion the final state is simply there: nothing jumps, nothing is held", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const device = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page } = device;
    await neverAskedToBeTold(device.context);
    const check = await backFromTheCheck(page);
    await makeAnAccount(device);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/g/${GIFT}?shown=1`);
    await expect(state(page)).toHaveText("Shown. Viky is checking it.");
    await expect(waitLine(page)).toHaveText("Keep this page open.");
    await expect.poll(check.looks).toBe(1);
    await check.pay();
    await expect(state(page)).toHaveText("It is yours.");
    await expect(card(page).locator('.had-or-not svg[data-character="earned"]')).toBeVisible();
    expect(await page.evaluate(`document.querySelector('.had-or-not').getAnimations({ subtree: true }).length`), "the character does not move").toBe(0);
    expect(await page.evaluate(`getComputedStyle(document.querySelector('.had-or-not [data-part="was"]')).opacity`), "and the triangle it was is not seen").toBe("0");
    expect(await page.evaluate(`document.documentElement.getAnimations().length`), "nothing times a landing").toBe(0);
    await expect(moment(page)).toBeVisible();
    await device.context.close();
  });

  test("a day counted on the open page jumps as the triangle it was, and the days done before it do not move", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const DAILY = "47";
    const today = Math.floor(now() / DAY);
    const device = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page } = device;
    await neverAskedToBeTold(device.context);
    let counted = false;
    const done = () => daily(DAILY, "recipient", { creditedDays: 3, daysLeft: 4, earned: "3000000", earnedDisplay: "$3.00", alreadyTheirs: "3000000", alreadyTheirsDisplay: "$3.00", days: [{ day: today - 2, outcome: "earned" }, { day: today - 1, outcome: "earned" }, { day: today, outcome: "earned" }] });
    await serve(page, DAILY, () => (counted ? done() : daily(DAILY, "recipient")), TERMS.daily);
    await page.route(`**/api/gift/${DAILY}/count`, (route) => {
      counted = true;
      return route.fulfill(json({ kind: "counted", giftId: DAILY, totalXp: 1_010, creditedDays: 3, hash: `0x${"c3".repeat(32)}` }));
    });
    await makeAnAccount(device);
    await page.addInitScript(SLOWED);
    await page.goto(`/g/${DAILY}`);
    const days = card(page).locator(".day-row-day svg");
    await expect(days.nth(2)).toHaveAttribute("data-character", "today");
    await page.getByText("How this is checked").click();
    await page.getByRole("button", { name: "Count now" }).click();
    // The day is the circle now, and it carries the triangle it was into its jump.
    await expect(days.nth(2)).toHaveAttribute("data-character", "earned");
    await expect(days.nth(2)).toHaveAttribute("data-from", "today");
    await expect(days.nth(2).locator('[data-part="was"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(`document.querySelectorAll('.day-row-day')[2].getAnimations({ subtree: true }).length`)).toBeGreaterThan(0);
    // The days done before this page was opened were never drawn otherwise here: they carry nothing and do not move.
    for (const before of [0, 1]) {
      await expect(days.nth(before)).not.toHaveAttribute("data-from", /.*/);
      expect(await page.evaluate(`document.querySelectorAll('.day-row-day')[${before}].getAnimations({ subtree: true }).length`)).toBe(0);
    }
    // Once it has landed the circle alone is seen.
    await expect.poll(() => page.evaluate(`document.querySelectorAll('.day-row-day')[2].getAnimations({ subtree: true }).length`), { timeout: 30_000 }).toBe(0);
    expect(await page.evaluate(`getComputedStyle(document.querySelectorAll('.day-row-day')[2].querySelector('[data-part="was"]')).opacity`)).toBe("0");
    expect(await page.evaluate(`getComputedStyle(document.querySelectorAll('.day-row-day')[2].querySelector('[data-part="body"]')).opacity`)).toBe("1");
    await device.context.close();
  });
});
