import assert from "node:assert/strict";
import test from "node:test";
import { MITX_ONLINE_CERTIFICATE } from "../src/attested-sources";
import { privacyOf } from "../src/condition-privacy";
import { proofOfCondition } from "../src/condition-proof";
import { CONDITIONS, conditionById, MITX_ONLINE_CERTIFICATE_LINE as LINE } from "../src/conditions";
import { certificateById, MITX_ONLINE_MILESTONE } from "../src/milestone-conditions";
import { MILESTONE_GOALS } from "../src/milestone-goals";
import { MITX_ONLINE_GOAL_TYPE, mitxOnlineCourseOf, mitxOnlineIssuedDaySeconds, mitxOnlineKeyOf, mitxOnlineProviderId, mitxOnlineSubject } from "../src/mitx-online-certificate";
import { MitxOnlineReadError, mitxOnlineCertificateOf, readMitxOnlineCertificate } from "../src/mitx-online-reading";

/**
 * An MIT course certificate from MITx Online (D222). The markup below is a live program certificate's, measured on
 * 24 Sep 2026 (`/certificate/program/2c3d4e5f-…`), trimmed to what is read, with an invented holder's name.
 */
const ID = "2c3d4e5f-6071-4c8d-ae9f-1a2b3c4d5e6f";
const PAGE = `<title>MITx Online | Certificate for: Introduction to Mechanics</title><meta name="description" content="">
<span class="certify-text">This is to certify that</span>
                    <span class="certify-name">Ada Example</span>
                    <span class="degree-text">Introduction to Mechanics</span>
                    <span class="award-text">

                        Issued: Dec. 19, 2025
                    </span>
                              <strong>Valid Certificate ID:</strong>
                              <a href="http://mitxonline.mit.edu/certificate/program/${ID}/" target="_blank">${ID}</a>`;

function valuesOf(page: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of MITX_ONLINE_CERTIFICATE.matches) Object.assign(values, new RegExp(match.value).exec(page)?.groups ?? {});
  return values;
}

test("the link gives the certificate's key, a course's uuid or a program's, and nothing else", () => {
  assert.equal(mitxOnlineKeyOf(`https://mitxonline.mit.edu/certificate/program/${ID}/`), `program/${ID}`);
  assert.equal(mitxOnlineKeyOf(`mitxonline.mit.edu/certificate/${ID}`), ID);
  assert.equal(mitxOnlineKeyOf(ID.toUpperCase()), ID);
  assert.equal(mitxOnlineKeyOf(`https://mitxonline.mit.edu.evil.test/certificate/${ID}/`), undefined);
  assert.equal(mitxOnlineKeyOf(`https://mitxonline.mit.edu/courses/${ID}/`), undefined);
  assert.equal(mitxOnlineKeyOf("https://courses.edx.org/certificates/0a1b2c3d4e5f60718293a4b5c6d7e8f9"), undefined);
  assert.equal(MITX_ONLINE_CERTIFICATE.url(`program/${ID}`), `https://mitxonline.mit.edu/certificate/program/${ID}/`);
  assert.ok(MITX_ONLINE_CERTIFICATE.accepts(ID) && MITX_ONLINE_CERTIFICATE.accepts(`program/${ID}`) && !MITX_ONLINE_CERTIFICATE.accepts(`../${ID}`));
});

test("the four patterns read the live page, and the reading is what the funder signs", () => {
  const certificate = mitxOnlineCertificateOf(`program/${ID}`, valuesOf(PAGE));
  assert.equal(certificate.name, "Ada Example");
  assert.equal(certificate.title, "Introduction to Mechanics");
  assert.equal(certificate.course, "introduction to mechanics");
  assert.equal(certificate.issuedDay, Date.UTC(2025, 11, 19) / 1000);
  assert.equal(certificate.subject, mitxOnlineSubject("Ada Example", mitxOnlineCourseOf("Introduction  to Mechanics") ?? ""));
  assert.throws(() => mitxOnlineCertificateOf(`program/${"0".repeat(8)}-0000-0000-0000-000000000000`, valuesOf(PAGE)), (error: unknown) => error instanceof MitxOnlineReadError && error.code === "PROOF_MISMATCH");
  assert.throws(() => mitxOnlineCertificateOf(ID, {}), (error: unknown) => error instanceof MitxOnlineReadError && error.code === "NO_CERTIFICATE");
});

test("the day of issue in Django's own month words", () => {
  assert.equal(mitxOnlineIssuedDaySeconds("Nov. 4, 2024"), Date.UTC(2024, 10, 4) / 1000);
  assert.equal(mitxOnlineIssuedDaySeconds("Sept. 30, 2026"), Date.UTC(2026, 8, 30) / 1000);
  assert.equal(mitxOnlineIssuedDaySeconds("May 3, 2026"), Date.UTC(2026, 4, 3) / 1000);
  assert.equal(mitxOnlineIssuedDaySeconds("March 31, 2026"), Date.UTC(2026, 2, 31) / 1000);
  assert.equal(mitxOnlineIssuedDaySeconds("Feb. 30, 2026"), undefined);
  assert.equal(mitxOnlineIssuedDaySeconds("September 30, 2026"), undefined, "Django prints Sept.");
});

test("a revoked or unknown certificate is a 404, and says so by name", async () => {
  const answer = (status: number, body = "") => async () => new Response(body, { status });
  await assert.rejects(readMitxOnlineCertificate(ID, answer(404)), (error: unknown) => error instanceof MitxOnlineReadError && error.code === "NO_CERTIFICATE");
  await assert.rejects(readMitxOnlineCertificate("not-a-key", answer(200)), (error: unknown) => error instanceof MitxOnlineReadError && error.code === "INVALID_LINK");
  const read = await readMitxOnlineCertificate(`program/${ID}`, answer(200, PAGE));
  assert.equal(read.title, "Introduction to Mechanics");
});

test("the line: read for them, School & studies, goal 29, open, the fact rule, in the shared list", () => {
  assert.equal(LINE.family, "exam");
  assert.equal(LINE.nature, "read");
  assert.equal(LINE.live, true);
  assert.ok(CONDITIONS.includes(LINE));
  assert.ok(LINE.name.length <= 30);
  // What the giver buys, said without a negation (the founder, 5 Oct 2026): an online course, on MITx Online.
  assert.match(LINE.help, /It proves an online course passed on MITx Online\.$/, "an online course, never enrolled at MIT");
  assert.doesNotMatch(LINE.help, /\bnot\b/);
  assert.equal(conditionById("mitx-online-certificate"), LINE);
  assert.equal(certificateById("mitx-online-certificate"), MITX_ONLINE_MILESTONE);
  assert.ok(proofOfCondition("mitx-online-certificate"));
  assert.equal(privacyOf(LINE).kept, "fact");
  assert.equal(MITX_ONLINE_GOAL_TYPE, 29);
  assert.ok(MILESTONE_GOALS.some((goal) => goal.goalType === 29 && goal.providerId === mitxOnlineProviderId()));
  assert.equal(MITX_ONLINE_MILESTONE.readPath, "/api/mitx-online/certificate");
});
