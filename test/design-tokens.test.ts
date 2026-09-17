import { strict as assert } from "node:assert";
import test from "node:test";
import { globSync, readFileSync } from "node:fs";
import { contrastRatio, NON_TEXT_CONTRAST_MINIMUM, TEXT_CONTRAST_MINIMUM } from "../src/contrast.js";
import {
  APP_COLUMN_MAX,
  CARD,
  COLOURS,
  CONTROL,
  CONTROL_COLOURS,
  DESTINATION_MAX,
  DISPLAY_TYPE,
  GROUNDS,
  NAV,
  PAGE_MARGIN,
  PROSE_MAX_CH,
  RADIUS,
  SPACE,
  TAP_GAP,
  TAP_TARGET,
  TEXT_COLOURS,
  TWO_PANE_FROM,
  TYPE,
  type Appearance,
} from "../src/design-tokens.js";

/**
 * The colours are held to a measurement, not to taste, and the stylesheet is held to the tokens. Between
 * them these two ideas are the whole guarantee: a palette nobody measured is how every secondary button in
 * Viky ended up with an outline at 1.48:1 against its background, which is a third of what WCAG asks.
 *
 * Since 17 Sep 2026 there are three colours per appearance and one look: the tests below hold the palette to
 * that too, so a fourth background cannot come back through a token.
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

/** A token's role as the stylesheet names it: controlBorder becomes control-border. */
const cssName = (role: string) => role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

test("every colour that carries text clears 4.5:1 on both grounds, in both appearances", () => {
  for (const appearance of ["light", "dark"] as Appearance[]) {
    const palette = COLOURS[appearance];
    for (const role of TEXT_COLOURS) {
      for (const ground of GROUNDS) {
        const ratio = contrastRatio(palette[role], palette[ground]);
        assert.ok(ratio >= TEXT_CONTRAST_MINIMUM, `${appearance} ${role} is ${ratio.toFixed(2)}:1 on the ${ground}, below ${TEXT_CONTRAST_MINIMUM}`);
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
        assert.ok(ratio >= NON_TEXT_CONTRAST_MINIMUM, `${appearance} ${role} is ${ratio.toFixed(2)}:1 on the ${ground}, below ${NON_TEXT_CONTRAST_MINIMUM} (WCAG 1.4.11)`);
      }
    }
  }
});

/** The old value, kept as a test so the defect cannot come back unnoticed. */
test("the outline we replaced really did fail, so this is not a precaution", () => {
  assert.ok(contrastRatio("#d4d4d8", "#ffffff") < NON_TEXT_CONTRAST_MINIMUM);
});

/**
 * At night the accent fill is what identifies the active destination of the bar and the primary button, so it is
 * measured against both grounds as a control is. The acid green it replaced was a fourth colour; the tomato of the
 * night is the day's tomato one step lighter, and this pins that it stayed in the family.
 */
