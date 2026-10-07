import { expect, test, type Page, type Route } from "@playwright/test";
import { agreement, gift, json, makeAnAccount, now, profile, shot as capture, sizesFor } from "./gift-kit";

/**
 * A proof being made survives the gift's page being loaded again, and no page offers the link of a verification that
 * is over (7 Oct 2026).
 *
 * The first two real proofs of a university were made on a phone and never asked for: the student spent nine minutes
 * on the verification page, the phone let go of the gift's page meanwhile and loaded it again on the way back, and the
 * page, which kept the session in its own memory alone, offered "Show it". The page now asks the server which session
 * is open when it loads, waits for that one again and looks at once.
 *
 * On the third proof several pages of the gift were open: one had shown the proof, the others still offered a link
 * that Reclaim answered "verification failed" to. And one session had stalled at Reclaim, which ended it a quarter of
 * an hour later, while the page went on waiting. So a page that comes back to the front asks the server before it
 * draws a link again, and a verification Reclaim ended is said, with the button to show it again.
 *
 * What is real: the product's page against the server under test, a real account, every press and every reload. What
 * is stood in for: the gift, the session routes and the verdict, as in ./recipient-path.spec.ts, and the page going
 * behind another, which a test cannot do to a real tab. What this does not show: a real phone letting go of a tab,
 * and Reclaim's own page bringing the person back.
 *
 * VIKY_RELOAD_CAPTURES=<folder> also photographs each point, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_RELOAD_CAPTURES;
const SIZES = sizesFor(SHOTS);
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);
const WAITING = "Waiting for the proof. Come back to this page when you are done there.";
const VERIFY_PAGE = "https://share.reclaimprotocol.org/verify/?template=reload";
const HELD = "First proof from this university: checked within an hour.";
/** Puts the page behind another, or back in front, as a browser tells a page of it. */
const seen = (page: Page, state: "hidden" | "visible") =>
  page.evaluate(`Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "${state}" }); document.dispatchEvent(new Event("visibilitychange"));`);

