import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { answerTheChain, json, profile, shot, type Holdings } from "./gift-kit";

/**
 * Rampnow in a frame of our own, one payment for one gift (the founder, 3 Oct 2026). The pay press opens the wait with
 * the sheet over it, the frame filled in and locked. The sheet is held: no cross, no handle, and Escape, the backdrop
 * and a pull do nothing. Under the frame, the way out depends on what is known of a payment. Left otherwise, the wait
 * says a known payment and gives one button, "Finish my payment"; with nothing known it asks "Did you pay by card?",
 * and only the answer "No, pay now" opens a new payment. Home and Gifts say a card payment was started and lead to the
 * wait. A button says what its press does and never declares a state (the founder, 4 Oct 2026). The money arriving in
 * the account is what closes the frame and makes the gift.
 *
 * It needs a build where the way is on: `NEXT_PUBLIC_RAMPNOW_WAY_IN=on`, `NEXT_PUBLIC_USDC_ROUTER_ADDRESS` and
 * `NEXT_PUBLIC_RAMPNOW_FRAME=on`; run with `VIKY_RAMPNOW_FRAME_BUILD=1` against one. Rampnow itself is stood in for by
 * a page served at its own origin that sends the messages its SDK documents: none of its order messages has been seen
 * on the real page without a partner's key.
 *
 * VIKY_RAMPNOW_CAPTURES=<folder> also photographs each state, at 390 by 844 and on a laptop window of 700.
 */
const SHOTS = process.env.VIKY_RAMPNOW_CAPTURES;
const sheet = (page: Page) => page.locator("dialog.sheet[open]").last();
const card = (page: Page) => page.locator('section[aria-labelledby="offer-card"]');
const frameOf = (page: Page) => page.locator("iframe[data-rampnow-frame]");
const inFrame = (page: Page) => page.frameLocator("iframe[data-rampnow-frame]");
const pending = (page: Page) => page.locator("[data-rampnow-pending]");
/** The button that starts a payment, on the screen that waits: "Pay €30.00 by card". */
const payByCard = (page: Page) => page.getByRole("button", { name: /^Pay \S+ by card$/ });

const WINDOWS = [
  { name: "390", viewport: { width: 390, height: 844 } },
  { name: "laptop-700", viewport: { width: 1280, height: 700 } },
];

/**
 * Rampnow's page as a stand-in at its own origin. It says where it is, it says it is ready unless it is "silent" (the
 * public page as it may be without a partner's key: drawn, and never sending a word about an order), and each of its
 * buttons sends one message of an order, as the SDK names them, about the order "ord_42".
 */
