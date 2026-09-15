import { strict as assert } from "node:assert";
import test from "node:test";
import { globSync, readFileSync } from "node:fs";
import { contrastRatio, NON_TEXT_CONTRAST_MINIMUM, TEXT_CONTRAST_MINIMUM } from "../src/contrast.js";
import {
  APP_COLUMN_MAX,
  COLOURS,
  CONTROL_COLOURS,
  DAY_SURFACES,
  GROUNDS,
  DESTINATION_MAX,
  PAGE_MARGIN,
  POSTER_COLOURS,
  POSTER_CONTROL,
  POSTER_TYPE,
  PROSE_MAX_CH,
  STICKER_FILLS,
  TWO_PANE_FROM,
  RADIUS,
  SPACE,
  TAP_GAP,
  TAP_TARGET,
  TEXT_COLOURS,
  TYPE,
  type Appearance,
} from "../src/design-tokens.js";

/**
 * The colours are held to a measurement, not to taste, and the stylesheet is held to the tokens. Between
 * them these two ideas are the whole guarantee: a palette nobody measured is how every secondary button in
 * Viky ended up with an outline at 1.48:1 against its background, which is a third of what WCAG asks.
 */

const css = readFileSync("app/globals.css", "utf8");

function cssVariable(name: string, inDark = false): string {
  // The explicit block, because that is the one a person's own choice uses; a separate test pins that the
  // media query carries the same values.
  const dark = css.slice(css.indexOf('[data-theme="dark"]'));
  const source = inDark ? dark : css.slice(0, css.indexOf("@media"));
  const match = source.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(match, `--${name} is missing from globals.css${inDark ? " in dark" : ""}`);
  return match![1].trim();
}

/** The body of the first rule written with exactly this selector, up to its closing brace. */
function rule(selector: string, from = 0): string {
  const start = css.indexOf(`${selector} {`, from);
  assert.ok(start >= 0, `${selector} is missing from globals.css`);
  return css.slice(start, css.indexOf("}", start));
}

function variableIn(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(match, `--${name} is missing from ${block.slice(0, 60)}`);
  return match![1].trim();
}

/** A token's role as the stylesheet names it: stickerOutline becomes sticker-outline. */
const cssName = (role: string) => role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const POSTER = '[data-look="poster"]';

test("every colour that carries text clears 4.5:1 on both surfaces, in both appearances", () => {
  for (const appearance of ["light", "dark"] as Appearance[]) {
    const palette = COLOURS[appearance];
    for (const role of TEXT_COLOURS) {
      // Both, never just one. The page ground is a colour now, so a value that clears the card and fails the
      // ground would put unreadable words on whatever sits outside a card. That happened twice while this
      // palette was being chosen.
      for (const ground of GROUNDS) {
        const ratio = contrastRatio(palette[role], palette[ground]);
        assert.ok(
          ratio >= TEXT_CONTRAST_MINIMUM,
          `${appearance} ${role} is ${ratio.toFixed(2)}:1 on the ${ground}, below ${TEXT_CONTRAST_MINIMUM}`,
        );
      }
    }
    // The primary action is text on the accent rather than on the background, so it is its own pair.
    const onAccent = contrastRatio(palette.onAccent, palette.accent);
    assert.ok(onAccent >= TEXT_CONTRAST_MINIMUM, `${appearance} text on the accent is ${onAccent.toFixed(2)}:1`);
  }
});

test("a control's outline clears 3:1, because it is what identifies the control", () => {
  for (const appearance of ["light", "dark"] as Appearance[]) {
    const palette = COLOURS[appearance];
    for (const role of CONTROL_COLOURS) {
      for (const ground of GROUNDS) {
        const ratio = contrastRatio(palette[role], palette[ground]);
        assert.ok(
          ratio >= NON_TEXT_CONTRAST_MINIMUM,
          `${appearance} ${role} is ${ratio.toFixed(2)}:1 on the ${ground}, below ${NON_TEXT_CONTRAST_MINIMUM} (WCAG 1.4.11)`,
        );
      }
    }
  }
});

