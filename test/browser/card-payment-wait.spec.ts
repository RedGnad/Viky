import { expect, test, type Page } from "@playwright/test";
import { answerTheChain, json, makeAnAccount, profile, shot as capture, sizesFor } from "./gift-kit";

/**
 * The gift being made, and a creation that does not answer (the founder, 5 Oct 2026).
 *
 * A tester paid by card, read "something went wrong", left the page, and found the payment again from Home. Whether
 * the sentence was the card service's or ours is not known. Ours could have been: once the money is in the account,
 * the call that makes the gift answered a failure with "Something went wrong. Nothing was changed." and a screen that
 * said the gift had failed. Now a call that does not answer keeps the screen, says what is known, and is asked again
 * with the same signed request; a gift being made says so; and a gift already made leads to the gifts.
 *
 * The chain and the creation are answered here: nothing is ever sent to either. On a build that names no gift
 * contract the creation is never sent, and the test says so and stops.
 *
 * VIKY_CARD_WAIT_CAPTURES=<folder> also photographs each state, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_CARD_WAIT_CAPTURES;
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);
const sheet = (page: Page) => page.locator("dialog.sheet[open]").last();
const card = (page: Page) => page.locator('section[aria-labelledby="offer-card"]');
const NOT_ANSWERED = "The check did not answer. Your payment is not lost, and the wait goes on.";
const NEVER_AFTER_A_PAYMENT = /Something went wrong|Nothing was changed|nothing was changed|nothing was taken/;

test.describe("the gift being made: a creation that does not answer keeps the screen and is asked again", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(180_000);

  for (const size of sizesFor(SHOTS)) {
    test(`not answered, then being made, then already made: never a failure, never a second signature (${size.name})`, async ({ browser, baseURL }) => {
      const funder = await profile(browser, baseURL, size.viewport);
      const { page, context } = funder;
      await answerTheChain(context, { ausd: 50_000_000n, mon: 0n, usdc: 0n });
      await context.addCookies([{ name: "viky.currency", value: "EUR", domain: new URL(funder.baseURL).hostname, path: "/" }]);
      await page.route("**/api/rails/where**", (route) =>
        route.fulfill(json({ country: "fr", ask: false, fromConnection: "fr", fromDevice: "fr", waysOut: {}, waysIn: {}, card: { offered: true, country: "fr" }, out: { bank: null, cardSmallest: null } })),
      );
      // What the creation answers, changed as the test goes; every request it was sent is kept.
      let creation: "silent" | "being made" | "made" = "silent";
      const sent: string[] = [];
      await page.route("**/api/gift/create", (route) => {
        sent.push(route.request().postData() ?? "");
        if (creation === "silent") return route.fulfill(json({ error: "Something went wrong. Nothing was changed.", code: "FAILED" }, 500));
        if (creation === "being made") return route.fulfill(json({ error: "This gift is being made. Give it a minute, then look in your gifts.", code: "IN_PROGRESS" }, 409));
        return route.fulfill(json({ error: "This gift is already made. It is in your gifts.", code: "ALREADY_MADE" }, 409));
      });
      await makeAnAccount(funder);
      await page.goto("/");
      await card(page).getByLabel("Their first name").fill("Boo");
      await card(page).getByLabel("how much").fill("19");
      await card(page).locator("[data-card-action]").click();
      await sheet(page).getByRole("button", { name: "Put €19.00 in Boo's name" }).click();
      await page.waitForURL(/\/fund\?step=paying/, { timeout: 60_000 });

      const reached = await expect.poll(() => sent.length, { timeout: 25_000 }).toBeGreaterThan(0).then(() => true, () => false);
      test.skip(!reached, "this build names no gift contract: a creation is never sent from it");

      // Not answered: the screen that makes the gift stays, and says what is known. No failure, nothing to press.
      const asksAgain = page.locator("[data-asks-again]");
      await expect(asksAgain).toHaveText(NOT_ANSWERED);
      await expect(page.locator(".working-ring")).toBeVisible();
      await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
      await expect(page.getByText(NEVER_AFTER_A_PAYMENT)).toHaveCount(0);
      await shot(page, size.name, "1-the-creation-did-not-answer");
      // Asked again after a pause, never at once: twelve seconds hold two more tries at most.
      const atStart = sent.length;
      await page.waitForTimeout(12_000);
      expect(sent.length - atStart, "tries in twelve seconds").toBeLessThanOrEqual(2);
      expect(sent.length, "and it was asked again").toBeGreaterThan(1);

      // Being made: the server's own sentence, on the same screen.
      creation = "being made";
      await expect(asksAgain).toHaveText("This gift is being made. Give it a minute, then look in your gifts.", { timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
      await shot(page, size.name, "2-the-gift-is-being-made");

      // Already made: the answer of a creation that went through and whose first answer was lost. The way on is the
      // gifts, and nothing offers to make it again.
      creation = "made";
      await expect(page.getByText("This gift is already made. It is in your gifts.", { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("link", { name: "Back to my gifts" }).last()).toHaveAttribute("href", "/gifts");
      await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
      await expect(page.getByText(NEVER_AFTER_A_PAYMENT)).toHaveCount(0);
      await shot(page, size.name, "3-already-made-leads-to-the-gifts");

      // One signature for all of it: every request sent was the same signed request.
      expect(new Set(sent).size, `${sent.length} requests sent`).toBe(1);
      await context.close();
    });
  }
});
