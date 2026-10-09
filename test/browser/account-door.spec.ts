import { expect, test, type Page } from "@playwright/test";
import { answerTheChain, makeAnAccount, profile, shot as capture, sizesFor } from "./gift-kit";
import { holdAPasskey, KEPT_HERE_ALONE, signedIn } from "./virtual-passkey";

/**
 * The account's two doors on a device that knows no account, and where a passkey made on a computer is kept (the
 * founder, 5 Oct 2026).
 *
 * What a tester met: no account, "Sign in" pressed on an iPhone and then on a computer, and the browser's own choice of
 * a QR code, Bluetooth or a security key, which is what it shows when asked for a passkey it does not hold. The
 * header's press now opens the door and asks the browser nothing; making an account leads, and signing in is the one
 * action that asks for a passkey. A prompt closed there says what happened and what to do.
 *
 * VIKY_DOOR_CAPTURES=<folder> also photographs each state, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_DOOR_CAPTURES;
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** Keeps what the page asks of the browser's passkeys, and can answer as a sheet that was closed. */
const WATCH = `(() => {
  window.__asked = [];
  for (const method of ["create", "get"]) {
    const real = navigator.credentials[method].bind(navigator.credentials);
    navigator.credentials[method] = async (options) => {
      window.__asked.push(method);
      if (window.__closeTheSheet) throw new DOMException("The operation either timed out or was not allowed.", "NotAllowedError");
      return real(options);
    };
  }
})();`;
const asked = (page: Page) => page.evaluate("window.__asked.join(',')") as Promise<string>;
const DOOR = { name: "Sign in or create account" } as const;
const NOT_FOUND = "No account was found on this device. Create one, or sign in on the device where you made it.";
const ON_A_COMPUTER = "Save your passkey with Apple or Google. Kept on this computer alone, it stays on it.";
const KEPT_HERE = "Your passkey is kept on this computer only. It does not follow you to your phone.";

for (const size of sizesFor(SHOTS)) {
  test.describe(`the account's doors on a device that knows no account (${size.name})`, () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
    test.setTimeout(120_000);
    // The phone's window is a phone, the wide one a computer, as a person's would be.
    const computer = size.name === "1440";
    const userAgent = computer ? WINDOWS : IPHONE;

    test(`the header's press opens the door and asks for no passkey; only "Sign in" in the door does (${size.name})`, async ({ browser, baseURL }) => {
      const person = await profile(browser, baseURL, size.viewport, { userAgent });
      const { page, context } = person;
      await context.addInitScript(WATCH);
      await page.goto("/");
      await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
      const door = page.getByRole("dialog", DOOR);
      await expect(door).toBeVisible();
      expect(await asked(page), "the press that opens the door asks the browser nothing").toBe("");
      // Making an account leads, signing in comes second, and nothing was tried: no "Try again".
      const create = door.getByRole("button", { name: "Create my account", exact: true });
      const signIn = door.getByRole("button", { name: "Sign in", exact: true });
      await expect(create).toBeVisible();
      expect((await create.boundingBox())!.y).toBeLessThan((await signIn.boundingBox())!.y);
      await expect(door.getByRole("button", { name: "Try again" })).toHaveCount(0);
      // A computer is told which choice of its sheet follows the person; a phone is told nothing of a computer.
      await expect(door.getByText(ON_A_COMPUTER, { exact: true })).toHaveCount(computer ? 1 : 0);
      await shot(page, size.name, "1-the-header-door-with-no-account");

      // The one press that asks for a passkey, on a sheet the person closes: what happened, and what to do.
      await page.evaluate("window.__closeTheSheet = true");
      await signIn.click();
      await expect(door.getByRole("alert")).toHaveText(NOT_FOUND);
      expect(await asked(page)).toBe("get");
      await expect(page.getByText(/Try again/)).toHaveCount(0);
      await expect(door.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
      await shot(page, size.name, "2-the-header-door-after-a-closed-prompt");

      // Pressed again, the header's entry shuts the door, and still asks nothing.
      await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
      await expect(page.getByRole("dialog", DOOR)).toHaveCount(0);
      expect(await asked(page)).toBe("get");
      await context.close();
    });

    test(`the account's other door says the same, with making an account first (${size.name})`, async ({ browser, baseURL }) => {
      const person = await profile(browser, baseURL, size.viewport, { userAgent });
      const { page, context } = person;
      await context.addInitScript(WATCH);
      await page.goto("/gifts");
      const create = page.locator("main").getByRole("button", { name: "Create my account", exact: true });
      const signIn = page.locator("main").getByRole("button", { name: "Sign in", exact: true });
      await expect(create).toBeVisible();
      expect((await create.boundingBox())!.y).toBeLessThan((await signIn.boundingBox())!.y);
      await expect(page.locator("main").getByText(ON_A_COMPUTER, { exact: true })).toHaveCount(computer ? 1 : 0);
      expect(await asked(page)).toBe("");
      await shot(page, size.name, "3-the-other-door-with-no-account");
      await page.evaluate("window.__closeTheSheet = true");
      await signIn.click();
      await expect(page.locator("main").getByRole("alert")).toContainText(NOT_FOUND);
      await expect(page.getByText(/Try again when you are ready/)).toHaveCount(0);
      await shot(page, size.name, "4-the-other-door-after-a-closed-prompt");
      await context.close();
    });
  });
}

