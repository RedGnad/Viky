import { expect, test, type Page } from "@playwright/test";
import { CONTRACT, TERMS, aWindow, climb, countPasskeyPrompts, daily, endedDaily, photographer, serve } from "./gift-fixtures";
import { gift, json, makeAnAccount, neverAskedToBeTold } from "./gift-kit";

/**
 * "You decide" (the founder, 1 Oct 2026, the mockup you-decide.html): the standing controls of the person a gift is
 * for, under the card. Three round buttons, the sheets they open, the ending in two figures and the gift once ended.
 *
 * What is real: the product's pages against the server under test, its sign-in with a passkey (Chrome's virtual
 * authenticator), every press, the stop and the yes the agreement key signs, and the signature the ending is sent
 * with. What is stood in for: the gift, which a new account does not have, so its page is answered here as the server
 * would answer it, the agreement's route, and the route that relays the ending. The contracts themselves are walked
 * on a fork of mainnet by scripts/rehearse-v2-fork.ts.
 *
 * VIKY_DECIDE_CAPTURES=<folder> also photographs each state at 390 by 844: a page whole, a sheet as the screen shows it.
 */
const shot = photographer(process.env.VIKY_DECIDE_CAPTURES);

const decide = (page: Page) => page.locator("section.you-decide");
const act = (page: Page, which: "messages" | "sees" | "stop") => page.locator(`[data-decide="${which}"]`);

