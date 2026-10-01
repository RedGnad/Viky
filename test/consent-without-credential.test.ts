import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test } from "node:test";
import * as mera from "../src/account/mera";
import * as consent from "../src/client/consent";
import { consentKey, CONSENT_SALT_HEX } from "../src/client/consent-key";

/**
 * The yes and the stop on a page that holds no key any more (the audit of 1 Oct 2026, its five scenarios).
 *
 * Signed in by the server's cookie but with nothing in storage (the app on an iPhone's home screen, storage cleared,
 * a browser that refuses to write), the consent path asked a passkey it could not name, so no prompt ever opened and
 * every yes and every stop failed with PASSKEY_CANCELLED. A fake browser, a fake passkey and a fake server: no
 * network, no key, no chain. The passkey's PRF is sha256(secret || salt), as an authenticator gives per salt.
 */
const store = new Map<string, string>();
let storageBlocked = false;
let secondOutput = true;
let secret = 7;
/** Who the server's cookie names; null is a browser the server does not know. */
let cookieAccount: string | null = null;
type Ceremony = { allow: boolean; salts: string[] };
const ceremonies: Ceremony[] = [];
const posts: Array<{ path: string; body: { kind: string; publicKey: string } }> = [];

const hex = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("hex");
async function prf(salt: BufferSource): Promise<ArrayBuffer> {
  const view = salt instanceof ArrayBuffer ? new Uint8Array(salt) : new Uint8Array(salt.buffer, salt.byteOffset, salt.byteLength);
  const joined = new Uint8Array(64);
  joined.set(new Uint8Array(32).fill(secret), 0);
  joined.set(view, 32);
  return webcrypto.subtle.digest("SHA-256", joined);
}

const browser = globalThis as unknown as Record<string, unknown>;
browser.window = {
  navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1" },
  PublicKeyCredential: function () {},
  location: { hostname: "viky.cash" },
  localStorage: {
    getItem: (key: string) => (storageBlocked ? null : (store.get(key) ?? null)),
    setItem: (key: string, value: string) => {
      if (storageBlocked) throw new Error("storage blocked");
      store.set(key, value);
    },
    removeItem: (key: string) => void store.delete(key),
  },
};
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    credentials: {
      get: async ({ publicKey }: { publicKey: { allowCredentials?: unknown[]; extensions: { prf: { eval: { first: BufferSource; second?: BufferSource } } } } }) => {
        const asked = publicKey.extensions.prf.eval;
        ceremonies.push({ allow: Array.isArray(publicKey.allowCredentials), salts: [hex(asked.first as ArrayBuffer), ...(asked.second ? [hex(asked.second as ArrayBuffer)] : [])] });
        const first = await prf(asked.first);
        const second = asked.second && secondOutput ? await prf(asked.second) : undefined;
        return { type: "public-key", rawId: new Uint8Array([1, 2, 3, secret]).buffer, response: {}, getClientExtensionResults: () => ({ prf: { results: { first, ...(second ? { second } : {}) } } }) };
      },
    },
  },
});
// The server as the page sees it: the cookie names the account, the gift's consent texts are served, a POST is kept.
browser.fetch = async (path: string, init?: { method?: string; body?: string }) => {
  if (String(path).endsWith("/api/account/session")) {
    return cookieAccount ? new Response(JSON.stringify({ account: cookieAccount, expiresAt: "" }), { status: 200 }) : new Response(JSON.stringify({ error: "Sign in first" }), { status: 401 });
  }
  if (init?.method === "POST") {
    const body = JSON.parse(init.body ?? "{}") as { kind: string; publicKey: string };
    posts.push({ path, body });
    return new Response(JSON.stringify({ state: { kind: body.kind, signedAt: new Date(0).toISOString() } }), { status: 200 });
  }
  return new Response(JSON.stringify({ giftId: "7", state: null, reading: "no_agreement", opened: true, finished: false, terms: { what: "your streak" }, until: "", texts: { yes: "YES TEXT", stop: "STOP TEXT" } }), { status: 200 });
};

const outcome = (run: () => Promise<unknown>) => run().then(() => "OK", (error: { code?: string }) => error?.code ?? String(error));
/** A reload: the keys leave memory, the page forgets nothing else. */
const reload = () => {
  mera.signOut();
  ceremonies.length = 0;
  posts.length = 0;
};
/** A reload that finds nothing kept: the app on the home screen, or storage cleared. The cookie stays. */
const reloadWithNothingKept = () => {
  mera.forgetCredential();
  store.clear();
  ceremonies.length = 0;
  posts.length = 0;
};

let consentPublicKey = "";

