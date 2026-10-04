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

test("signing out and asking for another account both lead straight to the account's door", () => {
  // "You, not signed in on this device" showed for a moment at a sign-out, and "Other account" left the person on it,
  // one more press from anywhere (the founder, 4 Oct 2026).
  for (const way of ["leave: async () => {", "useAnotherAccount: async () => {"]) {
    const body = provider.slice(provider.indexOf(way), provider.indexOf("},", provider.indexOf(way)) + 2);
    assert.match(body, /askForTheDoor\(\);[\s\S]*window\.location\.assign\("\/"\);/, `${way} asks for the door, then loads the landing`);
  }
  // The landing's door opens as it arrives, once, with nothing tried yet: its second key says "Sign in".
  const door = readFileSync("app/kit/SignInDoor.tsx", "utf8");
  assert.match(door, /if \(live && doorWasAskedFor\(\)\) setOpen\(true\);/);
  assert.match(door, /\{tried \? W\.again : W\.open\}/);
  const asked = readFileSync("src/account/door-asked.ts", "utf8");
  assert.match(asked, /if \(asked\) window\.sessionStorage\.removeItem\(KEY\);/, "read once");
  // And the page of an account is never drawn for nobody on the way: it keeps the account it was drawn for.
  const me = readFileSync("app/kit/Me.tsx", "utf8");
  assert.match(me, /const address = signedIn \?\? \(leaving \? drawnFor : undefined\);/);
});
