import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, test, type Browser, type BrowserContext, type Page, type Route } from "@playwright/test";
import { consentBytes, consentText, fromHex, KEPT_AFTER } from "../../src/consent";
import { anchorSignatureStands, bindingStands, requestedAnchor } from "../../src/consent-anchoring";
import { AGREEMENTS_FROM, readingLeave } from "../../src/consent-guard";
import { consentTermsFor } from "../../src/consent-terms";
import { configureConsentStore, ed25519Verifies, keepConsent, keepConsentKey, latestConsent } from "../../src/consent-store";

/**
 * The recipient's yes and stop on two devices (the founder, 29 Sep 2026; Mera's "One Passkey, Many Keys").
 *
 * One passkey, two profiles. The first signs in, and the same ceremony gives it the consent key, from the passkey's
 * PRF under the salt sha256("viky:consent:v1"); it agrees to what a gift reads with the line under the card. The
 * second profile holds nothing but the same passkey: it signs in as the same account, its consent key has the same
 * public half, and the stop it signs from its own screen is accepted against the key the first one registered.
 * From that moment no reading is allowed, and the first device, looking again, reads that Viky stopped.
 *
 * What is real: the product's sign-in against the server under test, the two ceremonies asking both salts, the key
 * made in each page, the line, the sheet, every click, and the signatures, checked here by the server's own store
 * and guard (src/consent-store.ts, src/consent-guard.ts) on a database of their own. What is stood in for: the gift
 * (a new account receives none, so its page is answered as the capture scenarios answer it), the consent route's
 * lookup of the gift's recipient on the contract, and the PRF itself, since Chrome's virtual authenticator carries no
 * PRF secret across an export (measured on 23 Sep 2026): a script in each profile answers the same output for the same
 * passkey and salt, as a synced passkey does on a phone.
 *
 * The same walk is made a second time with the public record of agreements set (the audit of 1 Oct 2026, ConsentAnchor):
 * the browser is then told what to sign for it, and signs with no prompt added. The first yes carries the consent key's
 * signature for place 0 and the account's own signature binding that key; the stop from the second device carries the
 * signature for place 1 and no binding. Both are checked by the server's own functions (src/consent-anchoring.ts); the
 * anchor itself is stood in for by what it would answer, and runs for real in the fork rehearsal.
 *
 * VIKY_CONSENT_VIDEO=<folder> records both profiles.
 */

/** Where agreements would be written down in public, in the walk that has it set. */
const ANCHOR = "0x00000000000000000000000000000000000a2c04" as const;

const AUTHENTICATOR = { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, hasPrf: true, isUserVerified: true, automaticPresenceSimulation: true } as const;

