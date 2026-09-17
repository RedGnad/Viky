import { strict as assert } from "node:assert";
import test from "node:test";
import { globSync, readFileSync } from "node:fs";
import { contrastRatio, NON_TEXT_CONTRAST_MINIMUM, parseHex, relativeLuminance, TEXT_CONTRAST_MINIMUM } from "../src/contrast.js";
import {
  APP_COLUMN_MAX,
  CARD,
  CHARACTERS,
  CHARACTER_SHADOW_OPACITY,
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
  RELIEF,
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

/** OKLCH lightness, chroma and hue, from the published OKLab matrices: "neutral" and "not the accent" are measurable. */
function oklch(hex: string): { lightness: number; chroma: number; hue: number } {
  const { r, g, b } = parseHex(hex);
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [linear(r), linear(g), linear(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    chroma: Math.hypot(a, bb),
    hue: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  };
}

const hueDistance = (one: number, two: number) => {
  const d = Math.abs(one - two) % 360;
  return d > 180 ? 360 - d : d;
};

function cssVariable(name: string, inDark = false): string {
  // Day is the first block; night is the one block behind the device's own question, and there is no other.
  const dark = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
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
 * measured against both grounds as a control is. The founder's rule of 17 Sep 2026, and the practice of the references:
 * the hero hue does not change between the modes, and a sun this light needs no night value of its own.
 */
test("the sun is the same colour by day and by night, and stands off both night grounds on its own", () => {
  assert.equal(COLOURS.dark.accent, COLOURS.light.accent);
  for (const ground of GROUNDS) {
    const ratio = contrastRatio(COLOURS.dark.accent, COLOURS.dark[ground]);
    assert.ok(ratio >= NON_TEXT_CONTRAST_MINIMUM, `the night sun is ${ratio.toFixed(2)}:1 on the ${ground}`);
  }
  // Chosen by eye and then measured, as the brief asks: this is the figure the founder chose it on.
  assert.equal(contrastRatio(COLOURS.dark.accent, COLOURS.dark.background).toFixed(2), "11.71");
  assert.doesNotMatch(css, /#FF5A36|#FF7A5C|#C6FF4D/i, "a colour of a look we no longer wear is still in the stylesheet");
});

/**
 * By day the sun is 1.45:1 on the ground, so what identifies a button is its ink outline (WCAG 1.4.11), the way Cash App
 * builds its green "to work with black text". At night the fill alone does it. Both are measured, never assumed.
 */
test("a button is identified by its ink outline where the fill is too close to the ground, and the outline is always there", () => {
  assert.ok(contrastRatio(COLOURS.light.accent, COLOURS.light.background) < NON_TEXT_CONTRAST_MINIMUM);
  const ui = readFileSync("app/components/ui.ts", "utf8");
  const primary = ui.slice(ui.indexOf("export const PRIMARY_BUTTON"), ui.indexOf("export const SECONDARY_BUTTON"));
  assert.match(primary, /\$\{OUTLINE\}/, "the primary button carries the outline that identifies it");
});

/**
 * The characters' colours (the art direction brief of 17 Sep 2026, section 5): three and no more, never grey, never the
 * accent, and a face that reads on every one of them. They live only inside a character: never text, never a background.
 */
test("the characters have three colours, none grey, none the sun, and a face that reads on each of them", () => {
  for (const appearance of ["light", "dark"] as Appearance[]) {
    const palette = CHARACTERS[appearance];
    const range = [palette.one, palette.two, palette.three];
    assert.equal(new Set(range).size, 3);
    const accent = oklch(COLOURS[appearance].accent);
    for (const colour of range) {
      const measured = oklch(colour);
      assert.ok(measured.chroma >= 0.08, `${colour} is too close to grey`);
      assert.ok(hueDistance(measured.hue, accent.hue) >= 20, `${colour} reads as the sun`);
      const face = contrastRatio(palette.face, colour);
      assert.ok(face >= NON_TEXT_CONTRAST_MINIMUM, `a face on ${colour} is ${face.toFixed(2)}:1`);
    }
    assert.ok(CHARACTER_SHADOW_OPACITY[appearance] > 0 && CHARACTER_SHADOW_OPACITY[appearance] < 1);
  }
  // Only the character draws with them: never a word, never a ground.
  const painters = globSync("app/**/*.{ts,tsx}").filter((file) => /var\(--character-/.test(readFileSync(file, "utf8")));
  assert.deepEqual(painters.sort(), ["app/kit/Character.tsx"]);
});

/** The ground is neutral, which is what the cream of the poster look was not: its chroma is a tenth of that one's. */
test("the ground is neutral by day and by night", () => {
  assert.ok(oklch(COLOURS.light.background).chroma <= 0.02);
  assert.ok(oklch(COLOURS.dark.background).chroma <= 0.05);
  // The cream #FFF3D9 the founder rejected measures 0.036, and the indigo #1C1035 beside it 0.070.
  assert.ok(oklch("#FFF3D9").chroma > 0.03);
  for (const appearance of ["light", "dark"] as Appearance[]) {
    const { background, surface } = COLOURS[appearance];
    assert.ok(Math.abs(oklch(surface).chroma - oklch(background).chroma) <= 0.02, `${appearance} surface is a colour of its own`);
  }
});

/** The relief after dark is a shadow under the ground, never the ink: that is what read as a thick white edge. */
test("the relief is the ink by day and a shadow at night", () => {
  assert.equal(RELIEF.light, COLOURS.light.text);
  assert.notEqual(RELIEF.dark, COLOURS.dark.text);
  assert.ok(relativeLuminance(RELIEF.dark) < relativeLuminance(COLOURS.dark.background));
});

test("three colours per appearance and no fourth background: no joy, no sticker, no day surface, no look layered over another", () => {
  for (const appearance of ["light", "dark"] as Appearance[]) {
    assert.deepEqual(
      Object.keys(COLOURS[appearance]).sort(),
      ["accent", "accentText", "background", "controlBorder", "divider", "muted", "onAccent", "surface", "text"],
    );
  }
  assert.doesNotMatch(css, /--joy|--sticker-|--day-/, "a retired background token is still in the stylesheet");
  assert.doesNotMatch(css, /data-look/, "one look, not one layered over another");
  for (const file of globSync("app/**/*.{ts,tsx}")) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /\bSTICKER\b/, `${file} still names a sticker of the poster look`);
  }
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

test("the app follows the device: one night block, nothing chosen, nothing stored", () => {
  // Apple: "Avoid offering an app-specific appearance setting". Two settings that disagree read as a bug, and the way
  // to stop them disagreeing is to have one (the art direction brief of 17 Sep 2026, section 7).
  assert.match(css, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root \{/);
  assert.doesNotMatch(css, /data-theme/, "an appearance chosen in the product is gone");
  for (const file of [...globSync("app/**/*.{ts,tsx}"), ...globSync("src/**/*.ts")]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /data-theme|viky\.theme/, `${file} still remembers an appearance`);
  }
});

test("the stylesheet says what the tokens say, by day and by night", () => {
  for (const [role, value] of Object.entries(COLOURS.light)) {
    assert.equal(cssVariable(cssName(role)), value, `day ${role}`);
  }
  const night = rule(":root", css.indexOf("@media (prefers-color-scheme: dark)"));
  for (const [role, value] of Object.entries(COLOURS.dark)) {
    assert.equal(variableIn(night, cssName(role)), value, `night ${role}`);
  }
  for (const appearance of ["light", "dark"] as Appearance[]) {
    const block = appearance === "light" ? css.slice(0, css.indexOf("@media")) : night;
    for (const [role, value] of Object.entries(CHARACTERS[appearance])) {
      assert.equal(variableIn(block, `character-${role === "one" ? "1" : role === "two" ? "2" : role === "three" ? "3" : role}`), value, `${appearance} character ${role}`);
    }
    assert.equal(variableIn(block, "character-shadow-opacity"), String(CHARACTER_SHADOW_OPACITY[appearance]));
    assert.equal(variableIn(block, "control-relief-colour"), RELIEF[appearance], `${appearance} relief`);
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
  assert.equal(cssVariable("font-title"), "var(--font-fredoka)");
  assert.equal(cssVariable("font-text"), "var(--font-dm-sans)");
  assert.equal(cssVariable("control-border-width"), `${CONTROL.borderWidth}px`);
  assert.equal(cssVariable("control-relief-depth"), `${CONTROL.reliefDepth}px`);
  assert.equal(cssVariable("card-border-width"), `${CARD.borderWidth}px`);
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
  assert.match(fonts, /Fredoka\(\{[^}]*variable: "--font-fredoka"/);
  assert.match(fonts, /DM_Sans\(\{[^}]*variable: "--font-dm-sans"/);
  assert.doesNotMatch(fonts, /Anton/, "the poster look's face is gone");
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /<html[^>]*fredoka\.variable/);
  assert.match(layout, /<html[^>]*dmSans\.variable/);
});

/**
 * Fredoka sets exactly one display title per destination and the mark, and nothing else: no section title, no
 * amount, no button, nothing inside a task (structure of 17 Sep, section 12, item 7).
 */
test("the title face is the display title and the mark, and nothing else", () => {
  const ui = readFileSync("app/components/ui.ts", "utf8");
  const titleFace = (ui.match(/var\(--font-title\)/g) ?? []).length;
  assert.equal(titleFace, 2, "DISPLAY and MARK, and no other class, name the title face");
  assert.doesNotMatch(ui.slice(ui.indexOf("export const TITLE"), ui.indexOf("export const BODY")), /font-title/);
  for (const file of globSync("app/**/*.tsx")) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /var\(--font-title\)|font-\[family-name:var\(--font-title\)\]/, `${file} sets the title face itself`);
  }
});

/**
 * Every page a person can open is drawn through the shell, which is what gives it the mark, the column and the
 * three destinations. A page that bypassed it would have none of them.
 */
test("every page a person can open is drawn through the shell", () => {
  const pages = globSync("app/**/page.tsx").filter((file) => !file.startsWith("app/dev/")).sort();
  // A page that only redirects draws nothing, so it needs no shell.
  // A task whose steps each draw their own shell counts too: the offer of a gift draws one per step.
  const drawnThroughShell = (file: string) => /from "[^"]*(kit\/Shell|kit\/Home|kit\/Gifts|kit\/Me|GiftPage|FundGift)"|\bredirect\(/.test(readFileSync(file, "utf8"));
  assert.deepEqual(pages.filter((file) => !drawnThroughShell(file)), []);
  assert.ok(pages.length >= 9, `only ${pages.length} pages found`);
});

test("the title face is never in a task: no task screen sets a title in it (structure, item 7)", () => {
  for (const file of globSync("app/components/*.tsx")) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bDISPLAY\b/, `${file} is a task and uses the display face`);
  }
  const fund = readFileSync("app/components/FundGift.tsx", "utf8");
  assert.match(fund, /from "\.\.\/kit\/Shell"/, "every step of offering a gift draws the shell");
});
