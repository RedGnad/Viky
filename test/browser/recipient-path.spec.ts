import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page, type Route } from "@playwright/test";
import { holdAPasskey, passkeySite, signedIn } from "./virtual-passkey";

/**
 * The path of the person a gift is for (the audit of 1 Oct 2026, and the founder's account door of the same day).
 *
 * What is real: the product's pages against the server under test, its sign-in with a passkey (Chrome's virtual
 * authenticator, src of the PRF in ./virtual-passkey.ts), every press. What is stood in for: the gift, which a new
 * account does not have, so its page is answered here as the server would answer it; the proof session and its
 * verdict; the agreement's route, which keeps the yes it is sent.
 *
 * What none of this shows: a real Safari, a real messaging app, the installed app. Those are tried on real phones.
 *
 * VIKY_RECIPIENT_CAPTURES=<folder> also photographs each point, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_RECIPIENT_CAPTURES;
const SIZES = SHOTS
  ? [
      { name: "390", viewport: { width: 390, height: 844 } },
      { name: "1440", viewport: { width: 1440, height: 900 } },
    ]
  : [{ name: "390", viewport: { width: 390, height: 844 } }];

const KEY = "AbCdEfGhIjKlMnOpQrStUv";
const now = () => Math.floor(Date.now() / 1000);
const DAY = 86_400;

type Who = "recipient" | "funder" | "link";

/** A milestone gift as the gift route answers it. */
function gift(giftId: string, who: Who, over: Record<string, unknown>) {
  return {
    kind: "milestone",
    shape: "certificate",
    giftId,
    conditionId: "toefl-mybest-shown",
    youAreTheRecipient: who === "recipient",
    youAreTheFunder: who === "funder",
    names: { recipientName: "Boo", funderName: "Maman" },
    goalAccount: { username: null, bound: true, code: null, codeExpiresAt: null, namedByFunder: true },
    amount: "25000000",
    amountDisplay: "$25.00",
    startReading: null,
    target: 90,
    targetWords: null,
    todayReading: null,
    readAtMs: null,
    deadlineMs: (now() + 20 * DAY) * 1000,
    durationDays: 30,
    opened: true,
    connected: true,
    reached: false,
    reachedAtMs: null,
    finished: false,
    cancelled: false,
    earned: "0",
    earnedDisplay: "$0.00",
    takenDisplay: "$0.00",
    returnedDisplay: "$0.00",
    createdAtChain: now() - 5 * DAY,
    claimedAtChain: now() - 4 * DAY,
    withdrawNonce: "0",
    escrow: "0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e",
    phase: "climbing",
    cadence: { id: "certificate", label: "Certificate" },
    accountClosed: false,
    maximumStart: 0,
    standingAtOffer: null,
    marathon: null,
    wca: null,
    review: null,
    recorded: [],
    ...over,
  };
}

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

/** The agreement's route: nothing agreed until a yes is sent, and the yes kept from then on. */
function agreement(giftId: string, what: string) {
  let state: { kind: "yes" | "stop"; signedAt: string } | null = null;
  const handle = async (route: Route) => {
    if (route.request().method() === "POST") {
      const sent = JSON.parse(route.request().postData() ?? "{}") as { kind: "yes" | "stop" };
      state = { kind: sent.kind, signedAt: new Date().toISOString() };
      return route.fulfill(json({ giftId, state }));
    }
    return route.fulfill(json({ giftId, state, reading: state?.kind === "yes" ? "agreed" : "no_agreement", opened: true, finished: false, terms: { what }, until: "the gift's last day", texts: { yes: `I agree that Viky reads ${what}.`, stop: `Viky stops reading ${what}.` } }));
  };
  return { handle, agreed: () => state?.kind === "yes" };
}

type Profile = { context: BrowserContext; page: Page; baseURL: string };

