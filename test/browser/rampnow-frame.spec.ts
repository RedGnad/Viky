import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { answerTheChain, json, profile, shot, sizesFor } from "./gift-kit";

/**
 * Rampnow in a frame of our own (the founder, 3 Oct 2026): the pay press opens the wait with the sheet over it, the frame
 * filled in and locked, back in Viky when it says the order is completed, and its page beside when it fails.
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

/** Rampnow's page as a stand-in at its own origin: it says it is ready, then sends what its button says. */
async function rampnowStandIn(context: BrowserContext, ending: "ORDER_COMPLETED" | "ERROR"): Promise<void> {
  await context.route("https://app.rampnow.io/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body style="font:16px sans-serif;padding:24px">
        <p>Rampnow, stood in for by the test.</p>
        <button id="pay">Pay 30 EUR</button>
        <script>
          parent.postMessage({ source: "RAMPNOW_WIDGET", type: "WIDGET_READY" }, "*");
          document.getElementById("pay").onclick = () => parent.postMessage({ source: "RAMPNOW_WIDGET", type: "${ending}", payload: { orderUid: "o-1" } }, "*");
        </script></body></html>`,
    }),
  );
}

async function toTheFrame(page: Page, context: BrowserContext, ending: "ORDER_COMPLETED" | "ERROR"): Promise<void> {
  await answerTheChain(context, { ausd: 0n, mon: 0n });
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
  }
});
