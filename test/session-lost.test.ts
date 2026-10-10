import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * A session the server forgot is a sign-out on every screen (the founder, 28 Sep 2026: signed out in one tab at
 * 22:42, he pressed "Back to my gifts" in another at 22:44, the server answered 401 and the screen said the gifts
 * "could not be loaded"; read in production's own request log).
 */
const provider = readFileSync("src/account/provider.tsx", "utf8");
const client = readFileSync("src/client/server-session.ts", "utf8");
const gifts = readFileSync("app/kit/my-gifts.ts", "utf8");

test("only the server's own 401 says the session is gone; a network that fails changes nothing", () => {
  assert.match(client, /error instanceof ApiError && error\.status === 401 \? "gone" : "unknown"/);
});

test("a tab that signs out tells the others, and a tab brought back asks the server again", () => {
  for (const way of ["signOut: () => {", "leave: async () => {", "useAnotherAccount: async () => {"]) {
    const body = provider.slice(provider.indexOf(way), provider.indexOf("},", provider.indexOf(way)) + 2);
    assert.match(body, /tellOtherTabsSignedOut/, `${way} tells the other tabs`);
  }
  assert.match(provider, /new BroadcastChannel\(ACCOUNT_CHANNEL\)/);
  assert.match(provider, /if \(event\.data === "signed-out"\) serverForgot\(\);/);
  assert.match(provider, /addEventListener\("visibilitychange", check\)/);
  assert.match(provider, /if \(known === "gone"\) serverForgot\(\);/);
});

test("the gifts answered 401 are a sign-out, not gifts that could not be loaded", () => {
  assert.match(gifts, /if \(error instanceof ApiError && error\.status === 401\) return serverForgot\(\);/);
});

test("asking for another account leads straight to the account's door; signing out lands with nothing opened", () => {
  // "You, not signed in on this device" showed for a moment at a sign-out, and "Other account" left the person on it,
  // one more press from anywhere (the founder, 4 Oct 2026). Both then opened the door, and did the same thing on the
  // screen: since 9 Oct 2026 signing out closes the session and arrives on the landing, and the door is the other's.
  // That other is the panel's "Use another account" alone now: Me's "Other account" closes nothing, and lays its
  // door over the page (test/other-account.test.ts).
  const way = (name: string) => provider.slice(provider.indexOf(name), provider.indexOf("},", provider.indexOf(name)) + 2);
  assert.match(way("useAnotherAccount: async () => {"), /askForTheDoor\(\);[\s\S]*window\.location\.assign\("\/"\);/, "another account asks for the door, then loads the landing");
  const out = way("leave: async () => {");
  assert.doesNotMatch(out, /askForTheDoor/, "signing out asks for nothing");
  assert.match(out, /await signOutOfServer\(\);[\s\S]*mera\.signOut\(\{ quiet: true \}\);[\s\S]*window\.location\.assign\("\/"\);/, "it closes the session, then loads the landing");
  assert.equal((provider.match(/askForTheDoor\(\);/g) ?? []).length, 1);
  // The landing's door opens as it arrives, once, with nothing tried yet: its second key says "Sign in".
  const door = readFileSync("app/kit/SignInDoor.tsx", "utf8");
  assert.match(door, /if \(live && doorWasAskedFor\(\)\) setOpen\(true\);/);
  // "Try again" is said of a passkey this device remembers and that did not answer, and of nothing else (5 Oct 2026).
  assert.match(door, /\{tried && hasCredential \? W\.again : W\.open\}/);
  const asked = readFileSync("src/account/door-asked.ts", "utf8");
  assert.match(asked, /if \(asked\) window\.sessionStorage\.removeItem\(KEY\);/, "read once");
  // And the page of an account is never drawn for nobody on the way: it keeps the account it was drawn for.
  const me = readFileSync("app/kit/Me.tsx", "utf8");
  assert.match(me, /const address = signedIn \?\? \(leaving \? drawnFor : undefined\);/);
});
