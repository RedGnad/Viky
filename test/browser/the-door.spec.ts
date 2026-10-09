import { expect, test } from "@playwright/test";
import { answerTheChain, makeAnAccount, profile } from "./gift-kit";

/**
 * Asking for another account leads straight to the account's door (the founder, 4 Oct 2026); signing out arrives on
 * the landing with nothing opened (9 Oct 2026: the two did the same thing on the screen).
 *
 * What he saw on 4 Oct: the page "You, not signed in on this device" showed for a fraction of a second at a sign-out,
 * and "Other account" left the person on it, where "Sign in" had to be pressed again. It is a dead end: a page of an
 * account, drawn for nobody. Both load the landing, and that page is never drawn on the way.
 */
const SAW_THE_DEAD_END = `(() => {
  new MutationObserver(() => {
    if (document.body && document.body.innerText.includes("Not signed in on this device.")) sessionStorage.setItem("test.sawTheDeadEnd", "yes");
  }).observe(document, { subtree: true, childList: true, characterData: true });
})();`;

test.describe("the two ways out of an account: the landing, and the account's door for another account", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(120_000);

  test('"Sign out": the session closes, the landing arrives with nothing opened, and the page for nobody is never drawn', async ({ browser, baseURL }) => {
    const person = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = person;
    await answerTheChain(context, { ausd: 0n, mon: 0n, usdc: 0n });
    await context.addInitScript(SAW_THE_DEAD_END);
    await makeAnAccount(person);
    await page.goto("/me");
    await page.locator('[data-decide="sign-out"]').click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });
    // The landing for nobody: its "Sign in" is there to press, and no door stands open, now or a moment later.
    await expect(page.getByRole("button", { name: "Sign in", exact: true }).first()).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByRole("dialog", { name: "Sign in or create account" })).toHaveCount(0);
    expect(await page.evaluate(`sessionStorage.getItem("viky.door.asked")`), "nothing was asked of the landing").toBeNull();
    expect(await page.evaluate(`sessionStorage.getItem("test.sawTheDeadEnd")`), "the page for nobody was never drawn on the way").toBeNull();
    // The session is closed: the page of an account is the one for nobody.
    await page.goto("/me");
    await expect(page.getByText("Not signed in on this device.")).toBeVisible();
    await context.close();
  });

  for (const [key, name] of [["other-account", "Other account"]] as const) {
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
