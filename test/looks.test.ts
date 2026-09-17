import { strict as assert } from "node:assert";
import test from "node:test";
import { globSync, readFileSync } from "node:fs";
import { contrastRatio, NON_TEXT_CONTRAST_MINIMUM, parseHex, relativeLuminance, TEXT_CONTRAST_MINIMUM } from "../src/contrast.js";
import { COLOURS, CONTROL_COLOURS, GROUNDS, LOOKS, TEXT_COLOURS, type Appearance, type LookColours } from "../src/design-tokens.js";

/**
 * The three looks of the laboratory are held to the same measurements as the product's one look, and to the method of
 * the art direction brief (17 Sep 2026, section 3) where a number can say it: a neutral ground, a night accent that is
 * the day's accent made lighter, secondary colours that are never grey and never the accent, and a face that reads on
 * every character. Every ratio a look records is recomputed here, so a figure written in the tokens cannot drift from
 * the colours it describes.
 */

const APPEARANCES: Appearance[] = ["light", "dark"];

/** OKLCH lightness, chroma and hue, from the published OKLab matrices: chroma is what "neutral" can be measured by. */
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

function colourOf(palette: LookColours, role: string): string {
  const value = (palette as Record<string, unknown>)[role];
  assert.equal(typeof value, "string", `no colour named ${role}`);
  return value as string;
}

test("there are three looks, numbered as the brief numbers them", () => {
  assert.deepEqual(
    LOOKS.map((look) => [look.number, look.id]),
    [
      [1, "paper-tomato"],
      [2, "ink-sun"],
      [3, "white-violet"],
    ],
  );
});

test("each look starts from the brief's values, untouched: the measurements needed no adjustment", () => {
  const brief: Record<string, Record<Appearance, [string, string, string, string, string]>> = {
    "paper-tomato": { light: ["#FBF7EF", "#FFFFFF", "#2A0F24", "#6A5263", "#FF5A36"], dark: ["#1A1226", "#261B36", "#F6EFE6", "#B9ABC4", "#FF8562"] },
    "ink-sun": { light: ["#F6F4FB", "#FFFFFF", "#1E1633", "#5B5470", "#FFC531"], dark: ["#151026", "#211A38", "#F3F0FA", "#B3ABC9", "#FFD053"] },
    "white-violet": { light: ["#FAFAFC", "#FFFFFF", "#16131F", "#5A5668", "#5B3FE0"], dark: ["#121019", "#1D1A28", "#F2F1F6", "#ABA7BA", "#9C8BFF"] },
  };
  for (const look of LOOKS) {
    for (const appearance of APPEARANCES) {
      const p = look.colours[appearance];
      assert.deepEqual([p.background, p.surface, p.text, p.muted, p.accent], brief[look.id][appearance], `${look.id} ${appearance}`);
    }
  }
});

test("every look: each colour that carries text clears 4.5:1 on both grounds, in both appearances", () => {
  for (const look of LOOKS) {
    for (const appearance of APPEARANCES) {
      const palette = look.colours[appearance];
      for (const role of TEXT_COLOURS) {
        for (const ground of GROUNDS) {
          const ratio = contrastRatio(palette[role], palette[ground]);
          assert.ok(ratio >= TEXT_CONTRAST_MINIMUM, `${look.id} ${appearance} ${role} is ${ratio.toFixed(2)}:1 on the ${ground}`);
        }
      }
      const onAccent = contrastRatio(palette.onAccent, palette.accent);
      assert.ok(onAccent >= TEXT_CONTRAST_MINIMUM, `${look.id} ${appearance} words on the accent are ${onAccent.toFixed(2)}:1`);
    }
  }
});

test("every look: a control's outline clears 3:1 on both grounds (WCAG 1.4.11)", () => {
  for (const look of LOOKS) {
    for (const appearance of APPEARANCES) {
      const palette = look.colours[appearance];
      for (const role of CONTROL_COLOURS) {
        for (const ground of GROUNDS) {
          const ratio = contrastRatio(palette[role], palette[ground]);
          assert.ok(ratio >= NON_TEXT_CONTRAST_MINIMUM, `${look.id} ${appearance} ${role} is ${ratio.toFixed(2)}:1 on the ${ground}`);
        }
      }
    }
  }
});

