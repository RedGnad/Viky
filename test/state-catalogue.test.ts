import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import { everyState, JOURNEYS } from "../src/state-catalogue.js";

/**
 * The catalogue is a measurement of the screens, not a description of them. If a sentence in it is not in
 * the component it names, the catalogue is showing the funder words that do not exist, and a design pass
 * directed from it would be directed from fiction.
 */

const normalise = (text: string) => text.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const sources = new Map<string, string>();

function source(file: string): string {
  const cached = sources.get(file);
  if (cached) return cached;
  const text = normalise(readFileSync(file, "utf8"));
  sources.set(file, text);
  return text;
}

test("every sentence the catalogue quotes is really on the screen it names", () => {
  const missing: string[] = [];
  for (const { screen, file, state } of everyState()) {
    for (const sentence of state.says) {
      if (!source(file).includes(normalise(sentence))) missing.push(`${screen} / ${state.name}: ${sentence}`);
    }
  }
  assert.deepEqual(missing, [], `these sentences are in the catalogue and not in the code:\n${missing.join("\n")}`);
});

test("a state with no words says what is missing, rather than looking finished", () => {
  for (const { screen, state } of everyState()) {
    if (state.says.length === 0) {
      assert.ok(state.gap && state.gap.length > 20, `${screen} / ${state.name} has no words and no explanation`);
    }
  }
});

test("both journeys are there, and every state says what puts a person in it", () => {
  const who = JOURNEYS.map((journey) => journey.who);
  assert.ok(who.some((name) => /gives/.test(name)), "the person who gives");
  assert.ok(who.some((name) => /gift is for/.test(name)), "the person the gift is for");
  assert.ok(JOURNEYS.length >= 2);
  for (const { who, screens } of JOURNEYS) {
    assert.ok(who.length > 0);
    assert.ok(screens.length > 0);
    for (const s of screens) {
      assert.ok(s.states.length > 0, `${s.screen} has no states`);
      for (const state of s.states) {
        assert.ok(state.when.length > 5, `${s.screen} / ${state.name} does not say when`);
      }
    }
  }
});

test("the states nobody has built are visible as such", () => {
  const gaps = everyState().filter((s) => s.state.says.length === 0);
  assert.ok(gaps.length >= 5, "a catalogue with no gaps is not being honest about a product this unfinished");
});
