import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkedAgo, LIVE_READING_EVERY_MS } from "../app/kit/LiveReading";
import { GIFT_LIVE, MILESTONE_PAGE } from "../src/sentences";

/**
 * The page of a milestone gift in progress, cleaned after the mockup milestone.html of 19 Sep 2026 (the founder, 29 Sep
 * 2026): read as it opens, one line about reading, no hero, no nature label, and being told when it is reached.
 */
const PAGE = readFileSync("app/components/GiftPage.tsx", "utf8");
const L = GIFT_LIVE.climbing;

test("a climb is read live while its page is open, by either of its two people, and Count now is gone from it", () => {
  assert.match(PAGE, /const readsLive = Boolean\(milestone && milestone\.shape !== "certificate" && moment === "climbing" && \(voice === "recipient" \|\| voice === "funder"\)\)/);
  assert.match(PAGE, /useLiveReading\(\s*readsLive,\s*\(\) => checkMilestone\(giftId\)/);
  assert.match(PAGE, /\(mine \|\| readerIsFunder\) && !milestone && !gift\.finished/, "the button stays for a habit only");
  const routes = readFileSync("src/milestone-routes.ts", "utf8");
  assert.match(routes, /record\.funder\.toLowerCase\(\) !== auth\.account\.toLowerCase\(\)\) recipientRecord/, "the funder may start one too");
  assert.match(routes, /if \(outcome\.kind === "reached"\) await tellAboutMilestone\(giftId, "reached"/, "a reach found on opening is told at once");
});

test("one live line: read every minute while in front, one at a time, the seconds counting, a failure in its place", () => {
  assert.equal(checkedAgo(2), "Checked just now");
  assert.equal(checkedAgo(12), "Checked 12 s ago");
  assert.equal(checkedAgo(135), "Checked 2 min ago");
  assert.equal(L.checking("Chess.com"), "Checking Chess.com…");
  assert.equal(LIVE_READING_EVERY_MS, 60_000);
  const live = readFileSync("app/kit/LiveReading.tsx", "utf8");
  assert.match(live, /if \(!live \|\| busy \|\| document\.hidden\) return;/, "one reading at a time, none while hidden");
  assert.match(live, /document\.addEventListener\("visibilitychange"/, "back in front, it reads again");
  assert.match(PAGE, /outcome\.kind === "reached" \|\| \(outcome\.kind === "notYet" && outcome\.rating !== shownReading\)\) void refresh\(\)/, "a new figure or the target reached refreshes the page, and the moment plays");
  assert.doesNotMatch(PAGE, /Last updated|lastUpdated|nextClimbReading/);
  assert.doesNotMatch(MILESTONE_PAGE.ruleYours(1430, "by 30 Sep"), /Checked|every day|at about/);
});

test("no hero character on a gift in progress, no nature label and no 'where you are' on a milestone's page", () => {
  assert.match(PAGE, /character=\{moment === "counting" \|\| moment === "climbing" \|\| moment === "awaitingProof" \? null : <HeadCharacter \/>\}/);
  assert.match(PAGE, /nature=\{condition && !milestone \? <Nature/);
  assert.deepEqual(L.label, { yours: "Today", theirs: "Today" });
});

test("being told the moment it is reached, outside the card, and how to allow it when the phone refused", () => {
  assert.equal(L.alert.yours("1430"), "Get a message when you reach 1430.");
  // Behind "Messages", a round control under the card, for either of the gift's two people (rule 6, 1 Oct 2026).
  assert.match(PAGE, /\? \{ kind: "reach", target: String\(milestone\.targetWords \?\? milestone\.target\) \}/);
  assert.match(PAGE, /<YouDecide[\s\S]{0,400}about=\{about\}/);
  assert.match(PAGE, /<FunderControls giftId=\{giftId\} about=\{about\}/);
  const alert = readFileSync("app/kit/MorningMessage.tsx", "utf8");
  assert.match(alert, /\{step === "refused" \? <p className=\{HELP\}>\{morning \? W\.refused : L\.alertRefused\}<\/p> : null\}/);
  assert.match(alert, /disabled=\{busy \|\| step === "refused"\} className=\{PRIMARY_BUTTON\}>\s*\{morning \? W\.ask : L\.turnOn\}/, "the button waits where pressing it cannot work");
});
