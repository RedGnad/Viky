import assert from "node:assert/strict";
import test from "node:test";
import { COURSERA_CERTIFICATE } from "../src/attested-sources";
import {
  courseraCodeOf,
  courseraGrantedDaySeconds,
  courseraName,
  courseraSlugOf,
  courseraSubject,
  isValidCourseraCode,
  isValidCourseraSlug,
  COURSERA_GOAL_TYPE,
} from "../src/coursera-certificate";
import { CourseraReadError, readCourseraCertificate } from "../src/coursera-reading";
import { milestoneGoal } from "../src/milestone-goals";
import { SHAPE_HAVE_OR_NOT } from "../src/milestone-protocol";

/**
 * Reading a Coursera certificate (C3), against the page as it really is.
 *
 * Every shape here was measured on 19 Sep 2026 on a live certificate its holder published themselves, and on two
 * codes nobody has. The two findings that decided the design are both tested: the course carries a slug, the word a
 * funder reads in an ordinary course link, and the last name can be empty.
 */

/** The page's own shape, with the objects the four patterns are anchored on. Names are invented; the shape is not. */
function page(over: Partial<Record<string, string>> = {}): string {
  const values = { firstName: "Ada", lastName: "Lovelace", courseId: "-qIqP1FsEemNmQ6a3syMJg", slug: "introduction-git-github", courseName: "Introduction to Git and GitHub", certificateCode: "MTI2AG9TKCRD", grantedAt: "1728878220063", ...over };
  return [
    `{"__typename":"AccomplishmentsSignatureTrackProfile","firstName":"${values.firstName}","lastName":"${values.lastName}","middleName":null}`,
    `{"__typename":"Course_Course","id":"${values.courseId}","slug":"${values.slug}","name":"${values.courseName}"}`,
    `{"__typename":"XdpV1","name":"Another course entirely","id":"COURSE~other","slug":"another-course","xdpMetadata":{}}`,
    `{"__typename":"AccomplishmentsVCMembership","certificateCode":"${values.certificateCode}","grantedAt":${values.grantedAt}}`,
  ].join(",");
}

function answering(body: string, status = 200): (url: string, init: RequestInit) => Promise<Response> {
  return async () => new Response(body, { status });
}

test("a real certificate reads as the person, the course and the day it was granted", async () => {
  const certificate = await readCourseraCertificate("MTI2AG9TKCRD", answering(page()));
  assert.equal(certificate.code, "MTI2AG9TKCRD");
  assert.equal(certificate.name, "Ada Lovelace");
  assert.equal(certificate.courseSlug, "introduction-git-github");
  assert.equal(certificate.courseName, "Introduction to Git and GitHub");
  // 1728878220063 ms is 14 Oct 2024; what the contract judges is that day at midnight UTC.
  assert.equal(new Date(certificate.grantedDay * 1_000).toISOString(), "2024-10-14T00:00:00.000Z");
  assert.equal(certificate.subject, courseraSubject("Ada Lovelace", "introduction-git-github"));
});

test("the course it names is the certificate's own, not another course on the same page", async () => {
  const certificate = await readCourseraCertificate("MTI2AG9TKCRD", answering(page()));
  assert.notEqual(certificate.courseSlug, "another-course", "the page carries a second course and it must not win");
  assert.equal(certificate.subject, courseraSubject("Ada Lovelace", "introduction-git-github"));
  assert.notEqual(certificate.subject, courseraSubject("Ada Lovelace", "another-course"));
});

test("a certificate whose holder has no last name still reads, because a real one has none", async () => {
  const certificate = await readCourseraCertificate("MTI2AG9TKCRD", answering(page({ lastName: "" })));
  assert.equal(certificate.name, "Ada");
  assert.equal(certificate.subject, courseraSubject("Ada", "introduction-git-github"));
  assert.equal(courseraName("Ada", ""), "Ada");
  assert.equal(courseraName("", "Lovelace"), "Lovelace");
});

test("a code nobody has is refused as no certificate, not as a broken reading", async () => {
  // Coursera answers 200 with a page carrying no certificate at all: no status, no error code, no message.
  const nothing = '{"__typename":"XdpV1","name":"Some course","slug":"some-course"}';
  const refused = await readCourseraCertificate("AAAAAAAAAAAA", answering(nothing)).catch((error: unknown) => error);
  assert.ok(refused instanceof CourseraReadError);
  assert.equal(refused.code, "NO_CERTIFICATE");
});

