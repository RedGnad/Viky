// The account's door (the founder, 1 Oct 2026). A first outside tester was stopped on an iPhone, the gift's link
// opened from an Instagram message: a grey button and "This computer has no Face ID". Where the page is comes first,
// what the device says of itself never closes the button, and the same link, key included, is what leaves the app,
// always by a link the person presses. Nothing here is proven on a real phone: these hold what the code decides.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { embeddedIn, handsetOf, iosVersionOf, passkeyEnvironmentProblem } from "../src/account/errors";
import { doorOf, ownBrowserOf, wayOut } from "../src/account/passkey-support";
import { ACCOUNT_DOOR } from "../src/sentences";

const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const SAFARI_IPHONE_17 = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1";
const CHROME_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1";
const INSTAGRAM_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 Instagram 398.0.0.20.80 (iPhone12,5; iOS 18_6; fr_FR; fr; scale=3.00; 1242x2688; 780000000)";
const FACEBOOK_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.0;FBDV/iPhone12,5]";
const WHATSAPP_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WAiOS/2.25.20";
const LINKEDIN_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.31.1234";
const X_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/11.20";
/** An iPhone page that is no browser and names no app: another app's page, or Viky's own app on the home screen. */
const BARE_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const INSTAGRAM_ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 Instagram 398.0.0.0 Android";
const SOME_APP_ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36";
const MI_BROWSER = "Mozilla/5.0 (Linux; U; Android 14; fr-fr; 23090RA98G Build/UKQ1.230917.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.5993.48 Mobile Safari/537.36 XiaoMi/MiuiBrowser/18.3.20";
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const GIFT = "https://viky.cash/g/1000042?t=AbCdEfGhIjKlMnOpQrStUv";

test("a page inside another app is known by a general test, and by name where the app has one", () => {
  assert.deepEqual(embeddedIn(INSTAGRAM_IPHONE), { key: "instagram", name: "Instagram" });
  assert.equal(embeddedIn(WHATSAPP_IPHONE)?.key, "whatsapp");
  assert.equal(embeddedIn(LINKEDIN_IPHONE)?.key, "linkedin");
  assert.equal(embeddedIn(X_IPHONE)?.key, "twitter");
  assert.equal(embeddedIn(INSTAGRAM_ANDROID)?.key, "instagram");
  assert.deepEqual(embeddedIn(SOME_APP_ANDROID), { key: "app", name: null }, "any page an Android app draws");
  for (const browser of [SAFARI_IPHONE, CHROME_IPHONE, CHROME_ANDROID, CHROME_MAC, MI_BROWSER]) assert.equal(embeddedIn(browser), null, browser);
  assert.equal(handsetOf(CHROME_MAC), "other");
  // The library is in the dependencies because it is used, under a licence read in its own file (MIT).
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };
  assert.equal(manifest.dependencies["inapp-spy"], "5.0.10");
  assert.match(readFileSync("src/account/errors.ts", "utf8"), /import InAppSpy from "inapp-spy";/);
});

test("Viky's own app on an iPhone's home screen is no other app's page", () => {
  // It names itself exactly as an unnamed app's page does, so the server, which cannot tell, decides nothing.
  assert.equal(embeddedIn(BARE_IPHONE), null);
  assert.equal(embeddedIn(BARE_IPHONE, null), null);
  assert.equal(embeddedIn(BARE_IPHONE, true), null, "installed: an account is made there");
  assert.deepEqual(embeddedIn(BARE_IPHONE, false), { key: "app", name: null }, "not installed: another app's page");
  assert.equal(passkeyEnvironmentProblem(BARE_IPHONE, true, true), undefined);
  assert.equal(passkeyEnvironmentProblem(BARE_IPHONE, true, false), "UNSUPPORTED_BROWSER");
  // A named app is a named app whatever the page says of itself.
  assert.equal(embeddedIn(INSTAGRAM_IPHONE, true)?.key, "instagram");
  assert.match(readFileSync("src/account/door.tsx", "utf8"), /readDoor\(installedOnTheHomeScreen\(\)\)/);
  assert.match(readFileSync("src/account/mera.ts", "utf8"), /passkeyEnvironmentProblem\(window\.navigator\.userAgent, typeof window\.PublicKeyCredential !== "undefined", installedOnTheHomeScreen\(\)\)/);
});

