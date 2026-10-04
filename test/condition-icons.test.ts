import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONDITION_ICONS, ICON_BOX, ICON_STROKE, iconMarkup, type ConditionIcon } from "../src/condition-icons";
import { BUILDING, conditionById, CONDITIONS, PRONOTE_GRADE_SHOWN } from "../src/conditions";

/**
 * A pictogram at the start of each condition's line, on the sheet where it is chosen (the founder, 5 Oct 2026): one
 * per kind of activity, never the logo of the source, in outline, the text's colour, 26 pixels.
 */

test("each line has the pictogram of its kind of activity, as the founder gave them", () => {
  const of = (id: string) => conditionById(id)?.icon;
  assert.equal(of("duolingo-daily"), "language");
  for (const id of ["credly-badge", "accredible-credential", "coursera-certificate", "edx-certificate", "mitx-online-certificate"]) assert.equal(of(id), "rosette", id);
  assert.equal(of("codeforces-rating"), "code");
  assert.equal(of("chess-rating"), "pawn");
  assert.equal(of("chess-tactics"), "puzzle");
  assert.equal(of("wca-time"), "cube");
  for (const id of ["university-enrollment-shown", "university-year-passed-shown", "university-grade-shown"]) assert.equal(of(id), "university", id);
  for (const id of ["toefl-mybest-shown", "duolingo-english-test"]) assert.equal(of(id), "test", id);
  assert.equal(of("fitbit-daily"), "watch");
  assert.equal(of("strava-daily"), "route");
  assert.equal(of("marathon-finish"), "flag");
  // A line that is closed or being built takes the one of its kind, and every line has one.
  for (const condition of [...CONDITIONS, ...BUILDING, PRONOTE_GRADE_SHOWN]) assert.ok(condition.icon in CONDITION_ICONS, `${condition.id} has a pictogram`);
  assert.equal(of("cambridge-english-shown"), "test");
  assert.equal(of("chsi-enrolment-shown"), "university");
});

test("the drawings: eleven, in outline on a square of 24, a stroke of 1.9, and nothing of a source's logo", () => {
  const names = Object.keys(CONDITION_ICONS) as ConditionIcon[];
  assert.deepEqual(names, ["language", "rosette", "code", "pawn", "puzzle", "cube", "university", "test", "watch", "route", "flag"]);
  assert.equal(ICON_BOX, 26);
  assert.equal(ICON_STROKE, 1.9);
  for (const name of names) {
    const markup = iconMarkup(name);
    assert.ok(markup.length > 20, name);
    assert.doesNotMatch(markup, /fill=|<text|<image/, `${name}: outline only`);
    // Every coordinate stays inside the square, with room for the stroke.
    for (const number of markup.match(/-?\d+(\.\d+)?/g) ?? []) assert.ok(Math.abs(Number(number)) <= 24, `${name}: ${number}`);
  }
  // The given drawings are kept as given; the five whose path was cut in the brief are completed in the same stroke.
  assert.equal(iconMarkup("flag"), '<path d="M5 21V4M5 4.6h13l-2.6 4 2.6 4H5"/>');
  assert.equal(iconMarkup("rosette"), '<circle cx="12" cy="9" r="5.2"/><circle cx="12" cy="9" r="1.7"/><path d="M9 13.4L7.6 21l4.4-2.6 4.4 2.6-1.4-7.6"/>');
  assert.match(iconMarkup("cube"), /stroke-width="1.2"/);
  const icon = readFileSync("app/kit/ConditionIcon.tsx", "utf8");
  assert.match(icon, /aria-hidden/);
  assert.match(icon, /fill="none"\n\s*stroke="currentColor"\n\s*strokeWidth=\{ICON_STROKE\}\n\s*strokeLinecap="round"\n\s*strokeLinejoin="round"\n\s*className="shrink-0 text-\[var\(--text\)\]"/);
});

test("the pictogram stands at the start of the line, twelve pixels before the name, and the chevron stays at its end", () => {
  const sheet = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  const row = sheet.slice(sheet.indexOf("{lines(shownSection.conditions).map("), sheet.indexOf("The four families, two by two"));
  assert.match(row, /justify-between! gap-\[var\(--space-md\)\] text-left/);
  assert.match(readFileSync("app/globals.css", "utf8"), /--space-md: 12px;/);
  assert.ok(row.indexOf("<ConditionIcon icon={option.icon} />") < row.indexOf("{name}"), "before the name");
  assert.ok(row.indexOf("{name}") < row.indexOf('d="M9 5l7 7-7 7"'), "and the chevron after it");
});
