import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Browser, BrowserContext, CDPSession, Locator, Page } from "@playwright/test";
import { APPEARANCES, chromium, Session, SIZES, type Appearance, type Size } from "./capture-connected";

/**
 * The funder's journey as the product draws it today, walked from the first screen to the link, and photographed.
 *
 * Why it exists: the funder scenarios of `capture-scenarios.ts` waited for "Who is it for?", the first step of the
 * assistant the card replaced on 19 Sep 2026, and `capture-card.ts` stopped at a "change" button the sheet no longer
 * has. Both are gone since 1 Oct 2026, and this is what photographs the funder's side.
 * It walks what a person meets now: the card on Home, its sheets, the pay sheet, the passkey made at the payment, the
 * wait, the gift made and its link, and the refusals on the way.
 *
 * What is real and what is not, exactly as in `capture-connected.ts`: the account is a virtual passkey with PRF, signed
 * in through the product's own code; every click is real; the answers a local server cannot give (no database, no
 * relayer key, no evidence key) are replaced in the browser and each capture says which. Nothing is sent to the chain:
 * the Session refuses a broadcast, and this script refuses one again for any host, whatever RPC the build names.
 * Nothing here talks to viky.cash: a request to it is aborted.
 *
 * Usage, from the repository, with a production build served locally:
 *   pnpm build && pnpm start --port 3301
 *   pnpm review:capture-funder http://localhost:3301 [--only=390x844-day] [--scene=<word>] [--persona=fr|us|sn|ma] [--out=<folder>]
 * Never an IP address: a passkey refuses one as its domain.
 *
 * Scenes, in the order they run: card (the card and every kind of condition), unreadable (the university list failing),
 * amount (the amount's refusals, the lengths, the currency, a gift with no first name), first-payment (the pay sheet,
 * the passkey at the payment, the wait, the tab closed, the session over, a payment a little short, the gift made and
 * its link), from-account (money already there, a refused creation), country (the pay sheet and the wait for a payer
 * in the United States, Senegal and Morocco), shortest (the presses counted), door (the header's door with no
 * passkey), judge (a judge's code on the pay sheet). A whole size and appearance takes about ten minutes.
 */

type Persona = Readonly<{ key: string; locale: string; country: string; says: string }>;

/**
 * Who is paying. The country is what Vercel would read from the connection (`x-vercel-ip-country`), which the local
 * server never receives: it is added to the requests this browser sends to the local server, and the rails route then
 * answers by itself for that country. The language is the device's own.
 */
const PERSONAS: Readonly<Record<string, Persona>> = {
  fr: { key: "fr", locale: "fr-FR", country: "FR", says: "a payer in France (device in fr-FR, connection read as FR)" },
  us: { key: "us", locale: "en-US", country: "US", says: "a payer in the United States (device in en-US, connection read as US)" },
  sn: { key: "sn", locale: "fr-SN", country: "SN", says: "a payer in Senegal (device in fr-SN, connection read as SN)" },
  ma: { key: "ma", locale: "fr-MA", country: "MA", says: "a payer in Morocco, where no card partner serves (device in fr-MA, connection read as MA)" },
};

const CLAIM_TOKEN = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
const COURSES = [
  { id: "DUOLINGO_ES_EN", title: "Spanish", xp: 1200 },
  { id: "DUOLINGO_IT_EN", title: "Italian", xp: 40 },
];

type Note = { combo: string; persona: string; step: string; url: string; text: string; ms?: number; extra?: string };
const NOTES: Note[] = [];
const OUTSIDE = new Set<string>();
let ipCounter = 10;

type Walk = Readonly<{ s: Session; page: Page; context: BrowserContext; cdp: CDPSession; authenticatorId: string; persona: Persona; combo: string; journey: string }>;

/** What is on the screen in words: the open sheet when there is one, the page otherwise. A string, not a function. */
const READ = `(() => {
  var open = Array.prototype.slice.call(document.querySelectorAll("dialog[open]")).pop();
  var root = open || document.querySelector("main") || document.body;
  return (root.innerText || "").replace(/[ \\t]+/g, " ").replace(/\\n{2,}/g, "\\n").trim();
})()`;

async function note(w: Walk, step: string, extra?: string, ms?: number): Promise<string> {
  const text = (await w.page.evaluate(READ).catch(() => "")) as string;
  NOTES.push({ combo: w.combo, persona: w.persona.key, step, url: w.page.url().replace(w.s.base, ""), text, ms, extra });
  return text;
}

/** Whether every amount that counts to its value has arrived, as `capture-connected.ts` asks it. */
const COUNT_SETTLED = `Array.prototype.slice.call(document.querySelectorAll("[data-count-settled]")).every(function (node) { return node.getAttribute("data-count-settled") === "true"; })`;

/**
 * The screen at rest, asked more briefly than the Session asks it: the landing turns one line of words over for ever, so
 * waiting for every animation to end waits its whole four seconds at each step. A sheet rises in 300ms; this gives it
 * six times that, the fonts, and a count that has arrived.
 */
async function settle(w: Walk): Promise<void> {
  await w.page.waitForLoadState("load");
  await w.page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
  await w.page
    .evaluate(`(async () => {
      await document.fonts.ready;
      var ending = document.getAnimations().filter(function (a) { return a.effect && a.effect.getComputedTiming().iterations !== Infinity; });
      await Promise.race([Promise.all(ending.map(function (a) { return a.finished.catch(function () {}); })), new Promise(function (done) { setTimeout(done, 1800); })]);
    })()`)
    .catch(() => undefined);
  await w.page.waitForFunction(COUNT_SETTLED, undefined, { timeout: 15_000 }).catch(() => undefined);
  await w.page.waitForTimeout(400);
}

const card = (w: Walk): Locator => w.page.locator('section[aria-labelledby="offer-card"]');
const sheet = (w: Walk): Locator => w.page.locator("dialog.sheet[open]").last();

/** A picture and the words beside it. With a sheet open, the page behind is left where it is. */
async function shot(w: Walk, state: string, path: string, at?: Locator): Promise<void> {
  const open = (await w.page.locator("dialog.sheet[open]").count()) > 0;
  const target = at ?? (open ? sheet(w).locator("h2").first() : undefined);
  await w.s.shot(w.journey, state, path, target ? { scrollTo: target } : {});
  await note(w, state);
}

async function press(w: Walk, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await target.click();
  await settle(w);
}

