import { expect, test } from "@playwright/test";
import { profile, shot } from "./gift-kit";

/**
 * The page the founder opens to read what Rampnow's frame said on a device (app/dev/rampnow): every press answers
 * (the founder, 4 Oct 2026). He pressed "Copy all of it" and "Forget all of it" and saw nothing: a copy the browser
 * refused showed nothing, and neither did forgetting a list already empty.
 *
 * VIKY_JOURNAL_CAPTURES=<folder> also photographs the answers, at 390 by 844.
 */
const SHOTS = process.env.VIKY_JOURNAL_CAPTURES;
const LINES = [
  { atMs: Date.UTC(2026, 9, 4, 3, 0, 0), what: "Viky: the frame opens on a new payment" },
  { atMs: Date.UTC(2026, 9, 4, 3, 0, 4), what: "Viky: the frame loaded a page (1)" },
];
const answer = /At \d{2}:\d{2}:\d{2} UTC\.$/;

test.describe("the journal of Rampnow's frame: every press answers", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");

  test("nothing written down: both presses say so, and the buttons keep their names", async ({ browser, baseURL }) => {
    const device = await profile(browser, baseURL, { width: 390, height: 844 }, { passkey: false });
    const { page } = device;
    await page.goto("/dev/rampnow");
    const said = page.locator("[data-rampnow-journal-answer]");
    await expect(said).toHaveText("");
    await page.getByRole("button", { name: "Forget all of it" }).click();
    await expect(said).toHaveText(/^Nothing to forget: no line is written down on this device\. /);
    await expect(said).toHaveText(answer);
    await page.getByRole("button", { name: "Copy all of it" }).click();
    await expect(said).toHaveText(/^Nothing to copy: no line is written down on this device\. /);
    await shot(SHOTS, page, "390", "1-nothing-to-copy");
    // A button says what its press does and never declares a state: it used to turn into "Copied".
    await expect(page.getByRole("button", { name: "Copy all of it" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copied" })).toHaveCount(0);
    await device.context.close();
  });

  test("lines written down: a copy says how many it copied, a refused copy gives the text to copy by hand, and forgetting says how many it forgot", async ({ browser, baseURL }) => {
    const device = await profile(browser, baseURL, { width: 390, height: 844 }, { passkey: false });
    const { page, context } = device;
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/dev/rampnow");
    await page.evaluate(`localStorage.setItem("viky.rampnow.journal", ${JSON.stringify(JSON.stringify(LINES))})`);
    await page.reload();
    await expect(page.locator("[data-rampnow-journal] li")).toHaveCount(2);
    const said = page.locator("[data-rampnow-journal-answer]");
    // Copied: said, with how many lines, and the clipboard holds them.
    await page.getByRole("button", { name: "Copy all of it" }).click();
    await expect(said).toHaveText(/^Copied 2 lines\. /);
    expect(JSON.parse((await page.evaluate("navigator.clipboard.readText()")) as string)).toEqual(LINES);
    await expect(page.locator("[data-rampnow-journal-by-hand]")).toHaveCount(0);
    // Refused by the browser: said, and the text itself is put on the page.
    await page.evaluate(`navigator.clipboard.writeText = () => Promise.reject(new Error("refused"))`);
    await page.getByRole("button", { name: "Copy all of it" }).click();
    await expect(said).toHaveText(/^This browser refused to copy\. The text is under the buttons: select it and copy it by hand\. /);
    expect(JSON.parse(await page.locator("[data-rampnow-journal-by-hand]").inputValue())).toEqual(LINES);
    await shot(SHOTS, page, "390", "2-a-copy-the-browser-refused");
    // Forgotten: said, with how many lines, and the list is empty.
    await page.getByRole("button", { name: "Forget all of it" }).click();
    await expect(said).toHaveText(/^Forgot 2 lines\. /);
    await shot(SHOTS, page, "390", "3-forgot-two-lines");
    await expect(page.getByText("Nothing written down on this device.")).toBeVisible();
    await expect(page.locator("[data-rampnow-journal-by-hand]")).toHaveCount(0);
    await device.context.close();
  });
});
