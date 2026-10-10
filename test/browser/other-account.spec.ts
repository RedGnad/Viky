import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { answerTheChain, makeAnAccount, profile, shot as capture, sizesFor } from "./gift-kit";
import { holdAPasskey, signedIn } from "./virtual-passkey";

/**
 * "Other account" opens the account's door over Me and closes nothing (the founder, 9 Oct 2026).
 *
 * The press used to close the session, let go of the passkey this device remembered and load the landing with its
 * door open, so somebody who only looked was signed out. What is held here: the sheet comes up over the page and the
 * session stands; closing it, closing the passkey's prompt, choosing the account already here, or a server that could
 * not be told leave everything as it was; and the browser becomes another account's only once that account's passkey
 * has answered, after which Home is loaded as theirs and the page for nobody is never drawn on the way.
 *
 * VIKY_OTHER_ACCOUNT_CAPTURES=<folder> also photographs each state, at 390 by 844 and at 1440 by 900, by day and by
 * night.
 */
const SHOTS = process.env.VIKY_OTHER_ACCOUNT_CAPTURES;

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** Keeps what the page asks of the browser's passkeys, and whether it named one. */
const WATCH = `(() => {
  window.__asked = [];
  for (const method of ["create", "get"]) {
    const real = navigator.credentials[method].bind(navigator.credentials);
    navigator.credentials[method] = async (options) => {
      const named = Boolean(options && options.publicKey && options.publicKey.allowCredentials && options.publicKey.allowCredentials.length);
      window.__asked.push(method + (named ? ":named" : ""));
      return real(options);
    };
  }
})();`;
const SAW_THE_DEAD_END = `(() => {
  new MutationObserver(() => {
    if (document.body && document.body.innerText.includes("Not signed in on this device.")) sessionStorage.setItem("test.sawTheDeadEnd", "yes");
  }).observe(document, { subtree: true, childList: true, characterData: true });
})();`;

const SHEET = { name: "Other account" } as const;
const STAYS = "This account stays signed in until the other one opens.";
const SAME = "That is the account you are signed in to.";
const CLOSED = "The passkey prompt was closed before it finished. Try again when you are ready.";
const NOT_TOLD = "Something went wrong on our side. Nothing was changed. Please try again.";

const asked = (page: Page) => page.evaluate("window.__asked.join(',')") as Promise<string>;
const remembered = (page: Page) => page.evaluate(`localStorage.getItem("viky.credential")`) as Promise<string | null>;
/** Who the server says this browser is. */
const account = async (context: BrowserContext) => ((await (await context.request.get("/api/account/session")).json()) as { account: string }).account;

