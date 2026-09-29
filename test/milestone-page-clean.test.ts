import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pastMomentInWords } from "../src/moments";
import { nextClimbReadingMs } from "../src/pass-schedule";
import { GIFT_LIVE, MILESTONE_PAGE } from "../src/sentences";

/**
 * The page of a milestone gift in progress, cleaned after the mockup milestone.html of 19 Sep 2026 (the founder, 29 Sep
 * 2026): read as it opens, one line about reading, no hero, no nature label, and being told when it is reached.
 */
const PAGE = readFileSync("app/components/GiftPage.tsx", "utf8");
const L = GIFT_LIVE.climbing;

test("a climb is read as its page opens, by either of its two people, and Count now is gone from it", () => {
  assert.match(PAGE, /const readsOnOpen = Boolean\(milestone && milestone\.shape !== "certificate" && moment === "climbing" && \(voice === "recipient" \|\| voice === "funder"\)\)/);
  assert.match(PAGE, /checkMilestone\(giftId\)\n\s*\.then/);
  assert.match(PAGE, /\(mine \|\| readerIsFunder\) && !milestone && !gift\.finished/, "the button stays for a habit only");
  const routes = readFileSync("src/milestone-routes.ts", "utf8");
  assert.match(routes, /record\.funder\.toLowerCase\(\) !== auth\.account\.toLowerCase\(\)\) recipientRecord/, "the funder may start one too");
  assert.match(routes, /if \(outcome\.kind === "reached"\) await tellAboutMilestone\(giftId, "reached"/, "a reach found on opening is told at once");
});

test("one quiet line: when the source last updated it, and no other time of reading", () => {
  assert.equal(L.lastUpdated("today at 13:55"), "Last updated at 13:55.");
  assert.equal(L.lastUpdated("yesterday at 22:10"), "Last updated yesterday at 22:10.");
  assert.match(PAGE, /readOnOpen\?\.state === "read" && readOnOpen\.sourceUpdatedAt \? L\.climbing\.lastUpdated/, "the source's time only once it was read");
  // And Viky's own next reading, by the nearer of the two passes, both of which read the milestones.
  assert.equal(L.nextReading("tomorrow at 02:30"), "Next reading tomorrow at about 02:30.");
  assert.match(PAGE, /L\.climbing\.nextReading\(comingMomentInWords\(nextClimbReadingMs\(nowMs\), nowMs\)\)/);
  const late = Date.UTC(2026, 8, 29, 3, 0);
  assert.equal(nextClimbReadingMs(late), Date.UTC(2026, 8, 29, 7, 0), "after the counting pass, the settling one");
  assert.equal(nextClimbReadingMs(Date.UTC(2026, 8, 29, 8, 0)), Date.UTC(2026, 8, 30, 0, 30), "after both, the next night's");
  assert.doesNotMatch(MILESTONE_PAGE.ruleYours(1430, "by 30 Sep"), /Checked|every day|at about/);
  const noon = new Date(2026, 8, 29, 15, 0).getTime();
  assert.equal(pastMomentInWords(new Date(2026, 8, 29, 13, 55).getTime(), noon), "today at 13:55");
  assert.equal(pastMomentInWords(new Date(2026, 8, 28, 22, 10).getTime(), noon), "yesterday at 22:10");
  assert.equal(pastMomentInWords(new Date(2026, 8, 26, 9, 5).getTime(), noon), "on 26 Sep at 09:05");
});

test("no hero character on a gift in progress, no nature label and no 'where you are' on a milestone's page", () => {
  assert.match(PAGE, /character=\{moment === "counting" \|\| moment === "climbing" \|\| moment === "awaitingProof" \? null : <HeadCharacter \/>\}/);
  assert.match(PAGE, /nature=\{condition && !milestone \? <Nature/);
  assert.deepEqual(L.label, { yours: "Today", theirs: "Today" });
});

test("being told the moment it is reached, outside the card, and how to allow it when the phone refused", () => {
  assert.equal(L.alert.yours("1430"), "Get a message when you reach 1430.");
  assert.match(PAGE, /<ReachAlert giftId=\{giftId\}/);
  const alert = readFileSync("app/kit/MorningMessage.tsx", "utf8");
  assert.match(alert, /step === "refused" \? L\.alertRefused/);
  assert.match(alert, /step === "ask" \? \(\s*<button[\s\S]{0,200}\{L\.turnOn\}/, "the button is there only when pressing it can work");
});