test("a page about another certificate is refused rather than read", async () => {
  const refused = await readCourseraCertificate("MTI2AG9TKCRD", answering(page({ certificateCode: "SOMEONEELSE1" }))).catch((error: unknown) => error);
  assert.equal((refused as CourseraReadError).code, "PROOF_MISMATCH");
});

test("a page that carries a certificate and lost a field is ours to fix, and says so", async () => {
  const half = page().replace(/"slug":"introduction-git-github"/, '"slug":""');
  const refused = await readCourseraCertificate("MTI2AG9TKCRD", answering(half)).catch((error: unknown) => error);
  assert.equal((refused as CourseraReadError).code, "PROOF_INVALID");
});

test("what is not a certificate link is refused before anything is fetched", async () => {
  let asked = 0;
  const counting = async () => {
    asked += 1;
    return new Response(page(), { status: 200 });
  };
  for (const bad of ["", "nope", "https://example.com/verify/MTI2AG9TKCRD", "MT!2AG9TKCRD"]) {
    const refused = await readCourseraCertificate(bad, counting).catch((error: unknown) => error);
    assert.equal((refused as CourseraReadError).code, "INVALID_LINK", bad);
  }
  assert.equal(asked, 0, "nothing was fetched");
});

test("the code and the course are read out of what a person would paste", () => {
  for (const pasted of [
    "MTI2AG9TKCRD",
    "mti2ag9tkcrd",
    "https://www.coursera.org/account/accomplishments/verify/MTI2AG9TKCRD",
    "coursera.org/verify/MTI2AG9TKCRD",
  ]) {
    assert.equal(courseraCodeOf(pasted), "MTI2AG9TKCRD", pasted);
  }
  assert.equal(courseraCodeOf("https://example.com/verify/MTI2AG9TKCRD"), undefined, "another site is not Coursera");

  for (const pasted of [
    "introduction-git-github",
    "https://www.coursera.org/learn/introduction-git-github",
    "https://www.coursera.org/learn/introduction-git-github?specialization=google-it-automation",
    "coursera.org/specializations/introduction-git-github",
  ]) {
    assert.equal(courseraSlugOf(pasted), "introduction-git-github", pasted);
  }
  assert.equal(courseraSlugOf("https://www.coursera.org/browse"), undefined, "a page that names no course gives none");
  assert.ok(isValidCourseraCode("MTI2AG9TKCRD") && !isValidCourseraCode("short"));
  assert.ok(isValidCourseraSlug("introduction-git-github") && !isValidCourseraSlug("Not A Slug"));
});

test("the day is taken from milliseconds, and nothing else passes for one", () => {
  assert.equal(courseraGrantedDaySeconds(1_728_878_220_063), Date.UTC(2024, 9, 14) / 1_000);
  assert.equal(courseraGrantedDaySeconds(0), undefined);
  assert.equal(courseraGrantedDaySeconds(-1), undefined);
  assert.equal(courseraGrantedDaySeconds(Number.NaN), undefined);
  // Seconds where milliseconds belong would put the day in 1970, which the thirteen digit pattern refuses upstream.
  assert.notEqual(courseraGrantedDaySeconds(1_728_878_220), courseraGrantedDaySeconds(1_728_878_220_063));
});

test("the source reads four things and the goal is registered for having it or not", () => {
  const names = COURSERA_CERTIFICATE.matches.flatMap((match) => [...match.value.matchAll(/\(\?<(\w+)>/g)].map(([, name]) => name));
  assert.deepEqual(names.sort(), ["certificateCode", "courseId", "courseName", "firstName", "grantedAt", "lastName", "slug"].sort());
  assert.equal(COURSERA_CERTIFICATE.url("mti2ag9tkcrd"), "https://www.coursera.org/account/accomplishments/verify/MTI2AG9TKCRD");
  const goal = milestoneGoal(COURSERA_GOAL_TYPE);
  assert.equal(goal?.shape, SHAPE_HAVE_OR_NOT);
  assert.equal(goal?.source, "Coursera");
});
