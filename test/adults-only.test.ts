import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { exampleGift } from "../app/kit/example-gift";
import { ACCOUNT_DOOR, PAY } from "../src/sentences";

/**
 * Viky is for adults, on both sides (the founder, 4 Oct 2026). "18 or older" was said at the card payment alone, which
 * the person a gift is for never meets; the public page named two school portals; and the app's examples of a giver
 * were a parent.
 */

test("'18 or older' is said wherever an account is made, to the person who offers and to the person a gift is for", () => {
  assert.equal(ACCOUNT_DOOR.adult, "By creating an account you confirm you are 18 or older.");
  // The panel on a gift's link and on Gifts, where the person a gift is for makes their account.
  const panel = readFileSync("app/components/AccountPanel.tsx", "utf8");
  assert.ok(panel.indexOf("Create my account") < panel.indexOf("{W.adult}"), "under the button that makes it");
  // The door of the landing.
  const door = readFileSync("app/kit/SignInDoor.tsx", "utf8");
  assert.ok(door.indexOf("{W.create}") < door.indexOf("{ACCOUNT_DOOR.adult}"));
  // The pay sheet, whose press makes a first account: the card's own line says it when a card pays, this one otherwise.
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.match(sheet, /\{address \|\| hasCredential \|\| !madeHere \|\| byCard \? null : \(\n\s*<p className=\{HELP\} data-adult="">\n\s*\{ACCOUNT_DOOR\.adult\}/);
  assert.match(`${PAY.cardLine.before("Rampnow")}${PAY.cardLine.link("Rampnow")}${PAY.cardLine.after}`, /By paying you are 18 or older/);
  // And the legal notice says who Viky is for, and that the age is confirmed, not checked by Viky.
  const legal = readFileSync("app/legal/page.tsx", "utf8");
  assert.match(legal, /Viky is for adults\. The person who offers a gift and the person it is for each confirm they are 18 or older/);
  assert.match(legal, /Viky does not check an age itself/);
});

test("no example in the app is a parent", () => {
  assert.equal(PAY.namePlaceholder, "Sam");
  assert.equal(exampleGift(Date.UTC(2026, 9, 4)).funderName, "Sam");
  const sentences = readFileSync("src/sentences.ts", "utf8");
  assert.doesNotMatch(sentences, /"[^"\n]*\b(Mum|Mom|Mama|Dad|Papa|Maman)\b[^"\n]*"/, "no sentence of the app names a parent as its example");
});