test("signing in asks both salts in one prompt, and that is the account the cookie names from here on", async () => {
  cookieAccount = await mera.signIn();
  assert.equal(ceremonies.length, 1);
  assert.equal(ceremonies[0].salts.length, 2);
  assert.equal(ceremonies[0].salts[1], CONSENT_SALT_HEX);
  assert.ok(consentKey(), "the consent key is held after sign-in");
  consentPublicKey = hex(consentKey()!.publicKey);
});

test("1. the cookie alone, nothing kept: the yes and the stop open one prompt and are signed", async () => {
  reloadWithNothingKept();
  assert.equal(await outcome(() => consent.signConsent("7", "stop")), "OK");
  assert.equal(ceremonies.length, 1, "one prompt");
  assert.equal(ceremonies[0].allow, false, "the passkey is the person's to choose, since none is remembered");
  assert.equal(ceremonies[0].salts.length, 2, "both salts, as at any sign-in");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.publicKey.replace(/^0x/, ""), consentPublicKey, "the same passkey makes the same consent key");
  // The key is held now: the yes that follows asks nothing more.
  assert.equal(await outcome(() => consent.agreeFirst("7")), "OK");
  assert.equal(ceremonies.length, 1);
});

test("1b. a passkey of another account signs nothing, opens nothing, and is not remembered", async () => {
  reloadWithNothingKept();
  secret = 9;
  assert.equal(await outcome(() => consent.signConsent("7", "stop")), "OTHER_ACCOUNT");
  assert.equal(ceremonies.length, 1);
  assert.equal(posts.length, 0, "nothing reaches the server");
  assert.equal(consentKey(), null, "the other passkey's consent key is dropped");
  assert.equal(mera.currentAddress(), undefined, "and its account is never opened");
  assert.equal(mera.storedCredential(), undefined);
  secret = 7;
  // A cookie that names nobody opens nothing either.
  const named = cookieAccount;
  cookieAccount = null;
  ceremonies.length = 0;
  assert.equal(await outcome(() => consent.signConsent("7", "stop")), "SESSION_ENDED");
  assert.equal(posts.length, 0);
  assert.equal(mera.currentAddress(), undefined);
  cookieAccount = named;
});

test("2. a money gesture first opens the account and the consent key with it: no further prompt", async () => {
  reloadWithNothingKept();
  await mera.signIn();
  assert.equal(ceremonies[0].allow, false);
  assert.equal(hex(consentKey()!.publicKey), consentPublicKey);
  assert.equal(await outcome(() => consent.signConsent("7", "stop")), "OK");
  assert.equal(ceremonies.length, 1);
  assert.equal(posts.length, 1);
});

test("3. an ordinary reload: one prompt for the consent and for the take that follows, on the remembered passkey", async () => {
  reload();
  assert.ok(mera.storedCredential());
  assert.equal(await outcome(() => consent.signConsent("7", "yes")), "OK");
  assert.equal(ceremonies.length, 1);
  assert.equal(ceremonies[0].allow, true, "restricted to the passkey this device remembers");
  assert.equal(ceremonies[0].salts.length, 2);
  assert.equal(mera.currentAddress()?.toLowerCase(), cookieAccount?.toLowerCase(), "the account is open, so a take asks nothing more");
});

test("4. storage that refuses writes: after the idle sign-out, the page still knows its passkey", async () => {
  reloadWithNothingKept();
  storageBlocked = true;
  await mera.signIn();
  assert.equal(await outcome(() => consent.signConsent("7", "stop")), "OK");
  mera.signOut(); // what the idle timer does
  ceremonies.length = 0;
  assert.equal(await outcome(() => consent.signConsent("7", "stop")), "OK");
  assert.equal(ceremonies.length, 1);
  assert.equal(ceremonies[0].allow, true, "the passkey is remembered in memory where storage would not keep it");
});

test("5. a passkey that gives no second output, with storage refusing writes: asked once more, for the consent salt alone", async () => {
  reloadWithNothingKept();
  storageBlocked = true;
  secondOutput = false;
  assert.equal(await outcome(() => consent.signConsent("7", "stop")), "OK");
  assert.equal(ceremonies.length, 2);
  assert.equal(ceremonies[0].salts.length, 2, "the sign-in asks both");
  assert.deepEqual(ceremonies[1], { allow: true, salts: [CONSENT_SALT_HEX] }, "then the consent salt alone, on the same passkey");
  assert.equal(posts[0].body.publicKey.replace(/^0x/, ""), consentPublicKey);
  storageBlocked = false;
  secondOutput = true;
  mera.signOut();
});