test.describe("a device that remembers a passkey, and a passkey a computer keeps for itself", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(120_000);

  test("on a device that remembers a passkey, the header's Sign in stays direct", async ({ browser, baseURL }) => {
    const person = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = person;
    await answerTheChain(context, { ausd: 0n, mon: 0n, usdc: 0n });
    await makeAnAccount(person);
    await page.goto("/me");
    await page.locator('[data-decide="sign-out"]').click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });
    await expect.poll(() => signedIn(context)).toBe(false);
    // Signing out opened nothing; the reload puts the watch in the page: what is measured is the header's own press.
    await context.addInitScript(WATCH);
    await page.reload();
    await expect(page.getByRole("dialog", DOOR)).toHaveCount(0);
    await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
    await expect.poll(() => signedIn(context), { timeout: 30_000 }).toBe(true);
    expect(await asked(page), "the passkey this device remembers is asked at once").toBe("get");
    await expect(page.getByRole("dialog", DOOR)).toHaveCount(0);
    // A passkey a store copies says nothing of a computer on Home.
    await expect(page.locator("[data-key-kept]")).toHaveCount(0);
    await context.close();
  });

  for (const size of sizesFor(SHOTS)) {
    test(`made on a computer whose passkey stays on it: said once on Home, and on the account's own screen (${size.name})`, async ({ browser, baseURL }) => {
      const person = await profile(browser, baseURL, size.viewport, { userAgent: WINDOWS, passkey: false });
      const { page, context } = person;
      await holdAPasskey(context, page, `kept-here-${Date.now()}-${Math.random()}`, KEPT_HERE_ALONE);
      await answerTheChain(context, { ausd: 0n, mon: 0n, usdc: 0n });
      await makeAnAccount(person);
      const notice = page.locator('[data-key-kept="here"]');
      await expect(notice).toContainText(KEPT_HERE);
      await shot(page, size.name, "5-home-a-passkey-this-computer-keeps");
      await notice.getByRole("button", { name: "Got it" }).click();
      await expect(notice).toHaveCount(0);
      await page.reload();
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator('[data-key-kept="here"]')).toHaveCount(0);
      await page.goto("/me");
      await expect(page.locator('[data-key-kept="line"]')).toHaveText(KEPT_HERE);
      await shot(page, size.name, "6-me-where-the-passkey-is-kept");
      await context.close();
    });
  }
});