for (const size of sizesFor(SHOTS)) {
  test.describe(`"Other account" over Me (${size.name})`, () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
    test.setTimeout(180_000);
    // The phone's window is a phone, the wide one a computer, as a person's would be.
    const userAgent = size.name === "1440" ? WINDOWS : IPHONE;
    const shot = async (page: Page, name: string) => {
      if (!SHOTS) return;
      await capture(SHOTS, page, size.name, name);
      await page.emulateMedia({ colorScheme: "dark" });
      await capture(SHOTS, page, size.name, `${name}-night`);
      await page.emulateMedia({ colorScheme: "light" });
    };

    /** A window with an account in it, standing on Me, and the device's store of passkeys. */
    const onMe = async (browser: Parameters<typeof profile>[0], baseURL: string | undefined) => {
      const person = await profile(browser, baseURL, size.viewport, { passkey: false, userAgent });
      const { page, context } = person;
      const store = await holdAPasskey(context, page, `other-account-${Date.now()}-${Math.random()}`);
      await answerTheChain(context, { ausd: 0n, mon: 0n, usdc: 0n });
      await context.addInitScript(WATCH);
      await context.addInitScript(SAW_THE_DEAD_END);
      await makeAnAccount(person);
      await page.goto("/me");
      await expect(page.locator('[data-decide="other-account"]')).toBeVisible();
      return { page, context, store, first: await account(context), firstPasskey: await remembered(page) };
    };

    test(`the press opens the door over Me and closes nothing; closing it leaves everything as it was (${size.name})`, async ({ browser, baseURL }) => {
      const { page, context, first, firstPasskey } = await onMe(browser, baseURL);
      await page.locator('[data-decide="other-account"]').click();
      const sheet = page.getByRole("dialog", SHEET);
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText(STAYS)).toBeVisible();
      // Signing in to another account leads, making one comes second, with who may make one said under it.
      const choose = sheet.getByRole("button", { name: "Sign in to another account", exact: true });
      const make = sheet.getByRole("button", { name: "Create a new account", exact: true });
      await expect(choose).toBeVisible();
      expect((await choose.boundingBox())!.y).toBeLessThan((await make.boundingBox())!.y);
      await expect(sheet.locator("[data-adult]")).toHaveText("By creating an account you confirm you are 18 or older.");
      await expect(sheet.locator("[data-on-a-computer]")).toHaveCount(size.name === "1440" ? 1 : 0);
      await shot(page, "1-the-door-over-me");
      // Nothing was asked of the browser, the page is still Me, and the session and the device's passkey stand.
      expect(await asked(page), "the press that opens the door asks for no passkey").toBe("");
      expect(new URL(page.url()).pathname).toBe("/me");
      expect(await signedIn(context)).toBe(true);
      expect(await account(context)).toBe(first);
      expect(await remembered(page)).toBe(firstPasskey);
      await sheet.getByRole("button", { name: "Close" }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByText(/^Signed in on this device/)).toBeVisible();
      // And a load later it is still this account's page.
      await page.reload();
      await expect(page.locator('[data-decide="other-account"]')).toBeVisible();
      expect(await account(context)).toBe(first);
      expect(await page.evaluate(`sessionStorage.getItem("test.sawTheDeadEnd")`), "the page for nobody was never drawn").toBeNull();
      expect(await page.evaluate(`sessionStorage.getItem("viky.door.asked")`), "and nothing is asked of the landing").toBeNull();
      await context.close();
    });

    test(`the passkey of the account already here changes nothing, and the sheet says so; a prompt that is closed says what happened (${size.name})`, async ({ browser, baseURL }) => {
      const { page, context, store, first, firstPasskey } = await onMe(browser, baseURL);
      await page.locator('[data-decide="other-account"]').click();
      const sheet = page.getByRole("dialog", SHEET);
      // The device holds one passkey for Viky, this account's: it is the one that answers.
      await sheet.getByRole("button", { name: "Sign in to another account", exact: true }).click();
      await expect(sheet.locator('[data-other-account="same"]')).toHaveText(SAME);
      expect(await asked(page), "the device is asked with no passkey named, so it offers every account it holds").toBe("get");
      expect(new URL(page.url()).pathname).toBe("/me");
      expect(await account(context)).toBe(first);
      expect(await remembered(page)).toBe(firstPasskey);
      await shot(page, "2-the-same-account");
      // A prompt nobody confirms: the refusal is under the button that was pressed, and the first line is gone.
      await store.answers(false);
      await sheet.getByRole("button", { name: "Sign in to another account", exact: true }).click();
      await expect(sheet.locator("#other-account-refused")).toHaveText(CLOSED);
      await expect(sheet.locator('[data-other-account="same"]')).toHaveCount(0);
      expect(await account(context)).toBe(first);
      expect(await remembered(page)).toBe(firstPasskey);
      await shot(page, "3-a-prompt-that-was-closed");
      // Closed and opened again, the sheet starts with nothing said.
      await sheet.getByRole("button", { name: "Close" }).click();
      await page.locator('[data-decide="other-account"]').click();
      await expect(sheet.getByRole("button", { name: "Sign in to another account", exact: true })).toBeVisible();
      await expect(sheet.locator("#other-account-refused")).toHaveCount(0);
      await context.close();
    });

    test(`a new account: the browser becomes theirs once its passkey answered, Home is loaded as theirs, and the way back is the same sheet (${size.name})`, async ({ browser, baseURL }) => {
      const { page, context, store, first, firstPasskey } = await onMe(browser, baseURL);
      const heldAtFirst = await store.held();
      expect(heldAtFirst).toHaveLength(1);
      await page.locator('[data-decide="other-account"]').click();
      const sheet = page.getByRole("dialog", SHEET);
      await sheet.getByRole("button", { name: "Create a new account", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });
      await expect.poll(() => account(context), { timeout: 30_000 }).not.toBe(first);
      const second = await account(context);
      // The device remembers the new account's passkey, so its first signature asks for that one.
      const secondPasskey = await remembered(page);
      expect(secondPasskey).not.toBe(firstPasskey);
      expect(await store.held()).toHaveLength(2);
      // Home, as an account's: no door to sign in by, and nothing was asked of the landing.
      await expect(page.getByRole("link", { name: "Me", exact: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
      expect(await page.evaluate(`sessionStorage.getItem("viky.door.asked")`)).toBeNull();
      expect(await page.evaluate(`sessionStorage.getItem("test.sawTheDeadEnd")`), "the page for nobody was never drawn on the way").toBeNull();
      await shot(page, "4-home-as-the-new-account");

      // Back to the first account: the device now holds its passkey alone, and it is the one that answers.
      for (const held of await store.held()) if (!heldAtFirst.includes(held)) await store.forget(held);
      expect(await store.held()).toEqual(heldAtFirst);
      await page.goto("/me");
      await page.locator('[data-decide="other-account"]').click();
      await sheet.getByRole("button", { name: "Sign in to another account", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });
      await expect.poll(() => account(context), { timeout: 30_000 }).toBe(first);
      expect(second).not.toBe(first);
      expect(JSON.parse((await remembered(page))!).credentialId).toBe(JSON.parse(firstPasskey!).credentialId);
      expect(await page.evaluate(`sessionStorage.getItem("test.sawTheDeadEnd")`), "nor on the way back").toBeNull();
      await context.close();
    });

    test(`a server that could not be told changes nothing: the account, the session and the device's passkey stand (${size.name})`, async ({ browser, baseURL }) => {
      const { page, context, first, firstPasskey } = await onMe(browser, baseURL);
      await page.route("**/api/account/challenge", (route) => route.abort());
      await page.locator('[data-decide="other-account"]').click();
      const sheet = page.getByRole("dialog", SHEET);
      await sheet.getByRole("button", { name: "Create a new account", exact: true }).click();
      await expect(sheet.locator("#new-account-refused")).toHaveText(NOT_TOLD);
      expect(new URL(page.url()).pathname).toBe("/me");
      expect(await account(context)).toBe(first);
      expect(await remembered(page)).toBe(firstPasskey);
      // The page is still this account's, and says so, behind a sheet that can be closed.
      await sheet.getByRole("button", { name: "Close" }).click();
      await expect(page.getByText(/^Signed in on this device/)).toBeVisible();
      expect(await page.evaluate(`sessionStorage.getItem("test.sawTheDeadEnd")`), "the page for nobody was never drawn").toBeNull();
      await context.close();
    });
  });
}
