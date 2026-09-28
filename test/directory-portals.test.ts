import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CORRIDOR_PORTALS, DIRECTORY_PORTALS } from "../src/directory-portals";
import { portalProblem, rowProblem } from "../src/portal-store";

const OPERATOR = "0x000000000000000000000000000000000000a11c";

/**
 * The universities written by hand (D199, D313): each is a row the portal store accepts whole; Rome's alone carries a
 * provider, whose pattern on the current term says enrolled for a schedule of this academic year and nothing else.
 */
test("each hand-written university is a whole row, and only Rome's carries a provider", () => {
  for (const portal of DIRECTORY_PORTALS) {
    assert.equal(portalProblem({ ...portal, provenBy: OPERATOR }), undefined, portal.portalId);
    assert.ok(portal.usedBy >= 1, "used by another application in the directory");
  }
  assert.deepEqual(DIRECTORY_PORTALS.map((portal) => portal.portalId), ["aur-it", "aus-ae", "innopolis-ru", "ignou-in", "du-bd"]);
  assert.deepEqual(DIRECTORY_PORTALS.filter((portal) => portal.providerId).map((portal) => portal.portalId), ["aur-it"], "a student account is not a sense (D313)");
});

test("the American University of Rome: a schedule of this academic year is enrolled, another year's is not", () => {
  const aur = DIRECTORY_PORTALS.find((portal) => portal.portalId === "aur-it")!;
  const pattern = new RegExp(aur.extract!.matches);
  for (const term of ["Fall 2026", "Spring 2027", "Summer 2027", "2026 Fall Semester"]) assert.ok(pattern.test(term), term);
  for (const term of ["Fall 2025", "Spring 2024", "", "Undergraduate"]) assert.ok(!pattern.test(term), term);
});

test("the corridor's universities: whole rows on https, each once, IHET and MIT Polytech taken out, UNIKIN on its live platform", () => {
  const ids = new Set<string>();
  for (const row of CORRIDOR_PORTALS) {
    assert.equal(rowProblem({ ...row, provenBy: OPERATOR }), undefined, row.portalId);
    assert.equal(ids.has(row.portalId), false, `${row.portalId} twice`);
    ids.add(row.portalId);
    assert.match(row.sourceProviderId, /^[0-9a-f-]{36}$/);
  }
  assert.equal(CORRIDOR_PORTALS.length, 18);
  assert.equal(ids.has("ihet-tn") || ids.has("polytech-med-tn"), false);
  assert.equal(CORRIDOR_PORTALS.find((row) => row.portalId === "unikin-cd")?.loginUrl, "https://unikin.optsolution.net/");
  assert.equal(CORRIDOR_PORTALS.find((row) => row.portalId === "iam-ml")?.loginUrl, "https://elearning-iambamako.com/");
});

test("the world's list: every line a whole row, each id once, one line per university and country (D313)", () => {
  const file = "data/university-register.json";
  const { rows } = JSON.parse(readFileSync(file, "utf8")) as { rows: { portalId: string; university: string; country: string; loginUrl: string; sourceProviderIds: string[] }[] };
  assert.ok(rows.length > 10_000, "the world's list, not the corridor's");
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const row of rows) {
    assert.equal(rowProblem({ ...row, name: row.university, provenBy: OPERATOR }), undefined, row.portalId);
    assert.equal(ids.has(row.portalId), false, `${row.portalId} twice`);
    ids.add(row.portalId);
    const key = `${row.university}|${row.country}`;
    assert.equal(names.has(key), false, `${key} twice`);
    names.add(key);
    assert.ok(row.sourceProviderIds.length >= 1 && row.sourceProviderIds.every((id) => /^[0-9a-f-]{36}$/.test(id)), row.portalId);
    assert.doesNotMatch(row.university, /\[test\]|\(copy\)/i, row.portalId);
  }
});
