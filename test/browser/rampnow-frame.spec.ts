import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { answerTheChain, json, profile, shot, sizesFor, type Holdings } from "./gift-kit";

/**
 * Rampnow in a frame of our own (the founder, 3 Oct 2026): the pay press opens the wait with the sheet over it, the frame
 * filled in and locked, back in Viky when it says the order is completed, and its page beside when it fails. Without a
 * partner's key the frame may say nothing at all: the money arriving in the account, seen by the wait under the sheet,
 * is then what closes it.
 *
 * It needs a build where the way is on: `NEXT_PUBLIC_RAMPNOW_WAY_IN=on`, `NEXT_PUBLIC_USDC_ROUTER_ADDRESS` and
 * `NEXT_PUBLIC_RAMPNOW_FRAME=on`, which no build of the product has yet; run with `VIKY_RAMPNOW_FRAME_BUILD=1` against
 * one. Rampnow itself is stood in for by a page served at its own origin that sends the messages its SDK documents.
 *
 * VIKY_RAMPNOW_CAPTURES=<folder> also photographs each state, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_RAMPNOW_CAPTURES;
const sheet = (page: Page) => page.locator("dialog.sheet[open]").last();
const card = (page: Page) => page.locator('section[aria-labelledby="offer-card"]');

type Ending = "ORDER_COMPLETED" | "ERROR" | "SILENT";

/**
 * Rampnow's page as a stand-in at its own origin: it says it is ready, then sends what its button says. "SILENT" is
 * the public page without a partner's key as it may be: drawn, and never sending a message.
 */
