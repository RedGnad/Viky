import assert from "node:assert/strict";
import test from "node:test";
import { classifyFetchFailure, type AttestedReadDeps } from "../src/attested-read";
import { DET_CERTIFICATE } from "../src/attested-sources";
import { attestDetCertificate, certificateIsFor, DetReadError, readDetCertificate, type PlainFetch } from "../src/det-reading";
import { certificateSubject, DET_SOURCE } from "../src/duolingo-english-test";
import type { ZkFetchProof } from "../src/duolingo-public";

/**
 * Reading a supervised result (U3). The three answers that are facts about the page rather than failures of ours are
 * the point of this file: private again, expired, never there. The keeper holds a gift open on our own failures, so a
 * certificate somebody withdrew must never look like one.
 */

const ATTESTOR = "0x244897572368eadf65bfbc5aec98d8e5443a9072";
const ALIAS = "abcd1234efgh5678";
/** The answer of the certificate's data address, in its own shape, with an invented holder: the name and the date of birth are made up. */
const ANSWER = {
  rating: null,
  is_legacy: false,
  overall_score: 135,
  language: "en",
  full_name: "Vantar, Elio Sam Noor",
  test_date: "2025-12-19",
  face_url: "https://example.test/face.jpg",
  date_of_birth: "2000-01-01",
  subscores: { literacy: 140 },
};

function answering(status: number, body: unknown = ANSWER): PlainFetch {
  return async () => new Response(status === 200 ? JSON.stringify(body) : "<html>no</html>", { status, headers: { "content-type": status === 200 ? "application/json" : "text/html" } });
}

function proofOf(extracted: Record<string, string>, timestampS = 1_789_653_320): ZkFetchProof {
  return {
    claimData: {
      provider: "http",
      parameters: JSON.stringify({ url: DET_CERTIFICATE.url(ALIAS), method: "GET", headers: { accept: "application/json" }, body: "", responseMatches: DET_CERTIFICATE.matches }),
      context: JSON.stringify({ extractedParameters: extracted, providerHash: "0xb78a" }),
      identifier: `0x${"d2".repeat(32)}`,
      timestampS,
    },
    signatures: ["0x00"],
    witnesses: [{ id: ATTESTOR, url: "wss://attestor.reclaimprotocol.org:444/ws" }],
  };
}

function honest(extracted: Record<string, string> = { overallScore: "135", testDate: "2025-12-19", fullName: ANSWER.full_name }): AttestedReadDeps {
  return {
    zkFetch: async () => proofOf(extracted),
    verify: async () => true,
    attestors: [ATTESTOR],
  } as unknown as AttestedReadDeps;
}

test("a public certificate reads as its three fields, and nothing else it carries", async () => {
  const certificate = await readDetCertificate(ALIAS, answering(200));
  assert.equal(certificate.score, 135);
  assert.equal(certificate.name, ANSWER.full_name);
  assert.equal(new Date(certificate.testDay * 1_000).toISOString(), "2025-12-19T00:00:00.000Z");
  assert.equal(certificate.subject, certificateSubject(DET_SOURCE, ANSWER.full_name));
  // Nothing on the object carries the date of birth or the photograph, whatever the answer held.
  assert.deepEqual(Object.keys(certificate).sort(), ["alias", "name", "score", "subject", "testDay"]);
  assert.doesNotMatch(JSON.stringify(certificate), /2000-01-01|face\.jpg/);
});

test("a link that is not public any more says so, and is not a failure of ours", async () => {
  await assert.rejects(readDetCertificate(ALIAS, answering(403)), (error: unknown) => error instanceof DetReadError && error.code === "CERTIFICATE_PRIVATE");
});

test("a certificate past its life says so", async () => {
  await assert.rejects(readDetCertificate(ALIAS, answering(400)), (error: unknown) => error instanceof DetReadError && error.code === "CERTIFICATE_EXPIRED");
});

test("a link nothing answers to says so, and anything else is ours to fix", async () => {
  await assert.rejects(readDetCertificate(ALIAS, answering(404)), (error: unknown) => error instanceof DetReadError && error.code === "NO_CERTIFICATE");
  await assert.rejects(readDetCertificate(ALIAS, answering(500)), (error: unknown) => error instanceof DetReadError && error.code === "FETCH_FAILED");
  await assert.rejects(
    readDetCertificate(ALIAS, async () => {
      throw new Error("the network went");
    }),
    (error: unknown) => error instanceof DetReadError && error.code === "FETCH_FAILED",
  );
});