async function rampnowStandIn(context: BrowserContext, silent: boolean): Promise<void> {
  const says = (label: string, type: string) => `<button onclick='parent.postMessage({ source: "RAMPNOW_WIDGET", type: "${type}", payload: { orderUid: "ord_42" } }, "*")'>${label}</button>`;
  await context.route("https://app.rampnow.io/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body style="font:16px sans-serif;padding:24px">
        <p>Rampnow, stood in for by the test.</p>
        <p id="where"></p>
        ${silent ? "" : [says("Create the order", "ORDER_CREATED"), says("The card pays", "ORDER_PAYMENT_PROCESSING"), says("The card is refused", "ORDER_PAYMENT_FAILED"), says("The order fails", "ORDER_FAILED")].join(" ")}
        <button id="login" style="position:fixed;left:24px;bottom:8px">Login</button>
        <script>
          document.getElementById("where").textContent = location.pathname;
          ${silent ? "" : 'parent.postMessage({ source: "RAMPNOW_WIDGET", type: "WIDGET_READY" }, "*");'}
        </script></body></html>`,
    }),
  );
}

async function toTheFrame(page: Page, context: BrowserContext, silent = false, holdings: Holdings = { ausd: 0n, mon: 0n }): Promise<void> {
  await answerTheChain(context, holdings);
  // After the chain's stand-in, which refuses every other host: the route registered last is the one asked first.
  await rampnowStandIn(context, silent);
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
  await expect(frameOf(page)).toBeVisible();
  // Camera and payment allowed, and the address asked of the server, which puts in the key and the session's account.
  await expect(frameOf(page)).toHaveAttribute("allow", "camera; microphone; payment; clipboard-write; publickey-credentials-get");
  expect(asked).toMatch(/\/api\/fund\/rampnow-frame(\?euros=\d+(\.\d+)?)?$/);
}

/** The frame is the same element before and after: a mark written on it is still there, so Rampnow's page was not loaded anew. */
const mark = (page: Page) => page.evaluate("document.querySelector('iframe[data-rampnow-frame]').dataset.kept = 'yes'");
const marked = (page: Page) => page.evaluate("document.querySelector('iframe[data-rampnow-frame]')?.dataset.kept ?? null");
/** What this device wrote down of the frame, as the founder's page reads it. */
const journal = (page: Page) => page.evaluate("JSON.parse(localStorage.getItem('viky.rampnow.journal') ?? '[]').map((line) => line.what + (line.orderUid ? ' ' + line.orderUid : ''))") as Promise<string[]>;

test.describe("Rampnow in a frame: one gift, one payment", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.skip(process.env.VIKY_RAMPNOW_FRAME_BUILD !== "1", "needs a build with the way and the frame switched on");
  test.setTimeout(180_000);

  for (const size of WINDOWS) {
    test(`the frame open, no payment known: no cross and no other way to close, one way out under it, and the page beside (${size.name})`, async ({ browser, baseURL }) => {
      const funder = await profile(browser, baseURL, size.viewport);
      const { page, context } = funder;
      await toTheFrame(page, context);
      await mark(page);
      // No cross, and nothing else closes it: Escape, twice, since a browser closes a dialog on the second whatever
      // the first was answered; a press outside the sheet; a pull on its head.
      await expect(sheet(page).getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.mouse.click(8, 8);
      const head = (await sheet(page).locator("header").boundingBox())!;
      await page.mouse.move(head.x + head.width / 2, head.y + 12);
      await page.mouse.down();
      await page.mouse.move(head.x + head.width / 2, head.y + 220, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      await expect(frameOf(page)).toBeVisible();
      expect(await marked(page), "the frame was not drawn anew").toBe("yes");
      // Under the frame: the one way out, and the page beside for a sign-in the frame does not keep.
      const under = sheet(page).locator("[data-rampnow-under]");
      await expect(under).toHaveAttribute("data-rampnow-under", "none");
      const out = under.getByRole("button", { name: "Go back without paying", exact: true });
      await expect(out).toBeVisible();
      await expect(under.getByText("Can't sign in here?", { exact: true })).toBeVisible();
      const beside = under.getByRole("link", { name: "Open the card page" });
      await expect(beside).toHaveAttribute("target", "_blank");
      expect(await beside.getAttribute("href")).toMatch(/^https:\/\/app\.rampnow\.io\/order\/quote\?orderType=buy&srcChain=fiat&srcCurrency=EUR/);
      // The link that pays by card carries the card's line too, as every button or link that pays by card does.
      await expect(under.getByText(/^By paying by card, you confirm you are 18 or older and accept/)).toBeVisible();
      await expect(under.locator("[data-rampnow-keep-open]")).toHaveCount(0);
      await expect(under.locator("[data-rampnow-late]")).toHaveCount(0);
      await shot(SHOTS, page, size.name, "1-frame-open-no-payment-known");
      // "Go back without paying": the frame goes, nothing is waited for, and paying is the screen's action again.
      await out.click();
      await expect(frameOf(page)).toHaveCount(0);
      await expect(pending(page)).toHaveCount(0);
      await expect(payByCard(page)).toBeVisible();
      await expect(page.getByRole("button", { name: "Open the card payment again" })).toHaveCount(0);
      await shot(SHOTS, page, size.name, "2-not-paid-back-to-paying");
      await context.close();
    });

    test(`a payment known by a message: no way out; five minutes on, one to the wait, which leads back to that order in our frame (${size.name})`, async ({ browser, baseURL }) => {
      const funder = await profile(browser, baseURL, size.viewport);
      const { page, context } = funder;
      await page.clock.install();
      await toTheFrame(page, context);
      // An order alone is not a payment: the person can still say they have not paid.
      await inFrame(page).getByRole("button", { name: "Create the order" }).click();
      const under = sheet(page).locator("[data-rampnow-under]");
      await expect(under).toHaveAttribute("data-rampnow-under", "none");
      await expect(under.getByRole("button", { name: "Go back without paying" })).toBeVisible();
      // The card pays: from here nothing under the frame leads out, and the page beside is gone with it.
      await inFrame(page).getByRole("button", { name: "The card pays" }).click();
      await expect(under).toHaveAttribute("data-rampnow-under", "known");
      await expect(under.locator("[data-rampnow-keep-open]")).toHaveText("Keep this window open: Rampnow is finishing your payment.");
      await expect(under.getByRole("button")).toHaveCount(0);
      await expect(under.getByRole("link")).toHaveCount(0);
      await expect(sheet(page).getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(frameOf(page)).toBeVisible();
      await shot(SHOTS, page, size.name, "3-payment-known-no-way-out");
      // Four minutes: still none. Five: the late way out.
      await page.clock.fastForward("04:00");
      await expect(under.locator("[data-rampnow-late]")).toHaveCount(0);
      await page.clock.fastForward("01:01");
      const late = under.locator("[data-rampnow-late]");
      await expect(late).toContainText("This is taking longer than usual.");
      await shot(SHOTS, page, size.name, "4-five-minutes-on-a-way-out");
      await late.getByRole("button", { name: "Close this window" }).click();
      await expect(frameOf(page)).toHaveCount(0);
      // The wait says where the payment is, with the wheel and since when, and gives one button, the way back to it.
      // Nothing else pays or forgets: the last way to a second payment would be here.
      await expect(pending(page)).toHaveAttribute("data-rampnow-pending", "known");
      await expect(pending(page)).toContainText("Your payment is at Rampnow.");
      await expect(pending(page)).toContainText("It finishes on Rampnow's page, which has to be open for it.");
      await expect(pending(page).locator("[data-rampnow-since]")).toHaveText(/^Started (less than a minute|\d+ minutes?) ago\.$/);
      await expect(pending(page).locator(".working-ring")).toBeVisible();
      await expect(pending(page).getByRole("button")).toHaveCount(1);
      await expect(pending(page).getByRole("button", { name: "Finish my payment", exact: true })).toBeVisible();
      await expect(payByCard(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /I have not paid|No, pay now/ })).toHaveCount(0);
      await shot(SHOTS, page, size.name, "5-the-wait-says-the-payment-is-at-rampnow");
      // Coming back to the same address later, the frame does not open by itself on a second payment.
      await page.reload();
      await expect(pending(page)).toHaveAttribute("data-rampnow-pending", "known");
      await page.waitForTimeout(1_500);
      await expect(frameOf(page)).toHaveCount(0);
      // "Finish my payment" opens that order again, in our frame, on the page Rampnow finishes it from: no way out.
      await pending(page).getByRole("button", { name: "Finish my payment" }).click();
      await expect(frameOf(page)).toHaveAttribute("src", "https://app.rampnow.io/order/dapp/ord_42");
      await expect(inFrame(page).locator("#where")).toHaveText("/order/dapp/ord_42");
      await expect(sheet(page).locator("[data-rampnow-under]")).toHaveAttribute("data-rampnow-under", "known");
      await expect(sheet(page).locator("[data-rampnow-under]").getByRole("button")).toHaveCount(0);
      await shot(SHOTS, page, size.name, "6-finish-my-payment-opens-that-order");
      // What the frame said and what the screens did is written down on the device, and read on the founder's page.
      const written = await journal(page);
      for (const line of ["Viky: the frame opens on a new payment", "Viky: the frame loaded a page (1)", "Rampnow: WIDGET_READY", "Rampnow: ORDER_CREATED ord_42", "Rampnow: ORDER_PAYMENT_PROCESSING ord_42", "Viky: the late way out was taken", "Viky: the wait shows a payment known, started in the frame ord_42", "Viky: the frame opens on a payment already started ord_42"]) expect(written, line).toContain(line);
      await page.goto("/dev/rampnow");
      await expect(page.locator("[data-rampnow-journal] li").filter({ hasText: "Rampnow: ORDER_PAYMENT_PROCESSING" })).toContainText("order ord_42");
      await context.close();
    });
  }

  test("left with nothing said by Rampnow: the wait asks 'Did you pay by card?', Home and Gifts lead to it, and only 'No, pay now' opens a new payment", async ({ browser, baseURL }) => {
    const funder = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = funder;
    await page.clock.install();
    await toTheFrame(page, context, true);
    // Left in its first seconds: nobody has paid, nothing is waited for, and the frame opens again on the same press.
    await page.reload();
    await expect(frameOf(page)).toBeVisible();
    await expect(pending(page)).toHaveCount(0);
    // Twenty seconds in front of the person: a payment may have left, though Rampnow said nothing of it.
    await page.clock.fastForward(21_000);
    await page.reload();
    // Only the person knows: the screen asks, in the body's text, with no wheel, and the answers are actions.
    await expect(pending(page)).toHaveAttribute("data-rampnow-pending", "asked");
    await expect(pending(page).getByText("Did you pay by card?", { exact: true })).toBeVisible();
    await expect(pending(page).locator("[data-rampnow-since]")).toHaveText(/^A card payment was started (less than a minute|\d+ minutes?) ago\.$/);
    await expect(pending(page).locator(".working-ring")).toHaveCount(0);
    const yes = pending(page).getByRole("button", { name: "Yes, finish my payment", exact: true });
    const no = pending(page).getByRole("button", { name: "No, pay now", exact: true });
    await expect(yes).toBeVisible();
    expect((await no.boundingBox())!.height, "a small button under the main one").toBeLessThan((await yes.boundingBox())!.height);
    expect((await no.boundingBox())!.y).toBeGreaterThan((await yes.boundingBox())!.y);
    await page.waitForTimeout(1_500);
    await expect(frameOf(page)).toHaveCount(0);
    await expect(payByCard(page)).toHaveCount(0);
    expect(await journal(page)).toContain("Viky: the page was left with the frame open");
    await shot(SHOTS, page, "390", "7-left-with-nothing-said-the-wait-asks");
    // Home and Gifts, where "not made yet" stood: one sentence and one button, which leads to the wait. Nothing there
    // pays, nothing there forgets, and the question is not asked there.
    for (const [where, name] of [["/", "8-home"], ["/gifts", "9-gifts"]] as const) {
      await page.goto(where);
      const kept = page.locator("[data-finish-gift]");
      await expect(kept.locator("p")).toHaveText(/^\$\S+ for Boo: a card payment was started (less than a minute|\d+ minutes?) ago\.$/);
      await expect(kept).not.toContainText(/not made yet|Did you pay/);
      await expect(kept.getByRole("link", { name: "Finish my payment", exact: true })).toHaveAttribute("href", "/fund?step=paying");
      await expect(kept.getByRole("link")).toHaveCount(1);
      await expect(kept.getByRole("button")).toHaveCount(0);
      await expect(kept.locator(".working-ring")).toHaveCount(0);
      await kept.scrollIntoViewIfNeeded();
      await shot(SHOTS, page, "390", name);
    }
    // From Gifts: the wait, which asks. "Yes, finish my payment": Rampnow's list of the person's orders, in our frame.
    await page.locator("[data-finish-gift]").getByRole("link", { name: "Finish my payment" }).click();
    await expect(pending(page)).toHaveAttribute("data-rampnow-pending", "asked");
    await expect(frameOf(page)).toHaveCount(0);
    await pending(page).getByRole("button", { name: "Yes, finish my payment" }).click();
    await expect(frameOf(page)).toHaveAttribute("src", "https://app.rampnow.io/order/list");
    await expect(inFrame(page).locator("#where")).toHaveText("/order/list");
    const under = sheet(page).locator("[data-rampnow-under]");
    await expect(under).toHaveAttribute("data-rampnow-under", "none");
    // The page beside is that same list, never a new payment; and the way out goes back to the wait, which keeps it.
    await expect(under.getByRole("link", { name: "Open the card page" })).toHaveAttribute("href", "https://app.rampnow.io/order/list");
    await expect(under.getByRole("button", { name: "Go back without paying" })).toHaveCount(0);
    await shot(SHOTS, page, "390", "10-yes-finish-opens-rampnow-s-orders");
    await under.getByRole("button", { name: "Go back", exact: true }).click();
    await expect(frameOf(page)).toHaveCount(0);
    await expect(pending(page)).toHaveAttribute("data-rampnow-pending", "asked");
    // "No, pay now": the payment is forgotten and the frame opens on a new one, by that press.
    await pending(page).getByRole("button", { name: "No, pay now" }).click();
    await expect(frameOf(page)).toHaveAttribute("src", "https://app.rampnow.io/order/quote?stand-in=1");
    await expect(sheet(page).getByRole("button", { name: "Go back without paying", exact: true })).toBeVisible();
    await sheet(page).getByRole("button", { name: "Go back without paying", exact: true }).click();
    await expect(frameOf(page)).toHaveCount(0);
    await expect(pending(page)).toHaveCount(0);
    await expect(payByCard(page)).toBeVisible();
    // And Home says "not made yet" again, with its own way back to paying.
    await page.goto("/");
    await expect(page.locator("[data-finish-gift]")).toContainText("not made yet");
    await context.close();
  });

  test("a payment known is never forgotten by a press: the wait, Home and Gifts give the way back and nothing else", async ({ browser, baseURL }) => {
    const funder = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = funder;
    await page.clock.install();
    await toTheFrame(page, context);
    await inFrame(page).getByRole("button", { name: "The card pays" }).click();
    await expect(sheet(page).locator("[data-rampnow-keep-open]")).toBeVisible();
    // The page is left while Rampnow is finishing: coming back, the wait says the payment and gives one button.
    await page.reload();
    await expect(pending(page)).toHaveAttribute("data-rampnow-pending", "known");
    await expect(pending(page).getByRole("button")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /No, pay now|Pay \S+ by card/ })).toHaveCount(0);
    await shot(SHOTS, page, "390", "12-reloaded-while-rampnow-finishes");
    for (const where of ["/", "/gifts"]) {
      await page.goto(where);
      const kept = page.locator("[data-finish-gift]");
      await expect(kept.locator("p")).toHaveText(/for Boo: a card payment was started/);
      await expect(kept.getByRole("link", { name: "Finish my payment", exact: true })).toHaveAttribute("href", "/fund?step=paying");
      await expect(kept.getByRole("button")).toHaveCount(0);
    }
    // "Finish my payment", from Gifts to the wait, then into the frame on that order, where nothing leads out.
    await page.locator("[data-finish-gift]").getByRole("link", { name: "Finish my payment" }).click();
    await pending(page).getByRole("button", { name: "Finish my payment" }).click();
    await expect(frameOf(page)).toHaveAttribute("src", "https://app.rampnow.io/order/dapp/ord_42");
    await expect(sheet(page).locator("[data-rampnow-under]").getByRole("button")).toHaveCount(0);
    await context.close();
  });

  test("the frame says the payment failed: it closes, the wait says nothing was taken, and paying starts again", async ({ browser, baseURL }) => {
    const funder = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = funder;
    await toTheFrame(page, context);
    await inFrame(page).getByRole("button", { name: "Create the order" }).click();
    await inFrame(page).getByRole("button", { name: "The card is refused" }).click();
    await expect(frameOf(page)).toHaveCount(0);
    await expect(page.locator("#rampnow-failed")).toHaveText("The payment did not go through. Nothing was taken.");
    await expect(pending(page)).toHaveCount(0);
    await expect(payByCard(page)).toBeVisible();
    await shot(SHOTS, page, "390", "11-the-payment-failed");
    // Paying again is a new payment, and the sentence goes with the press.
    await payByCard(page).click();
    await expect(frameOf(page)).toHaveAttribute("src", "https://app.rampnow.io/order/quote?stand-in=1");
    await expect(page.locator("#rampnow-failed")).toHaveCount(0);
    // An order that fails after its card paid has taken something: nothing is said that could be false, the frame stays.
    await inFrame(page).getByRole("button", { name: "The card pays" }).click();
    await expect(sheet(page).locator("[data-rampnow-under]")).toHaveAttribute("data-rampnow-under", "known");
    await inFrame(page).getByRole("button", { name: "The order fails" }).click();
    await page.waitForTimeout(600);
    await expect(frameOf(page)).toBeVisible();
    await expect(sheet(page).locator("[data-rampnow-keep-open]")).toBeVisible();
    await context.close();
  });

  test("the page beside: opened, the frame closes, and the wait leads back to Rampnow's own page in a tab", async ({ browser, baseURL }) => {
    const funder = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = funder;
    await toTheFrame(page, context, true);
    const [tab] = await Promise.all([context.waitForEvent("page"), sheet(page).getByRole("link", { name: "Open the card page" }).click()]);
    await tab.close();
    await expect(frameOf(page)).toHaveCount(0);
    await expect(pending(page)).toHaveAttribute("data-rampnow-pending", "asked");
    const finish = pending(page).getByRole("link", { name: "Yes, finish my payment" });
    await expect(finish).toHaveAttribute("href", "https://app.rampnow.io/order/list");
    await expect(finish).toHaveAttribute("target", "_blank");
    await expect(payByCard(page)).toHaveCount(0);
    await context.close();
  });

  test("the money arrives: the frame closes by itself, and nothing is waited for at Rampnow any more", async ({ browser, baseURL }) => {
    const funder = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = funder;
    const holdings: Holdings = { ausd: 0n, mon: 0n, usdc: 0n };
    // The conversion the wait would then ask of the server is refused here: this test moves nothing.
    let conversions = 0;
    await page.route("**/api/fund/convert/**", (route) => {
      conversions += 1;
      return route.fulfill(json({ code: "NOT_CONFIGURED", error: "Stood in for by the test. Nothing was taken." }, 503));
    });
    await toTheFrame(page, context, false, holdings);
    await inFrame(page).getByRole("button", { name: "The card pays" }).click();
    await expect(sheet(page).locator("[data-rampnow-keep-open]")).toBeVisible();
    // The card paid: the dollars are in the account. The wait under the sheet sees them and closes the frame.
    holdings.usdc = 40_000_000n;
    await expect(frameOf(page)).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(() => conversions, { timeout: 30_000 }).toBeGreaterThan(0);
    // And it stays closed, with nothing waited for: what is left on the screen is the wait itself.
    await page.waitForTimeout(1_500);
    await expect(frameOf(page)).toHaveCount(0);
    await expect(pending(page)).toHaveCount(0);
    expect(await journal(page)).toContain("Viky: the money arrived in the account");
    await context.close();
  });
});

/**
 * The frame fits the sheet (the founder, 3 Oct 2026). At a fixed 600 it stood taller than the sheet on a laptop of
 * 700: Rampnow's last button was half hidden, what stands under the frame out of sight, and nothing could be scrolled.
 * The stand-in pins a button to the bottom of its page, as Rampnow's "Login" is.
 */
test.describe("Rampnow's frame fits the sheet, whatever the window", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.skip(process.env.VIKY_RAMPNOW_FRAME_BUILD !== "1", "needs a build with the way and the frame switched on");
  test.setTimeout(120_000);

  for (const size of WINDOWS) {
    test(`the frame, its last button and everything under it are whole inside the sheet (${size.name})`, async ({ browser, baseURL }) => {
      const funder = await profile(browser, baseURL, size.viewport);
      const { page, context } = funder;
      await toTheFrame(page, context, true);
      const body = sheet(page).locator(".sheet-body");
      /** Whole inside the part of the sheet that shows, and inside the window. */
      const whole = async (box: { y: number; height: number } | null, what: string) => {
        const room = await body.boundingBox();
        expect(box, what).not.toBeNull();
        expect(box!.y, `${what}: its top`).toBeGreaterThanOrEqual(room!.y - 1);
        expect(box!.y + box!.height, `${what}: its bottom, in the sheet`).toBeLessThanOrEqual(room!.y + room!.height + 1);
        expect(box!.y + box!.height, `${what}: its bottom, in the window`).toBeLessThanOrEqual(size.viewport.height);
      };
      await page.waitForTimeout(400);
      await whole(await frameOf(page).boundingBox(), "the frame");
      await whole(await inFrame(page).getByRole("button", { name: "Login" }).boundingBox(), "the frame's last button");
      await whole(await sheet(page).getByRole("button", { name: "Go back without paying" }).boundingBox(), "the way out");
      await whole(await sheet(page).getByRole("link", { name: "Open the card page" }).boundingBox(), "the link to the card page");
      await whole(await sheet(page).locator("[data-rampnow-under]").boundingBox(), "everything under the frame");
      // Nothing is left to scroll: the frame took exactly the room what stands under it left.
      await expect(body).toHaveAttribute("data-scrolls", "no");
      expect((await frameOf(page).boundingBox())!.height).toBeGreaterThanOrEqual(360);
      await context.close();
    });
  }

  test("on a window too short for all of it, the sheet scrolls by what is under the frame", async ({ browser, baseURL }) => {
    const funder = await profile(browser, baseURL, { width: 1280, height: 520 });
    const { page, context } = funder;
    await toTheFrame(page, context, true);
    const link = sheet(page).getByRole("link", { name: "Open the card page" });
    await expect(link).toBeAttached();
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
