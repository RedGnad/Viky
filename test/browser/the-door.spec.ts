import { expect, test } from "@playwright/test";
import { answerTheChain, makeAnAccount, profile } from "./gift-kit";

/**
 * Signing out, and asking for another account, lead straight to the account's door (the founder, 4 Oct 2026).
 *
 * What he saw: the page "You, not signed in on this device" showed for a fraction of a second at a sign-out, and
 * "Other account" left the person on it, where "Sign in" had to be pressed again. It is a dead end: a page of an
 * account, drawn for nobody. Both now load the landing with the door standing open, and that page is never drawn on
 * the way.
 */
const SAW_THE_DEAD_END = `(() => {
  new MutationObserver(() => {
    if (document.body && document.body.innerText.includes("Not signed in on this device.")) sessionStorage.setItem("test.sawTheDeadEnd", "yes");
  }).observe(document, { subtree: true, childList: true, characterData: true });
})();`;

test.describe("the way out of an account leads to the account's door", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(120_000);

  for (const [key, name] of [
    ["sign-out", "Sign out"],
    ["other-account", "Other account"],
  ] as const) {
    test(`"${name}": the landing arrives with the door open, and the page for nobody is never drawn`, async ({ browser, baseURL }) => {
      const person = await profile(browser, baseURL, { width: 390, height: 844 });
      const { page, context } = person;
      await answerTheChain(context, { ausd: 0n, mon: 0n, usdc: 0n });
      await context.addInitScript(SAW_THE_DEAD_END);
      await makeAnAccount(person);
      await page.goto("/me");
      await page.locator(`[data-decide="${key}"]`).click();
      await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });
      // The door, open: how an account is made here, making one, and signing in. Nothing was tried, so it says "Sign in".
      const door = page.getByRole("dialog", { name: "Sign in or create account" });
      await expect(door).toBeVisible();
      await expect(door.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
      await expect(door.getByRole("button", { name: "Try again" })).toHaveCount(0);
      expect(await page.evaluate(`sessionStorage.getItem("test.sawTheDeadEnd")`), "the page for nobody was never drawn on the way").toBeNull();
      // Asked for once: the landing opened again keeps its door shut.
      await page.reload();
      await expect(page.getByRole("button", { name: "Sign in", exact: true }).first()).toBeVisible();
      await expect(page.getByRole("dialog", { name: "Sign in or create account" })).toHaveCount(0);
      await context.close();
    });
  }
});