async function profile(browser: Browser, served: string | undefined, viewport: { width: number; height: number }, options: { passkey?: boolean; userAgent?: string } = {}): Promise<Profile> {
  const baseURL = passkeySite(served);
  const context = await browser.newContext({ baseURL, serviceWorkers: "block", viewport, ...(options.userAgent ? { userAgent: options.userAgent } : {}) });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  if (options.passkey !== false) await holdAPasskey(context, page, `recipient-${Date.now()}-${Math.random()}`);
  await page.route("**/api/gifts/mine", (route) => route.fulfill(json({ account: "", gifts: [] })));
  return { context, page, baseURL };
}

/** Makes an account by the one door of Home, and waits for the server's cookie. */
async function makeAnAccount({ page, context }: Profile): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /^Sign in$/ }).first().click();
  await page.getByRole("button", { name: /^Create (your|my) account$/ }).first().click();
  await expect.poll(() => signedIn(context), { timeout: 30_000 }).toBe(true);
}

async function shot(page: Page, size: string, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SHOTS, `${name}-${size}.png`) });
}

test.describe("the path of the person a gift is for", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const size of SIZES) {
    test(`Show it, reached, Take: the moment closes and the review is on the page (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const GIFT = "1999997";
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      let reached = false;
      let seen = false;
      let looks = 0;
      const yes = agreement(GIFT, "your TOEFL score");
      await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) =>
        route.fulfill(json(gift(GIFT, "recipient", reached ? { reached: true, reachedAtMs: Date.now(), finished: true, earned: "25000000", earnedDisplay: "$25.00", phase: "reached" } : {}))),
      );
      await page.route(`**/api/gift/${GIFT}/consent`, yes.handle);
      await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
      await page.route(`**/api/gift/${GIFT}/reached-seen`, (route) => {
        if (route.request().method() === "POST") seen = true;
        return route.fulfill(json({ seen }));
      });
      await page.route("**/api/proof/session", (route) => route.fulfill(json({ sessionId: "session_recipient_path", requestUrl: "https://share.reclaimprotocol.org/verify/?template=recipient-path" })));
      await page.route("**/api/proof/verify", (route) => {
        looks += 1;
        // The first look finds nothing yet, as a person still signing in to the source would have it.
        if (looks === 1) return route.fulfill(json({ error: "Reclaim has not returned a proof yet", code: "NO_PROOF_YET" }, 409));
        reached = true;
        return route.fulfill(json({ kind: "reached", giftId: GIFT, metricValue: "96", shown: "96", observedAt: now(), hash: `0x${"ab".repeat(32)}` }));
      });

      await makeAnAccount(device);
      // The clock is the test's from here: the wait for a proof is paced in tens of seconds.
      await page.clock.install();
      await page.goto(`/g/${GIFT}`);
      const show = page.getByRole("button", { name: /^Show it$/ });
      await expect(show).toBeVisible();
      await shot(page, size.name, "3a-show-it");

      // The press prepares: the yes is signed, the session is opened, and nothing is opened outside the press.
      const windows: Page[] = [];
      device.context.on("page", (opened) => windows.push(opened));
      await show.click();
      const link = page.getByRole("link", { name: "Sign in to ETS" });
      await expect(link).toBeVisible();
      expect(yes.agreed(), "the press signed the yes").toBe(true);
      expect(windows.length, "no window is opened by a script").toBe(0);
      await expect(link).toHaveAttribute("href", "https://share.reclaimprotocol.org/verify/?template=recipient-path");
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener");
      await expect(page.getByText("Waiting for the proof. Come back to this page when you are done there.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Stop waiting" })).toBeVisible();
      await shot(page, size.name, "3b-the-link-and-the-wait");
      expect(looks, "nothing is asked before the first look is due").toBe(0);

      // Stop waiting brings the button back, and nothing more is asked.
      await page.getByRole("button", { name: "Stop waiting" }).click();
      await expect(page.getByText("Stopped before the proof came back. Nothing was changed.")).toBeVisible();
      await page.clock.fastForward(60_000);
      expect(looks).toBe(0);

      // Again, and this time the wait runs: one look at twenty seconds, the next no sooner than twenty-five later.
      await page.getByRole("button", { name: /^Show it$/ }).click();
      await expect(page.getByRole("link", { name: "Sign in to ETS" })).toBeVisible();
      await page.clock.fastForward(19_000);
      expect(looks).toBe(0);
      await page.clock.fastForward(2_000);
      await expect.poll(() => looks).toBe(1);
      await page.clock.fastForward(20_000);
      expect(looks, "the second look waits its turn").toBe(1);
      await page.clock.fastForward(6_000);
      await expect.poll(() => looks).toBe(2);

      // Reached: the moment plays over the gift's own page, and its one action is a button, not a link to this page.
      const moment = page.locator("dialog.reached-moment");
      await expect(moment).toBeVisible();
      const take = moment.getByRole("button", { name: /^Take \$25\.00$/ });
      await expect(take).toBeVisible();
      await expect(moment.getByRole("link")).toHaveCount(0);
      await shot(page, size.name, "1a-the-moment");
      await take.click();
      await expect(moment).toHaveCount(0);
      await expect(page.getByText("It goes into your account, and it stays yours: from there you can send it to your bank. Nothing to pay.")).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/g/${GIFT}$`));
      await shot(page, size.name, "1b-take-opens-the-review");
      await device.context.close();
    });

    test(`after the first yes the page says it was given, and offers no second one (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const GIFT = "1999996";
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      let started = false;
      const yes = agreement(GIFT, "your rapid rating");
      const climb = () =>
        gift(GIFT, "recipient", {
          shape: "climb",
          conditionId: "chess-rating",
          goalAccount: { username: "boo_plays", bound: started, code: null, codeExpiresAt: null, namedByFunder: true },
          target: 1500,
          startReading: started ? 1450 : null,
          todayReading: started ? 1450 : null,
          readAtMs: started ? Date.now() : null,
          deadlineMs: started ? (now() + 30 * DAY) * 1000 : null,
          connected: started,
          phase: started ? "climbing" : "opened",
          cadence: { id: "rapid", label: "Rapid" },
          maximumStart: 1460,
          standingAtOffer: 1450,
        });
      await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) => route.fulfill(json(climb())));
      await page.route(`**/api/gift/${GIFT}/consent`, yes.handle);
      await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
      await page.route(`**/api/gift/${GIFT}/bind`, (route) => {
        started = true;
        return route.fulfill(json({ kind: "started", giftId: GIFT, rating: 1450, aboveAccepted: false }));
      });
      await page.route(`**/api/gift/${GIFT}/count`, (route) => route.fulfill(json({ kind: "notYet", giftId: GIFT, rating: 1450, target: 1500, attested: false })));

      await makeAnAccount(device);
      // A full load: the page holds no key any more, only the server's cookie. The yes signs the person in again.
      await page.goto(`/g/${GIFT}`);
      const start = page.getByRole("button", { name: /^Start reading my Chess\.com/ });
      await expect(start).toBeVisible();
      await shot(page, size.name, "2a-before-the-start");
      await start.click();
      await expect(page.getByText(/^Viky reads your rapid rating for this gift\. You agreed on /)).toBeVisible();
      expect(yes.agreed()).toBe(true);
      await expect(page.getByText("Viky reads nothing for this gift until you agree.")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Agree$/ })).toHaveCount(0);
      await page.getByText(/^Viky reads your rapid rating for this gift\. You agreed on /).scrollIntoViewIfNeeded();
      await shot(page, size.name, "2b-after-the-start");
      await device.context.close();
    });

    test(`a funder who signs in on their own gift's link is shown their gift, not "Open my gift" (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const GIFT = "1999995";
      const device = await profile(browser, baseURL, size.viewport);
      const { page, context } = device;
      let reads = 0;
      await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), async (route) => {
        reads += 1;
        // Who reads is what the server's cookie says: nobody before the sign-in, the funder after it.
        const known = ((await route.request().allHeaders()).cookie ?? "").includes("__Host-viky-session");
        return route.fulfill(json(gift(GIFT, known ? "funder" : "link", { opened: false, connected: false, claimedAtChain: 0, phase: "unopened", deadlineMs: null })));
      });
      await page.route(`**/api/gift/${GIFT}/consent`, (route) => route.fulfill(json({ error: "Not yours" }, 403)));
      await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));

      await makeAnAccount(device);
      await context.clearCookies();
      await page.goto(`/g/${GIFT}?t=${KEY}`);
      // The device remembers a passkey, so signing in leads: no second account is made by somebody coming back.
      await expect(page.getByText("Create your account to open it. Nothing to install.")).toBeVisible();
      const signIn = page.getByRole("button", { name: /^Sign in$/ }).last();
      await expect(signIn).toBeVisible();
      await shot(page, size.name, "5a-own-link-signed-out");
      const before = reads;
      await signIn.click();
      await expect.poll(() => signedIn(context), { timeout: 30_000 }).toBe(true);
      await expect.poll(() => reads, { message: "the gift is read again for the account that signed in" }).toBeGreaterThan(before);
      await expect(page.getByRole("button", { name: "Open my gift" })).toHaveCount(0);
      await expect(page.getByText(/^Made .+\. Reference: gift 1999995\.$/)).toBeAttached();
      await shot(page, size.name, "5b-own-link-signed-in");
      await device.context.close();
    });

    test(`the account's door: inside another app, on an old iPhone, on a phone that says no, on a computer (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(180_000);
      const GIFT = "1999994";
      const unopened = (page: Page) =>
        Promise.all([
          page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) => route.fulfill(json(gift(GIFT, "link", { opened: false, connected: false, claimedAtChain: 0, phase: "unopened", deadlineMs: null })))),
          page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] }))),
        ]);
      const INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 Instagram 398.0.0.20.80 (iPhone12,5; iOS 18_6; fr_FR; fr; scale=3.00; 1242x2688; 780000000)";
      const TELEGRAM_ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36";
      const SAFARI_17 = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1";
      const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
      const CHROME_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1";

      // Inside Instagram on an iPhone: the gift is read, and the account's place is one link, the same link, key included.
      const instagram = await profile(browser, baseURL, size.viewport, { passkey: false, userAgent: INSTAGRAM });
      await unopened(instagram.page);
      const giftLink = `${instagram.baseURL}/g/${GIFT}?t=${KEY}`;
      // From the first image: the server is told which browser asks, so a page arrives with the way out already in
      // it. Read on Home, which the server draws whole (this gift is the test's own, so its page is drawn in the browser).
      const served = await (await instagram.context.request.get(`${instagram.baseURL}/`)).text();
      expect(served).toContain(`instagram://extbrowser/?url=${encodeURIComponent(`${instagram.baseURL}/`)}`);
      expect(served).toContain("This page is open inside Instagram, where an account cannot be made.");
      // And never a jump the page makes by itself.
      expect(served).not.toMatch(/http-equiv="refresh"/i);
      await instagram.page.goto(`/g/${GIFT}?t=${KEY}`);
      await expect(instagram.page.getByText("This page is open inside Instagram, where an account cannot be made.")).toBeVisible();
      const out = instagram.page.getByRole("link", { name: "Open in Safari" });
      await expect(out).toHaveAttribute("href", `instagram://extbrowser/?url=${encodeURIComponent(giftLink)}`);
      await expect(instagram.page.getByRole("button", { name: /Create my account|I already have an account|^Sign in$/ })).toHaveCount(0);
      await expect(instagram.page.getByRole("button", { name: "Copy this gift's link" })).toBeVisible();
      await expect(instagram.page.getByText(/computer|viky\.cash/i)).toHaveCount(0);
      await shot(instagram.page, size.name, "6a-inside-instagram");
      // A press that opens nothing: the page is still here, and says where the app's own menu is.
      await out.click();
      await expect(instagram.page.getByText("Nothing opened? Press ⋯ at the top, then choose to open it in your browser.")).toBeVisible();
      await instagram.context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await instagram.page.getByRole("button", { name: "Copy this gift's link" }).click();
      await expect(instagram.page.getByText("Copied. Paste it in Safari.")).toBeVisible();
      expect(await instagram.page.evaluate(() => navigator.clipboard.readText())).toBe(giftLink);
      await shot(instagram.page, size.name, "6b-nothing-opened");
      // The same door at the top of Home, before anything is filled in.
      await instagram.page.goto("/");
      await expect(instagram.page.getByText("This page is open inside Instagram, where an account cannot be made.")).toBeVisible();
      await expect(instagram.page.getByRole("button", { name: "Copy this page's link" })).toBeVisible();
      await shot(instagram.page, size.name, "6c-home-inside-instagram");
      await instagram.context.close();

      // Inside an Android app: the phone's own browser, by an intent that names no application.
      const android = await profile(browser, baseURL, size.viewport, { passkey: false, userAgent: TELEGRAM_ANDROID });
      await unopened(android.page);
      await android.page.goto(`/g/${GIFT}?t=${KEY}`);
      const site = new URL(android.baseURL);
      await expect(android.page.getByRole("link", { name: "Open in your browser" })).toHaveAttribute("href", `intent://${site.host}/g/${GIFT}?t=${KEY}#Intent;scheme=${site.protocol.slice(0, -1)};end`);
      await expect(android.page.getByText("This page is open inside another app, where an account cannot be made.")).toBeVisible();
      await shot(android.page, size.name, "6d-inside-an-android-app");
      await android.context.close();

      // An iPhone below iOS 18: nothing to press.
      const old = await profile(browser, baseURL, size.viewport, { passkey: false, userAgent: SAFARI_17 });
      await unopened(old.page);
      await old.page.goto(`/g/${GIFT}?t=${KEY}`);
      await expect(old.page.getByText("Update your iPhone to create your account. Viky needs iOS 18 or later.")).toBeVisible();
      await expect(old.page.getByRole("button", { name: /Create my account/ })).toHaveCount(0);
      await shot(old.page, size.name, "6e-iphone-below-ios-18");
      await old.context.close();

      // A phone that says it has no platform authenticator (iOS 26.2 outside Safari): the button is not grey, the
      // gesture decides, and a failure says what to do.
      const chrome = await profile(browser, baseURL, size.viewport, { passkey: false, userAgent: CHROME_IPHONE });
      await chrome.context.addInitScript(`(() => {
        if (!window.PublicKeyCredential) return;
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => false;
        PublicKeyCredential.getClientCapabilities = undefined;
        navigator.credentials.create = () => Promise.reject(new DOMException("The operation is not allowed.", "NotAllowedError"));
      })();`);
      await unopened(chrome.page);
      await chrome.page.goto(`/g/${GIFT}?t=${KEY}`);
      const create = chrome.page.getByRole("button", { name: "Create my account" });
      await expect(create).toBeEnabled();
      await expect(chrome.page.getByText(/computer/i)).toHaveCount(0);
      await shot(chrome.page, size.name, "6f-a-phone-that-says-no");
      await create.click();
      await expect(chrome.page.getByText("If it keeps failing on this iPhone: in Settings, turn on AutoFill Passwords and Passkeys, and open this gift's link in Safari.")).toBeVisible();
      await expect(chrome.page.getByRole("button", { name: "Copy this gift's link" })).toBeVisible();
      await shot(chrome.page, size.name, "6g-the-try-failed");
      await chrome.context.close();

      // A computer with no sensor: told before the press, and still let through for a security key.
      const computer = await profile(browser, baseURL, size.viewport, { passkey: false, userAgent: CHROME_MAC });
      await computer.context.addInitScript(`(() => {
        if (!window.PublicKeyCredential) return;
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => false;
        PublicKeyCredential.getClientCapabilities = undefined;
      })();`);
      await unopened(computer.page);
      await computer.page.goto(`/g/${GIFT}?t=${KEY}`);
      await expect(computer.page.getByText("This computer did not find a fingerprint reader or Windows Hello. Use a security key, or open this gift's link on your phone.")).toBeVisible();
      await expect(computer.page.getByRole("button", { name: "Create my account" })).toBeEnabled();
      await shot(computer.page, size.name, "6h-a-computer-with-no-sensor");
      await computer.context.close();
    });
  }
});