/** A PRF that is a function of the passkey and the salt, the same on every profile given the same seed; both salts answered. */
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
      // Every ceremony the page asks for is a prompt a person sees: counted, so a test can say none was added.
      window.__vikyPrompts = (window.__vikyPrompts || 0) + 1;
      const credential = await real(options);
      const asked = options && options.publicKey && options.publicKey.extensions && options.publicKey.extensions.prf && options.publicKey.extensions.prf.eval;
      if (credential && asked && asked.first) {
        const results = { first: await prf(credential.rawId, asked.first) };
        if (asked.second) results.second = await prf(credential.rawId, asked.second);
        const before = credential.getClientExtensionResults();
        Object.defineProperty(credential, "getClientExtensionResults", { value: () => ({ ...before, prf: { enabled: true, results } }) });
      }
      return credential;
    };
  }
})();`;

/** A gift the database under test does not hold, so the page asks the browser for it and the answer below is read. */
const GIFT_ID = "1999999";
const GIFT_READ = new RegExp(`/api/gift/${GIFT_ID}(\\?.*)?$`);
/** Funded before agreements existed, so the page asks for the yes in one line, as it will for gifts already running. */
const FUNDED_AT = AGREEMENTS_FROM - 3 * 86_400;

function milestoneGift() {
  return {
    kind: "milestone",
    giftId: GIFT_ID,
    conditionId: "chess-rating",
    youAreTheRecipient: true,
    youAreTheFunder: false,
    names: { recipientName: "Léa", funderName: "Maman" },
    goalAccount: { username: "lea_plays", bound: true, code: null, codeExpiresAt: null },
    amount: "50000000",
    amountDisplay: "$50.00",
    startReading: 1450,
    target: 1500,
    todayReading: 1472,
    readAtMs: Date.now() - 3 * 3_600_000,
    deadlineMs: Date.now() + 20 * 86_400_000,
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
    createdAtChain: FUNDED_AT,
    claimedAtChain: FUNDED_AT + 86_400,
    withdrawNonce: "0",
    escrow: "0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233",
    phase: "climbing",
    cadence: { id: "rapid", label: "Rapid" },
    maximumStart: 1460,
    standingAtOffer: 1450,
  };
}

function card() {
  const today = Math.floor(Date.now() / 86_400_000);
  return {
    giftId: GIFT_ID,
    role: "recipient",
    goalType: 5,
    goalUsername: "lea_plays",
    usernameSource: "funder",
    recipientName: "Léa",
    funderName: "Maman",
    catchUpSeconds: 108_000,
    days: [],
    fundedAt: FUNDED_AT,
    startDay: today - 2,
    endDay: today + 20,
    amountDisplay: "$50.00",
    perDayDisplay: "$0.00",
    durationDays: 30,
    creditedDays: 0,
    missedDays: 0,
    opened: true,
    counting: true,
    finished: false,
    cancelled: false,
    earnedDisplay: "$0.00",
    theirsDisplay: "$0.00",
    returnedDisplay: "$0.00",
    milestone: milestoneGift(),
  };
}

/** The consent route, with the server's own store and guard behind it; only the gift's recipient is not read from the contract. */
function consentServer(account: () => string, anchor: typeof ANCHOR | null) {
  const kept: Array<{ kind: string; publicKey: string }> = [];
  /** What the anchor would hold: whether the account's key is bound, and each entry in its place. */
  const anchored: Array<{ kind: string; sequence: number; withBinding: boolean }> = [];
  let bound = false;
  const texts = (who: string) => {
    const input = { account: who, giftId: GIFT_ID, terms: consentTermsFor("chess-rating", "yours", "rapid")!, until: "the gift's last day", kept: KEPT_AFTER };
    return { yes: consentText("yes", input), stop: consentText("stop", input) };
  };
  const answer = async () => {
    const [latest, leave] = await Promise.all([latestConsent(GIFT_ID), readingLeave(GIFT_ID, FUNDED_AT)]);
    return {
      giftId: GIFT_ID,
      state: latest ? { kind: latest.kind, signedAt: latest.signedAt.toISOString() } : null,
      reading: !leave.allowed ? "no_agreement" : leave.beforeAgreements ? "before_agreements" : "agreed",
      opened: true,
      finished: false,
      terms: consentTermsFor("chess-rating", "yours", "rapid"),
      until: "the gift's last day",
      texts: texts(account()),
      ...(anchor ? { anchor: { contract: anchor, account: account(), bound, sequence: anchored.length } } : {}),
    };
  };
  const handle = async (route: Route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ contentType: "application/json", body: JSON.stringify(await answer()) });
    // What the real route does with a POST: the text rebuilt here, the signature checked against it, the key checked
    // against the one the account first signed with, and the row kept.
    const body = JSON.parse(request.postData() ?? "{}") as { kind: "yes" | "stop"; publicKey: string; signature: string; anchor?: unknown };
    const text = texts(account())[body.kind];
    const key = fromHex(body.publicKey);
    const signature = fromHex(body.signature);
    if (!key || !signature || !ed25519Verifies(key, consentBytes(text), signature)) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "INVALID_SIGNATURE" }) });
    const registered = await keepConsentKey(account(), body.publicKey);
    if (registered !== body.publicKey.toLowerCase()) return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "ANOTHER_KEY" }) });
    if (anchor) {
      // What the real route checks before it keeps anything, and what the anchor itself would then enforce: the consent
      // key signed for this place, and an account whose key is not bound yet signed for that key itself.
      const signed = requestedAnchor(body.anchor);
      const refuse = (error: string) => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error }) });
      if (!signed) return refuse("NO_ANCHOR_SIGNATURE");
      if (signed.sequence !== anchored.length || !anchorSignatureStands(anchor, { account: account(), giftId: GIFT_ID, kind: body.kind, text, publicKey: body.publicKey }, signed)) return refuse("ANCHOR_SIGNATURE");
      if (!bound && (!signed.binding || !(await bindingStands(anchor, account(), body.publicKey, signed.binding)))) return refuse("BINDING");
      anchored.push({ kind: body.kind, sequence: signed.sequence, withBinding: signed.binding !== null });
      bound = true;
    } else if (body.anchor !== undefined) {
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "ANCHOR_NOT_SET" }) });
    }
    const row = await keepConsent({ giftId: GIFT_ID, account: account(), kind: body.kind, text, publicKey: body.publicKey, signature: body.signature });
    kept.push({ kind: body.kind, publicKey: body.publicKey.toLowerCase() });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ giftId: GIFT_ID, state: { kind: row.kind, signedAt: row.signedAt.toISOString() } }) });
  };
  return { handle, kept, anchored };
}

type Profile = { context: BrowserContext; page: Page; authenticatorId: string; cdp: Awaited<ReturnType<BrowserContext["newCDPSession"]>>; startedAt: number };

const VIDEO = process.env.VIKY_CONSENT_VIDEO;
/** On a recording, each state is held long enough to be read. */
const hold = (page: Page) => (VIDEO ? page.waitForTimeout(1_500) : Promise.resolve());
// A recording is slowed to a pace a person can follow; the test itself runs at full speed.
if (VIDEO) test.use({ launchOptions: { slowMo: 250 } });

async function profile(browser: Browser, baseURL: string, seed: string, video: string | undefined, handle: (route: Route) => Promise<void>): Promise<Profile> {
  const startedAt = Date.now();
  const context = await browser.newContext({
    baseURL,
    serviceWorkers: "block",
    viewport: { width: 390, height: 844 },
    ...(video ? { recordVideo: { dir: video, size: { width: 390, height: 844 } } } : {}),
  });
  await context.addInitScript(prfStandIn(seed));
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await page.route("**/api/gifts/mine", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ account: "", gifts: [card()] }) }));
  await page.route(GIFT_READ, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(milestoneGift()) }));
  await page.route(`**/api/gift/${GIFT_ID}/consent`, handle);
  await page.route(`**/api/gift/${GIFT_ID}/count`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ kind: "notYet", giftId: GIFT_ID, rating: 1472, target: 1500, attested: false }) }),
  );
  await page.route(`**/api/gift/${GIFT_ID}/journal`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ giftId: GIFT_ID, kind: "milestone", readings: [] }) }));
  await page.route(`**/api/gift/${GIFT_ID}/reached-seen`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ seen: false }) }));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: AUTHENTICATOR });
  return { context, page, authenticatorId, cdp, startedAt };
}

async function signedInAccount(page: Page): Promise<string | null> {
  return page.evaluate(() => fetch("/api/account/session", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((s) => (s ? s.account : null)));
}

/** Presses the one door, and waits for the server's cookie. Creates the account on a profile with no passkey yet. */
async function signIn(page: Page, context: BrowserContext, create: boolean): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: /^Sign in$/ }).first().click();
  if (create) await page.getByRole("button", { name: /^Create (your|my) account$/ }).first().click();
  await expect.poll(async () => (await context.cookies()).some((cookie) => cookie.name === "__Host-viky-session"), { timeout: 30_000 }).toBe(true);
  const account = await signedInAccount(page);
  expect(account).toMatch(/^0x[0-9a-fA-F]{40}$/);
  return (account as string).toLowerCase();
}

/** How many passkey prompts the page has asked for since it loaded. A string, not a function: see the suite's notes on tsx. */
const promptsOf = (page: Page) => page.evaluate("window.__vikyPrompts || 0") as Promise<number>;

/**
 * The agreement key as the judges page prints it for this device (the audit of 1 Oct 2026), reached by links only:
 * the key lives in the page's memory, and a load would drop it.
 */
async function agreementKeyOnJudges(page: Page): Promise<string> {
  if ((await page.locator('a[href="/me"]').count()) === 0) await page.locator('a[href="/gifts"]').first().click();
  await page.locator('a[href="/me"]:visible').first().click();
  await page.locator('a[href="/judges"]:visible').first().click();
  const line = page.locator("[data-agreement-key]");
  await expect(line).toBeVisible({ timeout: 30_000 });
  await expect(line).toContainText("Your agreement key: ed25519 ");
  return (await line.getAttribute("data-agreement-key")) ?? "";
}

/** The gift's page, reached by a click: the consent key lives in the page's memory, as the account's own does. */
async function openTheGift(page: Page) {
  await page.locator(`a[href="/g/${GIFT_ID}"]`).first().click();
  await expect(page.getByText(/A chess rating on/).first()).toBeVisible();
}

test.describe("the recipient's yes and stop, on two devices", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once");

  let db: PGlite;
  test.beforeAll(async () => {
    db = new PGlite();
    configureConsentStore(async (strings, ...values) => {
      const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
      return (await db.query<Record<string, unknown>>(text, values)).rows;
    });
  });
  test.afterAll(async () => {
    configureConsentStore(undefined);
    await db.close();
  });
  // Each walk starts from a gift nobody has answered for.
  test.beforeEach(async () => {
    await db.query("DELETE FROM viky_consents").catch(() => undefined);
    await db.query("DELETE FROM viky_consent_keys").catch(() => undefined);
  });

  for (const anchor of [null, ANCHOR]) {
  test(`the same passkey makes the same consent key on a second device, and the stop it signs there holds for the gift${anchor ? ", both signed for the public record with no prompt added" : ""}`, async ({ browser, baseURL: served }) => {
    test.setTimeout(180_000);
    const address = new URL(served ?? "http://127.0.0.1:3000");
    // A passkey refuses an IP address as its site.
    if (address.hostname === "127.0.0.1") address.hostname = "localhost";
    const baseURL = address.origin;
    const seed = `device-${Date.now()}`;
    // One recording is enough: the walk a person sees is the same with the public record set.
    const video = anchor ? undefined : VIDEO;
    let account = "";
    const server = consentServer(() => account, anchor);

    // The first device: a new passkey, a new account, and the yes from the line under the card.
    const first = await profile(browser, baseURL, seed, video, server.handle);
    account = await signIn(first.page, first.context, true);
    await openTheGift(first.page);
    await expect(first.page.getByText("Viky reads your rapid rating for this gift. Do you agree?")).toBeVisible();
    await hold(first.page);
    const promptsBeforeYes = await promptsOf(first.page);
    await first.page.getByRole("button", { name: /^Agree$/ }).click();
    await expect(first.page.getByText(/^Viky reads your rapid rating for this gift\. You agreed on /)).toBeVisible();
    expect(await promptsOf(first.page), "the yes asks the passkey for nothing more, with or without the public record").toBe(promptsBeforeYes);
    await hold(first.page);
    expect(server.kept.map((row) => row.kind)).toEqual(["yes"]);
    expect((await readingLeave(GIFT_ID, FUNDED_AT)).allowed, "with the yes, the gift is read").toBe(true);
    const { credentials } = await first.cdp.send("WebAuthn.getCredentials", { authenticatorId: first.authenticatorId });
    expect(credentials.length).toBe(1);

    // The second device: nothing but the same passkey. Same account, same consent key, and the stop from there.
    const second = await profile(browser, baseURL, seed, video, server.handle);
    await second.cdp.send("WebAuthn.addCredential", { authenticatorId: second.authenticatorId, credential: credentials[0] });
    expect(await signIn(second.page, second.context, false), "the same passkey is the same account").toBe(account);
    await openTheGift(second.page);
    await expect(second.page.getByText(/^Viky reads your rapid rating for this gift\. You agreed on /), "the yes signed on the first device").toBeVisible();
    await hold(second.page);
    await second.page.getByRole("button", { name: /^Stop$/ }).click();
    await expect(second.page.getByRole("dialog", { name: "Stop Viky reading your rapid rating?" })).toBeVisible();
    await expect(second.page.getByText(/If 1500 is not read by .+, the \$50\.00 goes back to Maman\./)).toBeVisible();
    await hold(second.page);
    const promptsBeforeStop = await promptsOf(second.page);
    await second.page.getByRole("button", { name: /^Stop reading$/ }).click();
    await expect(second.page.getByText(/^Viky stopped reading your rapid rating on /)).toBeVisible();
    expect(await promptsOf(second.page), "nor does the stop").toBe(promptsBeforeStop);
    await hold(second.page);
    expect(server.kept.map((row) => row.kind)).toEqual(["yes", "stop"]);
    expect(server.kept[1].publicKey, "the second device's key is the first one's").toBe(server.kept[0].publicKey);
    // With the public record set: the yes took place 0 and bound the key, the stop took place 1 on the other device
    // and bound nothing, since the key is bound once. Without it, nothing was signed for it at all.
    expect(server.anchored).toEqual(anchor ? [{ kind: "yes", sequence: 0, withBinding: true }, { kind: "stop", sequence: 1, withBinding: false }] : []);
    expect((await latestConsent(GIFT_ID))?.kind).toBe("stop");
    expect(await readingLeave(GIFT_ID, FUNDED_AT), "from the stop, nothing is read, whichever device reads").toEqual({ allowed: false, reason: "stopped" });

    // The first device, looking again, reads the stop signed elsewhere.
    await first.page.goBack();
    await openTheGift(first.page);
    await expect(first.page.getByText(/^Viky stopped reading your rapid rating on /)).toBeVisible();
    await hold(first.page);

    // What a judge compares by eye: the judges page prints the same agreement key on both devices, and it is the
    // very key the yes and the stop were signed with.
    const onFirst = await agreementKeyOnJudges(first.page);
    const onSecond = await agreementKeyOnJudges(second.page);
    expect(onFirst).toMatch(/^[0-9a-f]{64}$/);
    expect(onSecond, "the same passkey, the same key, on another device").toBe(onFirst);
    expect(`0x${onFirst}`).toBe(server.kept[0].publicKey);
    await hold(second.page);

    await first.context.close();
    await second.context.close();
    if (video) {
      // Where each recording starts, so the two can be laid side by side on one clock.
      const recorded = async (device: Profile) => ({ path: await device.page.video()?.path(), startedAt: device.startedAt });
      writeFileSync(join(video, "manifest.json"), JSON.stringify({ first: await recorded(first), second: await recorded(second) }, null, 2));
    }
  });
  }
});
