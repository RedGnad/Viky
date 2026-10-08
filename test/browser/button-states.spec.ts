import { expect, test } from "@playwright/test";
import { TERMS, aWindow, daily, photographer, serve } from "./gift-fixtures";
import { json, makeAnAccount, neverAskedToBeTold } from "./gift-kit";

/**
 * The one button and its four states (the UI pass of 8 Oct 2026, rule 3), walked on the page of the person who offered
 * a gift: at rest, doing with the wheel and what is being done, done with the mark, and failed, back at rest with a
 * line under it. Before, a button at work faded and kept still, "Copied" stayed for good, and a refusal stood
 * somewhere in the sheet.
 *
 * What is real: the product's page against the server under test, its sign-in with a passkey, every press. What is
 * stood in for: the gift, and the route that takes it back, held here for as long as the test wants and then refused.
 *
 * VIKY_BUTTON_CAPTURES=<folder> also photographs each state, at 390 by 844, or at 1440 by 900 with VIKY_CAPTURE_DESK=1.
 */
const shot = photographer(process.env.VIKY_BUTTON_CAPTURES);
const SUN = "rgb(255, 197, 49)";
/** The matrix of a button put down by its own depth, four pixels. */
const DOWN = "matrix(1, 0, 0, 1, 0, 4)";

test.describe("the one button, four states", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: the test opens its own window");

  test("at rest, doing, done and failed, each seen from the press", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const GIFT = "56";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await device.context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await serve(
      page,
      GIFT,
      () =>
        daily(GIFT, "funder", {
          opened: false,
          connected: false,
          creditedDays: 0,
          days: [],
          startDay: 0,
          endDay: 0,
          earned: "0",
          earnedDisplay: "$0.00",
          alreadyTheirs: "0",
          alreadyTheirsDisplay: "$0.00",
          claimedAtChain: 0,
          version: 1,
          end: null,
          goalAccount: { username: "boo_learns", source: "funder", bound: false, code: null, codeExpiresAt: null },
        }),
      TERMS.daily,
      null,
    );
    let asked = 0;
    let answer: (() => void) | undefined;
    await page.route(`**/api/gift/${GIFT}/cancel`, async (route) => {
      asked += 1;
      await new Promise<void>((resolve) => (answer = resolve));
      await route.fulfill(json({ code: "TEST", error: "This gift was opened a moment ago. Nothing was taken back." }, 409));
    });
    await makeAnAccount(device);
    const link = `${device.baseURL}/g/${GIFT}?t=AbCdEfGhIjKlMnOpQrStUv`;
    await page.evaluate(([id, kept]) => window.localStorage.setItem(`viky.gift-link.${id}`, kept), [GIFT, link]);
    await page.goto(`/g/${GIFT}`);

    // At rest: its words, on its relief, in the sun.
    const copy = page.getByRole("button", { name: "Copy the link" });
    await expect(copy).toBeVisible();
    await expect(copy).toHaveCSS("background-color", SUN);
    await expect(copy).toHaveCSS("transform", "none");
    await expect(copy).not.toHaveAttribute("data-state");
    await shot(page, "1-at-rest");

    // Done: the mark and the word, the button down and its sun given back, and the link is in the clipboard.
    await page.clock.install();
    await copy.click();
    const done = page.locator('button[data-state="done"]');
    await expect(done).toHaveText("Copied");
    await expect(done.locator("[data-done] svg")).toBeVisible();
    await expect(done).toHaveCSS("transform", DOWN);
    await expect(done).not.toHaveCSS("background-color", SUN);
    await expect(done).toHaveAttribute("aria-disabled", "true");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await shot(page, "2-done");
    // And then it is the button again, there to copy a second time: "Copied" stayed for good before. (The clock runs
    // on while it is installed, so the moment itself is held by test/waits.test.ts: 2.2 s.)
    await page.clock.runFor(2_500);
    await expect(done).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy the link" })).toHaveCSS("background-color", SUN);

    // Doing: the wheel and what is being done, in the button, which stays down in its own colour and is not faded.
    await page.locator('[data-decide="back"]').click();
    const sheet = page.getByRole("dialog", { name: "Take back the gift for Boo" });
    const take = sheet.getByRole("button", { name: "Take back $7.00" });
    await expect(take).toHaveCSS("background-color", SUN);
    await take.click();
    const doing = sheet.locator('button[data-state="doing"]');
    await expect(doing).toHaveText("Taking it back");
    await expect(doing.locator("[data-waiting] .working-ring")).toBeVisible();
    await expect(doing).toHaveCSS("background-color", SUN);
    await expect(doing).toHaveCSS("transform", DOWN);
    await expect(doing).toHaveAttribute("aria-busy", "true");
    await expect.poll(() => asked).toBe(1);
    // A second press while it works asks nothing more.
    await doing.click({ force: true });
    await doing.click({ force: true });
    expect(asked).toBe(1);
    // Past ten seconds the step in progress is named, right under the button.
    await page.clock.runFor(10_500);
    await expect(sheet.locator("[data-step-in-progress]")).toHaveText("Bringing it back into your account.");
    await shot(page, "3-doing", false);

    // Failed: the button is back at rest, and one line under it says what did not happen.
    answer?.();
    const refused = sheet.getByRole("alert");
    await expect(refused).toHaveText("This gift was opened a moment ago. Nothing was taken back.");
    await expect(take).toHaveCSS("transform", "none");
    await expect(take).not.toHaveAttribute("data-state");
    await expect(sheet.locator("[data-waiting]")).toHaveCount(0);
    const [button, line] = await Promise.all([take.boundingBox(), refused.boundingBox()]);
    expect(line!.y, "the line is under the button it is about").toBeGreaterThan(button!.y + button!.height);
    expect(line!.y - (button!.y + button!.height), "and right under it, before the next button").toBeLessThan(40);
    await shot(page, "4-failed", false);
    await device.context.close();
  });
});
