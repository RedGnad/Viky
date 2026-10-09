import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { DAY, json, makeAnAccount, now, profile, sizesFor } from "./gift-kit";

/**
 * An account page arrives once (the founder, 9 Oct 2026, on a living mockup of Home; Me and Gifts with the same
 * pieces): every block is at its place from the first image, held from what this device saw last time, and what is
 * read after it changes in place.
 *
 * The three readings a page waits for are answered here, each after its own delay, as the mockup simulates them: the
 * gifts at 0.5 s, the account at 0.9 s, and the last figure, the chain's own coin at the exchange's quote, at 1.25 s.
 * The account is a virtual passkey. It signs in twice on one device: the first visit leaves what the device remembers,
 * and the second one is measured. Signing in on the page is the one arrival on Home where the server has read nothing
 * for the account, so every reading is the browser's, and late; Me reads everything in the browser, and so does Gifts
 * where the server has no list to give.
 *
 * What is measured on each arrival of the second visit, image by image:
 * - the first image holds every block the last one will hold, and after the entrance no block's top changes at all;
 * - no block plays the entrance once the screen has arrived;
 * - Home: the last figure this device saw, the way out, one place for each gift, and the card's amount as it was;
 *   the figure, which has changed, counts to its value in place;
 * - Me: the same figure and the same way out; the reading of the figure is held back six seconds, so after four the
 *   figure goes to the faint ink, and it is back in full ink when the reading lands;
 * - Gifts: one place for each gift of its two lists, and the cards land in them.
 *
 * And on the first visit, where the device remembers nothing: the way out and the gifts have no place, and theirs open
 * by their height, so what stands under them slides and never jumps.
 *
 * VIKY_HOME_ARRIVAL_CAPTURES=<folder> also photographs the three arrivals at 0, 0.5, 0.9 and 1.3 s (and Me in the
 * faint ink), at 390 by 844 and at 1440 by 900, and writes beside them what each image measured: the gifts stand
 * under the fold on Home, where a block waits to be scrolled to, so their places are in the measurements.
 */
const SHOTS = process.env.VIKY_HOME_ARRIVAL_CAPTURES;
const ONE = 1_000_000_000_000_000_000n;
const USDC_CONTRACT = "0x754704bc059f8c67012fed69bc8a327a5aafb603";
/** When each reading is answered, after it was asked. */
const LATE = { gifts: 500, account: 900, figure: 1250 } as const;

/** A daily gift of this account's, as the list of gifts answers it: made out to it, or given by it. */
function gift(giftId: string, role: "recipient" | "funder", other: string) {
  const today = Math.floor(now() / DAY);
  return {
    giftId,
    role,
    goalType: 1,
    goalUsername: "boo_learns",
    usernameSource: "funder",
    recipientName: role === "funder" ? other : "Boo",
    funderName: role === "funder" ? "Boo" : other,
    catchUpSeconds: 108_000,
    days: [
      { day: today - 2, outcome: "earned" },
      { day: today - 1, outcome: "earned" },
    ],
    fundedAt: now() - 3 * DAY,
    startDay: today - 2,
    endDay: today + 4,
    amountDisplay: "$7.00",
    perDayDisplay: "$1.00",
    durationDays: 7,
    creditedDays: 2,
    missedDays: 0,
    opened: true,
    counting: true,
    finished: false,
    cancelled: false,
    earnedDisplay: "$2.00",
    theirsDisplay: "$2.00",
    returnedDisplay: "$0.00",
    takeable: "0",
  };
}

type World = { ausd: bigint; mon: bigint; gifts: unknown[]; wait: { gifts: number; account: number; figure: number } };
const later = (ms: number) => new Promise((done) => setTimeout(done, ms));
const word = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

