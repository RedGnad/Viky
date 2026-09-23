import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * The funder's private space, on two devices (D202, Mera's "One Passkey, Many Keys").
 *
 * The same passkey on a second profile shows the same names: a nickname and a note kept on the first device are read
 * on a second one that holds nothing but the passkey, because the key is derived from the passkey's PRF output under
 * the space's own salt, on each device, and the server keeps only a sealed envelope. Three things are asserted:
 *
 * 1. what leaves the first device is sealed: the request that keeps the space carries a nonce and a ciphertext and
 *    none of the words typed;
 * 2. the second device, signed in with the same passkey, opens the space and reads the same nickname and note;
 * 3. the same account opened with another key reads nothing, and is told so: nothing is overwritten by a key that
 *    could not open what was there.
 *
 * Chrome's virtual authenticator does not carry a passkey's PRF secret across an export (measured on 23 Sep 2026:
 * an imported credential answers no PRF at all), so the PRF is stood in for by a script in each profile that answers
 * the same output for the same passkey and salt, as a synced passkey does on a phone. Everything else is the real
 * product against the real server under test: the sign-in, the route, the database, the sealing in the page.
 */

const AUTHENTICATOR = { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, hasPrf: true, isUserVerified: true, automaticPresenceSimulation: true } as const;

/** A PRF that is a function of the passkey and the salt, the same on every profile given the same seed. */
const prfStandIn = (seed: string) => `(() => {
  const encoder = new TextEncoder();
  const bytes = (source) => source instanceof ArrayBuffer ? new Uint8Array(source) : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  async function prf(rawId, salt) {
    const key = await crypto.subtle.importKey("raw", encoder.encode(${JSON.stringify(seed)}), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const id = bytes(rawId), s = bytes(salt);
    const data = new Uint8Array(id.length + s.length);
    data.set(id, 0);
    data.set(s, id.length);
    return crypto.subtle.sign("HMAC", key, data);
  }
  for (const method of ["create", "get"]) {
    const real = navigator.credentials[method].bind(navigator.credentials);
    navigator.credentials[method] = async (options) => {
      const credential = await real(options);
      const salt = options && options.publicKey && options.publicKey.extensions && options.publicKey.extensions.prf && options.publicKey.extensions.prf.eval && options.publicKey.extensions.prf.eval.first;
      if (credential && salt) {
        const first = await prf(credential.rawId, salt);
        const results = credential.getClientExtensionResults();
        Object.defineProperty(credential, "getClientExtensionResults", { value: () => ({ ...results, prf: { enabled: true, results: { first } } }) });
      }
      return credential;
    };
  }
})();`;

/** One funded gift for a person named Léa, so the space has somebody to name. The page reads the role and the name. */
const ONE_GIFT = { account: "", gifts: [{ giftId: "1", role: "funder", recipientName: "Léa", funderName: "Sam", goalType: 1, days: [], catchUpSeconds: 0, fundedAt: 0, startDay: 0, endDay: 0, amountDisplay: "$7.00", perDayDisplay: "$1.00", durationDays: 7, creditedDays: 0, missedDays: 0, opened: false, counting: false, finished: false, cancelled: false, earnedDisplay: "$0.00", theirsDisplay: "$0.00", returnedDisplay: "$0.00" }] };

type Profile = { context: BrowserContext; page: Page; authenticatorId: string; cdp: Awaited<ReturnType<BrowserContext["newCDPSession"]>> };

async function profile(browser: Browser, baseURL: string, seed: string, storageState?: Awaited<ReturnType<BrowserContext["storageState"]>>): Promise<Profile> {
  const context = await browser.newContext({ baseURL, serviceWorkers: "block", viewport: { width: 375, height: 667 }, storageState });
  await context.addInitScript(prfStandIn(seed));
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: AUTHENTICATOR });
  return { context, page, authenticatorId, cdp };
}

