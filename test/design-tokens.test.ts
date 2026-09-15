import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import { contrastRatio, NON_TEXT_CONTRAST_MINIMUM, TEXT_CONTRAST_MINIMUM } from "../src/contrast.js";
import {
  APP_COLUMN_MAX,
  COLOURS,
  CONTROL_COLOURS,
  PAGE_MARGIN,
  PROSE_MAX_CH,
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
  const dark = css.slice(css.indexOf("prefers-color-scheme: dark"));
  const source = inDark ? dark : css.slice(0, css.indexOf("@media"));
  const match = source.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(match, `--${name} is missing from globals.css${inDark ? " in dark" : ""}`);
  return match![1].trim();
}

test("every colour that carries text clears 4.5:1 on its own background, in both appearances", () => {
  for (const appearance of ["light", "dark"] as Appearance[]) {
    const palette = COLOURS[appearance];
    for (const role of TEXT_COLOURS) {
      const ratio = contrastRatio(palette[role], palette.background);
      assert.ok(
        ratio >= TEXT_CONTRAST_MINIMUM,
        `${appearance} ${role} is ${ratio.toFixed(2)}:1 on the background, below ${TEXT_CONTRAST_MINIMUM}`,
      );
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
      const ratio = contrastRatio(palette[role], palette.background);
      assert.ok(
        ratio >= NON_TEXT_CONTRAST_MINIMUM,
        `${appearance} ${role} is ${ratio.toFixed(2)}:1, below ${NON_TEXT_CONTRAST_MINIMUM} (WCAG 1.4.11)`,
      );
    }
  }
});

/** The old value, kept as a test so the defect cannot come back unnoticed. */
test("the outline we replaced really did fail, so this is not a precaution", () => {
  assert.ok(contrastRatio("#d4d4d8", "#ffffff") < NON_TEXT_CONTRAST_MINIMUM);
});

test("the stylesheet says what the tokens say", () => {
  assert.equal(cssVariable("background"), COLOURS.light.background);
  assert.equal(cssVariable("text"), COLOURS.light.text);
  assert.equal(cssVariable("muted"), COLOURS.light.muted);
  assert.equal(cssVariable("accent"), COLOURS.light.accent);
  assert.equal(cssVariable("control-border"), COLOURS.light.controlBorder);
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

test("the column can never make a line of prose too long", () => {
  // 480 pixels at a 16 pixel body is about 53 characters, inside Material's 40 to 60 and everyone else's.
  assert.ok(APP_COLUMN_MAX / TYPE.body.size < PROSE_MAX_CH);
});
