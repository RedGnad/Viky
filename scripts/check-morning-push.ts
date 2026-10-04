import "../src/load-env";
import { createRequire } from "node:module";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { newClaimToken, saveGift } from "../src/gift-store";
import { tellAboutDays } from "../src/morning-send";
import { liveTellingDeps } from "../src/morning-send-live";
import { isSubscribed, subscriptionsForGift } from "../src/push-store";

/**
 * The morning message against a real push service, end to end (N1).
 *
 * Run it against a built app on this machine, pointed at the test database:
 *   `pnpm build && (PORT=3100 pnpm start &)` then `pnpm check:morning-push`.
 *
 * The browser is Firefox because Chrome refuses to register with its push service under automation ("Registration
 * failed - permission denied", with the notification permission granted, in Chrome and in Chromium alike). Firefox's
 * service is the standard one, reached over the network here, so what this proves is the real thing: the route the
 * button calls, the row, the keeper's own sending, the encryption, and the service worker that draws what a person
 * wakes up to. It writes one gift record and one subscription; the guard keeps it off the production database.
 */

const require = createRequire(import.meta.url);
const { firefox } = require("@playwright/test") as typeof import("@playwright/test");
const { privateKeyToAccount } = require("viem/accounts") as typeof import("viem/accounts");

const BASE = process.env.VERIFY_BASE ?? "http://localhost:3100";
const GIFT = process.env.PUSH_GIFT_ID ?? "9100";
const DAY = Number(process.env.PUSH_DAY ?? 20_709);
const FUNDER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

const checks: { what: string; ok: boolean; detail?: string }[] = [];
function record(what: string, ok: boolean, detail?: string) {
  checks.push({ what, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? ` (${detail})` : ""}`);
}

const PREFS = {
  "dom.push.enabled": true,
  "dom.push.connection.enabled": true,
  "dom.push.serverURL": "wss://push.services.mozilla.com/",
  "dom.webnotifications.enabled": true,
  "permissions.default.desktop-notification": 1,
  "dom.push.testing.ignorePermission": true,
};

function subscribeScript(key: string, giftId: string): string {
  return `(async () => {
    const padded = ("${key}" + "=".repeat((4 - ("${key}".length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(padded);
    const out = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    const registration = await navigator.serviceWorker.ready;
    let subscription = null;
    for (let attempt = 0; attempt < 4 && !subscription; attempt += 1) {
      try { subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: out }); }
      catch (error) { if (attempt === 3) return { failed: String(error && error.message || error) }; await new Promise((r) => setTimeout(r, 3000)); }
    }
    const json = subscription.toJSON();
    const answer = await fetch("/api/gift/${giftId}/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "on", subscription: { endpoint: json.endpoint, keys: json.keys } }),
    });
    return { status: answer.status, body: await answer.text(), endpoint: json.endpoint };
  })()`;
}

async function main() {
  const key = String(process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY);
  // A session signed the way the sign-in route signs one: Firefox has no virtual passkey, and the passkey is not
  // what is being checked here.
  const challenge = createAccountAuthChallenge({ account: FUNDER.address, origin: BASE, nonce: "0123456789abcdef0123456789abcdef" });
  const signature = await FUNDER.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: BASE });

  await saveGift({
    giftId: GIFT,
    funder: FUNDER.address,
    contactHash: `0x${"51".repeat(32)}`,
    goalType: 1,
    dailyTarget: 10,
    durationDays: 7,
    amount: 25_000_000n,
    escrow: "0x00000000000000000000000000000000000000e1",
    claimToken: newClaimToken(),
    createdTx: `0x${"90".repeat(32)}`,
    recipientName: "Léa",
    funderName: "Mom",
  });
  record("a gift is recorded on the test database", true, `gift ${GIFT}, funder ${FUNDER.address.slice(0, 10)}`);

  const browser = await firefox.launch({ headless: true, firefoxUserPrefs: PREFS });
  const context = await browser.newContext();
  await context.grantPermissions(["notifications"], { origin: BASE });
  await context.addCookies([{ name: ACCOUNT_AUTH_COOKIE_NAME, value: session.token, domain: "localhost", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

  const subscribed = (await page.evaluate(subscribeScript(key, GIFT))) as { status?: number; body?: string; endpoint?: string; failed?: string };
  record("the browser reached its push service and subscribed", !subscribed.failed && Boolean(subscribed.endpoint), subscribed.failed ?? new URL(String(subscribed.endpoint)).host);
  record("the route took it", subscribed.status === 200 && Boolean(subscribed.body?.includes('"on":true')), `${subscribed.status} ${subscribed.body}`);
  record("the row is in the database", await isSubscribed(String(subscribed.endpoint), GIFT));

  const sent = await tellAboutDays(GIFT, [{ day: DAY, outcome: "earned" }], liveTellingDeps());
  record("the keeper sent the morning message", sent === 1, `${sent} sent`);

  const shown = await page
    .waitForFunction(
      `(async () => {
        const registration = await navigator.serviceWorker.ready;
        const notifications = await registration.getNotifications();
        return notifications.length > 0 ? notifications.map((entry) => ({ title: entry.title, body: entry.body })) : false;
      })()`,
      undefined,
      { timeout: 90_000, polling: 1_000 },
    )
    .then(async (handle) => (await handle.jsonValue()) as { title: string; body: string }[])
    .catch(() => []);
  record("the phone shows one notification", shown.length === 1, JSON.stringify(shown));
  record("it says what yesterday came to, in the funder's words", shown[0]?.body === "Léa did yesterday's lesson. $3.57 is theirs.", shown[0]?.body ?? "nothing");
  record("its title names nobody", shown[0]?.title === "Viky", shown[0]?.title ?? "nothing");

  record("the same day is not sent twice", (await tellAboutDays(GIFT, [{ day: DAY, outcome: "earned" }], liveTellingDeps())) === 0);

  await page.evaluate(`(async () => {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();
  })()`);
  const afterDead = await tellAboutDays(GIFT, [{ day: DAY + 1, outcome: "returned" }], liveTellingDeps());
  const left = await subscriptionsForGift(GIFT);
  record("a subscription the service refuses is deleted at once", afterDead === 0 && left.length === 0, `${afterDead} sent, ${left.length} left`);

  await context.close();
  await browser.close();
  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length} checks, ${failed.length} failed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
