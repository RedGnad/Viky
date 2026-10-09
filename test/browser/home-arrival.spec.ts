import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { DAY, json, makeAnAccount, now, profile, sizesFor } from "./gift-kit";

/**
 * Home arrives once (the founder, 9 Oct 2026, on a living mockup): every block is at its place from the first image,
 * held from what this device saw last time, and what is read after it changes in place.
 *
 * The three readings Home waits for are answered here, each after its own delay, as the mockup simulates them: the
 * gifts at 0.5 s, the account at 0.9 s, and the last figure, the chain's own coin at the exchange's quote, at 1.25 s.
 * The account is a virtual passkey. It signs in twice on one device: the first visit leaves what the device remembers,
 * and the second one is measured. Signing in on the page is the one arrival where the server has read nothing for the
 * account, so every reading is the browser's, and late.
 *
 * What is measured on the second arrival, image by image:
 * - the first image holds the last figure this device saw, the way out, and one place for each gift it saw;
 * - nothing under them moves when the readings land: after the entrance, no block's top changes at all;
 * - no block plays the entrance once the screen has arrived;
 * - the figure, which has changed, counts to its value in place.
 *
 * And on the first one, where the device remembers nothing: the way out and the gifts have no place, and theirs open
 * by their height, so what stands under them slides and never jumps.
 *
 * VIKY_HOME_ARRIVAL_CAPTURES=<folder> also photographs the second arrival at 0, 0.5, 0.9 and 1.3 s, at 390 by 844 and
 * at 1440 by 900, and writes beside them what each image of the arrival measured: the gifts stand under the fold at
 * both sizes, where a block waits to be scrolled to, so their places are in the measurements and not in the pictures.
 */
const SHOTS = process.env.VIKY_HOME_ARRIVAL_CAPTURES;
const ONE = 1_000_000_000_000_000_000n;
const USDC_CONTRACT = "0x754704bc059f8c67012fed69bc8a327a5aafb603";
/** When each reading is answered, after it was asked. */
const LATE = { gifts: 500, account: 900, figure: 1250 } as const;

/** A daily gift made out to this account, as the list of gifts answers it. */
function gift(giftId: string, from: string) {
  const today = Math.floor(now() / DAY);
  return {
    giftId,
    role: "recipient",
    goalType: 1,
    goalUsername: "boo_learns",
    usernameSource: "funder",
    recipientName: "Boo",
    funderName: from,
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

/** Every reading Home asks for, answered from `world`, each after its own delay. Nothing leaves for anywhere else. */
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
 * Watches Home arrive, image by image, from the first one that holds the account's money: where each block stands,
 * what the figure says, how many places and cards the list holds, and every entrance that starts. A string: a function
 * sent into the page is compiled on the way and arrives calling a helper the page does not have.
 */
const WATCH = `(() => {
  const log = { t0: null, frames: [], entered: [] };
  window.__arrival = log;
  document.addEventListener("animationstart", (event) => {
    if (event.animationName === "page-enter" && log.t0 !== null) log.entered.push({ at: Math.round(performance.now() - log.t0), what: (event.target.textContent || "").trim().slice(0, 30) });
  }, true);
  const top = (part) => (part ? Math.round(part.getBoundingClientRect().top * 10) / 10 : null);
  const read = () => {
    const main = document.querySelector('main[data-drawn-for="account"]');
    const money = main && main.querySelector(".money-display-box");
    if (money && location.pathname === "/") {
      if (log.t0 === null) log.t0 = performance.now();
      const figure = money.querySelector("[data-amount] span") || money.querySelector("p");
      log.frames.push({
        at: Math.round(performance.now() - log.t0),
        amount: (figure.textContent || "").trim(),
        faint: !money.querySelector("[data-amount]"),
        pill: top(main.querySelector('a[href="/cash-out"]')),
        offer: top(main.querySelector("#offer-card, [aria-labelledby='offer-card'], h2")),
        list: top(main.querySelector(".arrives-in-turn")),
        rows: Array.prototype.map.call(main.querySelectorAll("[data-gift-row]"), top),
        tall: Array.prototype.map.call(main.querySelectorAll("[data-gift-row]"), (row) => Math.round(row.getBoundingClientRect().height)),
        places: main.querySelectorAll("[data-gift-place]").length,
        cards: main.querySelectorAll("[data-gift-row] a").length,
        waiting: main.querySelectorAll(".arrives-in-turn [data-waiting]").length,
      });
    }
    requestAnimationFrame(read);
  };
  requestAnimationFrame(read);
})()`;

type Frame = { at: number; amount: string; faint: boolean; pill: number | null; offer: number | null; list: number | null; rows: (number | null)[]; tall: number[]; places: number; cards: number; waiting: number };
type Seen = { t0: number | null; frames: Frame[]; entered: { at: number; what: string }[] };

const since = (ms: number) => `window.__arrival.t0 !== null && performance.now() - window.__arrival.t0 >= ${ms}`;
const spread = (values: (number | null)[]) => {
  const there = values.filter((value): value is number => value !== null);
  return there.length ? Math.max(...there) - Math.min(...there) : 0;
};

/** Signs in on the page, by the one door, with the passkey this window holds, and returns as Home is first drawn. */
async function signInOnThePage(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Sign in$/ }).first().click();
  await page.waitForFunction("window.__arrival && window.__arrival.t0 !== null", null, { timeout: 30_000 });
}