test("inside another app's page the account is made elsewhere, whatever the device says of itself", () => {
  assert.deepEqual(doorOf({ userAgent: INSTAGRAM_IPHONE, hasWebAuthn: true, platformAuthenticator: true }), { kind: "elsewhere", handset: "iphone", app: { key: "instagram", name: "Instagram" } });
  assert.deepEqual(doorOf({ userAgent: FACEBOOK_IPHONE, hasWebAuthn: true, platformAuthenticator: false }).kind, "elsewhere");
  assert.deepEqual(doorOf({ userAgent: INSTAGRAM_ANDROID, hasWebAuthn: false, platformAuthenticator: null }), { kind: "elsewhere", handset: "android", app: { key: "instagram", name: "Instagram" } });
  // A browser that never answers the prompt is not an app, and is sent to Chrome by name.
  assert.deepEqual(doorOf({ userAgent: MI_BROWSER, hasWebAuthn: true, platformAuthenticator: true }), { kind: "elsewhere", handset: "android", app: null });
  assert.equal(doorOf({ userAgent: BARE_IPHONE, hasWebAuthn: true, platformAuthenticator: true, standalone: false }).kind, "elsewhere");
  assert.equal(doorOf({ userAgent: BARE_IPHONE, hasWebAuthn: true, platformAuthenticator: true, standalone: true }).kind, "ready");
});

test("an iPhone below iOS 18 is told to update, before anything else is read", () => {
  assert.equal(iosVersionOf(SAFARI_IPHONE_17), 17);
  assert.equal(iosVersionOf(SAFARI_IPHONE), 18);
  assert.equal(iosVersionOf(CHROME_ANDROID), null);
  assert.equal(iosVersionOf(CHROME_MAC), null);
  assert.deepEqual(doorOf({ userAgent: SAFARI_IPHONE_17, hasWebAuthn: true, platformAuthenticator: true }), { kind: "outdated" });
  assert.deepEqual(doorOf({ userAgent: INSTAGRAM_IPHONE.replace(/18_6/g, "16_7"), hasWebAuthn: true, platformAuthenticator: true }), { kind: "outdated" }, "leaving the app would not help");
  assert.equal(doorOf({ userAgent: SAFARI_IPHONE, hasWebAuthn: true, platformAuthenticator: true }).kind, "ready", "iOS 18 makes an account");
  assert.equal(ACCOUNT_DOOR.outdated, "Update your iPhone to create your account. Viky needs iOS 18 or later.");
});

test("a device that says no is not closed: the button stays, and the gesture decides", () => {
  // iOS 26.2 answers no in every browser but Safari, and in Safari while no password manager is on.
  assert.deepEqual(doorOf({ userAgent: CHROME_IPHONE, hasWebAuthn: true, platformAuthenticator: false }), { kind: "unsure", handset: "iphone" });
  assert.deepEqual(doorOf({ userAgent: SAFARI_IPHONE, hasWebAuthn: true, platformAuthenticator: null }), { kind: "unsure", handset: "iphone" });
  assert.deepEqual(doorOf({ userAgent: CHROME_ANDROID, hasWebAuthn: true, platformAuthenticator: false }), { kind: "unsure", handset: "android" });
  assert.deepEqual(doorOf({ userAgent: CHROME_MAC, hasWebAuthn: true, platformAuthenticator: false }), { kind: "unsure", handset: "other" });
  assert.deepEqual(doorOf({ userAgent: SAFARI_IPHONE, hasWebAuthn: true, platformAuthenticator: true }), { kind: "ready" });
  const panel = readFileSync("app/components/AccountPanel.tsx", "utf8");
  assert.match(panel, /<button type="submit" disabled=\{busy\} className=\{returning \? SECONDARY_BUTTON : PRIMARY_BUTTON\}>/, "nothing but a ceremony under way greys the button");
  assert.doesNotMatch(panel, /isUserVerifyingPlatformAuthenticatorAvailable|cannot !== null/);
});

test("where the page is comes before what the device says, and the newer question before the older", () => {
  const support = readFileSync("src/account/passkey-support.ts", "utf8");
  const read = support.slice(support.indexOf("export async function readDoor"));
  assert.ok(read.indexOf('before.kind === "elsewhere"') < read.indexOf("await platformAuthenticator()"), "an app's page is settled without asking the device");
  const asked = support.slice(support.indexOf("async function platformAuthenticator"), support.indexOf("export async function readDoor"));
  assert.ok(asked.indexOf("getClientCapabilities") < asked.indexOf("isUserVerifyingPlatformAuthenticatorAvailable"));
  // Known from the first image: the server is told which browser asks.
  assert.match(readFileSync("app/layout.tsx", "utf8"), /<DoorProvider userAgent=\{userAgent\} origin=\{origin\}>/);
});

test("the way out reopens the same link, its key included, by the address each app is reported to follow", () => {
  const instagram = wayOut(GIFT, "iphone", embeddedIn(INSTAGRAM_IPHONE));
  assert.deepEqual(instagram, { browser: "safari", href: `instagram://extbrowser/?url=${encodeURIComponent(GIFT)}` });
  assert.ok(decodeURIComponent(instagram!.href).endsWith("?t=AbCdEfGhIjKlMnOpQrStUv"));
  assert.deepEqual(wayOut(GIFT, "iphone", embeddedIn(WHATSAPP_IPHONE)), { browser: "safari", href: `x-safari-${GIFT}` });
  // Android, inside an app: the phone's own browser, no application named, as reported working.
  assert.deepEqual(wayOut(GIFT, "android", embeddedIn(INSTAGRAM_ANDROID)), { browser: "browser", href: "intent://viky.cash/g/1000042?t=AbCdEfGhIjKlMnOpQrStUv#Intent;scheme=https;end" });
  // Android, a browser that cannot: Chrome by name, since the phone's own browser may be that very one.
  assert.deepEqual(wayOut(GIFT, "android", null), { browser: "chrome", href: "intent://viky.cash/g/1000042?t=AbCdEfGhIjKlMnOpQrStUv#Intent;scheme=https;package=com.android.chrome;end" });
  assert.equal(wayOut(GIFT, "other", null), null, "a computer has no such address: the link is copied");
  assert.equal(wayOut("javascript:alert(1)", "android", null), null);
});

