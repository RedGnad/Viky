import { expect, test, type Page } from "@playwright/test";
import { DAY, gift, json, makeAnAccount, now, profile, shot as capture, sizesFor } from "./gift-kit";

/**
 * A bib typed wrong can be entered again until the race starts (the audit of 1 Oct 2026). It was kept for good at the
 * first press, so a mistyped number meant the gift was read on somebody else's line, or on nobody's.
 *
 * What is real: the product's pages against the server under test, its sign-in with a passkey, every press, and what
 * the bib route is sent. What is stood in for: the gift, which a new account does not have, and the bib route itself,
 * whose rule (replaceable until the start, standing after) is held by test/marathon.test.ts.
 *
 * VIKY_BIB_CAPTURES=<folder> also photographs each state, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_BIB_CAPTURES;
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);
const GIFT = "1999951";

function marathonGift(bib: string | null, bibOpen: boolean) {
  return gift(GIFT, "recipient", {
    conditionId: "marathon-finish",
    target: 1,
    marathon: { raceId: "example-2026", raceName: "Example City Marathon 2026", distance: "Marathon", startsAt: new Date((now() + (bibOpen ? 9 : -1) * DAY) * 1000).toISOString(), bibOpen, bib, result: null },
  });
}

for (const size of sizesFor(SHOTS)) {
  test.describe(`the bib of a marathon gift (${size.name})`, () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

    test(`a bib already entered can be entered again before the start, and not once the race has started (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      let bib: string | null = "347";
      let open = true;
      const sent: string[] = [];
      await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) => route.fulfill(json(marathonGift(bib, open))));
      await page.route(`**/api/gift/${GIFT}/consent`, (route) =>
        route.fulfill(json({ giftId: GIFT, state: { kind: "yes", signedAt: new Date().toISOString() }, reading: "agreed", opened: true, finished: false, terms: { what: "your line on the timing company's results page" }, until: "the gift's last day", texts: { yes: "yes", stop: "stop" } })),
      );
      await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
      await page.route(`**/api/gift/${GIFT}/notify`, (route) => route.fulfill(json({ on: false, possible: false })));
      await page.route(`**/api/gift/${GIFT}/reached-seen`, (route) => route.fulfill(json({ seen: true })));
      await page.route("**/api/marathon/bib", async (route) => {
        const body = JSON.parse(route.request().postData() ?? "{}") as { giftId: string; bib: string };
        sent.push(body.bib);
        bib = body.bib.toUpperCase();
        await route.fulfill(json({ bib }));
      });
      await makeAnAccount(device);
      await page.goto(`/g/${GIFT}`);

      // The bib entered, and under it the one way to change it while the race has not started.
      await expect(page.getByText("Bib 347, Example City Marathon 2026, marathon.", { exact: true })).toBeVisible();
      const change = page.getByRole("button", { name: "Change my bib number" });
      await expect(change).toBeVisible();
      await shot(page, size.name, "1-a-bib-entered-before-the-start");

      // The field again, saying it can be changed until the start; the new number replaces the old one.
      await change.click();
      // One line under the field, and the rest folded (the founder's rule 4 of 1 Oct 2026).
      await expect(page.getByText("The number on your bib for the Example City Marathon 2026.", { exact: true })).toBeVisible();
      await expect(page.locator(".said-fold").getByText("It can be changed until the start.", { exact: true })).toHaveCount(1);
      await page.getByLabel("Your bib number").fill("374");
      await shot(page, size.name, "2-entering-it-again");
      await page.getByRole("button", { name: "Keep my bib number" }).click();
      await expect(page.getByText("Bib 374, Example City Marathon 2026, marathon.", { exact: true })).toBeVisible();
      expect(sent).toEqual(["374"]);
      await expect(page.getByText("Bib 347", { exact: false })).toHaveCount(0);

      // Once the race has started the bib stands: no way to change it is offered, and the reading is.
      open = false;
      await page.reload();
      await expect(page.getByText("Bib 374, Example City Marathon 2026, marathon.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Change my bib number" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Read my result" })).toBeVisible();
      await shot(page, size.name, "3-after-the-start");
      await device.context.close();
    });
  });
}