/** Every reading a page asks for, answered from `world`, each after its own delay. Nothing leaves for anywhere else. */
async function answer(page: Page, world: World): Promise<void> {
  await page.context().route(
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
        if (call.method === "eth_getBalance") return { jsonrpc: "2.0", id: call.id, result: `0x${world.mon.toString(16)}` };
        if (call.method === "eth_call") return { jsonrpc: "2.0", id: call.id, result: word(String(call.params?.[0]?.to ?? "").toLowerCase() === USDC_CONTRACT ? 0n : world.ausd) };
        if (call.method === "eth_chainId") return { jsonrpc: "2.0", id: call.id, result: "0x8f" };
        return { jsonrpc: "2.0", id: call.id, error: { code: -32000, message: "refused by the test" } };
      });
      if (calls.some((call) => call.method === "eth_getBalance" || call.method === "eth_call")) await later(world.wait.account);
      return route.fulfill(json(Array.isArray(body) ? answers : answers[0])).catch(() => undefined);
    },
  );
  await page.unroute("**/api/gifts/mine");
  await page.route("**/api/gifts/mine", async (route) => {
    await later(world.wait.gifts);
    return route.fulfill(json({ account: "", gifts: world.gifts })).catch(() => undefined);
  });
  // The chain's own coin above what an account keeps, at the exchange's quote: 5.02 dollars, whatever is asked.
  await page.route("**/api/fund/quote", async (route) => {
    await later(Math.max(0, world.wait.figure - world.wait.account));
    return route.fulfill(json({ output: "5020000", minOut: "0", to: "0x0000000000000000000000000000000000000001", data: "0x", value: "0" })).catch(() => undefined);
  });
  await page.route("**/api/gifts/earned", (route) => route.fulfill(json({ gifts: [] })));
  await page.route("**/api/exit/open", (route) => route.fulfill(json({ open: null })));
  await page.route("**/api/rates", (route) => route.fulfill(json({ rates: null, currencies: ["USD"] })));
  await page.route("**/api/account/preferences", (route) => route.fulfill(json({ country: "fr", displayCurrency: "USD" })));
}

/**
 * Watches an account page arrive, image by image, from the first one that shows its title: where each block stands
 * (each known by the element it is, so one that is built anew is another block), what the figure says and in which
 * ink, what the card's amount is, how many places and cards the lists hold, and every entrance that starts. A string:
 * a function sent into the page is compiled on the way and arrives calling a helper the page does not have.
 */
const WATCH = `(() => {
  let log = null;
  let known = new WeakMap();
  let next = 0;
  window.__watch = (path, title) => {
    log = { path: path, title: title, t0: null, frames: [], entered: [] };
    known = new WeakMap();
    next = 0;
    window.__arrival = log;
  };
  document.addEventListener("animationstart", (event) => {
    if (log && event.animationName === "page-enter" && log.t0 !== null) log.entered.push({ at: Math.round(performance.now() - log.t0), what: (event.target.textContent || "").trim().slice(0, 30) });
  }, true);
  const top = (part) => Math.round(part.getBoundingClientRect().top * 10) / 10;
  const read = () => {
    const main = log && document.querySelector('main[data-drawn-for="account"]');
    const head = main && main.querySelector("h1");
    const titled = main && (log.title === "Home" ? main.querySelector(".money-display-box") : head && (head.textContent || "").trim() === log.title);
    if (titled && location.pathname === log.path) {
      if (log.t0 === null) log.t0 = performance.now();
      const blocks = {};
      main.querySelectorAll(":scope > *:not(header):not(dialog), .arrives-in-turn > *, [data-gift-row]").forEach((block) => {
        if (!known.has(block)) known.set(block, "b" + next++);
        blocks[known.get(block)] = top(block);
      });
      const figure = main.querySelector("[data-amount]");
      const said = figure && figure.querySelector("span");
      const field = main.querySelector('input[inputmode="decimal"]');
      const out = main.querySelector('a[href="/cash-out"]');
      log.frames.push({
        at: Math.round(performance.now() - log.t0),
        amount: said ? (said.textContent || "").trim() : null,
        pale: Boolean(figure && figure.hasAttribute("data-pale")),
        out: out ? top(out) : null,
        offer: field ? field.value : null,
        places: main.querySelectorAll("[data-gift-place]").length,
        cards: main.querySelectorAll("[data-gift-row] a").length,
        waiting: main.querySelectorAll("[data-place] [data-waiting]").length,
        tall: Array.prototype.map.call(main.querySelectorAll("[data-gift-row]"), (row) => Math.round(row.getBoundingClientRect().height)),
        blocks: blocks,
      });
    }
    requestAnimationFrame(read);
  };
  requestAnimationFrame(read);
})()`;

type Frame = { at: number; amount: string | null; pale: boolean; out: number | null; offer: string | null; places: number; cards: number; waiting: number; tall: number[]; blocks: Record<string, number> };
type Seen = { t0: number | null; frames: Frame[]; entered: { at: number; what: string }[] };

const since = (ms: number) => `Boolean(window.__arrival) && window.__arrival.t0 !== null && performance.now() - window.__arrival.t0 >= ${ms}`;
const watch = (page: Page, path: string, title: string) => page.evaluate(`window.__watch(${JSON.stringify(path)}, ${JSON.stringify(title)})`);
const seenBy = async (page: Page) => (await page.evaluate("window.__arrival")) as Seen;