test.describe("you decide", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  test("a habit: three round buttons under the card and no sentence, a break first, an ending in two figures, and the gift once ended", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const GIFT = "41";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    const prompts = await countPasskeyPrompts(page);
    let ended: number | null = null;
    const sent: Array<Record<string, string>> = [];
    const served = await serve(page, GIFT, () => (ended === null ? daily(GIFT, "recipient") : endedDaily(GIFT, "recipient", ended)), TERMS.daily);
    await page.route(`**/api/gift/${GIFT}/end`, (route) => {
      sent.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, string>);
      ended = Date.now();
      served.finish();
      return route.fulfill(json({ giftId: GIFT, ended: true, keep: "2000000", giveBack: "5000000", hash: `0x${"ab".repeat(32)}` }));
    });

    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);

    // The card: the day as a label of four words, and the next reading as a figure beside the money.
    await expect(page.locator(".day-row-where")).toHaveText("Day 3 of 7");
    await expect(page.locator(".gift-figures")).toContainText("Next reading");
    await expect(page.locator(".gift-back")).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.getByText(/^Next reading: /)).toHaveCount(0);
    await expect(page.locator("section.gift-card-placed").getByText("It is yours already. Use it from Home whenever you like.")).toBeHidden();

    // Under it: three round buttons with two words each, their state in a label, and nothing else.
    await expect(decide(page).getByText("You decide", { exact: true })).toBeVisible();
    await expect(decide(page).getByRole("button")).toHaveCount(3);
    await expect(act(page, "messages")).toHaveText("NotificationsOff");
    await expect(act(page, "sees")).toHaveText("Maman seesOne thing");
    await expect(act(page, "stop")).toHaveText("StopAnytime");
    for (const which of ["messages", "sees", "stop"] as const) {
      const disc = await act(page, which).locator(".you-decide-disc").boundingBox();
      expect(disc?.width, `${which} is a disc of 64`).toBe(64);
      expect(disc?.height).toBe(64);
    }
    // What stood there before: a wide button, a line of help with a small "Stop", and a link under the card.
    await expect(page.getByRole("button", { name: "Tell me each morning" })).toHaveCount(0);
    await expect(page.getByText(/^Viky reads your lessons for this gift\. You agreed on /)).toBeHidden();
    await expect(page.getByText("Check this day yourself")).toBeHidden();
    await expect(page.getByRole("button", { name: "End this gift" })).toHaveCount(0);
    await shot(page, "01-habit-under-way");

    // "Stop" opens two choices of the same weight, the one that can be undone first.
    await act(page, "stop").click();
    const stop = page.getByRole("dialog", { name: "Your gift, your call." });
    const choices = stop.locator(".decide-option");
    await expect(choices).toHaveCount(2);
    await expect(choices.nth(0)).toContainText("Take a break");
    await expect(choices.nth(0)).toContainText("Viky stops reading. Start again when you like.");
    await expect(choices.nth(1)).toContainText("End the gift");
    await expect(choices.nth(1).locator(".decide-chip")).toHaveText(["$2.00 yours", "$5.00 back to Maman"]);
    const [first, second] = await Promise.all([choices.nth(0).boundingBox(), choices.nth(1).boundingBox()]);
    expect(first?.width, "the two choices have the same width").toBe(second?.width);
    await shot(page, "02-habit-stop-sheet", false);

    // "Keep going" leaves everything as it was: nothing is signed and nothing is sent.
    await stop.getByRole("button", { name: "Keep going" }).click();
    await expect(stop).toBeHidden();
    expect(served.signed).toEqual([]);
    expect(sent.length).toBe(0);

    // The agreement is folded, with where money already theirs goes at its foot and no ending in it.
    await page.getByText("What was agreed", { exact: true }).click();
    const agreed = page.locator("details.gift-fold").first();
    await expect(agreed.getByText("It is yours already. Use it from Home whenever you like.")).toBeVisible();
    await page.getByText("How this is checked", { exact: true }).click();
    const checked = page.locator("details.gift-fold").nth(1);
    await expect(checked.getByText(/^Viky reads your lessons for this gift\. You agreed on \d{1,2} \w{3} \d{4}\.$/)).toBeVisible();
    await expect(checked.getByText("Check this day yourself")).toBeVisible();
    await expect(checked.getByRole("button", { name: "Count now" })).toBeVisible();
    await shot(page, "03-habit-folds-open");

    // The ending: two figures and a label where a sentence stood.
    await act(page, "stop").click();
    await choices.nth(1).click();
    const end = page.getByRole("dialog", { name: "End the gift?" });
    await expect(end.locator(".decide-two > div")).toHaveCount(2);
    await expect(end.locator(".decide-two > div").nth(0)).toHaveText("$2.00Yours");
    await expect(end.locator(".decide-two > div").nth(1)).toHaveText("$5.00Back to Maman");
    await expect(end.getByText("This can't be undone")).toBeVisible();
    await expect(end.getByText(/You keep/)).toHaveCount(0);
    await shot(page, "04-habit-end-sheet", false);

    // "Not now" sends nothing.
    await end.getByRole("button", { name: "Not now" }).click();
    await expect(end).toBeHidden();
    expect(sent.length).toBe(0);

    // The ending asks the passkey again, with the session open, and signs the two amounts the sheet showed.
    const before = await prompts();
    await act(page, "stop").click();
    await choices.nth(1).click();
    await end.getByRole("button", { name: "End the gift" }).click();
    await expect(page.getByText("You ended this gift.", { exact: true })).toBeVisible();
    expect(await prompts(), "the passkey was asked again for a gesture that cannot be undone").toBe(before + 1);
    expect(sent.length).toBe(1);
    expect(sent[0].keep).toBe("2000000");
    expect(sent[0].giveBack).toBe("5000000");
    expect(sent[0].nonce).toBe("0");
    expect(sent[0].signature).toMatch(/^0x[0-9a-f]{130}$/);

    // The gift once ended: the day as a label, a headline, two figures, one action, and nothing left to decide.
    await expect(page.locator(".gift-when")).toHaveText(/^Ended \d{1,2} \w{3} \d{4}$/);
    await expect(page.locator(".gift-figures")).toHaveText(/\$2\.00Yours\$5\.00Back to Maman/);
    await expect(page.getByRole("button", { name: "Take $2.00" })).toBeVisible();
    await expect(decide(page)).toHaveCount(0);
    await expect(page.getByText(/gave up|quit|failed|lost/i)).toHaveCount(0);
    // No day of it is drawn as still to come.
    await expect(page.locator(".day-row-day[aria-label*='to come' i]")).toHaveCount(0);
    await shot(page, "05-habit-ended");

    // Taking what stayed theirs: the sentence is read in a sheet, with the press and "Not now".
    await page.getByRole("button", { name: "Take $2.00" }).click();
    const take = page.getByRole("dialog", { name: "Take $2.00?" });
    await expect(take.getByText("It goes into your account, and it stays yours: from there you can send it to your bank. Nothing to pay.")).toBeVisible();
    await expect(take.getByRole("button", { name: "Take $2.00" })).toBeVisible();
    await shot(page, "17-ended-take-sheet", false);
    await take.getByRole("button", { name: "Not now" }).click();
    await expect(take).toBeHidden();
    await device.context.close();
  });

  test("a break is signed as a stop, said under the card, and ended by Start again", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const GIFT = "45";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    // A gift of the first version of the contracts: it has no ending, so the break is the one choice.
    const served = await serve(page, GIFT, () => daily(GIFT, "recipient", { version: 1, end: null }), TERMS.daily);
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);

    await act(page, "stop").click();
    const stop = page.getByRole("dialog", { name: "Your gift, your call." });
    await expect(stop.locator(".decide-option")).toHaveCount(1);
    await expect(stop.getByText("End the gift")).toHaveCount(0);
    await stop.locator('[data-option="break"]').click();

    // What it costs, in the three sentences of the first sheet, before anything is signed.
    const pause = page.getByRole("dialog", { name: "Take a break?" });
    await expect(pause.getByText("Viky stops now, on all your devices. Each day that is not read goes back to Maman. You can agree again at any time.")).toBeVisible();
    expect(served.signed).toEqual([]);
    await shot(page, "02b-habit-break-sheet", false);
    await pause.getByRole("button", { name: "Take a break" }).click();
    await expect(pause).toBeHidden();
    expect(served.signed).toEqual(["stop"]);

    // Under the card: one line and one small button, and the round button says where it stands.
    const line = page.locator("[data-consent-line]");
    await expect(line.getByText(/^Viky stopped reading your lessons on \d{1,2} \w{3} \d{4}\.$/)).toBeVisible();
    const again = line.getByRole("button", { name: "Start again" });
    await expect(again).toBeVisible();
    expect((await again.boundingBox())?.height, "the one small button is 40 high").toBe(40);
    await expect(act(page, "stop")).toHaveText("StopOn a break");
    await shot(page, "07-habit-on-a-break");

    // The same choice from the sheet.
    await act(page, "stop").click();
    await expect(stop.locator(".decide-option")).toHaveCount(1);
    await expect(stop.locator('[data-option="again"]')).toContainText("Start again");
    await shot(page, "07b-habit-on-a-break-sheet", false);
    await stop.locator('[data-option="again"]').click();
    await expect(stop).toBeHidden();
    expect(served.signed).toEqual(["stop", "yes"]);
    await expect(line).toHaveCount(0);
    await expect(act(page, "stop")).toHaveText("StopAnytime");
    await device.context.close();
  });

  test("what the funder sees is their page, small, and the agreement's own words for it", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "46";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await serve(page, GIFT, () => daily(GIFT, "recipient"), TERMS.daily);
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);

    await act(page, "sees").click();
    const sees = page.getByRole("dialog", { name: "Maman sees one thing." });
    const view = sees.locator("[data-their-view]");
    await expect(view.getByText("Maman's page")).toBeVisible();
    // Her page, in her voice: the same state, and the money said as theirs.
    await expect(view.getByText("Yesterday counted.")).toBeVisible();
    await expect(view.getByText("$2.00 Theirs so far")).toBeVisible();
    await expect(view.locator(".decide-view-days > span")).toHaveCount(3);
    await expect(sees.getByText("Maman sees: for each day, whether it counted.")).toBeVisible();
    await shot(page, "15-habit-maman-sees", false);
    await sees.getByRole("button", { name: "Got it" }).click();
    await expect(sees).toBeHidden();
    await device.context.close();
  });

  test("messages: where it stands and the press that changes it, and what the phone refuses said after the press", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const GIFT = "44";
    const refuses = await aWindow(browser, baseURL);
    await refuses.context.addInitScript(`Object.defineProperty(Notification, "permission", { get: () => "denied" });`);
    await serve(refuses.page, GIFT, () => daily(GIFT, "recipient"), TERMS.daily);
    await makeAnAccount(refuses);
    await refuses.page.goto(`/g/${GIFT}`);
    // Nothing about the phone stands on the page.
    await expect(refuses.page.getByText(/Your phone is not letting Viky tell you/)).toBeHidden();
    await shot(refuses.page, "06-habit-phone-refuses");
    await act(refuses.page, "messages").click();
    const refused = refuses.page.getByRole("dialog", { name: "Notifications" });
    await expect(refused.getByText("Your phone is not letting Viky tell you. Turn notifications on for Viky in your phone's settings.")).toBeVisible();
    // The button waits: its own shape and colour, faded, and it cannot be pressed.
    await expect(refused.getByRole("button", { name: "Tell me each morning" })).toBeDisabled();
    await shot(refuses.page, "06b-habit-messages-refused-sheet", false);
    await refuses.context.close();

    const asks = await aWindow(browser, baseURL);
    await neverAskedToBeTold(asks.context);
    await serve(asks.page, GIFT, () => daily(GIFT, "recipient"), TERMS.daily);
    await makeAnAccount(asks);
    await asks.page.goto(`/g/${GIFT}`);
    await act(asks.page, "messages").click();
    const sheet = asks.page.getByRole("dialog", { name: "Notifications" });
    await expect(sheet.getByText("Viky stays quiet.")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Tell me each morning" })).toBeEnabled();
    await shot(asks.page, "06c-habit-messages-sheet", false);
    await asks.context.close();
  });

  test("a climb: the same three buttons, a break that says what it costs by its last day, and an ending in one figure", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const GIFT = "1999942";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await serve(page, GIFT, () => climb(GIFT, "recipient"), TERMS.climb);
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);

    await expect(decide(page).getByRole("button")).toHaveCount(3);
    await expect(act(page, "sees")).toHaveText("Maman seesTwo things");
    await expect(page.getByText(/^Get a message when you reach/)).toBeHidden();
    await expect(page.getByText(/^Viky reads your rapid rating for this gift/)).toBeHidden();
    await shot(page, "08-climb-under-way");

    await act(page, "stop").click();
    const stop = page.getByRole("dialog", { name: "Your gift, your call." });
    await expect(stop.locator('[data-option="break"]')).toContainText("Viky stops reading. Start again before the last day.");
    // Nothing is earned before the target: one figure on the ending's choice, and "$0.00 yours" is never said.
    await expect(stop.locator('[data-option="end"] .decide-chip')).toHaveText(["$25.00 back to Maman"]);
    await shot(page, "09-climb-stop-sheet", false);
    await stop.locator('[data-option="end"]').click();
    const end = page.getByRole("dialog", { name: "End the gift?" });
    await expect(end.locator(".decide-two > div")).toHaveCount(1);
    await expect(end.locator(".decide-two > div")).toHaveText("$25.00Back to Maman");
    await expect(end.getByText(/\$0\.00/)).toHaveCount(0);
    await shot(page, "10-climb-end-sheet", false);
    await end.getByRole("button", { name: "Not now" }).click();

    await act(page, "sees").click();
    const sees = page.getByRole("dialog", { name: "Maman sees two things." });
    await expect(sees.getByText("Maman sees: the rating read, and whether it reaches the target.")).toBeVisible();
    await expect(sees.locator("[data-their-view]").getByText("1462 Today")).toBeVisible();
    await shot(page, "16-climb-maman-sees", false);
    await sees.getByRole("button", { name: "Got it" }).click();

    await act(page, "messages").click();
    const messages = page.getByRole("dialog", { name: "Notifications" });
    await expect(messages.getByText("Get a message when you reach 1500.")).toBeVisible();
    await expect(messages.getByRole("button", { name: "Turn on" })).toBeEnabled();
    await shot(page, "08b-climb-messages-sheet", false);
    await device.context.close();
  });

  test("a gift for one thing: all of it goes back, and \"$0.00\" is never said, before or after", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "1999941";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    let ended: number | null = null;
    const offer = { keep: "0", keepDisplay: "$0.00", giveBack: "25000000", giveBackDisplay: "$25.00", nonce: "0" };
    const served = await serve(
      page,
      GIFT,
      () => gift(GIFT, "recipient", ended === null ? { version: 2, end: offer, ended: null, escrow: CONTRACT } : { version: 2, end: null, finished: true, phase: "returned", returnedDisplay: "$25.00", ended: { atMs: ended, keptDisplay: "$0.00", givenBackDisplay: "$25.00" }, escrow: CONTRACT }),
      TERMS.shown,
    );
    await page.route(`**/api/gift/${GIFT}/end`, (route) => {
      ended = Date.now();
      served.finish();
      return route.fulfill(json({ giftId: GIFT, ended: true, keep: "0", giveBack: "25000000", hash: `0x${"ab".repeat(32)}` }));
    });
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    await expect(decide(page).getByRole("button")).toHaveCount(3);
    await shot(page, "11-one-thing-waiting");

    await act(page, "stop").click();
    await page.locator('[data-option="end"]').click();
    const end = page.getByRole("dialog", { name: "End the gift?" });
    await expect(end.locator(".decide-two > div")).toHaveText("$25.00Back to Maman");
    await shot(page, "12-one-thing-end-sheet", false);
    await end.getByRole("button", { name: "End the gift" }).click();

    await expect(page.getByText("You ended this gift.", { exact: true })).toBeVisible();
    await expect(page.locator(".gift-when")).toHaveText(/^Ended \d{1,2} \w{3} \d{4}$/);
    // One figure, what went back, with its label (the amount counts up from what this device last saw of it).
    await expect(page.locator(".gift-figures > div")).toHaveCount(1);
    await expect(page.locator(".gift-figures")).toHaveText(/\$25\.00Back to Maman$/);
    await expect(page.getByText(/\$0\.00/)).toHaveCount(0);
    await expect(decide(page)).toHaveCount(0);
    await shot(page, "13-one-thing-ended");
    await device.context.close();
  });

  test("opened and not yet connected: the round buttons are there already, and the ending is one of them", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "42";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await serve(
      page,
      GIFT,
      () =>
        daily(GIFT, "recipient", {
          connected: false,
          creditedDays: 0,
          days: [],
          startDay: 0,
          endDay: 0,
          earned: "0",
          earnedDisplay: "$0.00",
          alreadyTheirs: "0",
          alreadyTheirsDisplay: "$0.00",
          goalAccount: { username: "boo_learns", source: "funder", bound: false, code: null, codeExpiresAt: null },
          end: { keep: "0", keepDisplay: "$0.00", giveBack: "7000000", giveBackDisplay: "$7.00", nonce: "0" },
        }),
      TERMS.daily,
      null,
    );
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    // What somebody who is not that account is told sits in a fold under the one action, named by a question: pressing
    // it opens a sentence and does nothing else, so it is no button (the founder, 4 Oct 2026).
    await expect(page.getByRole("button", { name: /Not (my|your)/ })).toHaveCount(0);
    const notYours = page.locator("details[data-not-your-name]");
    await expect(notYours.locator("summary")).toHaveText("Not your Duolingo name?");
    await expect(notYours.locator("p")).toBeHidden();
    await notYours.locator("summary").click();
    await expect(notYours.locator("p")).toHaveText("Ask Maman to check the name. Nothing counts until it is right.");
    await notYours.locator("summary").click();
    await expect(page.getByRole("button", { name: "End this gift" })).toHaveCount(0);
    await expect(decide(page).getByRole("button")).toHaveCount(3);
    await shot(page, "14-opened-not-connected");

    // Nothing is read yet, so there is nothing to pause: the ending is the one choice.
    await act(page, "stop").click();
    const stop = page.getByRole("dialog", { name: "Your gift, your call." });
    await expect(stop.locator(".decide-option")).toHaveCount(1);
    await expect(stop.locator('[data-option="end"] .decide-chip')).toHaveText(["$7.00 back to Maman"]);
    await shot(page, "14b-opened-stop-sheet", false);
    await device.context.close();
  });

  test("nobody named the account: the fold says how to get Duolingo first, and under the code the button says what it does", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "43";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    let goalAccount: Record<string, unknown> = { username: null, source: null, bound: false, code: null, codeExpiresAt: null };
    await serve(
      page,
      GIFT,
      () =>
        daily(GIFT, "recipient", {
          connected: false,
          creditedDays: 0,
          days: [],
          startDay: 0,
          endDay: 0,
          earned: "0",
          earnedDisplay: "$0.00",
          alreadyTheirs: "0",
          alreadyTheirsDisplay: "$0.00",
          goalAccount,
          end: { keep: "0", keepDisplay: "$0.00", giveBack: "7000000", giveBackDisplay: "$7.00", nonce: "0" },
        }),
      TERMS.daily,
      null,
    );
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    // The fold of somebody who has no Duolingo: what to do first, with Duolingo's own site, then what becomes of the
    // money meanwhile (the founder, 4 Oct 2026). The second sentence alone said nothing of what to do.
    const notYet = page.locator("details[data-no-source-yet]");
    await expect(notYet.locator("summary")).toHaveText("No Duolingo yet?");
    await expect(notYet.locator("p").first()).toBeHidden();
    await notYet.locator("summary").click();
    await expect(notYet.locator("p")).toHaveText([
      "Duolingo is free. Install it, make your account, then come back here with your username.",
      "The money stays in your name. Nothing counts until you connect, and after 14 days unconnected it goes back to Maman.",
    ]);
    const link = notYet.getByRole("link", { name: "Install it" });
    await expect(link).toHaveAttribute("href", "https://www.duolingo.com");
    await expect(link).toHaveAttribute("target", "_blank");
    await notYet.scrollIntoViewIfNeeded();
    await shot(page, "18-no-duolingo-yet-open", false);

    // The name typed and its code given: the button under the code opens the username's field again, and says so.
    goalAccount = { username: "boo_learns", source: "recipient", bound: false, code: "K7PX2M", codeExpiresAt: new Date(Date.now() + 3_600_000).toISOString() };
    await page.reload();
    await expect(page.getByRole("button", { name: "Not my name" })).toHaveCount(0);
    const another = page.getByRole("button", { name: "Use another username" });
    await another.scrollIntoViewIfNeeded();
    await shot(page, "19-use-another-username", false);
    await another.click();
    await expect(page.getByLabel("Your Duolingo username")).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep the name I had" })).toBeVisible();
    await device.context.close();
  });
});
