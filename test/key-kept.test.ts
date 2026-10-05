// Where an account's key is kept, and the door of a device that knows no account (the founder, 5 Oct 2026).
//
// A tester with no account pressed "Sign in", on an iPhone and then on a computer, and was offered a QR code,
// Bluetooth and a security key: what a browser shows when it is asked for a passkey it does not hold. And an account
// made on a computer may live in that computer alone, which the person learns the day they look for it on a phone.
// A fake browser and a fake passkey: no network, no key, no chain.

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { KEY_STORES, keyKeptOf, readRecord, recordOf, storeIdOf } from "../src/account/key-kept";
import * as mera from "../src/account/mera";
import { ACCOUNT_DOOR, DOOR, HELP } from "../src/sentences";

const WINDOWS_HELLO = "08987058-cadc-4b81-b6e1-30de50dcbe96";
const GOOGLE = "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4";
const UNLISTED = "11111111-2222-3333-4444-555555555555";

/** Authenticator data as an authenticator writes it: 32 bytes of hash, the flags, a counter, then the store's identifier at creation. */
function authenticatorData(input: { follows: boolean; storeId?: string | null }): Uint8Array {
  const withStore = input.storeId !== undefined && input.storeId !== null;
  const data = new Uint8Array(withStore ? 37 + 16 + 2 + 4 : 37);
  // User present, user verified, then backup eligibility (bit 3) and attested credential data (bit 6).
  data[32] = 0x01 | 0x04 | (input.follows ? 0x08 : 0) | (withStore ? 0x40 : 0);
  if (withStore) data.set(Buffer.from(input.storeId!.replace(/-/g, ""), "hex"), 37);
  return data;
}

test("the two facts are read where the specification puts them: bit 3 of the flags, and the store's identifier at creation", () => {
  assert.deepEqual(keyKeptOf({ authenticatorData: authenticatorData({ follows: false, storeId: WINDOWS_HELLO }), attachment: "platform" }), { follows: false, where: "Windows Hello", apart: false });
  assert.deepEqual(keyKeptOf({ authenticatorData: authenticatorData({ follows: true, storeId: GOOGLE }), attachment: "platform" }), { follows: true, where: "Google Password Manager", apart: false });
  // A store the public list does not name is not named, and what it says of the key still stands.
  assert.deepEqual(keyKeptOf({ authenticatorData: authenticatorData({ follows: false, storeId: UNLISTED }), attachment: "platform" }), { follows: false, where: null, apart: false });
  // A sign-in carries no identifier, and sixteen zeros name nothing.
  assert.deepEqual(keyKeptOf({ authenticatorData: authenticatorData({ follows: true }), attachment: null }), { follows: true, where: null, apart: false });
  assert.equal(storeIdOf(authenticatorData({ follows: true, storeId: "00000000-0000-0000-0000-000000000000" })), null);
  assert.equal(storeIdOf(authenticatorData({ follows: false, storeId: WINDOWS_HELLO })), WINDOWS_HELLO);
  // A security key, or a phone asked through a code, is apart from this device.
  assert.equal(keyKeptOf({ authenticatorData: authenticatorData({ follows: false }), attachment: "cross-platform" })?.apart, true);
  // A browser that cannot say gives nothing, and nothing is then said.
  for (const nothing of [null, undefined, new Uint8Array(0), new Uint8Array(32)]) assert.equal(keyKeptOf({ authenticatorData: nothing, attachment: "platform" }), null);
});

test("a later sign-in says again whether the key follows, and keeps the name creation gave for the same passkey only", () => {
  const made = recordOf("abc", { follows: false, where: "Windows Hello", apart: false }, null);
  assert.deepEqual(made, { credentialId: "abc", follows: false, where: "Windows Hello", apart: false });
  assert.deepEqual(recordOf("abc", { follows: false, where: null, apart: false }, made), made, "the same passkey keeps its store's name");
  assert.deepEqual(recordOf("other", { follows: true, where: null, apart: false }, made), { credentialId: "other", follows: true, where: null, apart: false }, "another passkey takes none of it");
  assert.equal(recordOf("other", null, made), null, "and a ceremony that said nothing leaves nothing for another passkey");
  assert.deepEqual(readRecord(JSON.stringify(made)), made);
  // What the device kept is read as data: a name that is no store's is dropped, a record without its facts is none.
  assert.equal(readRecord(JSON.stringify({ ...made, where: "<b>anything</b>" }))?.where, null);
  for (const broken of [null, "", "{", JSON.stringify({ credentialId: "abc" }), JSON.stringify({ follows: true })]) assert.equal(readRecord(broken), null);
  // Every name is one a person can read after "kept in".
  for (const name of Object.values(KEY_STORES)) assert.match(name, /^[A-Za-z0-9][A-Za-z0-9 ]+$/);
});