test("the night accent stands off both grounds on its own, and is the day's tomato, not another colour", () => {
  for (const ground of GROUNDS) {
    const ratio = contrastRatio(COLOURS.dark.accent, COLOURS.dark[ground]);
    assert.ok(ratio >= NON_TEXT_CONTRAST_MINIMUM, `night accent is ${ratio.toFixed(2)}:1 on the ${ground}`);
  }
  // Same hue family: red channel at its top, green in the middle, blue lowest, by day and by night.
  for (const appearance of ["light", "dark"] as Appearance[]) {
    const hex = COLOURS[appearance].accent;
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
    assert.ok(r > g && g > b && r === 255, `${appearance} accent ${hex} is not in the tomato family`);
  }
  assert.doesNotMatch(css, /#C6FF4D/i, "the acid green is gone from the stylesheet");
});

test("three colours per appearance and no fourth background: no joy, no sticker, no day surface", () => {
  for (const appearance of ["light", "dark"] as Appearance[]) {
    assert.deepEqual(
      Object.keys(COLOURS[appearance]).sort(),
      ["accent", "accentText", "background", "controlBorder", "divider", "muted", "onAccent", "surface", "text"],
    );
  }
  assert.doesNotMatch(css, /--joy|--sticker-|--day-/, "a retired background token is still in the stylesheet");
  assert.doesNotMatch(css, /data-look/, "one look, not one layered over another");
  for (const file of globSync("app/**/*.{ts,tsx}")) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /var\(--joy\)|var\(--sticker-|var\(--day-/, `${file} paints a retired background`);
  }
});

test("the art direction changed the colours and nothing else", () => {
  // The whole argument for building the foundation on neutral colours first: swapping the palette must not
  // move a measurement. If one of these changes, it has to be a decision somebody took, and this is where it
  // gets noticed rather than slipping through with a theme. It caught the line length going from 60 to 66 on
  // 15 Sep, recorded in D65.
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

test("the stylesheet says what the tokens say, and night says it both ways", () => {
  for (const [role, value] of Object.entries(COLOURS.light)) {
    assert.equal(cssVariable(cssName(role)), value, `day ${role}`);
  }
  const nightByThePhone = rule(':root:not([data-theme="light"])');
  const nightByChoice = rule(':root[data-theme="dark"]');
  for (const [role, value] of Object.entries(COLOURS.dark)) {
    assert.equal(variableIn(nightByThePhone, cssName(role)), value, `night by the phone ${role}`);
    assert.equal(variableIn(nightByChoice, cssName(role)), value, `night by choice ${role}`);
  }

  assert.equal(cssVariable("tap-target"), `${TAP_TARGET}px`);
  assert.equal(cssVariable("tap-gap"), `${TAP_GAP}px`);
  assert.equal(cssVariable("page-margin"), `${PAGE_MARGIN.compact}px`);
  assert.equal(cssVariable("app-column-max"), `${APP_COLUMN_MAX}px`);
  assert.equal(cssVariable("prose-max"), `${PROSE_MAX_CH}ch`);
  assert.equal(cssVariable("destination-max"), `${DESTINATION_MAX}px`);
  assert.equal(cssVariable("space-lg"), `${SPACE.lg}px`);
  assert.equal(cssVariable("radius-card"), `${RADIUS.card}px`);
  assert.equal(cssVariable("type-money"), `${TYPE.money.size}px`);
  assert.equal(cssVariable("type-title"), `${TYPE.title.size}px`);
  assert.equal(cssVariable("type-body"), `${TYPE.body.size}px`);
  assert.equal(cssVariable("type-help"), `${TYPE.help.size}px`);
  assert.equal(cssVariable("type-display"), `${DISPLAY_TYPE.display.compact.size}px`);
  assert.equal(cssVariable("type-display-leading"), `${DISPLAY_TYPE.display.compact.lineHeight}px`);
  assert.equal(cssVariable("type-mark"), `${DISPLAY_TYPE.mark.size}px`);
  assert.equal(cssVariable("font-title-weight"), String(DISPLAY_TYPE.titleWeight));
  assert.equal(cssVariable("font-title"), "var(--font-anton)");
  assert.equal(cssVariable("font-text"), "var(--font-dm-sans)");
  assert.equal(cssVariable("control-border-width"), `${CONTROL.borderWidth}px`);
  assert.equal(cssVariable("control-relief"), `0 ${CONTROL.reliefDepth}px 0 var(--control-border)`);
  assert.equal(cssVariable("card-border-width"), `${CARD.borderWidth}px`);
  assert.equal(cssVariable("card-border"), "var(--divider)");
  assert.equal(cssVariable("nav-bar-height"), `${NAV.barHeight}px`);
  assert.equal(cssVariable("nav-rail-width"), `${NAV.railWidth}px`);

  const wide = rule(":root", css.indexOf("@media (min-width: 840px)"));
  assert.equal(variableIn(wide, "type-display"), `${DISPLAY_TYPE.display.expanded.size}px`);
  assert.equal(variableIn(wide, "type-display-leading"), `${DISPLAY_TYPE.display.expanded.lineHeight}px`);
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
  assert.ok(NAV.barHeight >= TAP_TARGET, "a destination in the bar is a full target with its label");
});

test("a journey stays narrow enough that prose can never run too long", () => {
  // 480 pixels at a 16 pixel body is about 53 characters, inside every published range.
  assert.ok(APP_COLUMN_MAX / TYPE.body.size < PROSE_MAX_CH);
});

/**
 * Why 840 and not a device size: web.dev asks for breakpoints chosen from content. The rail replaces the bar at
 * the width Material calls expanded, and a destination's column plus the rail must still fit with room.
 */
test("the rail begins where Material's expanded breakpoint begins, and the column fits beside it", () => {
  assert.equal(NAV.from, TWO_PANE_FROM);
  assert.equal(TWO_PANE_FROM, 840);
  assert.ok(NAV.railWidth + DESTINATION_MAX + PAGE_MARGIN.medium * 2 < TWO_PANE_FROM, "the column and the rail fit at the breakpoint");
  assert.ok(DESTINATION_MAX > APP_COLUMN_MAX, "a destination is wider than a journey");
});

test("the faces are loaded by next/font and defined on the whole document", () => {
  const fonts = readFileSync("app/fonts.ts", "utf8");
  assert.match(fonts, /from "next\/font\/google"/);
  assert.match(fonts, /Anton\(\{[^}]*variable: "--font-anton"/);
  assert.match(fonts, /DM_Sans\(\{[^}]*variable: "--font-dm-sans"/);
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /<html[^>]*anton\.variable/);
  assert.match(layout, /<html[^>]*dmSans\.variable/);
});

/**
 * Anton sets exactly one display title per destination and the mark, and nothing else: no section title, no
 * amount, no button, nothing inside a task (structure of 17 Sep, section 12, item 7).
 */
test("Anton is the display title and the mark, and nothing else", () => {
  const ui = readFileSync("app/components/ui.ts", "utf8");
  const anton = (ui.match(/var\(--font-title\)/g) ?? []).length;
  assert.equal(anton, 2, "DISPLAY and MARK, and no other class, name the title face");
  assert.doesNotMatch(ui.slice(ui.indexOf("export const TITLE"), ui.indexOf("export const BODY")), /font-title/);
  for (const file of globSync("app/**/*.tsx")) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /var\(--font-title\)|font-\[family-name:var\(--font-title\)\]/, `${file} sets Anton itself`);
  }
});

/**
 * Every page a person can open is drawn through the shell, which is what gives it the mark, the column and the
 * three destinations. A page that bypassed it would have none of them.
 */
test("every page a person can open is drawn through the shell", () => {
  const pages = globSync("app/**/page.tsx").filter((file) => !file.startsWith("app/dev/")).sort();
  // A page that only redirects draws nothing, so it needs no shell.
  const drawnThroughShell = (file: string) => /from "[^"]*(kit\/Shell|kit\/Home|kit\/Gifts|kit\/Me|GiftPage)"|\bredirect\(/.test(readFileSync(file, "utf8"));
  assert.deepEqual(pages.filter((file) => !drawnThroughShell(file)), []);
  assert.ok(pages.length >= 9, `only ${pages.length} pages found`);
});
