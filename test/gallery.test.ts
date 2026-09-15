import { strict as assert } from "node:assert";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { EXAMPLE_SCREENS } from "../app/components/gallery/screens.js";

/**
 * The gallery exists so a design pass can be looked at instead of described, and the danger of such a thing
 * is obvious: it becomes a picture of a product that does not exist. Two rules keep it honest, and this
 * enforces both.
 *
 * Every sentence it says comes from a real component, word for word, or it is not claimed as built. And a
 * screen that has not been built says so, rather than sitting in a list of screens that look finished.
 */

const normalise = (text: string) => text.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const sources = new Map<string, string>();

function source(file: string): string {
  const cached = sources.get(file);
  if (cached) return cached;
  assert.ok(existsSync(file), `${file} does not exist, so a screen claims to come from nowhere`);
  const text = normalise(readFileSync(file, "utf8"));
  sources.set(file, text);
  return text;
}

test("every sentence the gallery claims as built is really in the component it names", () => {
  const missing: string[] = [];
  for (const screen of EXAMPLE_SCREENS) {
    if (!screen.builtFrom) continue;
    for (const quote of screen.quotes) {
      if (!source(screen.builtFrom).includes(normalise(quote))) missing.push(`${screen.slug}: ${quote}`);
    }
  }
  assert.deepEqual(missing, [], `quoted in the gallery and not in the code:\n${missing.join("\n")}`);
});

test("a screen that has not been built claims nothing", () => {
  for (const screen of EXAMPLE_SCREENS) {
    if (screen.builtFrom === null) {
      assert.deepEqual(screen.quotes, [], `${screen.slug} is not built, so it may not claim quotes`);
    } else {
      assert.ok(screen.quotes.length > 0, `${screen.slug} names a file but quotes nothing from it`);
    }
  }
});

test("both journeys are covered, and every screen says what comes first", () => {
  const funder = EXAMPLE_SCREENS.filter((screen) => screen.who === "funder");
  const recipient = EXAMPLE_SCREENS.filter((screen) => screen.who === "recipient");
  assert.ok(funder.length >= 5, "the funder journey: who, how much, check, the rail, ready");
  assert.ok(recipient.length >= 5, "the recipient journey: the card, Duolingo, the days, a day back, the money");
  for (const screen of EXAMPLE_SCREENS) {
    assert.ok(screen.hierarchy.length > 60, `${screen.slug} does not say what comes first and why`);
    assert.match(screen.slug, /^[a-z-]+$/);
  }
});

test("the slugs are unique, because each one is a page", () => {
  const slugs = EXAMPLE_SCREENS.map((screen) => screen.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});
