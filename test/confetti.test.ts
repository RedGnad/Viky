import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import test from "node:test";
import { MOTION } from "../src/design-tokens";
import { REACHED_MOMENT } from "../src/sentences";

/**
 * Decision B of the founder (23 Sep 2026): the one confetti of the app is "Atteint", for the person it is for and for
 * the funder; never at payment. Widened on 29 Sep 2026: the moment a gift is reached is the whole screen, once per
 * account wherever the person arrives, after the page has loaded, with confetti long enough to be seen.
 */
const MOMENT = readFileSync("app/kit/ReachedMoment.tsx", "utf8");

test("the moment is played in two places only, Home and the gift's page, to the gift's two people", () => {
  const users = globSync("app/**/*.tsx").filter((file) => /<ReachedMoments\b|<ReachedOnItsPage\b/.test(readFileSync(file, "utf8"))).sort();
  assert.deepEqual(users, ["app/components/GiftPage.tsx", "app/kit/Home.tsx", "app/kit/ReachedMoment.tsx"]);
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /const reachedNow = landed \?\? \(milestone\?\.reached \? milestone : null\);/);
  assert.match(page, /\{reachedNow && \(mine \|\| readerIsFunder\) \? \(\s*<ReachedOnItsPage/);
  assert.match(MOMENT, /gift\.role === "reader"\) return null/, "a reader who is neither of the two is owed nothing");
});

test("once per account, kept by the server, never by the device", () => {
  assert.doesNotMatch(MOMENT, /localStorage|sessionStorage/);
  assert.match(MOMENT, /markReachedSeen\(now\.giftId\)/, "written seen when it is shown");
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  assert.match(home, /gift\.reachedSeen === false/, "Home plays only what the account has not had");
  assert.match(readFileSync("src/my-gifts.ts", "utf8"), /reachedSeenOf\(account, reached\)\.catch\(\(\) => new Set\(reached\)\)/, "a store that cannot be read counts them seen");
});

test("after the page has loaded, one after another, and long enough to be seen", () => {
  assert.match(MOMENT, /document\.readyState === "complete"/);
  assert.match(MOMENT, /document\.fonts\.ready/);
  assert.match(MOMENT, /queue\.find\(\(gift\) => !done\.includes\(gift\.giftId\)\)/, "the next once the last is closed");
  const { fallMs, spreadMs, pieces } = MOTION.moment;
  assert.ok(fallMs + spreadMs >= 2500 && fallMs + spreadMs <= 4000, "about three seconds of rain");
  assert.ok(pieces >= 40);
  assert.doesNotMatch(MOMENT, /setInterval|setTimeout|iterations/, "nothing on a timer, nothing repeated");
});

test("reduced motion is the same screen, still: the amount already theirs, nothing thrown, nothing jumping", () => {
  assert.match(MOMENT, /const \[still\] = useState\(reduced\)/);
  assert.match(MOMENT, /const became = still \|\| turned/);
  assert.match(MOMENT, /if \(still\) return;\n[\s\S]*rain\(layer\.current\)/, "the rain and the jump are after the door");
});

test("one action: seeing the gift, for the person it is for as for the funder, and See it again on the page", () => {
  // "Take $25.00" was the action of the person it is for until 4 Oct 2026: Home counts what a gift paid in "Yours" and
  // whatever the money is used for takes it from the gift first, so the gesture did the same thing twice (the advisor).
  assert.match(MOMENT, /href=\{`\/g\/\$\{gift\.giftId\}`\} className=\{`\$\{PRIMARY_BUTTON\} block text-center no-underline`\}>\n\s*\{W\.seeTheGift\}/);
  assert.doesNotMatch(MOMENT, /take=1|onTake|W\.take\(/);
  assert.doesNotMatch(readFileSync("app/components/GiftPage.tsx", "utf8"), /openTake|withdrawEarned|takeReview/);
  assert.equal(REACHED_MOMENT.seeTheGift, "See the gift");
  assert.equal(REACHED_MOMENT.theyDidIt, "They did it.");
  assert.match(MOMENT, /\{W\.seeItAgain\}/);
});

test("at payment, the gift's character arrives on its spring, only when the payment was just made, and nothing is thrown", () => {
  const pay = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.doesNotMatch(pay, /Confetti|ReachedMoment/);
  // On the gift's own page since 8 Oct 2026, which is the screen after paying: the payment marks the gift, the page
  // reads the mark as it is first drawn, and forgets it, so a reload plays nothing.
  assert.match(pay, /markJustMade\(result\.giftId\);\n[^\n]*\n[^\n]*\n\s*router\.replace\(`\/g\/\$\{result\.giftId\}`\);/, "the press that made it, and not a reload, is what plays it");
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.doesNotMatch(page, /Confetti/);
  assert.match(page, /justMade \? \(\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*<Success>\s*<span className="block w-\[72px\] shrink-0">\s*<Figure id="made"/);
  assert.match(page, /useEffect\(\(\) => \{\n\s*if \(justMade\) forgetJustMade\(\);\n\s*\}, \[justMade\]\);/);
});