/** How far each block went, over the images given: between the tops it stood at, by the element it is. */
function travel(frames: Frame[]): Record<string, number> {
  const tops: Record<string, number[]> = {};
  for (const frame of frames) for (const [block, top] of Object.entries(frame.blocks)) (tops[block] ??= []).push(top);
  return Object.fromEntries(Object.entries(tops).map(([block, all]) => [block, Math.round((Math.max(...all) - Math.min(...all)) * 10) / 10]));
}

/**
 * What every arrival on a device that remembers must show: the first image holds each block the last one holds, a
 * block goes up by the entrance's own rise and no further, once the entrance is over none moves at all, and no
 * entrance starts after the screen has arrived.
 */
function arrivedOnce(seen: Seen, page: string): void {
  const frames = seen.frames;
  expect(Object.keys(frames.at(-1)?.blocks ?? {}).sort(), `${page}: every block of the last image was at its place in the first`).toEqual(Object.keys(frames[0].blocks).sort());
  expect(Math.max(0, ...Object.values(travel(frames))), `${page}: the entrance's rise at most`).toBeLessThanOrEqual(9);
  expect(Math.max(0, ...Object.values(travel(frames.filter((frame) => frame.at > 560)))), `${page}: nothing moves once the screen has arrived`).toBeLessThanOrEqual(1);
  expect(seen.entered.filter((one) => one.at > 400), `${page}: no block enters once the screen has arrived`).toEqual([]);
}

/** Photographs the arrival under way at the moments named, where a folder is named. */
async function photograph(page: Page, size: string, name: string, moments: number[]): Promise<void> {
  for (const at of moments) {
    await page.waitForFunction(since(at));
    if (!SHOTS) continue;
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `${name}-${size}-${String(at).padStart(4, "0")}ms.png`) });
  }
}
/** Writes what each image of an arrival measured beside its photographs. */
function keep(size: string, name: string, seen: Seen): void {
  if (SHOTS) writeFileSync(join(SHOTS, `${name}-${size}-measured.json`), JSON.stringify(seen, null, 1));
}