test("what is said: a key this computer keeps alone, with what follows from it; a store by its name; nothing where nothing is known", () => {
  assert.equal(ACCOUNT_DOOR.keyKept({ follows: false, where: "Windows Hello", apart: false }), "Your passkey is kept in Windows Hello, on this computer only. It does not follow you to your phone.");
  assert.equal(ACCOUNT_DOOR.keyKept({ follows: false, where: "this Chrome profile", apart: false }), "Your passkey is kept in this Chrome profile, on this computer only. It does not follow you to your phone.");
  assert.equal(ACCOUNT_DOOR.keyKept({ follows: false, where: null, apart: false }), "Your passkey is kept on this computer only. It does not follow you to your phone.");
  assert.equal(ACCOUNT_DOOR.keyKept({ follows: true, where: "Apple Passwords", apart: false }), "Your passkey is kept in Apple Passwords.");
  // A key that may follow, in a store nothing names: where it is kept is not known, so nothing is said.
  assert.equal(ACCOUNT_DOOR.keyKept({ follows: true, where: null, apart: false }), null);
  assert.equal(ACCOUNT_DOOR.keyKept({ follows: false, where: null, apart: true }), "Your passkey is kept on your security key. Your account opens with it alone.");
  // Nothing is promised of a store: which phones it reaches is not something a browser tells.
  for (const follows of [true, false]) assert.doesNotMatch(ACCOUNT_DOOR.keyKept({ follows, where: "Google Password Manager", apart: false }) ?? "", /every|all your|any device/i);
  // Before the press, on a computer: which choice follows the person.
  assert.equal(ACCOUNT_DOOR.onAComputer, "Save your passkey with Apple or Google. Kept on this computer alone, it stays on it.");
});

// The fake browser: a computer, whose passkey sheet answers what each test sets.
const store = new Map<string, string>();
let secret = 3;
let said: { follows: boolean; storeId: string | null; attachment: string | null } = { follows: false, storeId: WINDOWS_HELLO, attachment: "platform" };
let closed = false;
const asked: string[] = [];

async function prf(salt: BufferSource): Promise<ArrayBuffer> {
  const view = salt instanceof ArrayBuffer ? new Uint8Array(salt) : new Uint8Array(salt.buffer, salt.byteOffset, salt.byteLength);
  const joined = new Uint8Array(64);
  joined.set(new Uint8Array(32).fill(secret), 0);
  joined.set(view, 32);
  return webcrypto.subtle.digest("SHA-256", joined);
}

type Extensions = { prf: { eval: { first: BufferSource; second?: BufferSource } } };
const answer = async (extensions: Extensions, creating: boolean) => {
  const first = await prf(extensions.prf.eval.first);
  const second = extensions.prf.eval.second ? await prf(extensions.prf.eval.second) : undefined;
  const data = authenticatorData({ follows: said.follows, storeId: creating ? said.storeId : null });
  return {
    type: "public-key",
    rawId: new Uint8Array([9, 9, 9, secret]).buffer,
    authenticatorAttachment: said.attachment,
    response: creating ? { getTransports: () => ["internal"], getAuthenticatorData: () => data.buffer } : { authenticatorData: data.buffer },
    getClientExtensionResults: () => ({ prf: { enabled: true, results: { first, ...(second ? { second } : {}) } } }),
  };
};
const refusal = () => Object.assign(new Error("The operation either timed out or was not allowed."), { name: "NotAllowedError" });

const browser = globalThis as unknown as Record<string, unknown>;
browser.window = {
  navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36" },
  PublicKeyCredential: function () {},
  location: { hostname: "viky.cash" },
  localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) },
};
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    credentials: {
      create: async ({ publicKey }: { publicKey: { extensions: Extensions } }) => {
        asked.push("create");
        if (closed) throw refusal();
        return answer(publicKey.extensions, true);
      },
      get: async ({ publicKey }: { publicKey: { extensions: Extensions } }) => {
        asked.push("get");
        if (closed) throw refusal();
        return answer(publicKey.extensions, false);
      },
    },
  },
});

const outcome = (run: () => Promise<unknown>) => run().then(() => "OK", (error: { code?: string }) => error?.code ?? String(error));

test("a prompt closed on a device that knows no account: what happened and what to do, never 'try again'", async () => {
  closed = true;
  assert.equal(mera.hasStoredCredential(), false);
  const failure = await mera.signIn().then(() => null, (error: { code: string; guidance: string }) => error);
  assert.equal(failure?.code, "NO_CREDENTIAL");
  assert.equal(failure?.guidance, "No account was found on this device. Create one, or sign in on the device where you made it.");
  assert.doesNotMatch(failure?.guidance ?? "", /try again/i);
  closed = false;
});