/** The old value, kept as a test so the defect cannot come back unnoticed. */
test("the outline we replaced really did fail, so this is not a precaution", () => {
  assert.ok(contrastRatio("#d4d4d8", "#ffffff") < NON_TEXT_CONTRAST_MINIMUM);
});

/**
 * The bright row of days is the one place a saturated colour sits under a word. Each of these was chosen for
 * the state it carries and then measured; the first green failed at night and was darkened until it did not.
 */
test("every surface a day can wear carries the reader's text at 4.5:1", () => {
  for (const appearance of ["light", "dark"] as Appearance[]) {
    for (const [state, surface] of Object.entries(DAY_SURFACES[appearance])) {
      const ratio = contrastRatio(COLOURS[appearance].text, surface);
      assert.ok(ratio >= TEXT_CONTRAST_MINIMUM, `${appearance} ${state} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("the art direction changed the colours and nothing else", () => {
  // The whole argument for building the foundation on neutral colours first: swapping the palette must not
  // move a measurement. If one of these changes, it has to be a decision somebody took, and this is where it
  // gets noticed rather than slipping through with a theme.
  //
  // It has already caught one. The line length went from 60 to 66 on 15 Sep, which was not the art direction
  // at all but a separate call: 60 was the value inside all three published ranges, 66 is web.dev's own
  // stated ideal and six characters past Material's ceiling. Recorded in D65.
  assert.equal(TAP_TARGET, 48);
  assert.equal(TAP_GAP, 12);
  assert.equal(PAGE_MARGIN.compact, 16);
  assert.equal(PAGE_MARGIN.medium, 24);
  assert.equal(APP_COLUMN_MAX, 480);
  assert.equal(PROSE_MAX_CH, 66);
  assert.equal(TYPE.body.size, 16);
  assert.equal(SPACE.lg, 16);
});

test("a person who chooses an appearance beats the phone that disagrees", () => {
  // Light chosen on a dark phone has to win, which only works if the media query excludes an explicit
  // choice. Without the :not(), the phone wins and the control looks broken.
  assert.match(css, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/);
  assert.match(css, /:root\[data-theme="dark"\]/);
});

test("the stylesheet says what the tokens say", () => {
  assert.equal(cssVariable("background"), COLOURS.light.background);
  assert.equal(cssVariable("text"), COLOURS.light.text);
  assert.equal(cssVariable("muted"), COLOURS.light.muted);
  assert.equal(cssVariable("accent"), COLOURS.light.accent);
  assert.equal(cssVariable("control-border"), COLOURS.light.controlBorder);
  assert.equal(cssVariable("surface"), COLOURS.light.surface);
  assert.equal(cssVariable("background", true), COLOURS.dark.background);
  assert.equal(cssVariable("text", true), COLOURS.dark.text);
  assert.equal(cssVariable("muted", true), COLOURS.dark.muted);
  assert.equal(cssVariable("accent", true), COLOURS.dark.accent);
  assert.equal(cssVariable("control-border", true), COLOURS.dark.controlBorder);

  assert.equal(cssVariable("tap-target"), `${TAP_TARGET}px`);
  assert.equal(cssVariable("tap-gap"), `${TAP_GAP}px`);
  assert.equal(cssVariable("page-margin"), `${PAGE_MARGIN.compact}px`);
  assert.equal(cssVariable("app-column-max"), `${APP_COLUMN_MAX}px`);
  assert.equal(cssVariable("prose-max"), `${PROSE_MAX_CH}ch`);
  assert.equal(cssVariable("destination-max"), `${DESTINATION_MAX}px`);
  assert.equal(cssVariable("space-lg"), `${SPACE.lg}px`);
  assert.equal(cssVariable("radius-card"), `${RADIUS.card}px`);
  assert.equal(cssVariable("type-money"), `${TYPE.money.size}px`);
  assert.equal(cssVariable("type-body"), `${TYPE.body.size}px`);
  assert.equal(cssVariable("type-help"), `${TYPE.help.size}px`);
});

test("the page margin grows at the breakpoint Material publishes, and nowhere else", () => {
  assert.match(css, /@media \(min-width: 600px\)/);
  const wide = css.slice(css.indexOf("min-width: 600px"));
  assert.match(wide, new RegExp(`--page-margin:\\s*${PAGE_MARGIN.medium}px`));
});

test("the insets are declared with fallbacks, and never as padding on a pinned bar", () => {
  for (const side of ["top", "right", "bottom", "left"]) {
    assert.match(css, new RegExp(`env\\(safe-area-inset-${side}, 0px\\)`), `${side} inset missing its fallback`);
  }
  assert.doesNotMatch(css, /position:\s*fixed[^}]*padding-bottom:\s*env\(safe-area-inset-bottom/);
});

test("the viewport is declared the way web.dev asks, and lets people zoom", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /width: "device-width"/);
  assert.match(layout, /initialScale: 1/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.doesNotMatch(layout, /userScalable/, "never disable zoom");
  assert.doesNotMatch(layout, /maximumScale/, "never cap zoom");
});

test("four levels of text and no more, each one from a published scale", () => {
  assert.equal(Object.keys(TYPE).length, 4);
  assert.equal(TYPE.money.size, 32);
  assert.equal(TYPE.body.size, 16);
  // Above Apple's 11 floor and above the 12 the removed Lighthouse audit worried about.
  assert.ok(TYPE.help.size >= 14);
  // Material's guidance: about 1.5x for body, about 1.2x for the large sizes.
  assert.ok(TYPE.body.lineHeight / TYPE.body.size >= 1.5);
  assert.ok(TYPE.money.lineHeight / TYPE.money.size <= 1.3);
});

test("the tap target satisfies every source, including the strictest accessibility level", () => {
  assert.equal(TAP_TARGET, 48);
  assert.ok(TAP_TARGET >= 44, "WCAG 2.5.5 at AAA");
  assert.ok(TAP_TARGET >= 24, "WCAG 2.5.8 at AA");
  assert.ok(TAP_GAP >= 12, "Apple's bezelled spacing");
});

test("a journey stays narrow enough that prose can never run too long", () => {
  // 480 pixels at a 16 pixel body is about 53 characters, inside every published range.
  assert.ok(APP_COLUMN_MAX / TYPE.body.size < PROSE_MAX_CH);
});

/**
 * Why 840 and not a device size: web.dev asks for breakpoints chosen from content. Two panes need Material's
 * own 360 default twice, its 24 spacer, and a 24 margin each side. Anything narrower is two cramped columns.
 */
test("two panes begin at the first width where two panes actually fit", () => {
  const needed = 360 * 2 + 24 + PAGE_MARGIN.medium * 2;
  assert.ok(TWO_PANE_FROM >= needed, `two panes need ${needed}, the breakpoint is ${TWO_PANE_FROM}`);
  assert.ok(TWO_PANE_FROM - needed < 100, "and it is not so far past it that a whole size class is wasted");
  assert.ok(DESTINATION_MAX > APP_COLUMN_MAX, "a destination is wider than a journey");
  assert.ok(DESTINATION_MAX < TWO_PANE_FROM, "and narrower than the width at which it splits");
});

/**
 * The poster look is held to the same measurement as the calm one, by day and by night, with one addition of
 * its own: the words it sets on a sticker are measured against every fill a sticker can wear.
 */
test("the poster look's words clear 4.5:1 and its outlines 3:1, by day and by night", () => {
  for (const appearance of ["light", "dark"] as Appearance[]) {
    const palette = POSTER_COLOURS[appearance];
    for (const ground of GROUNDS) {
      for (const role of TEXT_COLOURS) {
        const ratio = contrastRatio(palette[role], palette[ground]);
        assert.ok(ratio >= TEXT_CONTRAST_MINIMUM, `poster ${appearance} ${role} is ${ratio.toFixed(2)}:1 on the ${ground}`);
      }
      for (const role of [...CONTROL_COLOURS, "stickerOutline"]) {
        const ratio = contrastRatio(palette[role], palette[ground]);
        assert.ok(ratio >= NON_TEXT_CONTRAST_MINIMUM, `poster ${appearance} ${role} is ${ratio.toFixed(2)}:1 on the ${ground}`);
      }
    }
    const onAccent = contrastRatio(palette.onAccent, palette.accent);
    assert.ok(onAccent >= TEXT_CONTRAST_MINIMUM, `poster ${appearance} words on the accent are ${onAccent.toFixed(2)}:1`);
    for (const fill of STICKER_FILLS) {
      const ratio = contrastRatio(palette.onSticker, palette[fill]);
      assert.ok(ratio >= TEXT_CONTRAST_MINIMUM, `poster ${appearance} words on ${fill} are ${ratio.toFixed(2)}:1`);
    }
  }
});

test("the stylesheet's poster look says what the tokens say, and night says it both ways", () => {
  const day = rule(`:root:has(${POSTER})`);
  const nightByThePhone = rule(`:root:not([data-theme="light"]):has(${POSTER})`);
  const nightByChoice = rule(`:root[data-theme="dark"]:has(${POSTER})`);
  for (const [role, value] of Object.entries(POSTER_COLOURS.light)) {
    assert.equal(variableIn(day, cssName(role)), value, `day ${role}`);
  }
  for (const [role, value] of Object.entries(POSTER_COLOURS.dark)) {
    assert.equal(variableIn(nightByThePhone, cssName(role)), value, `night by the phone ${role}`);
    assert.equal(variableIn(nightByChoice, cssName(role)), value, `night by choice ${role}`);
  }

  assert.equal(variableIn(day, "font-title"), "var(--font-anton)");
  assert.equal(variableIn(day, "font-text"), "var(--font-dm-sans)");
  assert.equal(variableIn(day, "font-title-weight"), String(POSTER_TYPE.titleWeight));
  assert.equal(variableIn(day, "type-display"), `${POSTER_TYPE.display.compact.size}px`);
  assert.equal(variableIn(day, "type-display-leading"), `${POSTER_TYPE.display.compact.lineHeight}px`);
  assert.equal(variableIn(day, "type-title"), `${POSTER_TYPE.title.size}px`);
  assert.equal(variableIn(day, "type-title-leading"), `${POSTER_TYPE.title.lineHeight}px`);
  assert.equal(variableIn(day, "control-border-width"), `${POSTER_CONTROL.borderWidth}px`);
  assert.equal(variableIn(day, "control-relief"), `0 ${POSTER_CONTROL.reliefDepth}px 0 var(--control-border)`);

  const wide = rule(`:root:has(${POSTER})`, css.indexOf("@media (min-width: 840px)"));
  assert.equal(variableIn(wide, "type-display"), `${POSTER_TYPE.display.expanded.size}px`);
  assert.equal(variableIn(wide, "type-display-leading"), `${POSTER_TYPE.display.expanded.lineHeight}px`);
});

test("the poster look's faces are loaded by next/font and defined on the whole document", () => {
  const fonts = readFileSync("app/fonts.ts", "utf8");
  assert.match(fonts, /from "next\/font\/google"/);
  assert.match(fonts, /Anton\(\{[^}]*variable: "--font-anton"/);
  assert.match(fonts, /DM_Sans\(\{[^}]*variable: "--font-dm-sans"/);
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /<html[^>]*anton\.variable/);
  assert.match(layout, /<html[^>]*dmSans\.variable/);
});

/**
 * The calm look stays on every screen that has not asked for the poster one. When a screen joins, this list
 * grows, and that is a decision somebody took rather than something a shared class did on its own.
 */
test("only the signed-out home wears the poster look so far", () => {
  const wearers = globSync("app/**/*.tsx").filter((file) => readFileSync(file, "utf8").includes('look="poster"'));
  assert.deepEqual(wearers, ["app/components/HomeScreen.tsx"]);
});
