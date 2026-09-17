import assert from "node:assert/strict";
import test from "node:test";
import { DET_CERTIFICATE } from "../src/attested-sources";
import {
  certificateSubject,
  detAliasOf,
  detCertificateUrl,
  detDataUrl,
  detProviderId,
  detTestDaySeconds,
  DET_DURATION_DAYS,
  DET_MAX_SCORE,
  DET_MIN_SCORE,
  DET_SOURCE,
  isValidDetAlias,
  isValidDetScore,
  normaliseCertificateName,
} from "../src/duolingo-english-test";

/**
 * The supervised result a gift can hang on (U3). What is tested here is what would let a gift pay the wrong person or
 * refuse the right one: the link, the name, the score, the day, and the three fields the reading is allowed to take.
 */

test("a pasted link gives its alias, whatever shape the person pasted", () => {
  for (const pasted of [
    "https://certs.duolingo.com/abcd1234efgh5678",
    "http://certs.duolingo.com/abcd1234efgh5678",
    "certs.duolingo.com/abcd1234efgh5678",
    "  https://certs.duolingo.com/abcd1234efgh5678  ",
    "abcd1234efgh5678",
  ]) {
    assert.equal(detAliasOf(pasted), "abcd1234efgh5678", pasted);
  }
});

test("anything that is not one of their links gives nothing, rather than a guess", () => {
  for (const pasted of [
    "",
    "   ",
    "https://certs.duolingo.com/",
    "https://duolingo.com/abcd1234efgh5678",
    "https://certs.duolingo.com.evil.test/abcd1234efgh5678",
    "https://certs.duolingo.com/UPPER",
    "https://certs.duolingo.com/short1",
    "not a link at all",
  ]) {
    assert.equal(detAliasOf(pasted), undefined, pasted);
  }
  // Eight characters is the oldest shape they issued, so that is the shortest thing accepted and "short1" is not one.
  assert.equal(detAliasOf("https://certs.duolingo.com/rwfxb4dp"), "rwfxb4dp");
  assert.ok(isValidDetAlias("0123456789abcdef0123456789abcdef"), "the thirty-two character shape");
});

test("the two addresses are the ones measured, and the alias is escaped into them", () => {
  assert.equal(detCertificateUrl("abcd1234efgh5678"), "https://certs.duolingo.com/abcd1234efgh5678");
  assert.equal(detDataUrl("abcd1234efgh5678"), "https://certs.duolingo.com/certificates/data?alias=abcd1234efgh5678");
  assert.equal(detDataUrl("a b"), "https://certs.duolingo.com/certificates/data?alias=a%20b");
});

test("a name is the same whichever way round either side wrote it", () => {
  // The certificate prints "Vantar, Elio Sam Noor"; a funder would type it the other way round.
  const onTheCertificate = "Vantar, Elio Sam Noor";
  const asTyped = "Elio Sam Noor Vantar";
  assert.equal(normaliseCertificateName(onTheCertificate), normaliseCertificateName(asTyped));
  assert.equal(certificateSubject(DET_SOURCE, onTheCertificate), certificateSubject(DET_SOURCE, asTyped));
  // Accents, case and punctuation are all the same name.
  assert.equal(normaliseCertificateName("Léa MARTIN"), normaliseCertificateName("martin lea"));
  assert.equal(normaliseCertificateName("  O'Neill,   Séan  "), "neill o sean");
});

test("a name that is missing a part is another name, and pays nothing", () => {
  const full = certificateSubject(DET_SOURCE, "Vantar, Elio Sam Noor");
  assert.notEqual(certificateSubject(DET_SOURCE, "Noor Vantar"), full, "two of the four words is not the same person");
  assert.notEqual(certificateSubject(DET_SOURCE, "Lea Martin"), full);
  // The source is part of the subject, so one house's certificate can never stand for another's.
  assert.notEqual(certificateSubject("Coursera", "Lea Martin"), certificateSubject(DET_SOURCE, "Lea Martin"));
});

test("the scores are the ones the test gives, in fives", () => {
  assert.ok(isValidDetScore(10) && isValidDetScore(120) && isValidDetScore(160));
  for (const bad of [0, 5, 9, 121, 165, 200, -10, 12.5, Number.NaN]) assert.ok(!isValidDetScore(bad), String(bad));
  assert.equal(DET_MIN_SCORE, 10);
  assert.equal(DET_MAX_SCORE, 160);
});

test("the day of the test is read as a day, and a day the calendar does not have is refused", () => {
  assert.equal(detTestDaySeconds("2025-12-19"), Date.UTC(2025, 11, 19) / 1_000);
  assert.equal(new Date((detTestDaySeconds("2024-02-29") ?? 0) * 1_000).toISOString(), "2024-02-29T00:00:00.000Z");
  for (const bad of ["2025-02-30", "2025-13-01", "19/12/2025", "2025-12-19T10:00:00Z", "", "yesterday"]) {
    assert.equal(detTestDaySeconds(bad), undefined, bad);
  }
});

test("a gift on this result ends well inside the two years a certificate can be shared", () => {
  // Their terms: after two years a certificate is marked expired and can no longer be shared.
  assert.ok(DET_DURATION_DAYS.max <= 365, "the contract caps a deadline at a year, and this is under it");
  assert.ok(DET_DURATION_DAYS.max * 2 < 730, "at proof time the certificate is at most half its life old");
  assert.ok(DET_DURATION_DAYS.min >= 14 && DET_DURATION_DAYS.suggested <= DET_DURATION_DAYS.max);
});

test("the reading takes three fields and never the date of birth or the photograph", () => {
  const patterns = DET_CERTIFICATE.matches.map((match) => match.value).join(" ");
  assert.equal(DET_CERTIFICATE.matches.length, 3);
  for (const wanted of ["overall_score", "test_date", "full_name"]) assert.ok(patterns.includes(wanted), wanted);
  for (const refused of ["date_of_birth", "face_url", "subscores", "translated_name", "certificate_url"]) {
    assert.ok(!patterns.includes(refused), `${refused} must not be read`);
  }
  assert.equal(DET_CERTIFICATE.url("abcd1234efgh5678"), detDataUrl("abcd1234efgh5678"));
  assert.ok(!DET_CERTIFICATE.accepts("../etc/passwd") && DET_CERTIFICATE.accepts("abcd1234efgh5678"));
});

test("the name pattern survives the comma the certificate prints inside it", () => {
  const answer = '{"overall_score":135,"full_name":"Vantar, Elio Sam Noor","test_date":"2025-12-19"}';
  const values: Record<string, string> = {};
  for (const match of DET_CERTIFICATE.matches) {
    const found = new RegExp(match.value).exec(answer);
    assert.ok(found?.groups, match.value);
    Object.assign(values, found.groups);
  }
  assert.equal(values.overallScore, "135");
  assert.equal(values.testDate, "2025-12-19");
  assert.equal(values.fullName, "Vantar, Elio Sam Noor");
});

test("the provider id is this source's own, and stable", () => {
  assert.match(detProviderId(), /^0x[0-9a-f]{64}$/);
  assert.equal(detProviderId(), detProviderId());
});
