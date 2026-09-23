import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import { UNIVERSITY_GOAL_TYPE, countryInWords, enrolledBy, isPortalId, universityShownProviderId, universitySubject } from "../src/university-shown";
import { UNIVERSITY_SHOWN } from "../src/shown-conditions";

/**
 * Staying enrolled, shown from the person's own student portal (D165): one goal for every portal, the portal bound
 * into the subject the funder signs, and "enrolled" decided by the portal's own row.
 */

test("one goal for the whole family, pinned by name, and the portal is what tells two gifts apart", () => {
  assert.equal(UNIVERSITY_GOAL_TYPE, 14);
  assert.equal(universityShownProviderId(), keccak256(stringToHex("viky:provider:university-enrollment-shown:v1")));
  assert.equal(universityShownProviderId(), "0xa95adf80ba13395dcc23c8048874f1ddfba5321a9eb5e1f90711c6a81c3d64df", "the id written in OPERATIONS for the owner to sign");
  assert.notEqual(universitySubject("ucad-sn"), universitySubject("sorbonne-fr"), "a proof shown from another portal fails the contract's own check");
  assert.equal(universitySubject("UCAD-SN "), universitySubject("ucad-sn"), "the same portal, however it was typed");
  assert.equal(UNIVERSITY_SHOWN.condition.attestationProviderId, universityShownProviderId());
  assert.equal(UNIVERSITY_SHOWN.subjectOf?.({ giftId: "1", conditionId: "university-enrollment-shown", mode: "certificate", standingAtOffer: 0, standingReadAt: new Date(0), portal: "ucad-sn" }), universitySubject("ucad-sn"));
  assert.equal(UNIVERSITY_SHOWN.subjectOf?.({ giftId: "1", conditionId: "university-enrollment-shown", mode: "certificate", standingAtOffer: 0, standingReadAt: new Date(0), portal: null }), null, "a gift naming no portal has no subject to sign against");
});

test("a portal id is ours to write: lower case, letters, digits and dashes", () => {
  for (const good of ["ucad-sn", "sorbonne-fr", "ufhb-ci", "x1"]) assert.ok(isPortalId(good), good);
  for (const bad of ["UCAD", "ucad sn", "-ucad", "ucad-", "", "a".repeat(65), 12]) assert.equal(isPortalId(bad), false, String(bad));
});

test("the country reads in words on the chooser's line, and an unknown code reads as itself", () => {
  assert.equal(countryInWords("SN"), "Senegal");
  assert.equal(countryInWords("fr"), "France");
  assert.equal(countryInWords("Q"), "Q", "a code that is not one reads as itself rather than throwing at the chooser");
});

test("enrolled is what the portal's own row says it is, on the one field it names, and nothing else is read", () => {
  const status = { field: "status", matches: "^(Inscrit|Enrolled)", keeps: "whether the status says enrolled" };
  assert.equal(enrolledBy(status, { status: "Inscrit 2026-2027" }), true);
  assert.equal(enrolledBy(status, { status: "enrolled" }), true, "case does not matter");
  assert.equal(enrolledBy(status, { status: "Radié" }), false);
  assert.equal(enrolledBy(status, { year: "2026" }), false, "another field is not the field");
  const year = { field: "academicYear", matches: "2026", keeps: "the academic year on the page" };
  assert.equal(enrolledBy(year, { academicYear: "2026-2027" }), true);
  assert.equal(enrolledBy(year, { academicYear: "2024-2025" }), false);
  assert.equal(enrolledBy({ ...status, matches: "(" }, { status: "Inscrit" }), false, "a row with a broken pattern proves nobody enrolled");
});
