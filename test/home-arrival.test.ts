import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EASING, MOTION } from "../src/design-tokens";
import { SEEN_MAX_ENTRIES } from "../src/seen-cookie";

/**
 * Home arrives once (the founder, 9 Oct 2026, on a living mockup). Six rules, each held to the code that makes it true;
 * what a browser shows of them, image by image, is measured in test/browser/home-arrival.spec.ts.
 */
const home = readFileSync("app/kit/Home.tsx", "utf8");
const place = readFileSync("app/kit/Place.tsx", "utf8");
const hero = readFileSync("app/kit/MoneyHero.tsx", "utf8");
const money = readFileSync("app/kit/money.ts", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const account = home.slice(home.indexOf("<PlacesOf>"), home.indexOf("</PlacesOf>"));

test("1. every block is at its place from the first image, held from what this device saw last time", () => {
  // What the device saw is kept where the server reads it while it draws the page, never in a store the browser reads
  // a moment after the first image.
  assert.match(money, /import \{ forgetOnThisScreen, useSeen, writeSeen \} from "\.\/seen";/);
  assert.match(money, /const saw = useSeen\(SAW_MONEY\) === 1;/);
  assert.doesNotMatch(money, /localStorage/);
  assert.match(home, /const sawGifts = useSeen\(SEEN_GIFTS\);\n\s*const sawHeights = useSeenMany\(SEEN_GIFT_HEIGHTS\);/);
  // The way out: drawn at once where this device saw money, and it is the button itself, not an unseen copy of it.
  assert.match(home, /const toTake = holdings !== null && giftsRead \? holdsAnything\(holdings, gifts\) : \(holdings !== null && holdsAnything\(holdings\)\) \|\| sawMoney;/);
  assert.match(account, /<Place open=\{toTake\}>\n\s*<SpendOrWithdraw \/>\n\s*<\/Place>/);
  assert.doesNotMatch(readFileSync("app/kit/SpendOrWithdraw.tsx", "utf8"), /holding|invisible/);
  // The gifts: one place for each gift this device saw, three at most, at the height its card had.
  assert.match(home, /const held = gifts === null && !problem \? Math\.min\(SHOWN, sawGifts \?\? 0\) : 0;\n\s*const rows = gifts === null \? held : moving\.length;/);
  assert.match(account, /<Reveal>\{moving\[at\] \? <GiftCard gift=\{moving\[at\]\} landed=\{listLands\} \/> : <GiftPlace height=\{sawHeights\[at\]\} \/>\}<\/Reveal>/);
  // The line that says the list is read is for a device that remembers nothing of it.
  assert.match(account, /<Place open=\{!problem && gifts === null && sawGifts === undefined\}>\n\s*<WaitLine>\{W\.loading\}<\/WaitLine>/);
  // What is remembered is what the screen showed, written once it has settled; numbers only, and few of them.
  assert.match(home, /writeSeen\(SEEN_GIFTS, gifts\.length\);/);
  assert.match(home, /writeSeen\(SEEN_GIFT_HEIGHTS\[at\], Math\.round\(card\.getBoundingClientRect\(\)\.height\)\)/);
  assert.match(money, /writeSeen\(SAW_MONEY, holdsAnything\(holdings, gifts\) \? 1 : 0\);/);
  assert.ok(SEEN_MAX_ENTRIES >= 40, "the cookie keeps Home's six entries beside the gifts' own");
});

test("2. one entrance, today's, staggered by 80 ms, and no block plays it once the screen has arrived", () => {
  assert.equal(MOTION.reveal.staggerMs, 80);
  assert.match(css, /--page-enter-stagger: 80ms;/);
  // A place put on a drawn screen says so, and the stylesheet never enters it, under less movement either.
  assert.match(place, /<div ref=\{outer\} data-place="" \{\.\.\.\(late \? \{ "data-late": "" \} : \{\}\)\}>/);
  assert.match(css, /\.page-enters > \[data-late\],\n\.page-enters \.arrives-in-turn > \[data-late\] \{\n  animation: none !important;\n\}/);
  // Every block of the account's Home that a reading can bring later stands in a place of its own.
  for (const block of ["<SpendOrWithdraw />", "<WaitLine>{W.loading}</WaitLine>", "<EmptyState>{W.empty}</EmptyState>", "<MarkNotice />", "{W.seeAll}"]) {
    const at = account.indexOf(block);
    assert.ok(at > 0, block);
    const before = account.slice(0, at);
    assert.ok(before.lastIndexOf("<Place") > before.lastIndexOf("</Place>"), `${block} stands in a place`);
  }
  for (const notice of ["app/kit/KeyKept.tsx", "app/kit/FinishTheGift.tsx"]) assert.match(readFileSync(notice, "utf8"), /return \(\n\s*<Place>\n\s*<section/, notice);
  // A gift's row is the same element from the first image to the last, so nothing is built anew when its card lands.
  assert.match(account, /\{Array\.from\(\{ length: SHOWN \}, \(_, at\) => \(\n\s*<Place key=\{at\} open=\{at < rows\}>/);
  assert.doesNotMatch(account, /<Reveal key=\{gift\.giftId\}>/);
});

test("3. what arrives later changes in place: a fade of 180 ms, no rise, no delay tied to where it stands", () => {
  assert.deepEqual(MOTION.place, { fadeMs: 180, heightMs: 220, easing: EASING.standard });
  assert.match(css, new RegExp(`--come-up-duration: ${MOTION.place.fadeMs}ms;`));
  const rule = css.slice(css.indexOf(".comes-up,"), css.indexOf("/*", css.indexOf(".comes-up,")));
  assert.match(rule, /\.comes-up,\n\.comes-up-within > \* \{\n  animation: come-up var\(--come-up-duration\) ease-out backwards;\n\}\n@keyframes come-up \{\n  from \{\n    opacity: 0;\n  \}\n\}/);
  assert.doesNotMatch(rule, /transform|animation-delay/);
  // A card's frame is already there, as its place: its words come up inside it.
  assert.match(readFileSync("app/kit/GiftCard.tsx", "utf8"), /\$\{landed \? " comes-up-within" : ""\}/);
  assert.match(home, /const \[listLands\] = useState\(gifts === null\);/);
});

test("4. where the device's memory was wrong, the place opens or closes by its height in 220 ms, and never jumps", () => {
  assert.equal(MOTION.place.heightMs, 220);
  assert.equal(MOTION.place.easing, MOTION.reveal.easing, "the entrance's own curve");
  assert.match(place, /box\.animate\(\[at\(from, gap\.from\), at\(to, gap\.to\)\], \{ duration: MOTION\.place\.heightMs, easing: MOTION\.place\.easing/);
  // Opening starts before the browser paints, from nothing, the gap it will stand in taken back with it.
  assert.match(place, /useLayoutEffect\(\(\) => \{[\s\S]{0,420}slide\(box, 0, height, \{ from: -gapAbove\(box\), to: 0 \}\);/);
  // Closing gives the gap back and only then takes the place away; a card that lands a little taller slides to it.
  assert.match(place, /const closing = slide\(box, from, 0, \{ from: 0, to: -gapAbove\(box\) \}, true\);/);
  assert.match(place, /closing\.onfinish = \(\) => \{\n\s*over = true;\n\s*setThere\(false\);/);
  assert.match(place, /if \(drawn && !reduced\(\)\) slide\(box, from, height\);/);
  // A place that is not open and not closing is not in the page: no room, no gap, no turn taken in the entrance.
  assert.match(place, /if \(!there\) return null;/);
});

test("5. while it is read, the balance says the last figure this device saw, in full ink", () => {
  assert.match(hero, /const value = figure\?\.value \?\? seen;/);
  assert.match(hero, /<ArrivalAmount from=\{seen \?\? value\} to=\{value\}/);
  // The three dots, in the faint ink, are for a device that remembers nothing; the figure that lands then comes up.
  assert.match(hero, /if \(value === undefined\) \{\n\s*return \(/);
  assert.match(hero, /const \[startedWithout\] = useState\(value === undefined\);/);
  assert.match(hero, /className=\{`\$\{AMOUNT\}\$\{startedWithout \? " comes-up" : ""\}`\}/);
  assert.equal((hero.match(/on-surface-faint/g) ?? []).length, 1, "faint for the dots alone");
});

test("6. under less movement everything is there at once", () => {
  assert.match(place, /if \(!open && there && \(!drawn \|\| reduced\(\)\)\) setThere\(false\);/);
  assert.match(place, /if \(!late \|\| reduced\(\)\) return;/);
  const less = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  *,"));
  assert.match(less, /animation-duration: 0\.01ms !important;/, "what comes up in place is there at once");
});

test("the rule is Home's alone for now: no other screen asks for places", () => {
  for (const screen of ["app/kit/Gifts.tsx", "app/kit/Me.tsx", "app/components/GiftPage.tsx", "app/components/CashOut.tsx"]) {
    assert.doesNotMatch(readFileSync(screen, "utf8"), /PlacesOf|from "\.\/Place"|from "\.\.\/kit\/Place"/, screen);
  }
  assert.equal((home.match(/<PlacesOf>/g) ?? []).length, 1);
});