test("every look has the product's nine roles, and the same three colours per appearance: links are the ink", () => {
  for (const look of LOOKS) {
    for (const appearance of APPEARANCES) {
      const palette = look.colours[appearance];
      for (const role of Object.keys(COLOURS[appearance])) assert.ok(role in palette, `${look.id} ${appearance} has no ${role}`);
      assert.equal(palette.accentText, palette.text, `${look.id} ${appearance}: links are ink, underlined (brief, section 4)`);
      assert.equal(palette.controlBorder, palette.text, `${look.id} ${appearance}: a control's outline is the ink`);
    }
  }
});

test("the accent identifies a button by its fill only where the fill clears 3:1 on both grounds; elsewhere by an ink edge", () => {
  for (const look of LOOKS) {
    for (const appearance of APPEARANCES) {
      const palette = look.colours[appearance];
      const fillIsEnough = GROUNDS.every((ground) => contrastRatio(palette.accent, palette[ground]) >= NON_TEXT_CONTRAST_MINIMUM);
      assert.equal(look.accentEdge[appearance], fillIsEnough ? "fill" : "ink", `${look.id} ${appearance}`);
    }
  }
  // The brief's reading, pinned: tomato and sun need the ink edge by day, violet does not.
  assert.deepEqual(
    LOOKS.map((look) => look.accentEdge.light),
    ["ink", "ink", "fill"],
  );
});

test("every ratio a look records is the ratio its colours measure, to the hundredth", () => {
  for (const look of LOOKS) {
    for (const appearance of APPEARANCES) {
      const palette = look.colours[appearance];
      const recorded = look.ratios[appearance];
      assert.ok(Object.keys(recorded).length >= 17, `${look.id} ${appearance} records too few ratios`);
      for (const [pair, ratio] of Object.entries(recorded)) {
        const [foreground, background] = pair.split("/");
        const measured = contrastRatio(colourOf(palette, foreground), colourOf(palette, background));
        assert.equal(measured.toFixed(2), ratio.toFixed(2), `${look.id} ${appearance} ${pair}`);
      }
    }
  }
});

test("the ground is neutral: its chroma is below the cream the brief rejected, by day and by night", () => {
  // The cream #FFF3D9 measures 0.036 and the indigo #1C1035 0.070: both are what the brief called "not neutral".
  assert.ok(oklch(COLOURS.light.background).chroma > 0.03);
  assert.ok(oklch(COLOURS.dark.background).chroma > 0.06);
  for (const look of LOOKS) {
    assert.ok(oklch(look.colours.light.background).chroma <= 0.02, `${look.id} day ground is tinted`);
    assert.ok(oklch(look.colours.dark.background).chroma <= 0.05, `${look.id} night ground is tinted`);
    for (const appearance of APPEARANCES) {
      const { background, surface } = look.colours[appearance];
      // A surface is the ground a tone off, never a hue of its own (Material, role surface).
      assert.ok(Math.abs(oklch(surface).chroma - oklch(background).chroma) <= 0.02, `${look.id} ${appearance} surface is a colour`);
    }
  }
});

test("the night accent is the day's accent made lighter, not another accent", () => {
  for (const look of LOOKS) {
    const day = oklch(look.colours.light.accent);
    const night = oklch(look.colours.dark.accent);
    assert.ok(night.lightness > day.lightness, `${look.id} night accent is not lighter`);
    assert.ok(hueDistance(day.hue, night.hue) <= 10, `${look.id} night accent moved ${hueDistance(day.hue, night.hue).toFixed(0)} degrees of hue`);
    for (const ground of GROUNDS) {
      const ratio = contrastRatio(look.colours.dark.accent, look.colours.dark[ground]);
      assert.ok(ratio >= NON_TEXT_CONTRAST_MINIMUM, `${look.id} night accent is ${ratio.toFixed(2)}:1 on the ${ground}`);
    }
  }
});

test("the characters: three colours per look, none grey, none the accent, and a face that reads on each of them", () => {
  for (const look of LOOKS) {
    for (const appearance of APPEARANCES) {
      const palette = look.colours[appearance];
      const range = [palette.character1, palette.character2, palette.character3];
      assert.equal(new Set(range).size, 3, `${look.id} ${appearance} repeats a character colour`);
      const accent = oklch(palette.accent);
      for (const colour of range) {
        const measured = oklch(colour);
        // Duolingo: "never use gray".
        assert.ok(measured.chroma >= 0.08, `${look.id} ${appearance} ${colour} is too close to grey (${measured.chroma.toFixed(3)})`);
        assert.ok(hueDistance(measured.hue, accent.hue) >= 20, `${look.id} ${appearance} ${colour} reads as the accent`);
        const face = contrastRatio(palette.face, colour);
        assert.ok(face >= NON_TEXT_CONTRAST_MINIMUM, `${look.id} ${appearance} a face on ${colour} is ${face.toFixed(2)}:1`);
      }
      assert.ok(palette.shadowOpacity > 0 && palette.shadowOpacity < 1);
    }
    // Relief or none, and the same answer by day and by night: a relief that never moves is an ornament.
    assert.equal(look.colours.light.relief === null, look.colours.dark.relief === null, `${look.id} has a relief in one appearance only`);
    assert.equal(look.reliefDepth === 0, look.colours.light.relief === null, `${look.id} relief depth and relief colour disagree`);
  }
});