test.describe("a proof being made survives the page being loaded again", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const size of SIZES) {
    test(`loaded again, the page waits for the open session and takes the proof that came meanwhile (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const GIFT = "1999981";
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      let opened = 0;
      let open = false;
      let made = false;
      let reached = false;
      let looks = 0;
      const yes = agreement(GIFT, "your TOEFL score");
      await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) =>
        route.fulfill(json(gift(GIFT, "recipient", reached ? { reached: true, reachedAtMs: Date.now(), finished: true, earned: "25000000", earnedDisplay: "$25.00", phase: "reached" } : {}))),
      );
      await page.route(`**/api/gift/${GIFT}/consent`, yes.handle);
      await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
      await page.route(`**/api/gift/${GIFT}/reached-seen`, (route) => route.fulfill(json({ seen: false })));
      // One address, two questions: which session is open (GET, by the gift), and open one (POST).
      await page.route(/\/api\/proof\/session(\?.*)?$/, (route) => {
        if (route.request().method() === "GET") {
          expect(new URL(route.request().url()).searchParams.get("giftId")).toBe(GIFT);
          return route.fulfill(json({ open: open ? { sessionId: "session_reload", conditionId: "toefl-mybest-shown", requestUrl: VERIFY_PAGE, secondsLeft: 1_500 } : null }));
        }
        opened += 1;
        open = true;
        return route.fulfill(json({ sessionId: "session_reload", requestUrl: VERIFY_PAGE, secondsLeft: 1_800 }));
      });
      await page.route("**/api/proof/verify", (route) => {
        looks += 1;
        expect(route.request().postDataJSON()).toEqual({ sessionId: "session_reload" });
        if (!made) return route.fulfill(json({ error: "Reclaim has not returned a proof yet", code: "NO_PROOF_YET" }, 409));
        reached = true;
        open = false;
        return route.fulfill(json({ kind: "reached", giftId: GIFT, metricValue: "96", shown: "96", observedAt: now(), hash: `0x${"ab".repeat(32)}` }));
      });

      await makeAnAccount(device);
      await page.clock.install();
      await page.goto(`/g/${GIFT}`);
      // Nothing open: the button, as before, and no look.
      await page.getByRole("button", { name: /^Show it$/ }).click();
      const link = page.getByRole("link", { name: "Sign in to ETS" });
      await expect(link).toHaveAttribute("href", VERIFY_PAGE);
      expect(opened).toBe(1);
      expect(looks).toBe(0);

      // The page is loaded again while the person is still on the verification page: the same link, the wait, no
      // button to start over, and one look at once that finds nothing yet.
      await page.reload();
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", VERIFY_PAGE);
      await expect(page.getByText(WAITING)).toBeVisible();
      await expect(page.getByRole("button", { name: /^Show it$/ })).toHaveCount(0);
      await expect.poll(() => looks).toBe(1);
      expect(opened, "no second session").toBe(1);
      await shot(page, size.name, "1-loaded-again-still-waiting");

      // The proof is made while the page is away, and the page is loaded again on the way back: taken at once.
      made = true;
      await page.reload();
      const moment = page.locator("dialog.reached-moment");
      await expect(moment).toBeVisible();
      expect(looks, "one look, with no twenty seconds to wait").toBe(2);
      expect(opened).toBe(1);
      await shot(page, size.name, "2-loaded-again-the-proof-was-there");
      await device.context.close();
    });

    test(`a press made before the page knows of the open session takes that one up (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const GIFT = "1999982";
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      let opened = 0;
      let looks = 0;
      // The server is slow to say which session is open: held here until the test lets it answer.
      let answer: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        answer = resolve;
      });
      const pending: Route[] = [];
      const yes = agreement(GIFT, "your TOEFL score");
      await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) => route.fulfill(json(gift(GIFT, "recipient", {}))));
      await page.route(`**/api/gift/${GIFT}/consent`, yes.handle);
      await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
      await page.route(/\/api\/proof\/session(\?.*)?$/, async (route) => {
        if (route.request().method() !== "GET") {
          opened += 1;
          return route.fulfill(json({ sessionId: "session_second", requestUrl: "https://share.reclaimprotocol.org/verify/?template=second", secondsLeft: 1_800 }));
        }
        pending.push(route);
        await held;
        return route.fulfill(json({ open: { sessionId: "session_first", conditionId: "toefl-mybest-shown", requestUrl: VERIFY_PAGE, secondsLeft: 1_200 } }));
      });
      await page.route("**/api/proof/verify", (route) => {
        looks += 1;
        expect(route.request().postDataJSON()).toEqual({ sessionId: "session_first" });
        return route.fulfill(json({ error: "Reclaim has not returned a proof yet", code: "NO_PROOF_YET" }, 409));
      });

      await makeAnAccount(device);
      await page.clock.install();
      await page.goto(`/g/${GIFT}`);
      const show = page.getByRole("button", { name: /^Show it$/ });
      await expect(show).toBeVisible();
      await expect.poll(() => pending.length).toBeGreaterThan(0);
      await show.click();
      await expect(page.getByRole("button", { name: "Preparing the verification" })).toBeVisible();
      answer();
      const link = page.getByRole("link", { name: "Sign in to ETS" });
      await expect(link).toHaveAttribute("href", VERIFY_PAGE);
      await expect.poll(() => looks).toBe(1);
      expect(opened, "the press opened no second session beside the open one").toBe(0);
      expect(yes.agreed(), "and signed nothing again").toBe(false);
      await device.context.close();
    });

    test(`back in front after another page showed the proof, the page offers no link and says where the gift stands (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const GIFT = "1999983";
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      let open = false;
      let held = false;
      let looks = 0;
      let asked = 0;
      const yes = agreement(GIFT, "your TOEFL score");
      await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) => route.fulfill(json(gift(GIFT, "recipient", held ? { review: { status: "pending" } } : {}))));
      await page.route(`**/api/gift/${GIFT}/consent`, yes.handle);
      await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
      await page.route(/\/api\/proof\/session(\?.*)?$/, (route) => {
        if (route.request().method() === "GET") {
          asked += 1;
          return route.fulfill(json({ open: open ? { sessionId: "session_two_pages", conditionId: "toefl-mybest-shown", requestUrl: VERIFY_PAGE, secondsLeft: 1_500 } : null }));
        }
        open = true;
        return route.fulfill(json({ sessionId: "session_two_pages", requestUrl: VERIFY_PAGE, secondsLeft: 1_800 }));
      });
      await page.route("**/api/proof/verify", (route) => {
        looks += 1;
        return route.fulfill(json({ error: "Reclaim has not returned a proof yet", code: "NO_PROOF_YET" }, 409));
      });

      await makeAnAccount(device);
      await page.clock.install();
      await page.goto(`/g/${GIFT}`);
      await page.getByRole("button", { name: /^Show it$/ }).click();
      const link = page.getByRole("link", { name: "Sign in to ETS" });
      await expect(link).toBeVisible();

      // The person leaves for the verification page: this page is behind, and asks nothing for five minutes.
      await seen(page, "hidden");
      await page.clock.fastForward(5 * 60_000);
      expect(looks, "a page behind another makes no look").toBe(0);

      // Another page of the gift takes the proof meanwhile: held for review, the session answered.
      open = false;
      held = true;
      const before = asked;
      await seen(page, "visible");
      await expect(page.getByText(HELD).first()).toBeVisible();
      await expect(link).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Show it$/ })).toHaveCount(0);
      expect(asked, "the server's row was asked").toBeGreaterThan(before);
      expect(looks, "and the verify route was not spent on a session that is over").toBe(0);
      await shot(page, size.name, "3-back-in-front-the-proof-was-shown-elsewhere");
      await device.context.close();
    });

    test(`a verification Reclaim ended is said, and the button shows it again (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const GIFT = "1999984";
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      let opened = 0;
      let open = false;
      const yes = agreement(GIFT, "your TOEFL score");
      await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) => route.fulfill(json(gift(GIFT, "recipient", {}))));
      await page.route(`**/api/gift/${GIFT}/consent`, yes.handle);
      await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
      await page.route(/\/api\/proof\/session(\?.*)?$/, (route) => {
        if (route.request().method() === "GET") return route.fulfill(json({ open: open ? { sessionId: `session_stalled_${opened}`, conditionId: "toefl-mybest-shown", requestUrl: VERIFY_PAGE, secondsLeft: 1_500 } : null }));
        opened += 1;
        open = true;
        return route.fulfill(json({ sessionId: `session_stalled_${opened}`, requestUrl: `${VERIFY_PAGE}-${opened}`, secondsLeft: 1_800 }));
      });
      // The server closes the session when Reclaim's record says it ended with no proof, and says so.
      await page.route("**/api/proof/verify", (route) => {
        open = false;
        return route.fulfill(json({ error: "The verification stopped before it made a proof. Show it again.", code: "VERIFICATION_STOPPED" }, 409));
      });

      await makeAnAccount(device);
      await page.clock.install();
      await page.goto(`/g/${GIFT}`);
      await page.getByRole("button", { name: /^Show it$/ }).click();
      const link = page.getByRole("link", { name: "Sign in to ETS" });
      await expect(link).toBeVisible();
      await page.clock.fastForward(21_000);
      await expect(page.getByText("The verification stopped before it made a proof. Show it again.")).toBeVisible();
      await expect(link).toHaveCount(0);
      const again = page.getByRole("button", { name: /^Show it$/ });
      await expect(again).toBeVisible();
      await shot(page, size.name, "4-the-verification-stopped");
      // Loaded again, the page takes nothing up: the session is closed.
      await page.reload();
      await expect(page.getByRole("button", { name: /^Show it$/ })).toBeVisible();
      await expect(link).toHaveCount(0);
      // The press opens a new one.
      await page.getByRole("button", { name: /^Show it$/ }).click();
      await expect(link).toHaveAttribute("href", `${VERIFY_PAGE}-2`);
      expect(opened).toBe(2);
      await device.context.close();
    });
  }
});
