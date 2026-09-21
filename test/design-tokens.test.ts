import { strict as assert } from "node:assert";
import test from "node:test";
import { existsSync, globSync, readFileSync } from "node:fs";
import { contrastRatio, NON_TEXT_CONTRAST_MINIMUM, parseHex, relativeLuminance, TEXT_CONTRAST_MINIMUM } from "../src/contrast.js";
import { APPEARANCE } from "../src/sentences.js";
import {
  APP_COLUMN_MAX,
  CARD,
  CARD_PLACED,
  CARD_TYPE,
  CHARACTERS,
  CHARACTER_SHADOW_OPACITY,
  COLOURS,
  CONTROL,
  CONTROL_COLOURS,
  DESTINATION_MAX,
  DISPLAY_TYPE,
  HERO_TYPE,
  LEAD_TYPE,
  META_TYPE,
  TRACKING,
  TYPE_SCALE,
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
/**
 * The ground was neutral in both appearances until the rendered mockups of 19 Sep 2026 drew a lavender one for day
 * and kept the indigo for night, with the same cream card on both. What has to hold now is not neutrality: it is
 * that the card is never the value of the ground it sits on, which is what a card being an object means.
 */
test("the card stands off the ground it is on, by day and by night", () => {
  assert.ok(oklch(COLOURS.dark.background).chroma <= 0.05);
  const paper = "#FFF6E2";
  assert.ok(contrastRatio(paper, COLOURS.light.background) >= 1.3, "the cream on the day ground");
  assert.ok(contrastRatio(paper, COLOURS.dark.background) > 15, "and on the night one");
  // The surface the fields, the bar and the rail sit on is not a card: it stays near its ground, and the white one
  // of day sits at 1.41:1 on the lavender, which is a shade and not an object.
  for (const appearance of ["light", "dark"] as Appearance[]) {
    const { background, surface } = COLOURS[appearance];
    assert.ok(contrastRatio(surface, background) <= 1.5, `${appearance} surface reads as a card rather than as a shade`);
  }
});

/** The relief after dark is a shadow under the ground, never the ink: that is what read as a thick white edge. */
test("the relief is the ink by day, and at night a line that can be seen and is not a white edge", () => {
  assert.equal(RELIEF.light, COLOURS.light.text);
  // A shade under the ground, 1.09:1, measured invisible on production on 20 Sep 2026: the night door had "no
  // effect". The full pale of the outline read as a white edge on 17 Sep. Between the two: the night's muted
  // lavender, which is a line the ground shows and the outline outshines.
  assert.equal(RELIEF.dark, COLOURS.dark.muted, "the night relief is a colour the night already has");
  assert.ok(contrastRatio(RELIEF.dark, COLOURS.dark.background) >= 3, "a relief nobody can see is no relief");
  assert.ok(contrastRatio(RELIEF.dark, COLOURS.dark.background) < contrastRatio(COLOURS.dark.controlBorder, COLOURS.dark.background), "and it stays under the outline");
});

test("three colours per appearance and no fourth background: no joy, no sticker, no day surface, no look layered over another", () => {
  for (const appearance of ["light", "dark"] as Appearance[]) {
    assert.deepEqual(
      Object.keys(COLOURS[appearance]).sort(),
      ["accent", "accentText", "background", "controlBorder", "divider", "muted", "onAccent", "surface", "text", "tonal"],
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

/**
 * The fill of a button that is not the one action (K, rule 10, 19 Sep 2026). It is not a fourth background: nothing
 * but a control is ever painted with it, and what identifies the control is still its outline (WCAG 1.4.11). What it
 * has to be is visible as a fill on both the grounds a button sits on, and readable.
 */
test("the quiet button is filled, seen on both grounds, and its words clear 4.5:1", () => {
  for (const appearance of ["light", "dark"] as Appearance[]) {
    const palette = COLOURS[appearance];
    for (const ground of GROUNDS) {
      const seen = contrastRatio(palette.tonal, palette[ground]);
      assert.ok(seen >= 1.1, `${appearance} tonal is ${seen.toFixed(2)}:1 on the ${ground}, which is not a fill anybody sees`);
      assert.ok(seen <= 2, `${appearance} tonal is ${seen.toFixed(2)}:1 on the ${ground}: that is a second surface, not a quiet fill`);
    }
    for (const role of ["text", "muted"] as const) {
      const ratio = contrastRatio(palette[role], palette.tonal);
      assert.ok(ratio >= TEXT_CONTRAST_MINIMUM, `${appearance} ${role} on the quiet button is ${ratio.toFixed(2)}:1`);
    }
  }
  const ui = readFileSync("app/components/ui.ts", "utf8");
  assert.match(ui, /SECONDARY_BUTTON = `[^`]*bg-\[var\(--tonal\)\]/, "the quiet button is hollow again");
  assert.match(ui, /INLINE_BUTTON = `[^`]*bg-\[var\(--tonal\)\]/);
  assert.match(ui, /PRIMARY_BUTTON = `[^`]*bg-\[var\(--accent\)\]/, "the one action stopped carrying the accent");
  // The outline every button carries comes from one constant, so it cannot be dropped from one of them alone.
  assert.match(ui, /const OUTLINE = "border-\[length:var\(--control-border-width\)\] border-\[var\(--control-border\)\]"/);
  for (const name of ["SECONDARY_BUTTON", "INLINE_BUTTON", "PRIMARY_BUTTON"]) {
    const from = ui.indexOf(`${name} = \``);
    const button = ui.slice(from, ui.indexOf("`;", from));
    assert.match(button, /\$\{OUTLINE\}/, `${name} lost the outline WCAG 1.4.11 asks for`);
    assert.doesNotMatch(button, /disabled:opacity/, `${name} fades instead of saying it cannot be pressed`);
    // Shut, every one of them keeps its filled shape and its relief and loses its colour (the mockups, and the
    // founder on 19 Sep). A fill at half strength made a live button and a dead one one pair of pills at a squint.
    assert.match(button, /disabled:bg-\[var\(--action-off\)\]/, `${name} loses its shape rather than its colour`);
    assert.match(button, /disabled:text-\[var\(--action-off-ink\)\]/, `${name} keeps words nobody measured`);
    assert.match(
      button,
      /disabled:\[box-shadow:0_var\(--action-relief-depth\)_0_var\(--action-off-deep\)\]/,
      `${name} gives up its relief when it cannot be pressed`,
    );
  }

  /*
   * The one action is the exception, and it is the rendered mockups of 19 Sep 2026 that made it one (D113): shut, it
   * is still a filled, relieved button saying what it is waiting for, because on a card it is the shape a person is
   * waiting to press. What it may not be is unreadable: the image's own words on that fill measure 2.64:1.
   */
  const primary = ui.slice(ui.indexOf("PRIMARY_BUTTON = `"), ui.indexOf("`;", ui.indexOf("PRIMARY_BUTTON = `")));
  assert.match(primary, /disabled:bg-\[var\(--action-off\)\]/);
  assert.match(primary, /disabled:\[box-shadow:0_var\(--action-relief-depth\)_0_var\(--action-off-deep\)\]/);
  // One shut action, on the cream of the card in both appearances, and its words readable on it: the image's own
  // #9A8B62 measures 2.64:1 there.
  assert.ok(contrastRatio("#6F6133", "#EFE3C4") >= TEXT_CONTRAST_MINIMUM, "the words of the shut action are readable on it");
  assert.match(css, /--action-off-ink: #6F6133;/);
  // The ink under it, not a darker yellow: the same slab every control stands on, and the only one that reads as a
  // thickness against a sun fill (D142).
  assert.match(primary, /\[box-shadow:0_var\(--action-relief-depth\)_0_var\(--control-relief-colour\)\]/, "the ink is under it when it can be pressed");
});

test("the art direction changed the colours and nothing else", () => {
  // The whole argument for building the foundation on neutral colours first: swapping the palette must not
  // move a measurement. If one of these changes, it has to be a decision somebody took, and this is where it
  // gets noticed rather than slipping through with a theme. It caught the line length going from 60 to 66 on
  // 15 Sep, recorded in D65.
  assert.equal(TAP_TARGET, 48);
  assert.equal(TAP_GAP, 12);
  // 20 on a phone since D133, which is a decision somebody took: the founder read the page as cramped against a
  // real handset's edge, where Material's 16 is a floor and not a ceiling. This line is where that gets noticed.
  assert.equal(PAGE_MARGIN.compact, 20);
  assert.equal(PAGE_MARGIN.medium, 24);
  assert.equal(APP_COLUMN_MAX, 480);
  assert.equal(PROSE_MAX_CH, 66);
  assert.equal(TYPE.body.size, 16);
  assert.equal(SPACE.lg, 16);
});

test("the appearance follows the device until somebody chooses, and one press takes the other", () => {
  // Apple: "Avoid offering an app-specific appearance setting", because two settings that disagree read as a bug.
  // The control is back all the same (D97, 18 Sep 2026), and the way the two stop disagreeing is that the device is
  // the default and stays it until a person presses: "as your device" is a state, not the absence of one.
  assert.match(css, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\) \{/, "a chosen day does not survive a dark device");
  assert.match(css, /:root\[data-theme="dark"\] \{/, "night cannot be asked for on a device set to light");

  // Two appearances and no third to press through (the founder, 20 Sep 2026): the control shows the one the screen is
  // in, decided by the same rule that paints the screen, and one press takes the other.
  const control = readFileSync("app/kit/Appearance.tsx", "utf8");
  assert.match(control, /appearanceNow\(\) === "dark" \? "light" : "dark"/, "one press no longer takes the other appearance");
  assert.doesNotMatch(control, /"system"/, "a third state is back on the control");
  assert.match(control, /className="appearance-sun"/);
  assert.match(control, /className="appearance-moon"/);
  assert.match(css, /:root\[data-theme="dark"\] \.appearance-moon \{\s*display: inline;/, "the moon is not drawn by the rule that paints the night");
  assert.doesNotMatch(control, /--accent(?!-text)/, "the appearance control wears the accent, which belongs to the action and the destination");
  assert.match(control, /h-\[var\(--tap-target\)\] w-\[var\(--tap-target\)\]/, "the target is no longer the measured one");
  assert.match(control, /aria-label=\{W\.toggle\}/, "an icon alone says neither what this is nor what a press does");
  assert.match(APPEARANCE.toggle, /Press/, "the name says what a press does");

  // The choice lives in the person's own browser, and nowhere else: no account carries it, nothing is sent.
  const theme = readFileSync("src/theme.ts", "utf8");
  assert.match(theme, /localStorage\.setItem\(THEME_STORAGE_KEY/);
  assert.match(readFileSync("app/layout.tsx", "utf8"), /THEME_BOOT_SCRIPT/, "a chosen appearance would flash the other one on every load");

  // In the header of every screen, not on some of them: the shell draws it beside the mark before it asks what kind
  // of screen this is. `pnpm capture:appearance` photographs a destination, a task and a document to show it.
  const shell = readFileSync("app/kit/Shell.tsx", "utf8");
  const header = shell.slice(shell.indexOf("<header"), shell.indexOf("</header>"));
  assert.match(header, /<Appearance \/>/, "the header lost the appearance control");
  assert.doesNotMatch(header.slice(0, header.indexOf("<Appearance />")), /props\.kind === "[a-z]+" \?/, "the control is drawn on some kinds of screen only");
});

test("the stylesheet says what the tokens say, by day and by night", () => {
  for (const [role, value] of Object.entries(COLOURS.light)) {
    assert.equal(cssVariable(cssName(role)), value, `day ${role}`);
  }
  const night = rule(':root:not([data-theme="light"])', css.indexOf("@media (prefers-color-scheme: dark)"));
  // Night asked for and night because of the device paint the same screen: one list of values, written twice, and a
  // value that stops matching here is a screen that changes when a person presses rather than only its ground.
  const chosenNight = rule(':root[data-theme="dark"]');
  for (const [role, value] of Object.entries(COLOURS.dark)) {
    assert.equal(variableIn(night, cssName(role)), value, `night ${role}`);
    assert.equal(variableIn(chosenNight, cssName(role)), value, `chosen night ${role}`);
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

/** A major third from 16, rounded as K writes it: the only sizes the product is allowed to use (rule 6, D126). */
const SCALE: readonly number[] = TYPE_SCALE;

/**
 * The first principle of the design pass of 20 Sep 2026 (D126): every text size on every screen is a step of the
 * scale, with nothing between two steps. Production had six sizes from six images (36, 28, 42, 17, 11, 26). Read
 * from the stylesheet itself, at the root and inside every breakpoint, so a size typed from an image can never come
 * back quietly. The promise (D128) is 39 in the one column and 76 beside the card from 1024, both steps.
 */
test("every text size in the stylesheet is a step of the scale, and the promise takes its two steps", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const sizes = [...css.matchAll(/--type-([a-z-]+): (\d+(?:\.\d+)?)px;/g)]
    .filter(([, name]) => !/leading|tracking/.test(name))
    .map(([, name, px]) => ({ name, px: Number(px) }));
  assert.ok(sizes.length >= 14, `${sizes.length} sizes read`);
  for (const { name, px } of sizes) assert.ok(SCALE.includes(px), `--type-${name} is ${px}, which is not a step of the scale`);
  const root = css.slice(0, css.indexOf("@media (min-width: 600px)"));
  const from1024 = css.slice(css.indexOf("@media (min-width: 1024px)"), css.indexOf("@media (prefers-color-scheme: dark)"));
  assert.equal(HERO_TYPE.from, 1024);
  assert.match(root, new RegExp(`--type-hero: ${HERO_TYPE.compact.size}px;`));
  assert.match(root, new RegExp(`--type-lead: ${LEAD_TYPE.compact.size}px;`));
  assert.match(from1024, new RegExp(`--type-hero: ${HERO_TYPE.wide.size}px;`));
  assert.match(from1024, new RegExp(`--type-hero-leading: ${HERO_TYPE.wide.lineHeight};`), "the advisor's 1.02, unitless");
  assert.match(from1024, new RegExp(`--type-lead: ${LEAD_TYPE.wide.size}px;`));
  for (const size of [HERO_TYPE.compact.size, HERO_TYPE.wide.size, LEAD_TYPE.compact.size, LEAD_TYPE.wide.size]) assert.ok(SCALE.includes(size), `${size}`);
  // The card's three voices, on the scale and matched in the stylesheet.
  for (const [voice, level] of Object.entries(CARD_TYPE)) {
    assert.ok(SCALE.includes(level.size), `${voice} is ${level.size}`);
    assert.match(root, new RegExp(`--type-card-${voice}: ${level.size}px;`));
  }
  assert.ok(CARD_TYPE.amount.size > CARD_TYPE.who.size && CARD_TYPE.who.size > CARD_TYPE.label.size, "the amount stays the star of the card");
  // One left edge below 1024: the card starts where the promise starts, not in the middle of the column.
  assert.match(css, /\.gift-card-width \{[^}]*margin-inline: 0;/, "the card is on the column's left edge");
});

/**
 * The niche the founder named on 20 Sep 2026, "Neo Brutalism Juice", as a constraint that measures (D128): no blur
 * anywhere, neither a filter nor a shadow. The ground is a flat; the gift card stands by its colour (17:1 on the
 * ink) and its 2 px edge and wears no shadow at all; no other card wears one either.
 */
test("no blur anywhere: no halo on the ground, no shadow under a card, and the gift card keeps its 2 px edge", () => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.doesNotMatch(css, /blur\(/, "a filter with a blur is back");
  assert.doesNotMatch(css, /body::before|body::after/, "the two halos are gone with their pseudo-elements");
  assert.equal((css.match(/--card-shadow: none;/g) ?? []).length, 3, "day, the device's night and the chosen night");
  assert.doesNotMatch(css, /--card-shadow: 0 /, "no blurred shadow token remains");
  assert.match(css, /\.gift-card-placed \{\s*border: 2px solid var\(--card-placed-edge\);\s*box-shadow: none;\s*\}/);
  assert.equal(CARD_PLACED.edgeWidth, 2);
  const root = css.slice(0, css.indexOf("@media (prefers-color-scheme: dark)"));
  assert.match(root, new RegExp(`--card-placed-edge: ${CARD_PLACED.edge.light};`));
  const night = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
  assert.equal((night.match(new RegExp(`--card-placed-edge: ${CARD_PLACED.edge.dark};`, "g")) ?? []).length, 2, "both night blocks");
  assert.equal(CARD_PLACED.edge.dark, COLOURS.dark.controlBorder, "the night edge is the controls' edge");
  // The head of the page is the one character with an edge, and the founder chose its two colours (D133): the ink
  // at night, a light yellow by day, knowing that the yellow is under the ratio a control's border must hold.
  assert.match(css, /--character-hero-edge: #FFE7A8;/);
  // At night it is a violet above the ground, not black, and lighter at each asking: 1.25, then 1.62, now 2.14:1.
  assert.equal((css.match(/--character-hero-edge: #4C4189;/g) ?? []).length, 2, "both night blocks");
  assert.match(readFileSync("app/kit/offer/OfferCard.tsx", "utf8"), /gift-card-width gift-card-placed/, "and the one card is the one placed");
});

test("four levels of text and no more, every one of them a step of the same scale", () => {
  assert.equal(Object.keys(TYPE).length, 4);
  for (const [role, level] of Object.entries(TYPE)) {
    assert.ok(SCALE.includes(level.size), `${role} is ${level.size}, which is not a step of the scale`);
  }
  assert.equal(TYPE.body.size, 16, "the base of the scale is the body");
  // Above Apple's 11 floor and above the 12 the removed Lighthouse audit worried about.
  assert.ok(TYPE.help.size >= 13);
  // Material's guidance: about 1.5x for body, about 1.2x for the large sizes.
  assert.ok(TYPE.body.lineHeight / TYPE.body.size >= 1.5);
  assert.ok(TYPE.money.lineHeight / TYPE.money.size <= 1.3);
  // The display and the mark are on the same scale, and the third voice is its smallest step.
  for (const size of [DISPLAY_TYPE.display.compact.size, DISPLAY_TYPE.display.expanded.size, DISPLAY_TYPE.mark.size, META_TYPE.size]) {
    assert.ok(SCALE.includes(size), `${size} is not a step of the scale`);
  }
  // Letter spacing by role: tight where it is big, nothing on the body, open on a label and on the small capitals.
  assert.ok(TRACKING.display.expanded < TRACKING.display.compact && TRACKING.display.compact < 0);
  assert.equal(TRACKING.body, 0);
  assert.ok(TRACKING.label > 0 && TRACKING.meta > 0);
  assert.equal(META_TYPE.transform, "uppercase", "the third voice is what carries capitals, and nothing else does");
  // A voice nobody speaks in is a token, not a voice. The line it is for is the one that says where you are, on
  // every step of every task ("Step 2 of 5"), which is the shell's caption.
  const meta = readFileSync("app/components/ui.ts", "utf8").match(/export const META = "([^"]+)"/);
  assert.ok(meta, "the meta voice has no class");
  assert.match(meta[1], /uppercase/);
  assert.match(readFileSync("app/kit/Shell.tsx", "utf8"), /props\.caption \? <p className=\{META\}>/, "no line in the product speaks it");
});

test("one rhyme: a capsule, and a single radius for everything with corners", () => {
  assert.equal(RADIUS.control, RADIUS.card, "a field and a card no longer round differently");
  assert.equal(RADIUS.sheet, RADIUS.card, "a sheet is a card of the same family");
  assert.equal(RADIUS.full, 9999, "a button and a character stay capsules");
  const css = readFileSync("app/globals.css", "utf8");
  for (const name of ["control", "card", "sheet"]) {
    assert.match(css, new RegExp(`--radius-${name}: ${RADIUS.card}px;`), `--radius-${name} left the one radius`);
  }
});

test("the tap target satisfies every source, including the strictest accessibility level", () => {
  assert.equal(TAP_TARGET, 48);
  assert.ok(TAP_TARGET >= 44, "WCAG 2.5.5 at AAA");
  assert.ok(TAP_TARGET >= 24, "WCAG 2.5.8 at AA");
  assert.ok(TAP_GAP >= 12, "Apple's bezelled spacing");
  assert.ok(NAV.barHeight >= TAP_TARGET, "a destination in the bar is a full target with its label");
});

/**
 * The night a person chooses and the night a device reports must say exactly the same thing (D140). They are two
 * blocks in the stylesheet, `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and
 * `:root[data-theme="dark"]`, and a variable added to one and forgotten in the other is invisible to anyone whose
 * device already agrees with their choice. That is what happened to the head character's blend: its edge followed
 * the appearance control and its two colours did not, so the founder saw one blend whichever night he was in, three
 * times, while every measurement of mine passed because it emulated the device and never the control.
 */
test("the night a person chooses says everything the night a device reports says", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const insideOf = (start: string) => {
    const at = css.indexOf(start);
    assert.ok(at > 0, `${start} is in the stylesheet`);
    const open = css.indexOf("{", at) + 1;
    let depth = 1;
    let index = open;
    while (depth > 0 && index < css.length) {
      if (css[index] === "{") depth += 1;
      if (css[index] === "}") depth -= 1;
      index += 1;
    }
    return css.slice(open, index - 1);
  };
  const variables = (text: string) => new Map([...text.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((one) => [one[1], one[2].trim()]));
  const device = variables(insideOf("@media (prefers-color-scheme: dark)"));
  const chosen = variables(insideOf(':root[data-theme="dark"] {'));
  assert.ok(device.size > 20, `${device.size} variables read from the device's night`);
  for (const [name, value] of device) {
    assert.equal(chosen.get(name), value, `${name} is ${value} when the device says night, and ${chosen.get(name) ?? "nothing"} when a person chooses it`);
  }
});

/**
 * What a phone paints while the app opens (D140): the splash screen is the manifest's `background_color` with the
 * icon on it, and it was white while the app itself is ink. The founder saw a white flash and an old drawing: the
 * colour is the product's own ground now, and the icon is whatever `pnpm make:icon` last wrote. The drawing in an
 * installed app is baked into it and only changes when the phone installs it again, which no code here can do.
 */
test("the app a phone installs is painted in the product's own ground", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as Record<string, string> & { icons: { src: string }[] };
  assert.equal(manifest.background_color, COLOURS.dark.background);
  assert.equal(manifest.theme_color, COLOURS.dark.background);
  for (const icon of manifest.icons) assert.ok(globSync(`public${icon.src}`).length === 1, `${icon.src} is written`);
});

/**
 * A page never restarts itself under somebody (D153). The worker's provider reloads the whole page on every `online`
 * event, and a phone fires that when it finishes connecting, wakes, or changes network: the founder saw the landing
 * load twice on his phone and never on a desktop. Off, and nothing else in the app may ask for a reload either.
 */
test("nothing reloads the page because the network came back", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /reloadOnOnline=\{false\}/, "the library's own reload is off");
  for (const file of globSync("app/**/*.{ts,tsx}")) {
    const source = readFileSync(file, "utf8");
    if (/location\.reload\(\)/.test(source)) assert.fail(`${file} reloads the page, and nothing may`);
  }
});

/**
 * The worker keeps what cannot be wrong and nothing else (D155). A page, a payload the router fetches and an answer
 * under `/api/` come from the network and from nowhere else: the library's default kept all three for a day, and
 * across a day of deploys a phone was shown the previous build's page, "nobody is signed in" from the cache, and
 * the landing before every screen. The one thing precached is the offline page, named for this build.
 */
test("the worker never keeps a page, a payload or an answer about somebody", () => {
  const worker = readFileSync("app/sw.ts", "utf8");
  assert.doesNotMatch(worker, /defaultCache|NetworkFirst/, "nothing is kept network first, which is kept stale");
  assert.match(worker, /matcher: \/\.\*\/i,\n\s*handler: new NetworkOnly\(\)/, "everything not named below is the network only");
  assert.match(worker, /matcher: \/\\\/_next\\\/static\\\/\/i,\n\s*handler: new CacheFirst/, "a build's own files, named by their content, are kept");
  assert.match(worker, /precacheEntries: \[\{ url: OFFLINE, revision: buildOf\(self\.__SW_MANIFEST \?\? \[\]\) \}\]/, "the offline page alone is precached, for this build");
  assert.doesNotMatch(worker, /precacheEntries: self\.__SW_MANIFEST/, "the build's files are not precached, so the previous build's survive a deploy for a screen still open on it");
});

/**
 * A card prints the right figure the first time, because the server knew it (D160). What came before hid the
 * figures behind a curtain until the browser had corrected them, which is how a card came to be shown with a hole
 * in it. Nothing is hidden now, so nothing may reintroduce the curtain either.
 */
test("the money on a screen is decided by the server, and no figure is hidden while it settles", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /const money = await moneyForTheReader\(signedIn\)/, "the layout reads the currency and the rate while it renders");
  assert.match(layout, /cardFromCookie\(\(await cookies\(\)\)\.get\(CARD_COOKIE\)/, "and the card this device kept, from its cookie");
  assert.match(layout, /<MoneyStartProvider start=\{\{ currency: money\.currency, decided: money\.decided, rates: money\.rates, card: keptCard \}\}>/, "and hands all three to the screens");
  const reader = readFileSync("src/reader-money.ts", "utf8");
  assert.match(reader, /if \(input\.account\) return \{ currency: input\.account, decided: true \}/, "the account's own choice wins");
  assert.match(reader, /if \(isDisplayCurrency\(input\.kept\)\) return \{ currency: input\.kept, decided: true \}/, "then the cookie this device wrote");
  assert.match(reader, /decided: regionOf\(input\.language\) !== undefined/, "then the language, and it says when it only assumed");
  const hook = readFileSync("src/client/display-currency.ts", "utf8");
  assert.match(hook, /useState<Rates \| undefined>\(start\.rates \?\? undefined\)/, "a screen starts from the rate the server had");
  assert.match(reader, /ratesUsable\(rates, Date\.now\(\)\) \? rates : null/, "and the server is what decides a rate is too old to use");
  assert.match(hook, /useState\(start\.rates !== null\)/, "and does not say a rate is missing before anything was asked");
  assert.match(hook, /const asked = forTheTab \?\? chosen \?\? \(start\.decided \|\| !language \? start\.currency : proposedDisplayCurrency\(language\)\)/, "and reads in what the server decided unless it only assumed");
  assert.match(hook, /document\.cookie = `\$\{CURRENCY_COOKIE\}=\$\{currency\}/, "a press writes the cookie the server reads");
  const card = readFileSync("app/kit/offer/OfferCard.tsx", "utf8");
  assert.match(card, /useSyncExternalStore\(subscribeToCardDraft, cardDraft, asTheServerDrew\)/, "the card hydrates against the one the server drew");
  assert.equal(card.includes("data-money"), false, "no figure is hidden while it settles");
  assert.equal(existsSync("src/money-boot.ts"), false, "the script that hid them is gone");
  assert.equal(readFileSync("app/globals.css", "utf8").includes("data-money-settling"), false, "and so is the rule it drove");
});

/**
 * A screen for a person is drawn as theirs from its first byte (D156). The root layout reads the session cookie
 * while it renders and seeds the account provider with it, so a signed-in person reloading any screen on a phone
 * never meets the page for nobody first. The browser still asks the server afterwards, and its answer wins.
 */
test("the server says who is signed in before the browser has to ask", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /const signedIn = await signedInAccount\(\);/, "read while the layout renders, on every screen");
  assert.match(
    readFileSync("src/who-is-reading.ts", "utf8"),
    /readAccountAuthSessionFrom\(store\.get\(ACCOUNT_AUTH_COOKIE_NAME\)\?\.value \?\? null, normalizedOrigin\(/,
    "the same check the routes make: the cookie, and the origin it was served on",
  );
  assert.match(layout, /<AccountProvider initialAccount=\{signedIn\}>/, "and the provider starts from it");
  const provider = readFileSync("src/account/provider.tsx", "utf8");
  assert.match(provider, /useState<Address \| undefined>\(initialAccount\)/, "the first render, on the server and in the browser, already knows");
  assert.match(provider, /currentServerSession\(\)\.then/, "and the browser still asks, so a cookie that has gone is noticed");
});

/**
 * Day or night is remembered, and the browser's own bar says the same thing as the page (D159). The device answers
 * before the first paint; the account carries the choice to the next device and back to a browser that forgot.
 */
test("a chosen appearance is kept, and the browser's bar follows it rather than the phone", () => {
  const theme = readFileSync("src/theme.ts", "utf8");
  assert.match(theme, /export function paintTheBrowsersBar/, "a press paints the bar at once");
  assert.match(theme, /GROUNDS: Record<"light" \| "dark", string> = \{ light: "#DDD6EB", dark: "#151026" \}/, "the grounds the screens stand on");
  assert.match(theme, /if \(choice !== "system"\) paintTheBrowsersBar\(choice\);/);
  assert.match(theme, /export const APPEARANCE_COOKIE/, "and the choice reaches the server, which renders the page");
  const grounds = readFileSync("app/globals.css", "utf8");
  for (const colour of ["#DDD6EB", "#151026"]) assert.ok(grounds.includes(`--background: ${colour}`), `${colour} is a ground of the look`);
  const layout = readFileSync("app/layout.tsx", "utf8");
  // One colour, decided where the choice is known: two, one per appearance, followed the device rather than the
  // person, and came back at every hydration because that is when the metas are rendered again.
  assert.match(layout, /themeColor: chosen\n\s*\? GROUNDS\[chosen\]/, "one colour once somebody has chosen");
  assert.match(layout, /GROUNDS = \{ light: "#DDD6EB", dark: "#151026" \} as const/, "and it is the ground the screen stands on");
  assert.match(layout, /media: "\(prefers-color-scheme: light\)", color: GROUNDS\.light/, "until then the device decides, and the bar decides with it");
  assert.match(layout, /const chosen = await chosenAppearance\(\);/, "the device's cookie first, then the account");
  assert.match(layout, /\{\.\.\.\(chosen \? \{ "data-theme": chosen \} : \{\}\)\}/, "and written on the document before anything is painted");
  assert.match(readFileSync("app/kit/Appearance.tsx", "utf8"), /putJson<\{ appearance: string \}>\("\/api\/account\/preferences", \{ appearance: next \}\)/, "a press tells the account");
  assert.match(readFileSync("src/preferences-store.ts", "utf8"), /ALTER TABLE viky_accounts ADD COLUMN IF NOT EXISTS appearance text;/, "the column is created where the others are");
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
test("the title face is named once, and worn by the lines the mockups give it", () => {
  const ui = readFileSync("app/components/ui.ts", "utf8");
  const titleFace = (ui.match(/var\(--font-title\)/g) ?? []).length;
  assert.equal(titleFace, 1, "the face is named once, in TITLE_FACE, and composed from there");
  // Five lines wear it since the rendered mockups of 19 Sep 2026: the display, the mark, the promise, and a card's
  // own name and amount. Composing keeps a size from being overridden by the size inside another class.
  for (const name of ["DISPLAY", "MARK", "HERO", "CARD_TITLE", "CARD_AMOUNT"]) {
    assert.match(ui, new RegExp(`export const ${name} = \`\\$\\{TITLE_FACE\\}`), `${name} wears the title face`);
  }
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
  const drawnThroughShell = (file: string) => /from "[^"]*(kit\/Shell|kit\/Home|kit\/Gifts|kit\/Me|GiftPage|PayGift)"|\bredirect\(/.test(readFileSync(file, "utf8"));
  assert.deepEqual(pages.filter((file) => !drawnThroughShell(file)), []);
  assert.ok(pages.length >= 9, `only ${pages.length} pages found`);
});

test("the title face is never in a task: no task screen sets a title in it (structure, item 7)", () => {
  for (const file of globSync("app/components/*.tsx")) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bDISPLAY\b/, `${file} is a task and uses the display face`);
  }
  const pay = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(pay, /from "\.\.\/kit\/Shell"/, "paying for a gift draws the shell");
});
