import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { amountText } from "../app/kit/Motion";
import { listMemory, MOST_HELD } from "../app/kit/GiftRows";
import { EASING, MOTION } from "../src/design-tokens";
import { figureInDisplayCurrency } from "../src/display-currency";
import { SEEN_MAX_ENTRIES } from "../src/seen-cookie";

/**
 * An account page arrives once (the founder, 9 Oct 2026, on a living mockup of Home; Me and Gifts the same day, with
 * the same pieces). Six rules, each held to the code that makes it true; what a browser shows of them, image by
 * image, is measured in test/browser/home-arrival.spec.ts.
 */
const home = readFileSync("app/kit/Home.tsx", "utf8");
const me = readFileSync("app/kit/Me.tsx", "utf8");
const gifts = readFileSync("app/kit/Gifts.tsx", "utf8");
const rows = readFileSync("app/kit/GiftRows.tsx", "utf8");
const place = readFileSync("app/kit/Place.tsx", "utf8");
const hero = readFileSync("app/kit/MoneyHero.tsx", "utf8");
const money = readFileSync("app/kit/money.ts", "utf8");
const offer = readFileSync("app/kit/offer/OfferCard.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const account = home.slice(home.indexOf("<PlacesOf>"), home.indexOf("</PlacesOf>"));

test("1. every block is at its place from the first image, held from what this device saw last time", () => {
  // What the device saw is kept where the server reads it while it draws the page, never in a store the browser reads
  // a moment after the first image.
  assert.match(money, /import \{ forgetOnThisScreen, useSeen, writeSeen \} from "\.\/seen";/);
  assert.match(money, /const saw = useSeen\(SAW_MONEY\) === 1;/);
  assert.doesNotMatch(money, /localStorage/);
  assert.match(rows, /const saw = useSeen\(memory\.count\);\n\s*const heights = useSeenMany\(memory\.heights\);/);
  // The way out, on Home and on Me: drawn at once where this device saw money, and it is the button itself.
  assert.match(money, /return holdings !== null && giftsRead \? holdsAnything\(holdings, gifts\) : \(holdings !== null && holdsAnything\(holdings\)\) \|\| sawMoney;/);
  for (const [screen, source] of [["Home", home], ["Me", me]] as const) {
    assert.match(source, /const toTake = useSomethingToTake\(holdings, gifts, /, screen);
    assert.match(source, /<Place open=\{toTake\}>\n\s*<SpendOrWithdraw \/>\n\s*<\/Place>/, screen);
  }
  assert.match(home, /const toTake = useSomethingToTake\(holdings, gifts, giftsRead\);/);
  assert.doesNotMatch(readFileSync("app/kit/SpendOrWithdraw.tsx", "utf8"), /holding|invisible/);
  // The gifts: one place for each gift this device saw, at the height its card had. Home shows three, Gifts all of
  // each of its two lists, and no list holds more places than a memory gone stale could be forgiven.
  assert.match(home, /const held = gifts === null && !problem \? Math\.min\(SHOWN, sawGifts \?\? 0\) : 0;/);
  assert.match(account, /<GiftRows gifts=\{gifts === null \? null : moving\} held=\{held\} heights=\{sawHeights\} landed=\{listLands\} \/>/);
  assert.match(gifts, /<GiftRows gifts=\{gifts\} held=\{saw\.saw \?\? 0\} heights=\{saw\.heights\} landed=\{landed\} \/>/);
  assert.match(rows, /const count = gifts === null \? Math\.min\(MOST_HELD, held\) : gifts\.length;/);
  assert.equal(MOST_HELD, 8);
  assert.match(rows, /<Reveal>\{gifts\?\.\[at\] \? <GiftCard gift=\{gifts\[at\]\} landed=\{landed\} \/> : <GiftPlace height=\{heights\[at\]\} \/>\}<\/Reveal>/);
  // The line that says a list is read is for a device that remembers nothing of it.
  assert.match(account, /<Place open=\{!problem && gifts === null && sawGifts === undefined\}>\n\s*<WaitLine>\{W\.loading\}<\/WaitLine>/);
  assert.match(gifts, /<Place open=\{!problem && gifts === null && !remembered\}>\n\s*<WaitLine>\{HOME\.loading\}<\/WaitLine>/);
  // What is remembered is what the screen showed, written once it has settled; numbers only, and few of them.
  assert.match(rows, /writeSeen\(memory\.count, length\);/);
  assert.match(rows, /writeSeen\(memory\.heights\[at\], Math\.round\(card\.getBoundingClientRect\(\)\.height\)\)/);
  assert.match(money, /writeSeen\(SAW_MONEY, holdsAnything\(holdings, gifts\) \? 1 : 0\);/);
  assert.deepEqual(listMemory("home.gifts"), { count: "viky.seen.home.gifts", heights: ["viky.seen.home.gifts.0", "viky.seen.home.gifts.1", "viky.seen.home.gifts.2"] });
  // Home's list, the two of Gifts, the way out and the card's amount: fourteen entries of the forty the cookie keeps.
  assert.ok(SEEN_MAX_ENTRIES >= 40);
});

test("1b. the card a gift is filled in on starts on what it started on last time, while the account is read", () => {
  // It showed thirty, then the account's own money a second later: the last thing to change as Home arrived.
  assert.match(offer, /const startedOn = useSeen\(STARTED_ON\);/);
  assert.match(offer, /const held = holdings \? dollarsHeld\(holdings\) : holdings === null && startedOn !== undefined \? BigInt\(Math\.round\(startedOn\)\) : undefined;/);
  assert.match(offer, /const starting = untouched \? startingFigure\(money\.currency, money\.rates, held\) : undefined;/);
  assert.match(offer, /writeSeen\(STARTED_ON, Number\(dollarsHeld\(holdings\)\)\);/);
  // The page without an account gives the card no holdings at all, so nothing remembered ever reaches it.
  assert.match(home, /<OfferCard paying=\{paying\} onPaying=\{setPaying\} onMaking=\{setMaking\} \/>/);
  assert.match(home, /<OfferCard holdings=\{holdings\} paying=\{paying\} onPaying=\{setPaying\} onMaking=\{setMaking\} \/>/);
});

test("2. one entrance, today's, staggered by 80 ms, and no block plays it once the screen has arrived", () => {
  assert.equal(MOTION.reveal.staggerMs, 80);
  assert.match(css, /--page-enter-stagger: 80ms;/);
  // A place put on a drawn screen says so, and the stylesheet never enters it, nor the blocks of a list it holds,
  // under less movement either. A place that holds a list from the first image leaves the entrance to its blocks.
  assert.match(place, /<div ref=\{outer\} data-place="" \{\.\.\.\(late \? \{ "data-late": "" \} : \{\}\)\} \{\.\.\.\(turns \? \{ "data-turns": "" \} : \{\}\)\}>/);
  assert.match(css, /\.page-enters > \[data-late\],\n\.page-enters \.arrives-in-turn > \[data-late\],\n\.page-enters \[data-late\] \.arrives-in-turn > \*,\n\.page-enters > \[data-turns\] \{\n  animation: none !important;\n\}/);
  assert.match(readFileSync("app/kit/Motion.tsx", "utf8"), /!block\.hasAttribute\("data-turns"\)/, "and the scroll reveal leaves it to them too");
  // Every block of the account's Home that a reading can bring later stands in a place of its own.
  for (const block of ["<SpendOrWithdraw />", "<WaitLine>{W.loading}</WaitLine>", "<EmptyState>{W.empty}</EmptyState>", "<MarkNotice />", "{W.seeAll}"]) {
    const at = account.indexOf(block);
    assert.ok(at > 0, block);
    const before = account.slice(0, at);
    assert.ok(before.lastIndexOf("<Place") > before.lastIndexOf("</Place>"), `${block} stands in a place`);
  }
  for (const notice of ["app/kit/KeyKept.tsx", "app/kit/FinishTheGift.tsx"]) assert.match(readFileSync(notice, "utf8"), /return \(\n\s*<Place>\n\s*<section/, notice);
  // On Gifts the two lists are places themselves: they open by their height where nothing was remembered.
  assert.equal((gifts.match(/<Place open=\{lists\} turns>/g) ?? []).length, 2);
  assert.match(gifts, /const lists = gifts !== null \|\| \(remembered && !problem\);/);
  // A gift's row is the same element from the first image to the last, so nothing is built anew when its card lands.
  assert.match(rows, /return Array\.from\(\{ length: most \}, \(_, at\) => \(\n\s*<Place key=\{at\} open=\{at < count\}>/);
  assert.doesNotMatch(`${home}${gifts}`, /<Reveal key=\{gift\.giftId\}>/);
});

test("3. what arrives later changes in place: a fade of 180 ms, no rise, no delay tied to where it stands", () => {
  assert.deepEqual(MOTION.place, { fadeMs: 180, heightMs: 220, easing: EASING.standard, paleAfterMs: 4000 });
  assert.match(css, new RegExp(`--come-up-duration: ${MOTION.place.fadeMs}ms;`));
  const rule = css.slice(css.indexOf(".comes-up,"), css.indexOf("/*", css.indexOf(".comes-up,")));
  assert.match(rule, /\.comes-up,\n\.comes-up-within > \* \{\n  animation: come-up var\(--come-up-duration\) ease-out backwards;\n\}\n@keyframes come-up \{\n  from \{\n    opacity: 0;\n  \}\n\}/);
  assert.doesNotMatch(rule, /transform|animation-delay/);
  // A card's frame is already there, as its place: its words come up inside it.
  assert.match(readFileSync("app/kit/GiftCard.tsx", "utf8"), /\$\{landed \? " comes-up-within" : ""\}/);
  for (const screen of [home, gifts]) assert.match(screen, /const \[listLands\] = useState\(gifts === null\);/);
  // On Me the figure is not counted to: one that differs from the first image's comes up where it stands.
  assert.match(me, /<span key=\{said\} className=\{said === saidFirst \? undefined : "comes-up"\}>/);
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

test("5. while it is read, the figure is the last one this device saw: full ink for four seconds, the faint ink after", () => {
  // One piece for Home and for Me.
  assert.match(hero, /export function useFigureWhileRead\(address: string \| undefined, money: DisplayMoney, dollars: bigint \| undefined\) \{/);
  assert.match(hero, /const \{ figure, seen, value, written, startedWithout, pale \} = useFigureWhileRead\(address, money, dollars\);/);
  assert.match(me, /const yours = useFigureWhileRead\(address, money, held\);/);
  // Never a zero it remembers: a zero over money that has just arrived is what the rule of 4 Oct 2026 refuses.
  assert.match(hero, /const value = figure\?\.value \?\? \(seen \|\| undefined\);/);
  assert.match(hero, /<ArrivalAmount from=\{seen \?\? value\} to=\{value\}/);
  // A reading that does not land: the faint ink of the three dots after four seconds, full ink again when it lands.
  assert.equal(MOTION.place.paleAfterMs, 4000);
  assert.match(hero, /const awaited = figure === undefined && value !== undefined;\n\s*const \[pale, setPale\] = useState\(false\);\n\s*if \(!awaited && pale\) setPale\(false\);/);
  assert.match(hero, /const timer = setTimeout\(\(\) => setPale\(true\), MOTION\.place\.paleAfterMs\);/);
  for (const screen of [hero, me]) assert.match(screen, /pale \? " text-\[var\(--on-surface-faint\)\]" : ""/);
  assert.match(css, /\.ink-while-read \{\n  transition: color var\(--come-up-duration\) ease-out;\n\}/);
  // The three dots are for a device that remembers nothing; the figure that lands then comes up in their place.
  assert.match(hero, /if \(value === undefined\) \{\n\s*return \(/);
  assert.match(hero, /const \[startedWithout\] = useState\(value === undefined\);/);
  // The figure remembered is written as the figure read will be, letter for letter, whatever the currency: a figure
  // that is the same when it lands must not change by a space.
  const rates = { date: "2026-10-09", usdPerEur: 1.1, eurPerUsd: 1 / 1.1, xofPerUsd: 655.957 / 1.1, eurPer: { USD: 1.1, EUR: 1 }, readAtMs: 0 } as unknown as Parameters<typeof figureInDisplayCurrency>[2];
  for (const currency of ["USD", "EUR", "XOF"]) {
    for (const units of [0n, 8_980_000n, 14_000_000n, 1_234_567_890n]) {
      const figure = figureInDisplayCurrency(units, currency, rates);
      const value = figure.decimals === 0 ? Math.round(figure.value) : Math.round(figure.value * 100) / 100;
      assert.equal(amountText(value, figure), figure.text, `${currency} ${units}`);
    }
  }
});

test("6. under less movement everything is there at once", () => {
  assert.match(place, /if \(!open && there && \(!drawn \|\| reduced\(\)\)\) setThere\(false\);/);
  assert.match(place, /if \(!late \|\| reduced\(\)\) return;/);
  const less = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  *,"));
  assert.match(less, /animation-duration: 0\.01ms !important;/, "what comes up in place is there at once");
  assert.match(less, /transition-duration: 0\.01ms !important;/, "and an ink changes at once");
});

test("the rule stands on Home, Me and Gifts; a gift's page and the way out come after, and tasks keep their wait line", () => {
  for (const screen of [home, me, gifts]) assert.equal((screen.match(/<PlacesOf>/g) ?? []).length, 1);
  for (const screen of ["app/components/GiftPage.tsx", "app/components/CashOut.tsx", "app/components/PayGift.tsx", "app/components/GiftCardOut.tsx", "app/components/MobileMoneyOut.tsx"]) {
    assert.doesNotMatch(readFileSync(screen, "utf8"), /PlacesOf|from "\.\/Place"|from "\.\.\/kit\/Place"/, screen);
  }
});
