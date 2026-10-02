import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "@playwright/test";
import { DAY, gift, json, now, profile } from "./gift-kit";

/**
 * What the walks of a gift's own page share (test/browser/you-decide.spec.ts, test/browser/funder-page.spec.ts): a
 * habit and a climb as the gift route answers them, the agreement's route kept as it is signed, a window at 390 by
 * 844, by day or after dark, and a photograph where a folder is named.
 */
export const CONTRACT = "0x00000000000000000000000000000000000000d2";
export const VIEW = { width: 390, height: 844 };
/** VIKY_DECIDE_NIGHT=1 walks and photographs the same states after dark. */
const NIGHT = process.env.VIKY_DECIDE_NIGHT === "1";

export const aWindow = async (browser: Browser, baseURL: string | undefined, options: { userAgent?: string } = {}) => {
  const device = await profile(browser, baseURL, VIEW, options);
  if (NIGHT) await device.page.emulateMedia({ colorScheme: "dark" });
  return device;
};

/** A photograph in the folder named: a page whole, a sheet as the screen shows it. Nothing when no folder is named. */
export const photographer = (folder: string | undefined) =>
  async function shot(page: Page, name: string, whole = true): Promise<void> {
    if (!folder) return;
    mkdirSync(folder, { recursive: true });
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(folder, `${name}.png`), fullPage: whole });
  };

export type Who = "recipient" | "funder";

/** A daily gift as the gift route answers it: seven days at a dollar, two counted. */
export function daily(giftId: string, who: Who, over: Record<string, unknown> = {}) {
  const today = Math.floor(now() / DAY);
  return {
    kind: "daily",
    giftId,
    youAreTheRecipient: who === "recipient",
    youAreTheFunder: who === "funder",
    catchUpSeconds: 30 * 3_600,
    escrow: CONTRACT,
    goalAccount: { username: "boo_learns", source: "funder", bound: true, code: null, codeExpiresAt: null },
    names: { recipientName: "Boo", funderName: "Maman" },
    goalType: 1,
    dailyTarget: 10,
    durationDays: 7,
    amount: "7000000",
    amountDisplay: "$7.00",
    perDay: "1000000",
    perDayDisplay: "$1.00",
    opened: true,
    connected: true,
    cancelled: false,
    finished: false,
    creditedDays: 2,
    missedDays: 0,
    daysLeft: 5,
    earned: "2000000",
    earnedDisplay: "$2.00",
    alreadyTheirs: "2000000",
    alreadyTheirsDisplay: "$2.00",
    returned: "0",
    returnedDisplay: "$0.00",
    takenDisplay: "$0.00",
    days: [
      { day: today - 2, outcome: "earned" },
      { day: today - 1, outcome: "earned" },
    ],
    lastReturnAtMs: null,
    claimedAtChain: now() - 3 * DAY,
    createdAtChain: now() - 4 * DAY,
    returnable: "0",
    todayDayIndex: 3,
    startDay: today - 2,
    endDay: today + 4,
    withdrawNonce: "0",
    funderIsRecipient: false,
    recorded: [],
    hasRecord: true,
    version: 2,
    end: who === "recipient" ? { keep: "2000000", keepDisplay: "$2.00", giveBack: "5000000", giveBackDisplay: "$5.00", nonce: "0" } : null,
    ended: null,
    ...over,
  };
}

/**
 * The same gift once its person ended it, as the server answers it then: the two days counted, and every day after
 * them written as a day that went back, which is what the relay records from the ending (src/gift-relay.ts).
 */
export function endedDaily(giftId: string, who: Who, atMs: number) {
  const today = Math.floor(now() / DAY);
  const days = [
    { day: today - 2, outcome: "earned" },
    { day: today - 1, outcome: "earned" },
    ...Array.from({ length: 5 }, (_, index) => ({ day: today + index, outcome: "returned" })),
  ];
  return daily(giftId, who, { finished: true, daysLeft: 0, days, givenBackDays: 5, end: null, returned: "5000000", returnedDisplay: "$5.00", lastReturnAtMs: atMs, ended: { atMs, keptDisplay: "$2.00", givenBackDisplay: "$5.00" } });
}