async function signedInAccount(page: Page): Promise<string | null> {
  return page.evaluate(() => fetch("/api/account/session", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((s) => (s ? s.account : null)));
}

/** Presses the one door and waits for the server's cookie. Creates the account on a profile that has no passkey yet. */
async function signIn(page: Page, context: BrowserContext, create: boolean): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: /^Sign in$/ }).first().click();
  if (create) await page.getByRole("button", { name: /^Create (your|my) account$/ }).first().click();
  await expect.poll(async () => (await context.cookies()).some((cookie) => cookie.name === "__Host-viky-session"), { timeout: 30_000 }).toBe(true);
  const account = await signedInAccount(page);
  expect(account).toMatch(/^0x[0-9a-fA-F]{40}$/);
  return account as string;
}

async function openTheSpace(page: Page) {
  await page.route("**/api/gifts/mine", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(ONE_GIFT) }));
  await page.goto("/me");
  await page.getByRole("button", { name: /^Open$/ }).click();
}

test.describe("the private space, on two devices", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured at one width");

  test("a nickname and a note kept on one device are read on a second one that holds only the passkey, and not by another key", async ({ browser, baseURL: served }) => {
    test.setTimeout(180_000);
    const address = new URL(served ?? "http://127.0.0.1:3000");
    if (address.hostname === "127.0.0.1") address.hostname = "localhost";
    const baseURL = address.origin;
    const seed = `device-${Date.now()}`;

    // The first device: a new passkey, a new account, the space kept once.
    const first = await profile(browser, baseURL, seed);
    const account = await signIn(first.page, first.context, true);
    const sent: string[] = [];
    first.page.on("request", (request) => {
      if (request.method() === "PUT" && request.url().includes("/api/account/private")) sent.push(request.postData() ?? "");
    });
    await openTheSpace(first.page);
    await expect(first.page.getByLabel("Your name for Léa")).toBeVisible();
    await first.page.getByLabel("Your name for Léa").fill("Lili");
    await first.page.getByLabel("Your notes").fill("Birthday in March");
    await first.page.getByRole("button", { name: /^Keep$/ }).click();
    await expect(first.page.locator('section[aria-labelledby="private-space-title"]').getByRole("status")).toHaveText("Kept.");
    expect(sent.length, "one request kept the space").toBe(1);
    const kept = JSON.parse(sent[0]) as { sealed: { version: number; nonce: string; ciphertext: string }; revision: number };
    expect(kept.sealed.version).toBe(1);
    expect(kept.sealed.nonce).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(kept.sealed.ciphertext).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    for (const word of ["Lili", "Birthday", "Léa", "nickname", "notes"]) expect(sent[0], `the words typed never leave the device: ${word}`).not.toContain(word);
    const { credentials } = await first.cdp.send("WebAuthn.getCredentials", { authenticatorId: first.authenticatorId });
    expect(credentials.length).toBe(1);
    const firstState = await first.context.storageState();
    await first.context.close();

    // The second device: nothing but the same passkey. It signs in as the same account and reads the same names.
    const second = await profile(browser, baseURL, seed);
    await second.cdp.send("WebAuthn.addCredential", { authenticatorId: second.authenticatorId, credential: credentials[0] });
    expect(await signIn(second.page, second.context, false), "the same passkey is the same account").toBe(account);
    await openTheSpace(second.page);
    await expect(second.page.getByLabel("Your name for Léa")).toHaveValue("Lili");
    await expect(second.page.getByLabel("Your notes")).toHaveValue("Birthday in March");
    await second.context.close();

    // The same account, the same passkey, another key: refused by name, and nothing written.
    const other = await profile(browser, baseURL, `${seed}-another-key`, firstState);
    await other.cdp.send("WebAuthn.addCredential", { authenticatorId: other.authenticatorId, credential: credentials[0] });
    await other.page.goto("/");
    expect(await signedInAccount(other.page), "the first device's session names the account").toBe(account);
    await openTheSpace(other.page);
    // Scoped to the card: Next's route announcer is an alert of its own on every page.
    await expect(other.page.locator('section[aria-labelledby="private-space-title"]').getByRole("alert")).toHaveText("This passkey does not open it. Sign in with the passkey you kept it with.");
    await expect(other.page.getByLabel("Your name for Léa")).toHaveCount(0);
    await other.context.close();
  });
});
