import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { gift, json, KEY, profile } from "./gift-kit";
import { signedIn } from "./virtual-passkey";

/**
 * From the link to the first transaction, counted and timed (the founder, 2 Oct 2026, for Mera's UX bounty): the path of
 * a person who receives a gift's link and has no account. The link, the account, the opening.
 *
 * What is real: the product's own pages against the server under test, its account made with a passkey (Chrome's
 * virtual authenticator, ./virtual-passkey.ts), every press. What is stood in for: the gift, which nobody funded, so
 * its page and its opening are answered here as the server answers them. So the count of gestures is the product's
 * own, and the seconds are those of the screens with a passkey that answers at once and an opening that answers at
 * once: neither a person's reading time nor Monad's is in them. The judges page says so beside the figures.
 *
 * The count is held here: a press added to this path fails this test. VIKY_ARRIVAL_MEASURE=<file> also writes the
 * gestures and the seconds down, which is where the figures of src/measured.ts come from.
 */
const OUT = process.env.VIKY_ARRIVAL_MEASURE;
const GIFT = "1999996";

test.describe("from the link to the first transaction", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: the test opens its own window, at 390 by 844");

  test("a newcomer opens their gift in two presses and one passkey prompt", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const device = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = device;
    let opened = false;
    let openings = 0;
    await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) =>
      route.fulfill(json(opened ? gift(GIFT, "recipient", { connected: false, phase: "opened" }) : gift(GIFT, "link", { opened: false, connected: false, claimedAtChain: 0, phase: "unopened", deadlineMs: null }))),
    );
    await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
    await page.route(`**/api/gift/${GIFT}/consent`, (route) => route.fulfill(json({ giftId: GIFT, agreement: null })));
    await page.route("**/api/gift/claim", (route) => {
      openings += 1;
      opened = true;
      return route.fulfill(json({ giftId: GIFT, opened: true }));
    });

    const gestures: string[] = [];
    const started = Date.now();
    const at = () => Number(((Date.now() - started) / 1000).toFixed(1));

    // The link, as a message carries it.
    await page.goto(`/g/${GIFT}?t=${KEY}`);
    const create = page.getByRole("button", { name: "Create my account" });
    await expect(create).toBeVisible();
    const linkShown = at();

    // The account: one press, and the device's own prompt, which the virtual authenticator answers.
    await create.click();
    gestures.push("press: Create my account");
    gestures.push("the device's passkey prompt: a face or a fingerprint");
    await expect.poll(() => signedIn(context), { timeout: 30_000 }).toBe(true);
    const open = page.getByRole("button", { name: "Open my gift" });
    await expect(open).toBeVisible();
    const accountMade = at();

    // The opening: one press, and the first transaction is sent for them.
    await open.click();
    gestures.push("press: Open my gift");
    await expect.poll(() => openings, { timeout: 30_000 }).toBe(1);
    await expect(open).toHaveCount(0);
    const giftOpened = at();

    expect(gestures.length, "the link to the first transaction is three gestures, two presses and a passkey prompt").toBe(3);
    if (OUT) writeFileSync(OUT, `${JSON.stringify({ measuredAt: new Date().toISOString(), viewport: "390x844", gestures, seconds: { linkShown, accountMade, giftOpened } }, null, 2)}\n`);
    await context.close();
  });
});