/** A climb on Chess.com under way, read at 1462 of 1500. */
export function climb(giftId: string, who: Who, over: Record<string, unknown> = {}) {
  return gift(giftId, who, {
    shape: "climb",
    conditionId: "chess-rating",
    goalAccount: { username: "boo_plays", bound: true, code: null, codeExpiresAt: null, namedByFunder: true },
    target: 1500,
    startReading: 1450,
    todayReading: 1462,
    readAtMs: Date.now(),
    cadence: { id: "rapid", label: "Rapid" },
    maximumStart: 1460,
    standingAtOffer: 1450,
    version: 2,
    end: { keep: "0", keepDisplay: "$0.00", giveBack: "25000000", giveBackDisplay: "$25.00", nonce: "0" },
    ended: null,
    escrow: CONTRACT,
    ...over,
  });
}

/** What a yes covers, as the agreement's route says it to the person the gift is for (src/consent-terms.ts). */
export const TERMS = {
  daily: { reads: "your lessons on Duolingo, each day, from your public profile: whether the day has one", funderSees: "for each day, whether it counted", what: "your lessons", things: 1 },
  climb: { reads: "your rapid rating on Chess.com, from your public profile, each time it is read", funderSees: "the rating read, and whether it reaches the target", what: "your rapid rating", things: 2 },
  shown: { reads: "your score from TOEFL, shown from your own account, and nothing else on it", funderSees: "whether the score reaches the target, and the score", what: "your score", things: 2 },
} as const;

export type Served = { signed: Array<"yes" | "stop">; finish: () => void };

/** The gift's page answered by the test, the agreement kept as it is signed, and the routes around them quiet. */
export async function serve(page: Page, giftId: string, answer: () => unknown, terms: (typeof TERMS)[keyof typeof TERMS], first: "yes" | "stop" | null = "yes"): Promise<Served> {
  const signed: Array<"yes" | "stop"> = [];
  let state = first ? { kind: first, signedAt: new Date(Date.now() - 2 * DAY * 1000).toISOString() } : null;
  let finished = false;
  await page.route(new RegExp(`/api/gift/${giftId}(\\?.*)?$`), (route) => route.fulfill(json(answer())));
  await page.route(`**/api/gift/${giftId}/consent`, (route) => {
    if (route.request().method() === "POST") {
      const sent = JSON.parse(route.request().postData() ?? "{}") as { kind: "yes" | "stop" };
      signed.push(sent.kind);
      state = { kind: sent.kind, signedAt: new Date().toISOString() };
      return route.fulfill(json({ giftId, state }));
    }
    return route.fulfill(json({ giftId, state, reading: state?.kind === "yes" ? "agreed" : "no_agreement", opened: true, finished, terms, until: "the gift's last day", texts: { yes: `I agree that Viky reads ${terms.what}.`, stop: `Viky stops reading ${terms.what}.` } }));
  });
  await page.route(`**/api/gift/${giftId}/journal`, (route) => route.fulfill(json({ giftId, kind: "daily", days: [], readings: [] })));
  await page.route(`**/api/gift/${giftId}/notify`, (route) => route.fulfill(json({ on: false, possible: false })));
  await page.route(`**/api/gift/${giftId}/reached-seen`, (route) => route.fulfill(json({ seen: true })));
  await page.route(`**/api/gift/${giftId}/count`, (route) => route.fulfill(json({ kind: "notYet", giftId, rating: 1462, target: 1500, attested: false })));
  return { signed, finish: () => (finished = true) };
}

/** How many times the page asked the device for its passkey: every ceremony goes through this one call. */
export async function countPasskeyPrompts(page: Page) {
  await page.addInitScript(`(() => {
    const real = navigator.credentials.get.bind(navigator.credentials);
    window.__passkeyPrompts = 0;
    navigator.credentials.get = (options) => { window.__passkeyPrompts += 1; return real(options); };
  })();`);
  return () => page.evaluate(() => (window as unknown as { __passkeyPrompts: number }).__passkeyPrompts);
}