test("something that is not a link at all is refused before anything is fetched", async () => {
  let fetched = 0;
  const counting: PlainFetch = async () => {
    fetched += 1;
    return new Response("{}", { status: 200 });
  };
  await assert.rejects(readDetCertificate("../etc/passwd", counting), (error: unknown) => error instanceof DetReadError && error.code === "INVALID_LINK");
  assert.equal(fetched, 0);
});

test("an answer missing any of the three fields is not a result to settle anything on", async () => {
  for (const body of [
    { ...ANSWER, overall_score: undefined },
    { ...ANSWER, full_name: "" },
    { ...ANSWER, test_date: "not a day" },
    { ...ANSWER, overall_score: 137 },
  ]) {
    await assert.rejects(readDetCertificate(ALIAS, answering(200, body)), (error: unknown) => error instanceof DetReadError && error.code === "PROOF_INVALID", JSON.stringify(body.test_date ?? body.overall_score));
  }
});

test("the attested reading gives the same three fields, with the moment and the nullifier", async () => {
  const reading = await attestDetCertificate(ALIAS, honest());
  assert.equal(reading.score, 135);
  assert.equal(reading.name, ANSWER.full_name);
  assert.equal(reading.observedAt, 1_789_653_320);
  assert.match(reading.nullifier, /^0x[0-9a-f]{64}$/);
  assert.equal(reading.proofs.length, 1);
  assert.ok(certificateIsFor(reading, certificateSubject(DET_SOURCE, "Elio Sam Noor Vantar")), "the funder's own order of the name");
  assert.ok(!certificateIsFor(reading, certificateSubject(DET_SOURCE, "Lea Martin")));
});

test("what the source answers becomes what the person is told, not what the keeper holds on", async () => {
  // 403 and 400 are facts about the page. FETCH_FAILED is the code the keeper holds a gift open on, so neither may be it.
  const cases = [
    { message: "HTTP response status 403 is not a success status", code: "CERTIFICATE_PRIVATE" },
    { message: "HTTP response status 400 is not a success status", code: "CERTIFICATE_EXPIRED" },
    { message: "HTTP response status 404 is not a success status", code: "NO_CERTIFICATE" },
    { message: "the attestor fell over", code: "FETCH_FAILED" },
  ] as const;
  for (const { message, code } of cases) {
    const failing: AttestedReadDeps = {
      ...honest(),
      zkFetch: async () => {
        throw new Error(message);
      },
    };
    await assert.rejects(attestDetCertificate(ALIAS, failing), (error: unknown) => error instanceof DetReadError && error.code === code, message);
  }
});

test("the classifier itself knows the three answers apart", () => {
  assert.equal(classifyFetchFailure("HTTP response status 403 is not a success status", DET_CERTIFICATE).code, "REFUSED");
  assert.equal(classifyFetchFailure("received HTTP 400", DET_CERTIFICATE).code, "NOT_ACCEPTED");
  assert.equal(classifyFetchFailure("HTTP response status 404 is not a success status", DET_CERTIFICATE).code, "NOT_FOUND");
  assert.equal(classifyFetchFailure("something else entirely", DET_CERTIFICATE).code, "FETCH_FAILED");
});

test("a proof read with other patterns is refused, so a looser reading cannot pass for this one", async () => {
  const loose: AttestedReadDeps = {
    ...honest(),
    zkFetch: async () =>
      ({
        ...proofOf({ overallScore: "135", testDate: "2025-12-19", fullName: ANSWER.full_name }),
        claimData: {
          ...proofOf({}).claimData,
          parameters: JSON.stringify({ url: DET_CERTIFICATE.url(ALIAS), method: "GET", headers: { accept: "application/json" }, body: "", responseMatches: [{ type: "regex", value: '"overall_score":(?<overallScore>\\d+)' }] }),
        },
      }) as ZkFetchProof,
  };
  await assert.rejects(attestDetCertificate(ALIAS, loose), (error: unknown) => error instanceof DetReadError && error.code === "PROOF_MISMATCH");
});
