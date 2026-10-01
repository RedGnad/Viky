import assert from "node:assert/strict";
import test from "node:test";
import { ACCREDIBLE_CREDENTIAL, attestedSource } from "../src/attested-sources";
import { accredibleCourseOf, accredibleIdOf, accredibleProviderId, accredibleSubject, ACCREDIBLE_GOAL_TYPE, issuerDomainOf } from "../src/accredible-credential";
import { accredibleCredentialOf, AccredibleReadError, readAccredibleCredential } from "../src/accredible-reading";
import { privacyOf } from "../src/condition-privacy";
import { proofOfCondition } from "../src/condition-proof";
import { ACCREDIBLE_CREDENTIAL as LINE, BUILDING, CONDITIONS, conditionById } from "../src/conditions";
import { ACCREDIBLE_MILESTONE, certificateById } from "../src/milestone-conditions";
import { MILESTONE_GOALS } from "../src/milestone-goals";

/**
 * A credential on Accredible (D213). The record below is the live one measured on 24 Sep 2026, trimmed to what is read,
 * with an invented holder: the name, the identifiers and the masked e-mail are made up, each in the shape of the real one.
 */
const ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const RECORD = `{"data":{"id":100000001,"private_key":null,"private":false,"grade":null,"issued_on":"2024-06-22","expired_on":null,"uuid":"${ID}","name":"Rearchitecting the Financial System","custom_type":{"course_name":"text"},"expired":false,"recipient":{"email":"e********@e*******.org","name":"Elio Vantar","id":"${ID}"},"revoked_at":null,"issuer":{"id":10312,"name":"issuer+t00000@example.com","url":"https://www.cfte.education?aad=BAhJ","description":"x"},"group":{"course_name":"Rearchitecting the Financial System"}}}`;

function valuesOf(page: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of ACCREDIBLE_CREDENTIAL.matches) {
    const found = new RegExp(match.value).exec(page);
    assert.ok(found?.groups, match.value);
    Object.assign(out, found.groups);
  }
  return out;
}

test("the seven patterns read the live record, and the funder's line is one of the subjects it proves", () => {
  const values = valuesOf(RECORD);
  assert.equal(values.title, "Rearchitecting the Financial System");
  assert.equal(values.name, "Elio Vantar");
  assert.equal(values.issuerId, "10312");
  assert.equal(values.email, undefined, "the masked email is matched, never captured");
  const credential = accredibleCredentialOf(ID, values);
  assert.equal(credential.issuerHost, "cfte.education");
  assert.equal(credential.issuedDay, Date.UTC(2024, 5, 22) / 1_000);
  const course = accredibleCourseOf("Rearchitecting the Financial System, cfte.education");
  assert.equal(course, "rearchitecting the financial system|cfte.education");
  assert.ok(credential.subjects.includes(accredibleSubject("Vantar Elio", course!)));
  assert.ok(!credential.subjects.includes(accredibleSubject("Elio Vantar", accredibleCourseOf("Rearchitecting the Financial System, example.com")!)), "another issuer's site is another subject");
});

test("private, expired, revoked, another credential or none: each refused by name", async () => {
  const values = valuesOf(RECORD);
  const refused = (code: string) => (error: unknown) => error instanceof AccredibleReadError && error.code === code;
  assert.throws(() => accredibleCredentialOf(ID, { ...values, private: "true" }), refused("CERTIFICATE_PRIVATE"));
  assert.throws(() => accredibleCredentialOf(ID, { ...values, expired: "true" }), refused("CERTIFICATE_EXPIRED"));
  assert.throws(() => accredibleCredentialOf(ID, { ...values, revokedAt: '"2025-01-01T00:00:00Z"' }), refused("CERTIFICATE_EXPIRED"));
  assert.throws(() => accredibleCredentialOf("00000000-0000-4000-8000-000000000000", values), refused("PROOF_MISMATCH"));
  await assert.rejects(readAccredibleCredential("00000000-0000-4000-8000-000000000000", async () => new Response('{"error":"NOT_FOUND"}', { status: 404 })), refused("NO_CERTIFICATE"));
});

test("links and names as a person types them", () => {
  assert.equal(accredibleIdOf(`https://www.credential.net/${ID}#acc.LNGqF3XZ`), ID);
  assert.equal(accredibleIdOf(ID.toUpperCase()), ID);
  assert.equal(accredibleIdOf(`https://example.com/${ID}`), undefined);
  assert.equal(issuerDomainOf("https://www.cfte.education?aad=x"), "cfte.education");
  assert.equal(accredibleCourseOf("no comma here"), undefined);
});

test("the line: read for them, Learn, goal 26, open, the fact rule, in the shared list", () => {
  assert.equal(LINE.family, "learn");
  assert.equal(LINE.nature, "read");
  assert.equal(LINE.live, true);
  assert.equal(LINE.state, "open");
  assert.ok(CONDITIONS.includes(LINE) && !BUILDING.includes(LINE));
  assert.ok(LINE.name.length <= 30);
  assert.equal(conditionById("accredible-credential"), LINE);
  assert.equal(certificateById("accredible-credential"), ACCREDIBLE_MILESTONE);
  assert.ok(proofOfCondition("accredible-credential"));
  assert.equal(privacyOf(LINE).kept, "fact");
  assert.equal(ACCREDIBLE_GOAL_TYPE, 26);
  assert.ok(MILESTONE_GOALS.some((goal) => goal.goalType === 26 && goal.providerId === accredibleProviderId()));
  assert.equal(attestedSource("accredible-credential"), ACCREDIBLE_CREDENTIAL);
});
