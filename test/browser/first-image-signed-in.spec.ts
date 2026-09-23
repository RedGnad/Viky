import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

/**
 * A signed-in screen is drawn once (D196). The founder, 23 Sep 2026: the landing, Home and You load twice with his
 * account, and "ce test est la seule preuve qu'on accepte que le bug est clos".
 *
 * For each of the three screens, loaded cold in a fresh browser holding only the session cookie:
 * - the page the server sends is already the account's (`<main data-drawn-for="account">`), not the page for nobody;
 * - after the first image, `<main>` is never replaced by another one;
 * - no block plays its entrance twice.
 *
 * The account is made here with a virtual passkey against the server under test, which signs sessions only when it
 * has its session secret; a server without one cannot have anybody signed in, and the test says so rather than pass.
 */

const PAGES = ["/", "/gifts", "/me"] as const;

const WATCH = () => {
  const log: { mains: number; replaced: string[]; twice: string[] } = { mains: 0, replaced: [], twice: [] };
  (window as unknown as { firstImage: typeof log }).firstImage = log;
  let main: Element | null = null;
  new MutationObserver(() => {
    const now = document.querySelector("main");
    if (!now || now === main) return;
    if (main) log.replaced.push(`${now.getAttribute("data-drawn-for")}: ${(now.textContent ?? "").trim().slice(0, 40)}`);
    main = now;
    log.mains += 1;
  }).observe(document, { childList: true, subtree: true });
  const entered = new WeakMap<Element, number>();
  document.addEventListener(
    "animationstart",
    (event) => {
      const target = event.target as Element;
      if ((event as AnimationEvent).animationName !== "page-enter") return;
      const times = (entered.get(target) ?? 0) + 1;
      entered.set(target, times);
      if (times > 1) log.twice.push((target.textContent ?? "").trim().slice(0, 40));
    },
    true,
  );
};

async function signedInState(browser: Browser, baseURL: string): Promise<Awaited<ReturnType<BrowserContext["storageState"]>> | null> {
  const context = await browser.newContext({ baseURL, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, hasPrf: true, isUserVerified: true, automaticPresenceSimulation: true },
    });
    await page.goto("/");
    await page.getByRole("button", { name: /^Sign in$/ }).first().click();
    const create = page.getByRole("button", { name: /^Create (your|my) account$/ }).first();
    if (await create.waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false)) await create.click();
    const signedIn = await expect
      .poll(async () => (await context.cookies()).some((cookie) => cookie.name === "__Host-viky-session"), { timeout: 20_000 })
      .toBe(true)
      .then(() => true, () => false);
    return signedIn ? await context.storageState() : null;
  } finally {
    await context.close();
  }
}

test.describe("a signed-in screen is drawn once", () => {
  // One width is enough: what is measured is whom the page is drawn for and how often, not a layout.
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured at one width");

  test("the landing, Home, Gifts and You arrive signed in, and nothing is replaced after the first image", async ({ browser, baseURL: served }) => {
    test.setTimeout(120_000);
    // A passkey is bound to a name and refuses an IP address, so the same server is reached by the name localhost.
    const address = new URL(served ?? "http://127.0.0.1:3000");
    if (address.hostname === "127.0.0.1") address.hostname = "localhost";
    const baseURL = address.origin;
    const state = await signedInState(browser, baseURL);
    expect(state, "the server under test signed somebody in (it needs its session secret)").not.toBeNull();

    for (const path of PAGES) {
      const context = await browser.newContext({ baseURL, storageState: state ?? undefined, serviceWorkers: "block", viewport: { width: 375, height: 667 } });
      await context.addInitScript(WATCH);
      const page = await context.newPage();

      // What the server sends, before any script has run.
      const sent = await (await context.request.get(path)).text();
      expect(sent, `${path}: the server draws the account's screen`).toContain('data-drawn-for="account"');

      await page.goto(path, { waitUntil: "load" });
      await page.waitForTimeout(1_500);
      const log = await page.evaluate(() => (window as unknown as { firstImage: { mains: number; replaced: string[]; twice: string[] } }).firstImage);
      expect(log.replaced, `${path}: <main> was replaced after the first image`).toEqual([]);
      expect(log.mains, `${path}: one <main>`).toBe(1);
      expect(log.twice, `${path}: a block played its entrance twice`).toEqual([]);
      await expect(page.locator("main")).toHaveAttribute("data-drawn-for", "account");
      await context.close();
    }
  });
});