test.describe("Home arrives once, each block at its place", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(150_000);

  for (const size of sizesFor(SHOTS)) {
    test(`a device that remembers holds every place, and what is read later changes in place (${size.name})`, async ({ browser, baseURL }) => {
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      const world: World = { ausd: 8_980_000n, mon: 0n, gifts: [gift("7001", "Mom"), gift("7002", "Sam")], wait: { ...LATE } };
      await answer(page, world);
      await page.addInitScript(WATCH);

      // The first visit, on a device that remembers nothing: three dots, the line that says the list is read, and no
      // place for the way out or for the gifts. Theirs open by their height: what stands under them slides.
      await makeAnAccount(device);
      await page.waitForFunction(since(2_400));
      const first = (await page.evaluate("window.__arrival")) as Seen;
      const opening = first.frames[0];
      expect(opening.faint, "nothing remembered: the three dots").toBe(true);
      expect([opening.pill, opening.places, opening.waiting], "no place held for the way out or the gifts, and the list says it is read").toEqual([null, 0, 1]);
      expect(first.frames.at(-1)).toMatchObject({ amount: "$8.98", cards: 2, places: 0, waiting: 0 });
      expect(first.frames.at(-1)?.pill, "the way out is there once the account is read").not.toBeNull();
      // The way out opens over 220 ms: the card under it goes down through several places, never in one step.
      const sliding = first.frames.filter((frame) => frame.at >= LATE.account - 40 && frame.at <= LATE.account + 400).map((frame) => frame.offer);
      expect(new Set(sliding).size, `the title under the way out slides: ${sliding.join(" ")}`).toBeGreaterThanOrEqual(4);
      expect(first.entered.filter((one) => one.at > 400), "no block enters once the screen has arrived").toEqual([]);

      // What the screen saw is the device's memory now. The account signs out, and the money changes meanwhile: the
      // chain's own coin has arrived, worth 5.02 dollars at the exchange's quote.
      await page.waitForTimeout(400);
      await page.goto("/me");
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page.getByRole("button", { name: /^Sign in$/ }).first()).toBeVisible();
      world.mon = 11n * ONE + 186n * ONE;
      await page.goto("/");
      await signInOnThePage(page);

      // The second arrival, photographed where a folder is named.
      const shots = [0, 500, 900, 1300];
      for (const at of shots) {
        await page.waitForFunction(since(at));
        if (SHOTS) {
          mkdirSync(SHOTS, { recursive: true });
          await page.screenshot({ path: join(SHOTS, `home-${size.name}-${String(at).padStart(4, "0")}ms.png`) });
        }
      }
      await page.waitForFunction(since(2_600));
      const seen = (await page.evaluate("window.__arrival")) as Seen;
      const frames = seen.frames;
      if (SHOTS) writeFileSync(join(SHOTS, `home-${size.name}-measured.json`), JSON.stringify(seen, null, 1));
      // The first image: the last figure this device saw, in full ink, the way out, and a place for each gift.
      expect(frames[0], "the first image").toMatchObject({ amount: "$8.98", faint: false, places: 2, cards: 0, waiting: 0 });
      expect(frames[0].pill, "the way out is there from the first image").not.toBeNull();
      // The gifts land at 0.5 s in the places held for them, and the figure counts to its value once it is read.
      const before = frames.filter((frame) => frame.at < LATE.gifts - 60);
      expect(new Set(before.map((frame) => `${frame.places} ${frame.cards}`)), "two places until the list is read").toEqual(new Set(["2 0"]));
      expect(frames.at(-1)).toMatchObject({ amount: "$14.00", places: 0, cards: 2 });
      expect(frames.filter((frame) => frame.at < LATE.figure - 80).every((frame) => frame.amount === "$8.98"), "the last figure seen stands until the reading lands").toBe(true);
      const counting = new Set(frames.filter((frame) => frame.at >= LATE.figure - 80).map((frame) => frame.amount));
      expect(counting.size, "it counts to its value, through other figures").toBeGreaterThan(3);
      // Nothing moves: through the whole arrival a block goes up by the entrance's own rise and no further, and once
      // the entrance is over no block's top changes at all, whatever lands.
      for (const part of ["pill", "offer", "list"] as const) {
        expect(spread(frames.map((frame) => frame[part])), `${part}: the entrance's rise at most`).toBeLessThanOrEqual(9);
        expect(spread(frames.filter((frame) => frame.at > 560).map((frame) => frame[part])), `${part}: still once the screen has arrived`).toBeLessThanOrEqual(1);
      }
      expect(frames[0].tall, "each place is as tall as the card that lands in it").toEqual(frames.at(-1)?.tall);
      for (const row of [0, 1]) expect(spread(frames.filter((frame) => frame.at > 560).map((frame) => frame.rows[row] ?? null)), `gift ${row + 1}: its place does not move when it lands`).toBeLessThanOrEqual(1);
      expect(seen.entered.filter((one) => one.at > 400), "no block enters once the screen has arrived").toEqual([]);
      await device.context.close();
    });
  }
});
