import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_PASSKEY_LABEL, defaultPasskeyLabel } from "../src/account/passkey-label";
import { liveOf } from "../src/gift-live";
import { ACCOUNT_DOOR, GIFT_PAGE } from "../src/sentences";

/**
 * The link of a gift, opened by the person it is for (the UI pass of 8 Oct 2026, screen 1), and the passkey's name
 * (the audit of that day, point 7). One button, "Open my gift", which makes the account and opens the gift on one
 * press; one line under it; a quiet link for somebody who has an account. Nobody is asked to name anything, and the
 * name the device shows ends with when the account was made. The screen itself is walked in a browser by
 * test/browser/recipient-path.spec.ts, and the count of gestures by test/browser/arrival-measure.spec.ts.
 */

const read = (file: string) => readFileSync(file, "utf8");

test("a passkey nobody named says when it was made, so two on one device can be told apart", () => {
  assert.equal(DEFAULT_PASSKEY_LABEL, "Viky account");
  assert.equal(defaultPasskeyLabel(new Date(2026, 9, 8, 14, 32)), "Viky account, 8 Oct 14:32");
  assert.equal(defaultPasskeyLabel(new Date(2026, 0, 3, 7, 5)), "Viky account, 3 Jan 07:05", "the hour in two figures, on the device's own clock");
  assert.notEqual(defaultPasskeyLabel(new Date(2026, 9, 8, 14, 32)), defaultPasskeyLabel(new Date(2026, 9, 8, 14, 33)), "a minute apart is another name");
  const mera = read("src/account/mera.ts");
  assert.match(mera, /const name = displayName\.trim\(\) \|\| defaultPasskeyLabel\(\);/);
  assert.match(mera, /user: \{ name, displayName: name \},/, "the name goes to the device's own list and nowhere else");
});

test("no screen asks for a name any more", () => {
  const sources = ["app", "src"].flatMap((folder) =>
    readdirSync(folder, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => [file, read(`${folder}/${file}`)] as const),
  );
  for (const [file, source] of sources) {
    assert.doesNotMatch(source, /Name this device/, file);
    assert.doesNotMatch(source, /A name for this account on your device/, file);
  }
  const panel = read("app/components/AccountPanel.tsx");
  assert.doesNotMatch(panel, /displayName|setNaming/);
  // Wherever an account is made, the device names the key.
  for (const [file, source] of sources) for (const call of source.matchAll(/\bcreateAccount\(([^)]*)\)/g)) if (!/=>|: \(|displayName: string/.test(call[0]) && !file.endsWith("mera.ts")) assert.match(call[1], /^(""|displayName)?$/, `${file}: ${call[0]}`);
});

test("the link of a gift has one button, one line and one quiet link, and no frame of its own", () => {
  assert.equal(GIFT_PAGE.openMyGift, "Open my gift");
  assert.equal(GIFT_PAGE.opening, "Opening");
  assert.equal(ACCOUNT_DOOR.opensIt, "It creates your account with your fingerprint, face or screen lock. 18 or older.");
  assert.equal(ACCOUNT_DOOR.alreadyHave, "I already have an account");
  assert.equal("createToOpen" in GIFT_PAGE, false, "'Create your account to open it. Nothing to install.' is gone: the button says it");
  const panel = read("app/components/AccountPanel.tsx");
  const opening = panel.slice(panel.indexOf("if (opening) {"), panel.indexOf("const signInButton"));
  assert.ok(opening.length > 200, "the opening is its own drawing of the panel");
  assert.doesNotMatch(opening, /className=\{CARD\}/, "it stands in the gift's card, with no frame of its own");
  assert.equal((opening.match(/<Button /g) ?? []).length, 1, "one main button");
  assert.match(opening, /<Button doing=\{doing \? GIFT_PAGE\.opening : null\} failed=\{error \? error\.guidance : null\}/, "doing and failed are the button's own states");
  assert.doesNotMatch(opening, /PRIMARY_BUTTON|SECONDARY_BUTTON|SMALL_BUTTON/, "and no second button of any weight beside it");
  assert.match(opening, /\{returning \? W\.newAccount : W\.alreadyHave\}/);
  // A device that remembers a passkey signs in with it, so a press that did not mean it makes no second account.
  assert.match(opening, /const main = returning \? "signIn" : "make";/);
  // The rescue is offered only once a try failed.
  assert.match(opening, /\{error && phone \? <CopyThisLink/);
  // Adults only is still said where the account is made: in the line, or in its own on a computer with no sensor.
  assert.match(opening, /noSensor \? \[\.\.\.W\.computer\(onGift\), W\.adult\]/);
  assert.match(ACCOUNT_DOOR.opensIt, /18 or older\.$/);
});

test("the press makes the account and then opens the gift, once the gift was read for the account that came in", () => {
  const page = read("app/components/GiftPage.tsx");
  const press = page.slice(page.indexOf("const openFromTheLink = async"), page.indexOf("const name = (username: string)"));
  assert.match(press, /await \(how === "make" \? createAccount\(""\) : signIn\(\)\);\n\s*const cameIn = mera\.currentAddress\(\);/);
  assert.match(press, /if \(!cameIn\) return;/, "a passkey closed or refused opens nothing");
  // Who they are to the gift decides: the person who paid for it, signing in on their own link, opens nothing.
  assert.match(press, /const theirs = \(await loadGiftStatus\(giftId, linkKey\)\) as GiftStatus \| MilestoneStatus;\n\s*if \(theirs\.opened \|\| theirs\.youAreTheFunder\) return;\n\s*await openFor\(cameIn\);/);
  // The button after the account is the same one, in the same state.
  assert.match(page, /<Button doing=\{busy === "opening" \|\| comingIn \? W\.opening : null\}/);
  assert.match(page, /<AccountPanel returning=\{hasCredential\} opening=\{\{ pressed: \(how\) => void openFromTheLink\(how\), busy: comingIn \}\} \/>/);
});

test("the card of a gift nobody opened says its day as every other card does", () => {
  const said = liveOf({
    moment: "unopened",
    voice: "recipient",
    funderName: "Mom",
    recipientName: "Boo",
    source: "Duolingo",
    amountDisplay: "$7.00",
    theirsDisplay: "$0.00",
    returnedDisplay: "$0.00",
    todayReading: null,
    target: null,
    started: false,
    shown: false,
    shape: "days",
    lastJudged: null,
    openBy: "16 Oct 2026",
    connectBy: null,
    nextReadingInWords: null,
    cameBackOnInWords: null,
  });
  assert.equal(said.headline, "Mom put this in your name.");
  assert.equal(said.next, "By 16 Oct 2026, or it goes back to Mom.");
  assert.equal(GIFT_PAGE.openBy("16 Oct 2026", null), "By 16 Oct 2026, or it goes back to the person who offered it.");
});
