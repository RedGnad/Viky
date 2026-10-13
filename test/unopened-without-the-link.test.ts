// A gift nobody has opened, met without its link (the founder, 13 Oct 2026, after the final audit).
//
// The page of such a gift spoke to every visitor who was not its funder as the person it is for: "For you", "This is
// in your name.", "Yours with the proof", and "Open my gift". Somebody who had only the gift's number pressed, made an
// account, and read "This link is missing its key." under a greyed button. On the chain the gift is in nobody's name
// until its link opens it. Held here: without the link the page reads in the third person, offers nothing to open,
// and says the one thing true of that reader.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { eyebrowOf, titleOf } from "../src/gift-live";
import { voiceOf } from "../src/gift-voice";
import { GIFT_LIVE, GIFT_PAGE } from "../src/sentences";

const page = readFileSync("app/components/GiftPage.tsx", "utf8");

test("holding the link is having the two names from the server, or the key that opens the gift on the page", () => {
  assert.match(page, /const linkOpened = opensByItsLink\(status\.version\);\s+const openingKey = linkOpened \? openingSecret : linkKey;/);
  assert.match(page, /const holdsTheLink = names !== null \|\| Boolean\(openingKey\);/);
  assert.match(page, /opened: status\.opened,\s+holdsTheLink,\s+\}\);/);
  assert.match(page, /const withoutTheLink = !status\.opened && voice === "reader";/);
  // The server gives the names for what the link carries in `?t=`, and to the gift's two people: nobody else.
  for (const file of ["src/gift-status.ts", "src/milestone-status.ts"]) assert.match(readFileSync(file, "utf8"), /holdsTheLink \? \{ recipientName: record\.recipientName, funderName: record\.funderName \} : null/, file);
});

test("without the link the card and its headline are in the third person", () => {
  assert.equal(voiceOf({ youAreTheFunder: false, youAreTheRecipient: false, opened: false, holdsTheLink: false }), "reader");
  assert.equal(titleOf("reader", null), "For somebody");
  assert.equal(eyebrowOf("reader", null), "A gift");
  assert.equal(GIFT_LIVE.unopened.reading(null, null), "Somebody put this in somebody's name.");
  assert.equal(GIFT_LIVE.unopened.promise.theirs.stamp, "Theirs with the proof");
  // And with it, as before.
  assert.equal(titleOf(voiceOf({ youAreTheFunder: false, youAreTheRecipient: false, opened: false, holdsTheLink: true }), null), "For you");
});

test("nothing offers to open it, and the line said is the one true of every such reader", () => {
  assert.equal(GIFT_PAGE.missingKey, "This link is missing its key. Ask for the link again.");
  // Signed out: the account is the way in only for whoever holds the link.
  assert.match(page, /if \(!status\.opened && !withoutTheLink\) \{/);
  // The line is said once the link was read and found without a key, never while it is not read yet.
  assert.equal((page.match(/withoutTheLink && openingKey === null \? \(|return openingKey === null \? \(/g) ?? []).length, 2);
  assert.equal((page.match(/<p className=\{HELP\} data-no-key="">\s+\{W\.missingKey\}\s+<\/p>/g) ?? []).length, 2);
  // Signed in: that line stands before "This gift is not yours.", which the page cannot know of this reader.
  assert.ok(page.indexOf("if (withoutTheLink) {") > 0 && page.indexOf("if (withoutTheLink) {") < page.indexOf("<p className=\"font-medium\">{W.notYours}</p>"));
});