test("the relief after dark is a shadow darker than the ground, never the cream slab of the capture of 17 Sep", () => {
  for (const look of LOOKS) {
    const night = look.colours.dark;
    if (night.relief === null) continue;
    assert.ok(relativeLuminance(night.relief) < relativeLuminance(night.background), `${look.id} night relief is lighter than the ground`);
    assert.notEqual(night.relief, night.text, `${look.id} night relief is the ink`);
  }
});

test("a character's colours are painted only by the character: never text, never a background (brief, section 3)", () => {
  const painters = globSync("app/**/*.{ts,tsx}").filter((file) => /var\(--character-/.test(readFileSync(file, "utf8")));
  assert.deepEqual(painters.sort(), ["app/kit/Character.tsx"]);
});

test("each look's title face is loaded by next/font, only for the laboratory, and DM Sans stays the text face", () => {
  const fonts = readFileSync("app/dev/looks/fonts.ts", "utf8");
  assert.match(fonts, /from "next\/font\/google"/);
  assert.match(fonts, /Bricolage_Grotesque\(\{[^}]*variable: "--font-bricolage"/);
  assert.match(fonts, /Fredoka\(\{[^}]*variable: "--font-fredoka"/);
  assert.deepEqual(
    LOOKS.map((look) => look.type.face),
    ["bricolage", "fredoka", "bricolage"],
  );
  // The product's document loads neither: the looks are a laboratory.
  assert.doesNotMatch(readFileSync("app/layout.tsx", "utf8"), /bricolage|fredoka/i);
  assert.doesNotMatch(readFileSync("app/fonts.ts", "utf8"), /Bricolage|Fredoka/);
});

test("the looks are drawn from the tokens: the laboratory's stylesheet names every colour of every look", async () => {
  const { lookStylesheet } = await import("../app/dev/looks/look-css.js");
  for (const look of LOOKS) {
    const css = lookStylesheet(look);
    for (const appearance of APPEARANCES) {
      for (const [role, value] of Object.entries(look.colours[appearance])) {
        if (typeof value !== "string") continue;
        assert.ok(css.includes(value), `${look.id} ${appearance} ${role} ${value} is missing from its stylesheet`);
      }
    }
    assert.match(css, /prefers-color-scheme: dark/);
  }
});

test("no character where money is chosen or confirmed: the review and the amount step never draw one (brief, section 5)", async () => {
  const { SCREENS } = await import("../app/dev/looks/example.js");
  const files: Record<string, string> = {
    welcome: "app/dev/looks/screens/Welcome.tsx",
    home: "app/dev/looks/screens/HomeScreen.tsx",
    gift: "app/dev/looks/screens/GiftScreen.tsx",
    amount: "app/dev/looks/screens/FundAmount.tsx",
    review: "app/dev/looks/screens/Review.tsx",
    made: "app/dev/looks/screens/Made.tsx",
  };
  assert.deepEqual(SCREENS.map((screen) => screen.id).sort(), Object.keys(files).sort());
  for (const screen of SCREENS) {
    const source = readFileSync(files[screen.id], "utf8");
    const draws = /kit\/Character|kit\/Motion|\.\/parts/.test(source);
    assert.equal(draws, screen.characters, `${screen.id} ${screen.characters ? "should draw" : "draws"} characters`);
  }
  assert.equal(SCREENS.find((screen) => screen.id === "review")?.characters, false);
});

test("the page without an account has one action in its body, and the door is a small outlined button in its header (brief, section 7)", () => {
  const source = readFileSync("app/dev/looks/screens/Welcome.tsx", "utf8");
  assert.equal((source.match(/className=\{PRIMARY_BUTTON\}/g) ?? []).length, 1, "one action in the body");
  assert.match(source, /action=\{\s*<Link[^>]*className=\{INLINE_BUTTON\}>\s*\{LAB\.signInOrCreate\}/, "the door sits in the header");
  assert.doesNotMatch(source, /SECONDARY_BUTTON/);
});