test("made on a computer whose store keeps it for itself: the device remembers where, and a sign-in does not forget the name", async () => {
  said = { follows: false, storeId: WINDOWS_HELLO, attachment: "platform" };
  assert.equal(mera.keyKept(), null, "nothing is known before a ceremony says it");
  await mera.createAccount("");
  const kept = mera.keyKept();
  assert.deepEqual(kept && { follows: kept.follows, where: kept.where, apart: kept.apart }, { follows: false, where: "Windows Hello", apart: false });
  assert.equal(mera.keyKept(), kept, "the same object until a ceremony says otherwise: a screen may subscribe to it");
  assert.equal(store.has(mera.KEY_KEPT_STORAGE_KEY), true);
  mera.signOut();
  await mera.signIn();
  assert.equal(mera.keyKept()?.where, "Windows Hello", "a sign-in names no store, and the name creation gave is kept");
  // On a device that remembers a passkey, a prompt that is closed is a prompt that was closed.
  mera.signOut();
  closed = true;
  assert.equal(await outcome(() => mera.signIn()), "PASSKEY_CANCELLED");
  closed = false;
  // Asked to forget the passkey, the device forgets where it was kept with it.
  mera.forgetCredential();
  assert.equal(mera.keyKept(), null);
  assert.equal(store.has(mera.KEY_KEPT_STORAGE_KEY), false);
});

test("a key that may follow is said by its store; nothing of it is sent anywhere", async () => {
  secret = 4;
  said = { follows: true, storeId: GOOGLE, attachment: "platform" };
  await mera.createAccount("");
  assert.deepEqual([mera.keyKept()?.follows, mera.keyKept()?.where], [true, "Google Password Manager"]);
  mera.forgetCredential();
  // The reading lives in the browser alone: no route takes it, and the module that reads it calls nothing.
  const reader = readFileSync("src/account/key-kept.ts", "utf8");
  assert.doesNotMatch(reader, /fetch\(|import .* from "\.\.\/client\/api"/);
});

test("the header's door: a device that knows no account is asked for no passkey by the press that opens it", () => {
  const door = readFileSync("app/kit/SignInDoor.tsx", "utf8");
  // The press: the passkey where the device remembers one, the door where it does not.
  assert.match(door, /onClick=\{\(\) => \(hasCredential \? void tryPasskey\(\) : setOpen\(\(was\) => !was\)\)\}/);
  // In the door, making an account comes first and signing in second, and only the second asks for a passkey.
  const panel = door.slice(door.indexOf('role="dialog"'));
  assert.ok(panel.indexOf("onClick={() => void make()}") > 0 && panel.indexOf("onClick={() => void make()}") < panel.indexOf("onClick={() => void tryPasskey()}"));
  assert.equal(DOOR.create, "Create my account");
  assert.equal(DOOR.open, "Sign in");
  // "Try again" is said only of a passkey this device remembers.
  assert.match(panel, /\{tried && hasCredential \? W\.again : W\.open\}/);
  // The same name for the same action on the account's other door.
  assert.match(readFileSync("app/components/AccountPanel.tsx", "utf8"), /"Create my account"/);
  // Where signing in is the only thing offered, a closed prompt is never answered with "create one" (D74).
  assert.match(readFileSync("app/components/AccountPanel.tsx", "utf8"), /signInOnly && error\.code === "NO_CREDENTIAL" \? accountError\("PASSKEY_CANCELLED"\)\.guidance : error\.guidance/);
});

test("on a computer the doors say which choice follows the person, and the account's screens say where the key turned out to be", () => {
  for (const file of ["app/kit/SignInDoor.tsx", "app/components/AccountPanel.tsx", "app/kit/offer/PaySheet.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /useOnAComputer\(\)/, file);
    assert.match(source, /onAComputer/, file);
  }
  // A phone is never told of a computer: the notice and the line draw nothing off one.
  const kept = readFileSync("app/kit/KeyKept.tsx", "utf8");
  assert.match(kept, /if \(!computer \|\| !kept\) return null;/);
  // The notice is for the key a computer keeps alone, once; the line on Me is for whatever is known.
  assert.match(kept, /if \(!said \|\| !said\.here \|\| read === undefined \|\| read === said\.credentialId\) return null;/);
  assert.match(readFileSync("app/kit/Home.tsx", "utf8"), /<KeyKeptNotice \/>/);
  assert.match(readFileSync("app/kit/Me.tsx", "utf8"), /<KeyKeptLine \/>/);
  // A computer is a browser that names itself as no phone's; one that names nothing is not taken for one.
  assert.match(readFileSync("src/account/door.tsx", "utf8"), /const computer = userAgent !== "" && handsetOf\(userAgent\) === "other";/);
});

test("'I lost my phone.' says the condition its promise holds under", () => {
  const lost = HELP.questions.find((item) => item.q === "I lost my phone.");
  assert.ok(lost);
  assert.match(lost.a, /If your passkey is kept by Apple, Google or a password manager, sign in on the new phone the same way/);
  assert.match(lost.a, /A passkey kept only in Windows Hello or in one Chrome profile stays on that computer and does not come back on another device\./);
  // The promise is no longer made of every passkey.
  assert.doesNotMatch(lost.a, /kept by Apple, Google or your password manager rather than by Viky\. Sign in on the new phone/);
});