/** The open sheet's own scrolling part, moved to one of its ends: the innermost one when a sheet opened another. */
async function sheetTo(w: Walk, where: "top" | "bottom"): Promise<void> {
  await w.page.evaluate(`(() => {
    var bodies = Array.prototype.slice.call(document.querySelectorAll("dialog.sheet[open] .sheet-body"));
    var body = bodies.pop();
    if (body) body.scrollTo({ top: ${where === "top" ? "0" : "body.scrollHeight"} });
  })()`);
  await w.page.waitForTimeout(450);
}

async function openWalk(browser: Browser, base: string, size: Size, appearance: Appearance, persona: Persona, folder: string): Promise<Walk> {
  const context = await browser.newContext({ ...size.use, colorScheme: appearance.colorScheme, serviceWorkers: "block", locale: persona.locale });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  const ip = `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  ipCounter += 1;
  /**
   * The second guard, under the Session's own: a broadcast is refused for any host, viky.cash is never called, and the
   * requests to the local server carry the connection's country and an address of their own (the sign-in limit is kept
   * per address, and every browser of this run would otherwise share one).
   */
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (/(^|\.)viky\.cash$/.test(url.hostname) || url.hostname.endsWith("vercel.app")) return route.abort();
    const body = request.method() === "POST" ? (request.postData() ?? "") : "";
    if (/eth_sendRawTransaction|eth_sendTransaction/.test(body)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "refused by the audit walk" } }) });
    }
    if (request.url().startsWith(base)) {
      return route.continue({ headers: { ...request.headers(), "x-vercel-ip-country": persona.country, "x-forwarded-for": ip } });
    }
    if (url.protocol.startsWith("http")) OUTSIDE.add(url.hostname);
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(`  pageerror: ${String(error.stack ?? error).slice(0, 600)}`));
  page.setDefaultTimeout(30_000);
  // A partner's page opened in a new tab is not walked here: it is closed at once, and never signed in to.
  context.on("page", (other) => {
    if (other !== page) void other.close().catch(() => undefined);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, hasPrf: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  const s = new Session(page, base, size, appearance, folder);
  await s.reset();
  return { s, page, context, cdp, authenticatorId, persona, combo: `${size.name}-${appearance.name}`, journey: `funder ${persona.key}` };
}

/** The whole list of universities as /api/portals?all=1 answers it, from the register in the repository. */
function universities(): unknown {
  const register = JSON.parse(readFileSync(resolve("data/university-register.json"), "utf8")) as { rows: Array<{ portalId: string; university: string; country: string }> };
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  return {
    results: register.rows.map((row) => ({
      pair: row.portalId,
      title: row.university,
      issuer: names.of(row.country) ?? row.country,
      country: row.country,
      scale: null,
      // The one university the register's own comment names as read from a first proof (D200), so the first group shows.
      tested: row.portalId === "aur-edu",
    })),
  };
}

async function mockSources(w: Walk): Promise<void> {
  await w.s.api(
    "GET",
    /\/api\/duolingo\/profile\?/,
    ({ url }) =>
      /nobody_here/.test(url)
        ? { status: 404, body: { error: "No public Duolingo profile goes by that name.", code: "NO_SUCH_PROFILE" } }
        : { status: 200, body: { username: "ama_learns", courses: COURSES, currentCourseId: "DUOLINGO_ES_EN" } },
    "GET /api/duolingo/profile",
  );
  await w.s.api(
    "GET",
    /\/api\/chess\/standing\?/,
    ({ url }) =>
      /mode=blitz/.test(url)
        ? { status: 404, body: { error: "No rating in that cadence yet.", code: "NO_RATING" } }
        : { status: 200, body: { username: "lea_plays", mode: "rapid", rating: 1450, rd: 45, best: 1510, settled: true, readAt: new Date().toISOString() } },
    "GET /api/chess/standing (no blitz rating, 1450 in rapid)",
  );
  const list = universities();
  await w.s.api("GET", /\/api\/portals\?all=1/, () => ({ status: 200, body: list }), "GET /api/portals?all=1 (the register's 11,015 rows)");
}

/** From the first screen to the card, as a visitor does it: one press on the hero's action. */
async function arrive(w: Walk, photograph: boolean): Promise<void> {
  await w.s.goto("/");
  if (photograph) await shot(w, "01 arrival first screen", "Not signed in: the address, nothing pressed");
  await press(w, w.page.getByRole("link", { name: "Offer a gift" }).first());
  await w.page.waitForTimeout(600);
  if (photograph) await shot(w, "02 card as it opens", "Offer a gift", card(w));
}

async function openWill(w: Walk): Promise<void> {
  await press(w, card(w).getByRole("button", { name: /what they will do/i }));
  await sheet(w).waitFor({ state: "visible" });
}

/** Whatever face the will sheet is on, back to the four families. */
async function toFamilies(w: Walk): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    const back = sheet(w).getByRole("button", { name: /^(All families|Change what they will do)$/ });
    if ((await back.count()) === 0) return;
    await press(w, back.first());
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The card and its sheets: what they will do, in each of its kinds.

async function sceneCard(w: Walk): Promise<void> {
  await w.s.reset();
  await mockSources(w);
  await arrive(w, true);

  // The name: the card starts on "Boo", and the name is typed where it stands.
  const name = card(w).getByLabel("Their first name");
  await name.fill("");
  await settle(w);
  await shot(w, "03a name emptied", "On the card: the first name cleared", card(w));
  await name.fill("Boo");
  await settle(w);
  await shot(w, "03b named", "On the card: Boo typed as the first name", card(w));

  // What they will do: the four families, a family's list, a daily condition's own questions.
  await openWill(w);
  await shot(w, "04 will, the four families", "On the card: what they will do");
  const families = (await sheet(w).locator(".sheet-body button").allInnerTexts()).map((text) => text.replace(/\s+/g, " ").trim());
  await note(w, "04 families listed", families.join(" | "));
  await press(w, sheet(w).getByRole("button", { name: /^Learn/ }).first());
  await shot(w, "05 will, the Learn list", "what they will do, Learn");
  await press(w, sheet(w).getByRole("button", { name: /A Duolingo lesson each day/ }).first());
  await shot(w, "06 daily, its questions", "what they will do, Learn, A Duolingo lesson each day");
  const duolingo = sheet(w).getByLabel("Their Duolingo name");
  await duolingo.fill("nobody_here_at_all");
  await duolingo.blur();
  await w.s.text(/No public Duolingo profile goes by that name/);
  await shot(w, "07a daily, a name nobody has", "On the daily questions: nobody_here_at_all typed, then out of the field");
  await duolingo.fill("ama_learns");
  await duolingo.blur();
  await w.s.text("Which course counts?");
  await shot(w, "07b daily, the name read and its courses", "On the daily questions: ama_learns typed, then out of the field");
  // "How this is checked" is opened first, so its four lines are in the picture (4 Oct 2026).
  await sheet(w).locator("[data-how-checked] summary").click();
  await sheetTo(w, "bottom");
  await shot(w, "07c daily, the foot of the questions", "The same sheet, scrolled to its end");
  await press(w, sheet(w).getByRole("button", { name: "Done", exact: true }));
  await shot(w, "08 card, daily filled", "Done", card(w));

  // A milestone: a chess rating.
  await openWill(w);
  await toFamilies(w);
  await press(w, sheet(w).getByRole("button", { name: /^Play/ }).first());
  await shot(w, "09 will, the Play list", "what they will do, Play");
  await press(w, sheet(w).getByRole("button", { name: /A chess rating on Chess\.com/ }).first());
  await shot(w, "10a chess, its questions empty", "what they will do, Play, A chess rating on Chess.com");
  await press(w, sheet(w).getByRole("button", { name: "Done", exact: true }));
  await shot(w, "10b chess, Done pressed with nothing answered", "On the chess questions: Done");
  await sheet(w).getByLabel("Their Chess.com name").fill("lea_plays");
  await sheet(w).getByRole("radio", { name: /Blitz/ }).check();
  await w.s.text(/no blitz rating/i);
  await shot(w, "10c chess, no rating in that cadence", "On the chess questions: lea_plays, Blitz");
  await sheet(w).getByRole("radio", { name: /Rapid/ }).check();
  await sheet(w).getByText(/Today they are at 1450/).first().waitFor({ state: "attached", timeout: 30_000 });
  await settle(w);
  await shot(w, "10d chess, Rapid chosen, the sheet as it stands", "On the chess questions: Rapid (the sheet is left where it is)");
  // "How this is checked" is opened first, so its four lines are in the picture (4 Oct 2026).
  await sheet(w).locator("[data-how-checked] summary").click();
  await sheetTo(w, "bottom");
  await shot(w, "10d2 chess, the reading and the target, at the sheet's end", "The same sheet, scrolled to its end");
  const target = sheet(w).getByLabel("The rating they reach");
  await target.fill("1440");
  await target.blur();
  await settle(w);
  await shot(w, "10e chess, a target under today's rating", "On the chess questions: 1440 typed");
  await target.fill("1550");
  await settle(w);
  await press(w, sheet(w).getByRole("button", { name: "Done", exact: true }));
  await shot(w, "11 card, chess rating filled", "Done", card(w));
  // What the pay sheet says of a gift that waits for a rating: whether the rating itself is said before paying.
  await openPaySheet(w);
  await shot(w, "11b pay sheet, chess rating", "On the card with a chess rating: Send");
  const about = sheet(w).locator("[data-what-happens] > summary");
  await about.click();
  await w.page.waitForTimeout(300);
  await sheetTo(w, "bottom");
  await shot(w, "11c pay sheet, chess rating, what happens to my money", "The same sheet: What happens to my money");
  await press(w, sheet(w).getByRole("button", { name: "Close" }));

  // A certificate, named by a link.
  await openWill(w);
  await toFamilies(w);
  await press(w, sheet(w).getByRole("button", { name: /^School/ }).first());
  await shot(w, "12 will, the School and studies list", "what they will do, School & studies");
  await sheetTo(w, "bottom");
  await shot(w, "12b will, the School and studies list, its end", "The same list, scrolled to its end");
  await sheetTo(w, "top");
  await press(w, sheet(w).getByRole("button", { name: /A Coursera certificate/ }).first());
  await shot(w, "13a certificate, its questions", "what they will do, School & studies, A Coursera certificate");
  await sheet(w).getByLabel(/Their name/).first().fill("Boo Martin");
  const course = sheet(w).locator("#certificate-course");
  if ((await course.count()) > 0) {
    await course.fill("https://www.coursera.org/learn/introduction-git-github");
    await course.blur();
    await settle(w);
  }
  await shot(w, "13b certificate, the name and the course", "On the certificate questions: the name, then the course link pasted");

  // A university, through the list, its country and its search.
  await toFamilies(w);
  await press(w, sheet(w).getByRole("button", { name: /^School/ }).first());
  await press(w, sheet(w).getByRole("button", { name: /At university/ }).first());
  await sheet(w).locator('input[name="university"]').first().waitFor({ state: "attached", timeout: 30_000 });
  await settle(w);
  await shot(w, "14a university, the list as it opens", "what they will do, School & studies, At university");
  await sheetTo(w, "bottom");
  await shot(w, "14b university, the foot of the first hundred", "The same sheet, scrolled to its end");
  await sheetTo(w, "top");
  const search = sheet(w).getByLabel("Search universities");
  await search.fill("dakar");
  await settle(w);
  await shot(w, "14c university, dakar searched", "On the university questions: dakar typed in the search");
  await search.fill("");
  await press(w, sheet(w).locator("#university-country"));
  await shot(w, "14d university, the country sheet", "On the university questions: the country chip");
  await sheet(w).getByLabel("Search").first().fill("sen");
  await settle(w);
  await sheet(w).getByRole("radio", { name: "Senegal" }).click();
  await settle(w);
  await shot(w, "14e university, in Senegal", "The country sheet: sen typed, Senegal");
  // A press, not a check: the list folds into the one chosen, so the radio pressed is gone the moment it is chosen.
  await sheet(w).getByRole("radio", { name: /Cheikh Anta Diop/ }).click();
  await settle(w);
  await shot(w, "14f university, one chosen", "On the list: Cheikh Anta Diop University of Dakar");
  await sheet(w).getByRole("radio", { name: /^A grade/ }).check();
  await settle(w);
  await shot(w, "14g university, a grade and its scale", "On the university questions: A grade");
  await press(w, sheet(w).getByRole("button", { name: "Done", exact: true }));
  await shot(w, "14h university, Done with the scale unanswered", "On the university questions: Done");
  const outOf20 = sheet(w).getByRole("button", { name: /20/ }).first();
  if ((await outOf20.count()) > 0) {
    await press(w, outOf20);
    await sheet(w).locator("[data-how-checked] summary").click();
    await sheetTo(w, "bottom");
    await shot(w, "14i university, the grade on a scale of 20", "On the university questions: the scale out of 20");
  }
  await press(w, sheet(w).getByRole("button", { name: "Done", exact: true }));
  if ((await w.page.locator("dialog.sheet[open]").count()) > 0) await press(w, sheet(w).getByRole("button", { name: "Close" }));
  await shot(w, "15 card, a university grade", "Done", card(w));

}

/**
 * The list of universities when it cannot be read. Nothing is replaced: it is what the local server itself answers with
 * no database (a 500), and the screen is the product's own answer to a list route that fails.
 */
async function sceneUnreadable(w: Walk): Promise<void> {
  await w.s.reset();
  await w.s.forgetKept();
  await arrive(w, false);
  await openWill(w);
  await toFamilies(w);
  await press(w, sheet(w).getByRole("button", { name: /^School/ }).first());
  await press(w, sheet(w).getByRole("button", { name: /At university/ }).first());
  await w.page.waitForTimeout(2_000);
  await settle(w);
  await shot(w, "16 university, the list that could not be read", "what they will do, School & studies, At university, with the list route failing (the local server's own 500: no database)");
  await sheetTo(w, "bottom");
  await shot(w, "16b university, the list that could not be read, its end", "The same sheet, scrolled to its end");
  await press(w, sheet(w).getByRole("button", { name: "Done", exact: true }));
  await shot(w, "16c university, Done with no university", "On that sheet: Done");
}

// ---------------------------------------------------------------------------------------------------------------
// The amount, the length, and what the card refuses.

async function freshDailyCard(w: Walk, name = "Boo"): Promise<void> {
  await w.s.forgetKept();
  await w.page.evaluate(`document.cookie = "viky.card=; path=/; max-age=0"`).catch(() => undefined);
  await arrive(w, false);
  await card(w).getByLabel("Their first name").fill(name);
  await settle(w);
}

async function sceneAmount(w: Walk): Promise<void> {
  await w.s.reset();
  await freshDailyCard(w);
  const amount = card(w).getByLabel("how much");
  const tries: Array<[string, string, string]> = [
    ["", "20a amount emptied", "On the card: the amount cleared"],
    ["0.5", "20b amount under the smallest gift", "On the card: 0.5 typed as the amount"],
    ["5000", "20c amount above the pilot cap", "On the card: 5000 typed as the amount"],
    ["12.345", "20d amount with three decimals", "On the card: 12.345 typed as the amount"],
    ["abc", "20e amount that is not a number", "On the card: abc typed as the amount"],
  ];
  for (const [typed, state, path] of tries) {
    await amount.fill(typed);
    await settle(w);
    await shot(w, state, path, card(w));
    await note(w, `${state}: the action`, `action says "${(await card(w).locator("[data-card-action]").innerText()).trim()}", disabled=${await card(w).locator("[data-card-action]").isDisabled()}`);
  }
  await amount.fill("45");
  await settle(w);
  await press(w, card(w).getByRole("button", { name: "7 days", exact: true }));
  await shot(w, "21a length, seven days", "On the card: 45, then 7 days", card(w));
  await press(w, card(w).getByRole("button", { name: "90 days", exact: true }));
  await shot(w, "21b length, ninety days", "On the card: 90 days", card(w));
  await press(w, card(w).getByRole("button", { name: "30 days", exact: true }));
  await press(w, card(w).locator("button.money-key"));
  await shot(w, "22 the currency sheet", "On the card: the currency key beside the amount");
  await press(w, sheet(w).getByRole("button", { name: "Close" }));
  await shot(w, "23 card ready to send", "The currency sheet closed: Boo, a Duolingo lesson each day, 45, 30 days", card(w));

  // No first name at all: the card may be paid for without one, and the sheet says so in its own words.
  await card(w).getByLabel("Their first name").fill("");
  await settle(w);
  await note(w, "24 the action with no first name", `action says "${(await card(w).locator("[data-card-action]").innerText()).trim()}", disabled=${await card(w).locator("[data-card-action]").isDisabled()}`);
  await openPaySheet(w);
  await shot(w, "24a pay sheet with no first name", "On the card, the first name cleared: Send");
  await sheetTo(w, "bottom");
  await shot(w, "24b pay sheet with no first name, its end", "The same sheet, scrolled to its end");
  await press(w, sheet(w).getByRole("button", { name: "Close" }));
}

// ---------------------------------------------------------------------------------------------------------------
// Paying for the first time: the pay sheet, the passkey at the payment, the wait, coming back, the gift and its link.

async function openPaySheet(w: Walk): Promise<void> {
  await press(w, card(w).locator("[data-card-action]"));
  await sheet(w).waitFor({ state: "visible" });
  await w.page.waitForTimeout(1_200);
  await settle(w);
}

async function photographPaySheet(w: Walk, number: string, how: string): Promise<void> {
  await shot(w, `${number}a pay sheet`, how);
  await sheetTo(w, "bottom");
  await shot(w, `${number}b pay sheet, its end`, "The same sheet, scrolled to its end");
  const more = sheet(w).locator("[data-what-happens] > summary");
  if ((await more.count()) > 0) {
    await more.click();
    await w.page.waitForTimeout(300);
    await sheetTo(w, "bottom");
    await shot(w, `${number}c pay sheet, what happens to my money`, "The same sheet: What happens to my money");
    await more.click();
  }
  await sheetTo(w, "top");
}

async function sceneFirstPayment(w: Walk): Promise<void> {
  await w.s.reset();
  await w.s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine (no gift)");
  await freshDailyCard(w);
  await card(w).getByLabel("how much").fill("45");
  await settle(w);
  await openPaySheet(w);
  await photographPaySheet(w, "30", "On the card, not signed in: Send (the action of the card)");

  // The press that pays, with no passkey on this device: what a first funder does.
  const payButton = sheet(w).getByRole("button", { name: /^(Pay \S+ by card|Pay|Put .* in .* name)$/ }).first();
  await note(w, "31 the pay action", `button says "${(await payButton.innerText()).trim()}"`);
  const before = Date.now();
  await payButton.click();
  const outcome = await Promise.race([
    w.page.waitForURL(/\/fund\?step=paying/, { timeout: 70_000 }).then(() => "went to the wait"),
    w.page.getByText("That did not go through, and nothing was taken. Try again.").first().waitFor({ state: "visible", timeout: 70_000 }).then(() => "refused in the sheet"),
  ]).catch(() => "nothing happened in 70 seconds");
  const tookMs = Date.now() - before;
  await settle(w);
  await note(w, "31 first press on pay, no passkey on the device", outcome, tookMs);
  if (outcome === "refused in the sheet") {
    await shot(w, "31a pay pressed with no passkey, the sheet's answer", "On the pay sheet, no passkey on this device: Pay");
    await sheetTo(w, "bottom");
    await shot(w, "31b pay pressed with no passkey, the sheet's end", "The same sheet, scrolled to its end");
    await sheetTo(w, "top");
    const create = sheet(w).getByRole("button", { name: /^Create (my|your) account$/ }).first();
    await create.scrollIntoViewIfNeeded();
    const made = Date.now();
    await create.click();
    const landedOn = await Promise.race([
      w.page.waitForURL(/\/fund\?step=paying/, { timeout: 40_000 }).then(() => "the wait"),
      w.page.locator(".money-display-box h1").first().waitFor({ state: "visible", timeout: 40_000 }).then(() => "Home, signed in"),
    ]).catch(() => "neither the wait nor Home in 40 seconds");
    const madeMs = Date.now() - made;
    await w.page.waitForTimeout(1_200);
    await settle(w);
    const sheetStillOpen = (await w.page.locator("dialog.sheet[open]").count()) > 0;
    await note(w, "32 account made from the pay sheet", `landed on ${landedOn}; sheet still open: ${sheetStillOpen}; url ${w.page.url().replace(w.s.base, "")}`, madeMs);
    await w.s.shot(w.journey, "32 after Create my account in the pay sheet", "On the refused pay sheet: Create my account", {});
    await note(w, "32 after Create my account in the pay sheet");
    if (!/step=paying/.test(w.page.url())) {
      // Whatever the screen is now, the way on is the card's action and the sheet's action, pressed again.
      if (!sheetStillOpen) {
        await card(w).scrollIntoViewIfNeeded();
        await shot(w, "33a the card again, signed in", "After the account was made: the page as it stands", card(w));
        await openPaySheet(w);
        await shot(w, "33b pay sheet again, signed in", "On the card, signed in: Send");
      }
      await press(w, sheet(w).getByRole("button", { name: /^(Pay \S+ by card|Pay)$/ }).first());
      await w.page.waitForURL(/\/fund\?step=paying/, { timeout: 40_000 });
    }
  }
  await w.s.text(/Waiting for your/);
  await settle(w);
  await shot(w, "34 waiting for the payment", "Pay, once the account exists");
  const partner = w.page.getByRole("link", { name: /^Open / }).first();
  await note(w, "34 the partner link", `"${(await partner.innerText()).trim()}" opens ${await partner.getAttribute("href")}`);
  // Where the card is paid in a frame of our own (the build with Rampnow's frame on), the wait is under a sheet that
  // only its own way out closes, and there is no code to copy: the frame's page is told everything already.
  const framed = (await w.page.locator("iframe[data-rampnow-frame]").count()) > 0;
  if (framed) {
    await press(w, sheet(w).getByRole("button", { name: "Go back without paying" }));
    await shot(w, "34b the wait, back from the frame without paying", "On the frame's sheet: Go back without paying");
  } else {
    await press(w, w.page.getByRole("button", { name: "Copy the code" }));
    await shot(w, "35 waiting, the code copied", "On the waiting screen: Copy the code", w.page.getByRole("button", { name: "Copied" }));
  }

  // Closing the tab in the middle: a new visit keeps the device's storage and the cookie, not the tab's own storage.
  await w.page.evaluate(`window.sessionStorage.clear()`);
  await w.s.goto("/");
  await settle(w);
  await shot(w, "36a back on Home after closing the tab", "The tab closed while waiting, then the address opened again");
  await card(w).scrollIntoViewIfNeeded();
  await shot(w, "36b back on Home, the card", "The same page, at the card", card(w));
  await w.s.goto("/gifts");
  await shot(w, "36c my gifts while a payment is awaited", "The same visit: Gifts");
  await w.s.goto("/fund");
  await w.page.waitForTimeout(1_500);
  await settle(w);
  await shot(w, "36d the pay address opened again", "The same visit: the address /fund typed");

  // The payment landed while the person was away, and they come back to the address they know: Home.
  w.s.holdings = { AUSD: 51_100_000n, USDC: 0n, MON: 0n };
  await w.s.goto("/");
  await w.page.waitForTimeout(2_500);
  await settle(w);
  await w.s.shot(w.journey, "36e back on Home, the payment landed meanwhile", "The tab closed while waiting, the payment landing meanwhile (balance read replaced), then the address opened again", { real: "replaced: balance reads (the page's first figure is the local server's own read of the chain, which holds nothing)" });
  await note(w, "36e back on Home, the payment landed meanwhile");
  await openPaySheet(w);
  await shot(w, "36f the pay sheet from Home, the payment landed", "On that page: Send");
  await press(w, sheet(w).getByRole("button", { name: "Close" }));
  w.s.holdings = { AUSD: 0n, USDC: 0n, MON: 0n };

  // The twelve-hour session over: the cookie gone, the page opened again.
  await w.context.clearCookies();
  await w.s.goto("/fund");
  await settle(w);
  await shot(w, "37a session over, the pay address", "The session expired, then /fund opened");
  await w.s.goto("/");
  await press(w, w.page.getByRole("link", { name: "Offer a gift" }).first());
  await shot(w, "37b session over, Home", "The session expired, then the address opened", card(w));
  await w.s.goto("/fund");
  await w.s.budgetSignIn();
  await press(w, w.page.getByRole("button", { name: "Sign in to pick it up" }));
  await w.s.text(/Waiting for your/, 40_000);
  await shot(w, "37c picked up after signing in again", "On that screen: Sign in to pick it up");

  // A payment that lands a little short of the gift, on the rail that delivers what a gift holds. The gift's dollars
  // are read from what the device keeps of it: it was typed in euros, the day's rate decides its dollars (a figure
  // written here went stale, and on 4 Oct 2026 the "short" payment was more than the gift, which was made instead),
  // and the screen says the gift as it was typed, not in dollars.
  const giftDollars = String(await w.page.evaluate(`JSON.parse(localStorage.getItem("viky.pendingGift") ?? "{}").dollars ?? ""`)).match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!giftDollars) throw new Error("the device keeps no gift to read the dollars of");
  const short = (BigInt(giftDollars[1]) * 100n + BigInt((giftDollars[2] ?? "").padEnd(2, "0")) - 29n) * 10_000n;
  w.s.holdings = { AUSD: short, USDC: 0n, MON: 0n };
  // What the account holds is said in the money typed, on its own line since 4 Oct 2026: any figure but nothing.
  await w.page.locator("dl.said-lines > div").filter({ hasText: "In your account" }).locator("dd").filter({ hasText: /[1-9]/ }).first().waitFor({ timeout: 40_000 });
  await w.page.waitForTimeout(9_000);
  await settle(w);
  await w.s.shot(w.journey, "37d a payment landed 29 cents short", "On the waiting screen, a payment landing 29 cents short of the gift (balance read replaced), two looks later", { real: "replaced: balance reads" });
  await note(w, "37d a payment landed 29 cents short");

  // The payment lands: the account now holds what the gift needs, and the creation's answer is replaced.
  let release: (() => void) | undefined;
  const held = new Promise<void>((done) => {
    release = done;
  });
  await w.page.route(new URL("/api/gift/create", w.s.base).href, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await held;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ giftId: "3", claimUrl: `${w.s.base}/g/3?t=${CLAIM_TOKEN}`, funded: true }) });
  });
  const landed = Date.now();
  w.s.holdings = { AUSD: 60_000_000n, USDC: 0n, MON: 0n };
  await w.s.text(/^Putting /, 40_000);
  await note(w, "38 the payment seen", "from the balance changing to the screen saying so", Date.now() - landed);
  await w.page.waitForTimeout(900);
  await w.s.shot(w.journey, "38 the gift being made", "The payment landed (balance read replaced), the creation held unanswered", { real: "replaced: balance reads, POST /api/gift/create (held, then answered)" });
  await note(w, "38 the gift being made");
  release?.();
  await w.s.text(/is in Boo's name\./, 40_000);
  await settle(w);
  await w.s.shot(w.journey, "39 the gift made, with its link", "The creation answered", { real: "replaced: balance reads, POST /api/gift/create" });
  await note(w, "39 the gift made, with its link", `share offered: ${(await w.page.getByRole("button", { name: "Share", exact: true }).count()) > 0}`);
  await press(w, w.page.getByRole("button", { name: "Copy the link" }));
  await w.s.shot(w.journey, "40 the link copied", "On the gift made: Copy the link", { scrollTo: w.page.getByRole("button", { name: "Copied" }), real: "replaced: balance reads, POST /api/gift/create" });
  await note(w, "40 the link copied", `clipboard: ${await w.page.evaluate("navigator.clipboard.readText()").catch(() => "unreadable")}`);

  // A reload of the made screen, then a new tab: where the link is afterwards.
  await w.page.reload();
  await settle(w);
  await note(w, "41a the made screen after a reload");
  await w.page.evaluate(`window.sessionStorage.clear()`);
  await w.s.goto("/fund?step=done");
  await settle(w);
  await shot(w, "41 the made address in a new tab", "The tab closed after the gift was made, then /fund?step=done opened");
  await w.s.goto("/");
  await shot(w, "42 Home after the gift", "Home, signed in, after the gift (the gifts list is replaced by an empty one)");
  await w.s.forgetKept();
}

// ---------------------------------------------------------------------------------------------------------------
// Paying with money already in the account, and what a refused creation looks like.

async function sceneFromAccount(w: Walk): Promise<void> {
  await w.s.reset({ AUSD: 60_000_000n, USDC: 0n, MON: 0n });
  await w.s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine (no gift)");
  await w.s.forgetKept();
  await w.s.signIn();
  await settle(w);
  await shot(w, "50 Home with money in the account", "Signed in, $60.00 in the account: Home");
  await card(w).getByLabel("Their first name").fill("Boo");
  await card(w).getByLabel("how much").fill("45");
  await settle(w);
  await shot(w, "51 the card, signed in", "On Home: Boo, 45", card(w));
  await openPaySheet(w);
  await photographPaySheet(w, "52", "On the card, signed in with $60.00: Send");

  // First the creation refuses, then it answers.
  let hits = 0;
  await w.page.route(new URL("/api/gift/create", w.s.base).href, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    hits += 1;
    if (hits === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "The gift could not be made just now. Nothing was taken. Try again in a moment.", code: "RELAY_UNAVAILABLE" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ giftId: "3", claimUrl: `${w.s.base}/g/3?t=${CLAIM_TOKEN}`, funded: true }) });
  });
  const pressed = Date.now();
  await press(w, sheet(w).getByRole("button", { name: /^Put .* in .* name$/ }));
  await w.s.text("Your payment arrived", 40_000);
  await w.s.shot(w.journey, "53 the creation refused", "On the pay sheet: Put $45.00 in Boo's name, the creation answering a refusal", { real: "replaced: balance reads, POST /api/gift/create (a 503 with a typed sentence)" });
  await note(w, "53 the creation refused", undefined, Date.now() - pressed);
  await press(w, w.page.getByRole("button", { name: "Try again", exact: true }));
  await w.s.text(/is in Boo's name\./, 40_000);
  await settle(w);
  await w.s.shot(w.journey, "54 made from the account", "On the refusal: Try again", { real: "replaced: balance reads, POST /api/gift/create" });
  await note(w, "54 made from the account");
  await w.s.forgetKept();

  // The session closed by the server at the moment of creating.
  await w.s.goto("/");
  await w.page.getByRole("link", { name: "Home", exact: true }).first().waitFor({ state: "visible" });
  await card(w).getByLabel("Their first name").fill("Boo");
  await card(w).getByLabel("how much").fill("45");
  await settle(w);
  await openPaySheet(w);
  await w.page.unroute(new URL("/api/gift/create", w.s.base).href);
  await w.s.api("POST", "/api/gift/create", () => ({ status: 401, body: { error: "Account authentication is required", code: "SIGN_IN_REQUIRED" } }), "POST /api/gift/create (401, the session gone)");
  await press(w, sheet(w).getByRole("button", { name: /^Put .* in .* name$/ }));
  await w.s.text("Your payment arrived", 40_000);
  await shot(w, "55 the creation refused, session gone", "On the pay sheet: Put $45.00 in Boo's name, the server answering that nobody is signed in");
  await w.s.forgetKept();
}

// ---------------------------------------------------------------------------------------------------------------
// What the pay sheet says by country, and the wait on the rail that sells the chain's coin.

async function sceneCountry(w: Walk): Promise<void> {
  await w.s.reset();
  await w.s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine (no gift)");
  await freshDailyCard(w);
  await shot(w, "60 the card", `Not signed in, ${w.persona.says}: Offer a gift, Boo`, card(w));
  await openPaySheet(w);
  const rails = await w.page.evaluate(`fetch("/api/rails/where?locale=" + navigator.language).then((r) => r.json()).then((a) => JSON.stringify(a))`).catch(() => "unreadable");
  await note(w, "61 what the rails route answered", String(rails));
  await photographPaySheet(w, "61", `On the card, not signed in, ${w.persona.says}: Send`);

  // A gift under the card partners' smallest payment.
  await press(w, sheet(w).getByRole("button", { name: "Close" }));
  await card(w).getByLabel("how much").fill(w.persona.key === "sn" ? "2000" : "3");
  await settle(w);
  await openPaySheet(w);
  await shot(w, "62 pay sheet, a small gift", "The amount brought down to a few dollars, then Send");
  await sheetTo(w, "bottom");
  await shot(w, "62b pay sheet, a small gift, its end", "The same sheet, scrolled to its end");
  await press(w, sheet(w).getByRole("button", { name: "Close" }));

  if (w.persona.key === "us") return;

  // Signed in: the same sheet with an account, then the wait.
  await w.s.signIn();
  await settle(w);
  await card(w).getByLabel("Their first name").fill("Boo");
  await card(w).getByLabel("how much").fill(w.persona.key === "sn" ? "25000" : "45");
  await settle(w);
  await openPaySheet(w);
  await photographPaySheet(w, "63", `On the card, signed in with nothing in the account, ${w.persona.says}: Send`);
  const pay = sheet(w).getByRole("button", { name: /^(Pay \S+ by card|Pay)$/ });
  if ((await pay.count()) === 0) {
    await note(w, "64 no pay action on this sheet", "the card is not offered here");
    await press(w, sheet(w).getByRole("button", { name: "Close" }));
    return;
  }
  await press(w, pay.first());
  await w.page.waitForURL(/\/fund\?step=paying/, { timeout: 40_000 });
  await w.s.text(/Waiting for your/);
  await settle(w);
  await shot(w, "64 waiting for the payment", "On the pay sheet: Pay");

  if (w.persona.key !== "sn") {
    await w.s.forgetKept();
    return;
  }
  // The chain's coin arrived and the price cannot be had: every asking fails, for twelve seconds, and they are counted.
  let quotes = 0;
  let fails = true;
  await w.page.route(new URL("/api/fund/quote", w.s.base).href, async (route) => {
    quotes += 1;
    if (fails) return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "The exchange is not answering.", code: "QUOTE_UNAVAILABLE" }) });
    // Held: the screen stays on "getting it ready" and nothing is ever signed or sent.
  });
  w.s.holdings = { AUSD: 0n, USDC: 0n, MON: 2_000_000_000_000_000_000_000n };
  const seen = new Set<string>();
  const from = Date.now();
  while (Date.now() - from < 12_000) {
    const words = ((await w.page.evaluate(READ).catch(() => "")) as string).split("\n");
    for (const line of words) if (/price changed|Getting it ready|Waiting for your/.test(line)) seen.add(line);
    await w.page.waitForTimeout(150);
  }
  await note(w, "65 the price failing for twelve seconds", `${quotes} askings of the price in 12 seconds; the screen said in turn: ${[...seen].join(" / ")}`);
  await w.page.screenshot({ path: resolve(w.s.folder, `funder-${w.persona.key}--65-the-price-failing-as-the-screen-stands--${w.s.size.name}--${w.s.appearance.name}.png`) });
  fails = false;
  await w.s.text("Getting it ready, a few seconds.", 40_000);
  await w.page.waitForTimeout(900);
  await w.s.shot(w.journey, "66 the payment being made ready", "2,000 MON arrived (balance read replaced), the price asked and held unanswered", { real: "replaced: balance reads, POST /api/fund/quote (held unanswered, so nothing is signed or sent)" });
  await note(w, "66 the payment being made ready");
  await w.s.forgetKept();
}

// ---------------------------------------------------------------------------------------------------------------
// The shortest road, counted: every press and every field from the address to the wait.

async function sceneShortest(w: Walk): Promise<void> {
  await w.s.reset();
  await w.s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine (no gift)");
  await w.s.forgetKept();
  const gestures: string[] = [];
  const started = Date.now();
  await w.s.goto("/");
  await press(w, w.page.getByRole("link", { name: "Offer a gift" }).first());
  gestures.push("press: Offer a gift");
  await card(w).getByLabel("Their first name").fill("Boo");
  gestures.push("type: the first name");
  await settle(w);
  await press(w, card(w).locator("[data-card-action]"));
  gestures.push(`press: ${(await card(w).locator("[data-card-action]").innerText()).trim()}`);
  await sheet(w).waitFor({ state: "visible" });
  await w.page.waitForTimeout(1_200);
  const pay = sheet(w).getByRole("button", { name: /^(Pay \S+ by card|Pay)$/ }).first();
  gestures.push(`press: ${(await pay.innerText()).trim()}`);
  await pay.click();
  const refused = await w.page
    .getByText("That did not go through, and nothing was taken. Try again.")
    .first()
    .waitFor({ state: "visible", timeout: 70_000 })
    .then(() => true)
    .catch(() => false);
  if (refused) {
    gestures.push("(the device's own sheet for a passkey that does not exist, to wave away)");
    await sheet(w).getByRole("button", { name: /^Create (my|your) account$/ }).first().click();
    gestures.push("press: Create my account");
    gestures.push("(the device's own sheet to make the passkey)");
    await w.page.waitForTimeout(6_000);
    await settle(w);
    if (!/step=paying/.test(w.page.url())) {
      if ((await w.page.locator("dialog.sheet[open]").count()) === 0) {
        await press(w, card(w).locator("[data-card-action]"));
        gestures.push(`press: ${(await card(w).locator("[data-card-action]").innerText()).trim()} (again)`);
        await sheet(w).waitFor({ state: "visible" });
        await w.page.waitForTimeout(1_200);
      }
      const again = sheet(w).getByRole("button", { name: /^(Pay \S+ by card|Pay)$/ }).first();
      gestures.push(`press: ${(await again.innerText()).trim()} (again)`);
      await again.click();
    }
  }
  await w.page.waitForURL(/\/fund\?step=paying/, { timeout: 40_000 });
  await w.s.text(/Waiting for your/);
  gestures.push(`press: ${(await w.page.getByRole("link", { name: /^Open / }).first().innerText()).trim()} (the partner's page, not walked)`);
  await note(w, "70 the shortest road to the wait, counted", gestures.join(" > "), Date.now() - started);
  await w.s.forgetKept();
}

// ---------------------------------------------------------------------------------------------------------------
// The door in the header, pressed by somebody who has no account yet.

async function sceneDoor(w: Walk): Promise<void> {
  await w.s.reset();
  await w.s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine (no gift)");
  await w.s.goto("/");
  const pressed = Date.now();
  await w.page.getByRole("button", { name: /^Sign in$/ }).first().click();
  await w.page.getByRole("button", { name: /^Create (your|my) account$/ }).first().waitFor({ state: "visible", timeout: 70_000 });
  await settle(w);
  await w.s.shot(w.journey, "80 the door, no passkey on the device", "Not signed in, no passkey on this device: Sign in", {});
  const words = (await w.page.locator('[role="dialog"]').first().innerText().catch(() => "")) as string;
  await note(w, "80 the door, no passkey on the device", words.replace(/\s+/g, " "), Date.now() - pressed);
}

// ---------------------------------------------------------------------------------------------------------------
// A judge's code, typed where a code is typed at a checkout: the pay sheet of a signed-in account.

async function sceneJudge(w: Walk): Promise<void> {
  await w.s.reset();
  await w.s.api("GET", "/api/gifts/mine", () => ({ status: 200, body: { gifts: [] } }), "GET /api/gifts/mine (no gift)");
  let credited = false;
  await w.s.api(
    "GET",
    "/api/judge/credit",
    () => ({ status: 200, body: { open: true, credited, untouchedCredit: credited ? "25000000" : null } }),
    "GET /api/judge/credit (credits open)",
  );
  await w.s.api(
    "POST",
    "/api/judge/credit",
    () => {
      credited = true;
      w.s.holdings = { AUSD: 25_000_000n, USDC: 0n, MON: 0n };
      return { status: 200, body: { units: "25000000", hash: null } };
    },
    "POST /api/judge/credit (25 dollars credited, nothing sent)",
  );
  await w.s.forgetKept();
  await w.s.signIn();
  await settle(w);
  await card(w).getByLabel("Their first name").fill("Boo");
  await card(w).getByLabel("how much").fill("45");
  await settle(w);
  await openPaySheet(w);
  await sheetTo(w, "bottom");
  await shot(w, "90 pay sheet, have a code", "Signed in, nothing in the account, credits open: Send, the sheet scrolled to its end");
  // A fold since the mockup of 3 Oct 2026, not a button: its name is what is pressed.
  const have = sheet(w).locator("details[data-have-a-code] summary");
  await have.scrollIntoViewIfNeeded();
  await press(w, have);
  await sheet(w).getByLabel("Code").fill("JUDGE-CODE");
  await press(w, sheet(w).getByRole("button", { name: "Use the code" }));
  await w.s.text(/from your judge credit is in your account/, 30_000);
  await w.page.waitForTimeout(1_500);
  await settle(w);
  await sheetTo(w, "top");
  await shot(w, "91 pay sheet, the credit given", "On the sheet: Have a code?, a code, Use the code");
  await sheetTo(w, "bottom");
  await shot(w, "91b pay sheet, the credit given, its end", "The same sheet, scrolled to its end");
  await w.s.forgetKept();
}

const SCENES: ReadonlyArray<{ name: string; personas: readonly string[]; combos?: readonly string[]; run: (w: Walk) => Promise<void> }> = [
  { name: "card", personas: ["fr"], run: sceneCard },
  { name: "unreadable", personas: ["fr"], run: sceneUnreadable },
  { name: "amount", personas: ["fr"], run: sceneAmount },
  { name: "first-payment", personas: ["fr"], run: sceneFirstPayment },
  { name: "from-account", personas: ["fr"], run: sceneFromAccount },
  // The country changes words, not layout: day only, at both sizes.
  { name: "country", personas: ["us", "sn", "ma"], combos: ["390x844-day", "1440x900-day"], run: sceneCountry },
  { name: "shortest", personas: ["us"], combos: ["390x844-day"], run: sceneShortest },
  { name: "door", personas: ["fr"], combos: ["390x844-day", "1440x900-day"], run: sceneDoor },
  { name: "judge", personas: ["us"], combos: ["390x844-day", "1440x900-day"], run: sceneJudge },
];

async function main(): Promise<void> {
  const base = (process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "http://localhost:3301").replace(/\/+$/, "");
  if (new URL(base).hostname !== "localhost") throw new Error("run against http://localhost:<port>, never an IP address and never the real site");
  const only = process.argv.find((argument) => argument.startsWith("--only="))?.slice("--only=".length);
  const pick = process.argv.find((argument) => argument.startsWith("--scene="))?.slice("--scene=".length);
  const personaPick = process.argv.find((argument) => argument.startsWith("--persona="))?.slice("--persona=".length);
  const folder = resolve(process.argv.find((argument) => argument.startsWith("--out="))?.slice("--out=".length) ?? "review-captures/funder-walk");
  mkdirSync(folder, { recursive: true });

  const browser = await chromium.launch();
  const rows: Array<Record<string, string | undefined>> = [];
  const misses: string[] = [];
  try {
    for (const size of SIZES) {
      for (const appearance of APPEARANCES) {
        const combo = `${size.name}-${appearance.name}`;
        if (only && only !== combo) continue;
        for (const scene of SCENES) {
          if (pick && !scene.name.includes(pick)) continue;
          if (scene.combos && !scene.combos.includes(combo)) continue;
          for (const key of scene.personas) {
            if (personaPick && personaPick !== key) continue;
            const w = await openWalk(browser, base, size, appearance, PERSONAS[key], folder);
            console.log(`\n${combo} / ${scene.name} / ${key}`);
            try {
              await scene.run(w);
            } catch (error) {
              const message = error instanceof Error ? error.message.split("\n").slice(0, 3).join(" ") : String(error);
              const where = w.s.lastShot ? `after "${w.s.lastShot}"` : "before its first capture";
              await w.s.miss(w.journey, `${scene.name} ${where}`, message);
              await note(w, `MISSED ${scene.name} ${where}`, message);
              misses.push(`${combo} / ${scene.name} / ${key}: ${where}: ${message}`);
            }
            for (const row of w.s.rows) rows.push({ scene: scene.name, persona: key, ...row });
            await w.context.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  // The process id is part of the name: two runs that end in the same second would otherwise write the same file.
  const stamp = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${process.pid}`;
  writeFileSync(resolve(folder, `walk-${stamp}.json`), `${JSON.stringify({ base, taken: new Date().toISOString(), outside: [...OUTSIDE].sort(), misses, notes: NOTES, rows }, null, 1)}\n`);
  const lines = [
    "# The funder's journey, walked",
    "",
    `Taken ${new Date().toISOString()} against ${base}, a local production build. Virtual passkey with PRF; nothing sent to the chain; viky.cash never called.`,
    "",
    "| scene | persona | state | size | appearance | file | reached by | replaced |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map((row) => `| ${row.scene} | ${row.persona} | ${row.state} | ${row.size} | ${row.appearance} | ${row.file} | ${String(row.path).replace(/\|/g, "\\|")} | ${String(row.how).replace(/\|/g, "\\|")} |`),
    "",
    "## Not captured",
    "",
    ...(misses.length ? misses.map((miss) => `- ${miss}`) : ["- Nothing missed."]),
    "",
  ];
  writeFileSync(resolve(folder, `walk-${stamp}.md`), lines.join("\n"));
  console.log(`\n${rows.length} captures, ${misses.length} missed. Folder: ${folder}`);
}

main().catch((error) => {
  console.error("AUDIT_FUNDER_WALK_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
