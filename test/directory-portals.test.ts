import assert from "node:assert/strict";
import test from "node:test";
import { DIRECTORY_PORTALS } from "../src/directory-portals";
import { portalProblem } from "../src/portal-store";

/**
 * The directory's portals pinned in code (D199): each is a row the portal store accepts whole, and the pattern on the
 * current term says enrolled for a schedule of this academic year and for nothing else.
 */
test("each pinned portal is a whole row", () => {
  for (const portal of DIRECTORY_PORTALS) {
    assert.equal(portalProblem({ ...portal, provenBy: "0x000000000000000000000000000000000000a11c" }), undefined, portal.portalId);
    assert.ok(portal.usedBy >= 1, "used by another application in the directory");
  }
  assert.deepEqual(DIRECTORY_PORTALS.map((portal) => portal.portalId), ["aur-it"]);
});

test("the American University of Rome: a schedule of this academic year is enrolled, another year's is not", () => {
  const aur = DIRECTORY_PORTALS.find((portal) => portal.portalId === "aur-it")!;
  const pattern = new RegExp(aur.extract.matches);
  for (const term of ["Fall 2026", "Spring 2027", "Summer 2027", "2026 Fall Semester"]) assert.ok(pattern.test(term), term);
  for (const term of ["Fall 2025", "Spring 2024", "", "Undergraduate"]) assert.ok(!pattern.test(term), term);
});
