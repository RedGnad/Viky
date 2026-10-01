import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Browser, type BrowserContext, type Page, type Route } from "@playwright/test";
import { holdAPasskey, passkeySite, signedIn } from "./virtual-passkey";

/**
 * What the tests of a gift's own page share: a gift as the gift route answers it, the agreement's route, a window of
 * its own with a passkey in it, an account made by the one door, and a photograph where a folder is named.
 */
export const KEY = "AbCdEfGhIjKlMnOpQrStUv";
export const now = () => Math.floor(Date.now() / 1000);
export const DAY = 86_400;

/** The two sizes a capture is taken at; one when nothing is photographed. */
export function sizesFor(folder: string | undefined) {
  return folder
    ? [
        { name: "390", viewport: { width: 390, height: 844 } },
        { name: "1440", viewport: { width: 1440, height: 900 } },
      ]
    : [{ name: "390", viewport: { width: 390, height: 844 } }];
}

export type Who = "recipient" | "funder" | "link";

/** A milestone gift as the gift route answers it. */
export function gift(giftId: string, who: Who, over: Record<string, unknown>) {
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

export const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

/** The agreement's route: nothing agreed until a yes is sent, and the yes kept from then on. */
export function agreement(giftId: string, what: string) {
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

export type Profile = { context: BrowserContext; page: Page; baseURL: string };

export async function profile(browser: Browser, served: string | undefined, viewport: { width: number; height: number }, options: { passkey?: boolean; userAgent?: string } = {}): Promise<Profile> {
  const baseURL = passkeySite(served);
  const context = await browser.newContext({ baseURL, serviceWorkers: "block", viewport, ...(options.userAgent ? { userAgent: options.userAgent } : {}) });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  if (options.passkey !== false) await holdAPasskey(context, page, `recipient-${Date.now()}-${Math.random()}`);
  await page.route("**/api/gifts/mine", (route) => route.fulfill(json({ account: "", gifts: [] })));
  return { context, page, baseURL };
}

/** Makes an account by the one door of Home, and waits for the server's cookie. */
export async function makeAnAccount({ page, context }: Profile): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /^Sign in$/ }).first().click();
  await page.getByRole("button", { name: /^Create (your|my) account$/ }).first().click();
  await expect.poll(() => signedIn(context), { timeout: 30_000 }).toBe(true);
}

/** A photograph of the page as it stands, in the folder named, or nothing when none is. */
export async function shot(folder: string | undefined, page: Page, size: string, name: string): Promise<void> {
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(folder, `${name}-${size}.png`) });
}
