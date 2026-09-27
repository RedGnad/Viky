import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * The method of 23 Sep 2026 for providers nobody has tried on an account (D193): every definition in docs/reclaim
 * says where each pattern comes from, sits on a label the page prints, and says what a page that does not carry it
 * does. A definition that stops saying so fails here, not in front of a person.
 */
const OURS = ["bac-cameroon", "bac-france", "bac-morocco", "cambridge-english", "ecoledirecte-grade", "ielts"].map((name) => `docs/reclaim/${name}-shown-provider.md`);
const CORRIDOR = ["docs/reclaim/ucad-sn-portal.md", "docs/reclaim/ufhb-ci-portal.md"];

test("each of our provider definitions says what a missed extraction does, by name, with nothing lost and the journal", () => {
  for (const file of OURS) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /## When the page does not carry it/, file);
    assert.match(text, /nothing is lost/, file);
    assert.match(text, /journal of the gift carries the event/, file);
    assert.match(text, /read 23 Sep 2026|read on 23 Sep 2026|as read on 23 Sep 2026/, `${file} dates what it read`);
  }
});

test("the corridor's two portals are defined from their public pages and marked unverified, with the row's command ready", () => {
  for (const file of CORRIDOR) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /unverified/i, file);
    assert.match(text, /UNVERIFIED=1/, `${file} writes the row with the mark`);
    assert.match(text, /pnpm portal:add/, file);
    assert.doesNotMatch(text, /to confirm:/, `${file} says unverified, not "to confirm"`);
  }
  assert.ok(readdirSync("docs/reclaim").length >= OURS.length + CORRIDOR.length);
});