async function rampnowStandIn(context: BrowserContext, ending: Ending): Promise<void> {
  const says =
    ending === "SILENT"
      ? ""
      : `parent.postMessage({ source: "RAMPNOW_WIDGET", type: "WIDGET_READY" }, "*");
          document.getElementById("pay").onclick = () => parent.postMessage({ source: "RAMPNOW_WIDGET", type: "${ending}", payload: { orderUid: "o-1" } }, "*");`;
  await context.route("https://app.rampnow.io/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body style="font:16px sans-serif;padding:24px">
        <p>Rampnow, stood in for by the test.</p>
        <button id="pay">Pay 30 EUR</button>
        <button id="login" style="position:fixed;left:24px;bottom:8px">Login</button>
        <script>
          ${says}
        </script></body></html>`,
    }),
  );
}

async function toTheFrame(page: Page, context: BrowserContext, ending: Ending, holdings: Holdings = { ausd: 0n, mon: 0n }): Promise<void> {
  await answerTheChain(context, holdings);
  // After the chain's stand-in, which refuses every other host: the route registered last is the one asked first.
  await rampnowStandIn(context, ending);
  await page.route("**/api/rails/where**", (route) =>
    route.fulfill(json({ country: "fr", ask: false, fromConnection: "fr", fromDevice: "fr", waysOut: { Ramp: "serves", Mercuryo: "serves" }, waysIn: {}, card: { offered: true, country: "fr" }, out: { bank: null, cardSmallest: null } })),
  );
  let asked = "";
  await page.route("**/api/fund/rampnow-frame**", (route) => {
    asked = route.request().url();
    return route.fulfill(json({ url: "https://app.rampnow.io/order/quote?stand-in=1" }));
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Offer a gift" }).first().click();
  await card(page).getByLabel("Their first name").fill("Boo");
  await card(page).locator("[data-card-action]").click();
  await sheet(page).getByRole("button", { name: /^(Pay \S+ by card|Pay)$/ }).first().click();
  await page.waitForURL(/\/fund\?step=paying&rampnow=1/, { timeout: 60_000 });
  const frame = page.locator("iframe[data-rampnow-frame]");
  await expect(frame).toBeVisible();
  // Camera and payment allowed, and the address asked of the server, which puts in the key and the session's account.
  await expect(frame).toHaveAttribute("allow", "camera; microphone; payment; clipboard-write; publickey-credentials-get");
  expect(asked).toMatch(/\/api\/fund\/rampnow-frame(\?euros=\d+(\.\d+)?)?$/);
}

test.describe("Rampnow in a frame", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.skip(process.env.VIKY_RAMPNOW_FRAME_BUILD !== "1", "needs a build with the way and the frame switched on");
  test.setTimeout(120_000);

  for (const size of sizesFor(SHOTS)) {
    test(`the pay press opens the frame over the wait, and its end brings the person back (${size.name})`, async ({ browser, baseURL }) => {
      const funder = await profile(browser, baseURL, size.viewport);
      const { page, context } = funder;
      await toTheFrame(page, context, "ORDER_COMPLETED");
      await page.waitForTimeout(800);
      await shot(SHOTS, page, size.name, "1-the-frame");
      await page.frameLocator("iframe[data-rampnow-frame]").getByRole("button", { name: "Pay 30 EUR" }).click();
      await expect(page.locator("iframe[data-rampnow-frame]")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /^Waiting for your/ })).toBeVisible();
      await shot(SHOTS, page, size.name, "2-back-in-viky");
      await context.close();
    });

    test(`a frame that fails offers the page beside (${size.name})`, async ({ browser, baseURL }) => {
      const funder = await profile(browser, baseURL, size.viewport);
      const { page, context } = funder;
      await toTheFrame(page, context, "ERROR");
      await page.frameLocator("iframe[data-rampnow-frame]").getByRole("button", { name: "Pay 30 EUR" }).click();
      await expect(sheet(page).getByText("The card payment did not go through. Nothing was taken.", { exact: true })).toBeVisible();
      const beside = sheet(page).getByRole("link", { name: "Open the card page" });
      await expect(beside).toHaveAttribute("target", "_blank");
      expect(await beside.getAttribute("href")).toMatch(/^https:\/\/app\.rampnow\.io\/order\/quote\?orderType=buy&srcChain=fiat&srcCurrency=EUR/);
      // The way out to the card's page carries the card's line too, as every button or link that pays by card does.
      await expect(sheet(page).getByText(/^By paying by card, you confirm you are 18 or older and accept/)).toBeVisible();
      await beside.scrollIntoViewIfNeeded();
      await shot(SHOTS, page, size.name, "3-failed-and-the-page-beside");
      await context.close();
    });

    test(`a frame that says nothing is closed by the money arriving, and its page is offered beside meanwhile (${size.name})`, async ({ browser, baseURL }) => {
      const funder = await profile(browser, baseURL, size.viewport);
      const { page, context } = funder;
      const holdings: Holdings = { ausd: 0n, mon: 0n, usdc: 0n };
      // The conversion the wait would then ask of the server is refused here: this test moves nothing.
      let conversions = 0;
      await page.route("**/api/fund/convert/**", (route) => {
        conversions += 1;
        return route.fulfill(json({ code: "NOT_CONFIGURED", error: "Stood in for by the test. Nothing was taken." }, 503));
      });
      await toTheFrame(page, context, "SILENT", holdings);
      const frame = page.locator("iframe[data-rampnow-frame]");
      // No message ever comes: after fifteen seconds the page beside is offered under the frame, which stays.
      await expect(sheet(page).getByRole("link", { name: "Open the card page" })).toBeVisible({ timeout: 20_000 });
      await expect(frame).toBeVisible();
      await shot(SHOTS, page, size.name, "4-silent-frame-and-the-page-beside");
      // The card paid: the dollars are in the account. The wait under the sheet sees them and closes the frame.
      holdings.usdc = 40_000_000n;
      await expect(frame).toHaveCount(0, { timeout: 30_000 });
      await expect.poll(() => conversions, { timeout: 30_000 }).toBeGreaterThan(0);
      // And it stays closed: what is left on the screen is the wait itself.
      await page.waitForTimeout(1_500);
      await expect(frame).toHaveCount(0);
      await shot(SHOTS, page, size.name, "5-closed-by-the-money-arriving");
      await context.close();
    });
  }
});

/**
 * The frame fits the sheet (the founder, 3 Oct 2026). At a fixed 600 it stood taller than the sheet on a laptop of
 * 700: Rampnow's last button was half hidden, the link under the frame out of sight, and nothing could be scrolled.
 * The stand-in pins a button to the bottom of its page, as Rampnow's "Login" is.
 */
test.describe("Rampnow's frame fits the sheet, whatever the window", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.skip(process.env.VIKY_RAMPNOW_FRAME_BUILD !== "1", "needs a build with the way and the frame switched on");
  test.setTimeout(120_000);

  const WINDOWS = [
    { name: "390", viewport: { width: 390, height: 844 } },
    { name: "laptop-700", viewport: { width: 1280, height: 700 } },
  ];

  for (const size of WINDOWS) {
    test(`the frame, its last button and the link under it are whole inside the sheet (${size.name})`, async ({ browser, baseURL }) => {
      const funder = await profile(browser, baseURL, size.viewport);
      const { page, context } = funder;
      await toTheFrame(page, context, "SILENT");
      const frame = page.locator("iframe[data-rampnow-frame]");
      const body = sheet(page).locator(".sheet-body");
      /** Whole inside the part of the sheet that shows, and inside the window. */
      const whole = async (box: { y: number; height: number } | null, what: string) => {
        const room = await body.boundingBox();
        expect(box, what).not.toBeNull();
        expect(box!.y, `${what}: its top`).toBeGreaterThanOrEqual(room!.y - 1);
        expect(box!.y + box!.height, `${what}: its bottom, in the sheet`).toBeLessThanOrEqual(room!.y + room!.height + 1);
        expect(box!.y + box!.height, `${what}: its bottom, in the window`).toBeLessThanOrEqual(size.viewport.height);
      };
      await whole(await frame.boundingBox(), "the frame");
      await whole(await page.frameLocator("iframe[data-rampnow-frame]").getByRole("button", { name: "Login" }).boundingBox(), "the frame's last button");
      await expect(body).toHaveAttribute("data-scrolls", "no");
      await shot(SHOTS, page, size.name, "6-the-frame-fits");
      // Fifteen seconds without a word from the frame: the link comes under it, and the frame makes room for it.
      const link = sheet(page).getByRole("link", { name: "Open the card page" });
      await expect(link).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(400);
      await whole(await frame.boundingBox(), "the frame, with the link under it");
      await whole(await page.frameLocator("iframe[data-rampnow-frame]").getByRole("button", { name: "Login" }).boundingBox(), "the frame's last button, with the link under it");
      await whole(await link.boundingBox(), "the link to the card page");
      await whole(await sheet(page).locator("[data-rampnow-beside]").boundingBox(), "everything under the frame");
      // Nothing is left to scroll: the frame took exactly the room the link left it.
      await expect(body).toHaveAttribute("data-scrolls", "no");
      expect((await frame.boundingBox())!.height).toBeGreaterThanOrEqual(360);
      await shot(SHOTS, page, size.name, "7-the-frame-and-the-link-under-it");
      await context.close();
    });
  }

  test("on a window too short for all of it, the sheet scrolls by what is under the frame", async ({ browser, baseURL }) => {
    const funder = await profile(browser, baseURL, { width: 1280, height: 520 });
    const { page, context } = funder;
    await toTheFrame(page, context, "SILENT");
    const link = sheet(page).getByRole("link", { name: "Open the card page" });
    await expect(link).toBeAttached({ timeout: 20_000 });
    const body = sheet(page).locator(".sheet-body");
    await expect(body).toHaveAttribute("data-scrolls", "yes");
    // A wheel on what shows under or beside the frame moves the sheet, down to its last line.
    await link.scrollIntoViewIfNeeded();
    const room = await body.boundingBox();
    const box = await link.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(room!.y + room!.height + 1);
    await context.close();
  });
});