test.describe("an account page arrives once, each block at its place", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(180_000);

  for (const size of sizesFor(SHOTS)) {
    test(`a device that remembers holds every place, and what is read later changes in place (${size.name})`, async ({ browser, baseURL }) => {
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      const world: World = { ausd: 8_980_000n, mon: 0n, gifts: [gift("7001", "recipient", "Mom"), gift("7002", "recipient", "Sam"), gift("7003", "funder", "Zoe")], wait: { ...LATE } };
      await answer(page, world);
      await page.addInitScript(WATCH);
      await page.addInitScript(`window.addEventListener("DOMContentLoaded", () => { if (location.pathname === "/") window.__watch("/", "Home"); });`);

      // The first visit, on a device that remembers nothing: three dots, the line that says the list is read, and no
      // place for the way out or for the gifts. Theirs open by their height: what stands under them slides.
      await makeAnAccount(device);
      await page.waitForFunction(since(2_400));
      const first = await seenBy(page);
      const opening = first.frames[0];
      expect([opening.amount, opening.out, opening.places, opening.waiting, opening.offer], "nothing remembered: the dots, no place held, the list said to be read, the card on thirty").toEqual([null, null, 0, 1, "30.00"]);
      expect(first.frames.at(-1)).toMatchObject({ amount: "$8.98", cards: 3, places: 0, waiting: 0, offer: "8.98" });
      expect(first.frames.at(-1)?.out, "the way out is there once the account is read").not.toBeNull();
      // The way out opens over 220 ms: the title under it goes down through several places, never in one step.
      const under = first.frames.filter((frame) => frame.at >= LATE.account - 40 && frame.at <= LATE.account + 400).map((frame) => frame.blocks.b1);
      expect(new Set(under).size, `the block under the way out slides: ${under.join(" ")}`).toBeGreaterThanOrEqual(4);
      expect(first.entered.filter((one) => one.at > 400), "no block enters once the screen has arrived").toEqual([]);

      // Gifts and Me are seen once too, with nothing held back, and what they showed is the device's memory with Home's.
      world.wait = { gifts: 0, account: 0, figure: 0 };
      await page.getByRole("link", { name: "Gifts", exact: true }).first().click();
      await expect(page.locator("main [data-gift-row] a")).toHaveCount(3);
      await page.waitForTimeout(2_300);
      await page.getByRole("link", { name: "Me", exact: true }).first().click();
      await expect(page.locator("main [data-amount]")).toContainText("$8.98");
      await page.waitForTimeout(400);

      // The account signs out, and the money changes meanwhile: the chain's own coin has arrived, worth 5.02 dollars
      // at the exchange's quote.
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page.getByRole("button", { name: /^Sign in$/ }).first()).toBeVisible();
      world.mon = 11n * ONE + 186n * ONE;
      world.wait = { ...LATE };
      await page.goto("/");
      await page.getByRole("button", { name: /^Sign in$/ }).first().click();

      // Home, the second arrival.
      await photograph(page, size.name, "home", [0, 500, 900, 1300]);
      await page.waitForFunction(since(2_600));
      const home = await seenBy(page);
      keep(size.name, "home", home);
      // The first image: the last figure this device saw, in full ink, the way out, a place for each gift, and the
      // card on the amount it started on last time.
      expect(home.frames[0], "the first image").toMatchObject({ amount: "$8.98", pale: false, places: 3, cards: 0, waiting: 0, offer: "8.98" });
      expect(home.frames[0].out, "the way out is there from the first image").not.toBeNull();
      expect(new Set(home.frames.filter((frame) => frame.at < LATE.gifts - 60).map((frame) => `${frame.places} ${frame.cards}`)), "three places until the list is read").toEqual(new Set(["3 0"]));
      expect(home.frames.at(-1)).toMatchObject({ amount: "$14.00", places: 0, cards: 3 });
      expect(home.frames[0].tall, "each place is as tall as the card that lands in it").toEqual(home.frames.at(-1)?.tall);
      expect(home.frames.filter((frame) => frame.at < LATE.figure - 80).every((frame) => frame.amount === "$8.98"), "the last figure seen stands until the reading lands").toBe(true);
      expect(new Set(home.frames.filter((frame) => frame.at >= LATE.figure - 80).map((frame) => frame.amount)).size, "it counts to its value, through other figures").toBeGreaterThan(3);
      expect(new Set(home.frames.map((frame) => frame.offer)), "the card's amount is the same from the first image to the last").toEqual(new Set(["8.98"]));
      arrivedOnce(home, "Home");

      // Me: the same figure and the same way out from the first image. The reading of the figure is held back six
      // seconds: after four the figure is in the faint ink, and it is back in full ink when the reading lands.
      world.wait = { ...LATE, figure: 6_000 };
      await watch(page, "/me", "You");
      await page.getByRole("link", { name: "Me", exact: true }).first().click();
      await photograph(page, size.name, "me", [0, 500, 900, 1300, 4_600]);
      await page.waitForFunction(since(7_200));
      const me = await seenBy(page);
      keep(size.name, "me", me);
      expect(me.frames[0], "Me, the first image").toMatchObject({ amount: "$14.00", pale: false });
      expect(me.frames[0].out, "Me: the way out is there from the first image").not.toBeNull();
      expect(new Set(me.frames.map((frame) => frame.amount)), "Me: one figure from the first image to the last").toEqual(new Set(["$14.00"]));
      expect(me.frames.filter((frame) => frame.at < 3_800).some((frame) => frame.pale), "Me: full ink for four seconds").toBe(false);
      expect(me.frames.filter((frame) => frame.at > 4_300 && frame.at < 5_700).every((frame) => frame.pale), "Me: the faint ink while the reading does not land").toBe(true);
      expect(me.frames.at(-1)?.pale, "Me: full ink again once it has landed").toBe(false);
      // Two other blocks of Me come with a reading and have no place held: where the person lives, and what Viky reads
      // for them. They open by their height, and none of them enters.
      expect(me.entered.filter((one) => one.at > 400), "Me: no block enters once the screen has arrived").toEqual([]);

      // Gifts: one place for each gift of its two lists, and the cards land in them.
      world.wait = { ...LATE };
      await watch(page, "/gifts", "Gifts");
      await page.getByRole("link", { name: "Gifts", exact: true }).first().click();
      await photograph(page, size.name, "gifts", [0, 500, 900, 1300]);
      await page.waitForFunction(since(2_600));
      const gifts = await seenBy(page);
      keep(size.name, "gifts", gifts);
      expect(gifts.frames[0], "Gifts, the first image").toMatchObject({ places: 3, cards: 0, waiting: 0 });
      expect(gifts.frames.at(-1)).toMatchObject({ places: 0, cards: 3 });
      expect(gifts.frames[0].tall, "Gifts: each place is as tall as the card that lands in it").toEqual(gifts.frames.at(-1)?.tall);
      arrivedOnce(gifts, "Gifts");
      await device.context.close();
    });
  }
});
