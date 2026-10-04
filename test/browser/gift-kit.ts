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
    names: { recipientName: "Boo", funderName: "Mom" },
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

/**
 * An address of its own for each window, as the platform would name it. The server keeps its sign-in limit per
 * address (thirty in ten minutes), and every window of a run would otherwise share this machine's: the suite reached
 * it on 1 Oct 2026, and the accounts made after that were refused for a reason no test was measuring.
 */
let windows = 0;
function ownAddress(): string {
  windows += 1;
  return `10.${process.pid % 250}.${Math.floor(windows / 250) % 250}.${(windows % 250) + 1}`;
}

/** A browser that was never asked about notifications. One with nobody in front of it answers "denied" by itself. */
export async function neverAskedToBeTold(context: BrowserContext): Promise<void> {
  await context.addInitScript(`Object.defineProperty(Notification, "permission", { get: () => "default" });`);
}

export async function profile(browser: Browser, served: string | undefined, viewport: { width: number; height: number }, options: { passkey?: boolean; userAgent?: string } = {}): Promise<Profile> {
  const baseURL = passkeySite(served);
  const context = await browser.newContext({ baseURL, serviceWorkers: "block", viewport, extraHTTPHeaders: { "x-vercel-forwarded-for": ownAddress() }, ...(options.userAgent ? { userAgent: options.userAgent } : {}) });
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

/** What an account holds, as the chain would answer it: the two dollar coins in their six decimals, the chain's own in eighteen. */
export type Holdings = { ausd: bigint; mon: bigint; usdc?: bigint };

const USDC_CONTRACT = "0x754704bc059f8c67012fed69bc8a327a5aafb603";
const word = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

/**
 * Every call to the chain is answered here from `holdings`, which a test may change as it goes; a broadcast is refused,
 * whatever the screen tries, and nothing else leaves for any other host.
 */
export async function answerTheChain(context: BrowserContext, holdings: Holdings): Promise<void> {
  await context.route(
    (url) => url.hostname !== "localhost" && url.hostname !== "127.0.0.1",
    async (route) => {
      let body: unknown;
      try {
        body = JSON.parse(route.request().postData() ?? "");
      } catch {
        return route.abort();
      }
      const calls = (Array.isArray(body) ? body : [body]) as Array<{ id: unknown; method?: string; params?: Array<{ to?: string }> }>;
      if (!calls.every((call) => typeof call?.method === "string")) return route.abort();
      const answers = calls.map((call) => {
        if (call.method === "eth_getBalance") return { jsonrpc: "2.0", id: call.id, result: `0x${holdings.mon.toString(16)}` };
        if (call.method === "eth_call") {
          const usdc = String(call.params?.[0]?.to ?? "").toLowerCase() === USDC_CONTRACT;
          return { jsonrpc: "2.0", id: call.id, result: word(usdc ? (holdings.usdc ?? 0n) : holdings.ausd) };
        }
        if (call.method === "eth_chainId") return { jsonrpc: "2.0", id: call.id, result: "0x8f" };
        return { jsonrpc: "2.0", id: call.id, error: { code: -32000, message: "refused by the test" } };
      });
      return route.fulfill(json(Array.isArray(body) ? answers : answers[0]));
    },
  );
}
