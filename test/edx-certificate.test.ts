import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { attestedSource, EDX_CERTIFICATE } from "../src/attested-sources";
import { privacyOf } from "../src/condition-privacy";
import { proofOfCondition } from "../src/condition-proof";
import { BUILDING, CONDITIONS, conditionById, EDX_CERTIFICATE as EDX_LINE } from "../src/conditions";
import { edxCertificateIdOf, edxCourseKey, edxCourseOf, edxIssuedDaySeconds, edxProviderId, edxSubject, EDX_GOAL_TYPE, isVerifiedTrack } from "../src/edx-certificate";
import { edxCertificateOf, EdxReadError, readEdxCertificate } from "../src/edx-reading";
import { certificateById, EDX_MILESTONE } from "../src/milestone-conditions";
import { MILESTONE_GOALS } from "../src/milestone-goals";

/**
 * An edX verified certificate (D212). The page below is the live certificate measured on 24 Sep 2026, trimmed to the
 * block the patterns read, carriage returns kept as edX serves them.
 */
const PAGE = [
  "<title>GTx ISYE6501x Certificate | edX</title>",
  '            <div class="wrapper-accomplishment-rendering">',
  '                    <div class="wrapper-accomplishment-title verified">',
  '                                <strong class="accomplishment-recipient">Alba Ines Marchetti</strong>',
  '                                    <span class="accomplishment-course-number">ISYE6501x</span>:',
  '                                    <span class="accomplishment-course-name">Introduction to Analytics Modeling</span>',
  '                                <span class="copy-micro emphasized">Issued August 6, 2018</span>',
  '                                <span class="emphasized"><a href="https://courses.edx.org/certificates/0a1b2c3d4e5f60718293a4b5c6d7e8f9">0a1b2c3d4e5f60718293a4b5c6d7e8f9</a></span>',
].join("\r\n");
const ID = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";

function valuesOf(page: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of EDX_CERTIFICATE.matches) {
    const found = new RegExp(match.value).exec(page);
    assert.ok(found?.groups, match.value);
    Object.assign(out, found.groups);
  }
  return out;
}

test("the six patterns read the live certificate, and the reading is what the funder signs", () => {
  const values = valuesOf(PAGE);
  assert.deepEqual(values, { org: "GTx", courseNumber: "ISYE6501x", track: "verified", name: "Alba Ines Marchetti", courseName: "Introduction to Analytics Modeling", issued: "August 6, 2018", certificateId: ID });
  const certificate = edxCertificateOf(ID, values);
  assert.equal(certificate.courseKey, "gtx+isye6501x");
  assert.equal(certificate.issuedDay, Date.UTC(2018, 7, 6) / 1_000);
  assert.equal(certificate.subject, edxSubject("Marchetti Alba Ines", "GTx+ISYE6501x"), "name order and case do not matter");
  assert.notEqual(certificate.subject, edxSubject("Alba Ines Marchetti", "HarvardX+CS50x"), "another course is another subject");
});

test("a certificate that is not verified, is another's, or lost a field is refused by name", () => {
  const values = valuesOf(PAGE);
  assert.throws(() => edxCertificateOf(ID, { ...values, track: "honor" }), (error: unknown) => error instanceof EdxReadError && error.code === "NOT_VERIFIED");
  assert.ok(isVerifiedTrack("professional") && !isVerifiedTrack("audit"));
  assert.throws(() => edxCertificateOf("0".repeat(32), values), (error: unknown) => error instanceof EdxReadError && error.code === "PROOF_MISMATCH");
  assert.throws(() => edxCertificateOf(ID, { ...values, issued: "someday" }), (error: unknown) => error instanceof EdxReadError && error.code === "PROOF_INVALID");
  assert.throws(() => edxCertificateOf(ID, {}), (error: unknown) => error instanceof EdxReadError && error.code === "NO_CERTIFICATE");
});

test("a withdrawn or unknown certificate answers 404 and is refused as none", async () => {
  await assert.rejects(readEdxCertificate("f0e1d2c3b4a5968778695a4b3c2d1e0f", async () => new Response("Page not found", { status: 404 })), (error: unknown) => error instanceof EdxReadError && error.code === "NO_CERTIFICATE");
  const read = await readEdxCertificate(ID, async () => new Response(PAGE, { status: 200 }));
  assert.equal(read.name, "Alba Ines Marchetti");
});

test("links, codes and days as a person types them", () => {
  assert.equal(edxCertificateIdOf(`https://courses.edx.org/certificates/${ID}`), ID);
  assert.equal(edxCertificateIdOf(ID.toUpperCase()), ID);
  assert.equal(edxCertificateIdOf("https://example.com/certificates/" + ID), undefined);
  assert.equal(edxCourseOf("https://courses.edx.org/courses/course-v1:GTx+ISYE6501x+2T2018/course/"), "gtx+isye6501x");
  assert.equal(edxCourseOf("HarvardX CS50x"), "harvardx+cs50x");
  assert.equal(edxCourseOf("HarvardX+CS50x"), "harvardx+cs50x");
  assert.equal(edxCourseOf("https://www.edx.org/learn/computer-science/harvard-university-cs50-s-introduction-to-computer-science"), undefined, "a catalogue link carries no code");
  assert.equal(edxCourseKey("GTx", "ISYE 6501x"), undefined);
  assert.equal(edxIssuedDaySeconds("February 30, 2020"), undefined);
});

test("the line: read for them, Learn, goal 25, open, the fact rule, in the shared list", () => {
  assert.equal(EDX_LINE.family, "learn");
  assert.equal(EDX_LINE.nature, "read");
  assert.equal(EDX_LINE.live, true);
  assert.equal(EDX_LINE.state, "open");
  assert.ok(CONDITIONS.includes(EDX_LINE) && !BUILDING.includes(EDX_LINE));
  assert.equal(conditionById("edx-certificate"), EDX_LINE);
  assert.equal(certificateById("edx-certificate"), EDX_MILESTONE);
  assert.ok(proofOfCondition("edx-certificate"));
  assert.equal(privacyOf(EDX_LINE).kept, "fact");
  assert.equal(EDX_GOAL_TYPE, 25);
  assert.ok(MILESTONE_GOALS.some((goal) => goal.goalType === 25 && goal.providerId === edxProviderId()));
  assert.equal(attestedSource("edx-certificate"), EDX_CERTIFICATE);
  assert.ok(EDX_LINE.name.length <= 30);
  assert.ok(readFileSync("app/judges/page.tsx", "utf8").includes("edX&apos;s terms."));
});