test("always a link the person presses: the page never leaves by itself, and says where the menu is if nothing opened", () => {
  const door = readFileSync("app/kit/AccountDoor.tsx", "utf8");
  assert.match(door, /<a\s+href=\{way\.href\}/, "a real link");
  assert.doesNotMatch(door, /location\.(href|assign|replace)|httpEquiv/, "no jump made by the page");
  assert.doesNotMatch(readFileSync("app/g/[id]/page.tsx", "utf8"), /httpEquiv|refresh/);
  assert.match(door, /document\.visibilityState === "visible"\) setStayed\(true\)/, "still in front a moment after the press: the menu is said");
  assert.match(ACCOUNT_DOOR.stayed.iphone, /Press ⋯ at the top/);
  assert.match(ACCOUNT_DOOR.stayed.android, /Press ⋮ at the top/);
  // The same door before anything is filled in: at the top of Home, and on the page that pays for a gift.
  assert.match(readFileSync("app/kit/Home.tsx", "utf8"), /<SideCrowd \/>\s*\{\/\*[^]*?\*\/\}\s*<DoorNotice \/>/);
  assert.match(readFileSync("app/components/PayGift.tsx", "utf8"), /<DoorNotice \/>/);
  // Nothing is claimed to the judges before testers have tried it on real phones.
  for (const page of ["app/judges/page.tsx"]) assert.doesNotMatch(readFileSync(page, "utf8"), /Open in Safari|another app|inapp/i);
});

test("never 'computer' on a phone, never the site's name in place of the gift's link", () => {
  const W = ACCOUNT_DOOR;
  const instagram = { key: "instagram", name: "Instagram" };
  const phone = [W.insideApp(instagram), W.insideApp({ key: "app", name: null }), W.browserCannot, W.openIn("safari"), W.openIn("browser"), W.stayed.iphone, W.stayed.android, W.copy(true), W.copied("safari"), W.copyRefused, W.ifItKeepsFailing.iphone(true), W.ifItKeepsFailing.android(true), W.how, W.outdated];
  for (const sentence of phone) assert.doesNotMatch(sentence, /computer/i, sentence);
  const all = [...phone, W.computer(true), W.computer(false), W.openItIn(true), W.copy(false), W.samePasskey, W.another];
  for (const sentence of all) assert.doesNotMatch(sentence, /viky\.cash/i, sentence);
  // The box's small line says why here cannot, and never that an account "cannot be made" (the founder, 1 Oct 2026).
  assert.equal(W.insideApp(instagram), "Instagram's own window cannot create an account.");
  assert.equal(W.insideApp({ key: "twitter", name: "Twitter" }), "X's own window cannot create an account.");
  assert.equal(W.insideApp({ key: "gsa", name: "Google" }), "The Google app's own window cannot create an account.");
  assert.equal(W.insideApp({ key: "app", name: null }), "This app's own window cannot create an account.");
  assert.equal(W.browserCannot, "This browser cannot create an account.");
  // The line above it on a gift carries the name the button carries.
  assert.equal(W.continueIn("safari"), "To open it, continue in Safari. Nothing to install.");
  assert.equal(W.continueIn("browser"), "To open it, continue in your browser. Nothing to install.");
  assert.equal(W.continueIn("chrome"), "To open it, continue in Chrome. Nothing to install.");
  assert.equal(W.continueIn(null), "To open it, continue in Chrome or Safari. Nothing to install.");
  for (const [handset, app] of [["iphone", instagram], ["iphone", null], ["android", instagram], ["android", null], ["other", null]] as const) {
    assert.equal(ownBrowserOf(handset, app), wayOut("https://viky.cash/g/7?t=k", handset, app)?.browser ?? null, `${handset}: the line and the button name one browser`);
  }
  const gift = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(gift, /\{door\.kind === "elsewhere" \? ACCOUNT_DOOR\.continueIn\(ownBrowserOf\(door\.handset, door\.app\)\) : W\.createToOpen\}/, "in that state only");
  assert.equal(W.copy(true), "Copy this gift's link");
  assert.equal(W.openIn("browser"), "Open in your browser");
  assert.match(W.computer(true), /open this gift's link on your phone/);
});
