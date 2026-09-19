import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { POST as readCertificate } from "../app/api/coursera/certificate/route";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { COURSERA_HAS_IT, courseraSubject } from "../src/coursera-certificate";
import { conditionAnswered, EMPTY_DRAFT } from "../src/gift-draft";
import { COURSERA_MILESTONE, DET_MILESTONE } from "../src/milestone-conditions";

/**
 * What the funder is asked for a course certificate, and what the screens and the route both judge it by (C3).
 *
 * The condition asks one different thing from the test: there is nothing to score, so the funder names the course by
 * pasting its ordinary link. Both halves of that were measured on live pages on 19 Sep 2026, and both are held here:
 * the certificate page carries the same word for the course as the course link does, and a real certificate can
 * carry a name of one word.
 */

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const SOMEBODY = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;

async function cookie(): Promise<string> {
  const challenge = createAccountAuthChallenge({ account: SOMEBODY.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const signature = await SOMEBODY.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  return `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
}

function ask(body: unknown, withCookie?: string): Request {
  const headers: Record<string, string> = { origin: ORIGIN, host: "viky.test", "content-type": "application/json" };
  if (withCookie) headers.cookie = withCookie;
  return new Request(`${ORIGIN}/api/coursera/certificate`, { method: "POST", headers, body: JSON.stringify(body) });
}

test("the funder names the course by pasting its link, and the terms carry that word", () => {
  const course = COURSERA_MILESTONE.course;
  assert.ok(course, "a course certificate asks for a course");
  for (const pasted of [
    "https://www.coursera.org/learn/introduction-git-github",
    "coursera.org/learn/introduction-git-github?specialization=google-it-automation",
    "introduction-git-github",
  ]) {
    assert.equal(course.slugOf(pasted), "introduction-git-github", pasted);
  }
  assert.equal(course.slugOf("https://example.test/learn/introduction-git-github"), undefined, "another site names no course here");
  // The same word the certificate page carries, which is what makes the two ends meet without resolving anything.
  assert.equal(
    COURSERA_MILESTONE.subject({ name: "Ada Lovelace", course: "introduction-git-github" }),
    courseraSubject("Ada Lovelace", "introduction-git-github"),
  );
});

test("two courses are two gifts, and the person alone is not enough to tell them apart", () => {
  const one = COURSERA_MILESTONE.subject({ name: "Ada Lovelace", course: "introduction-git-github" });
  const other = COURSERA_MILESTONE.subject({ name: "Ada Lovelace", course: "matlab" });
  assert.notEqual(one, other, "a certificate for another course pays nothing");
  assert.notEqual(one, COURSERA_MILESTONE.subject({ name: "Grace Hopper", course: "introduction-git-github" }));
});

test("each certificate condition says what name its own source prints", () => {
  // Measured 19 Sep 2026: a real Coursera certificate carries an empty last name, so one word is a name there.
  assert.ok(COURSERA_MILESTONE.validName("Ada"), "a one word name is a name on a course certificate");
  assert.ok(!DET_MILESTONE.validName("Ada"), "the test prints a legal name and asks for two words");
  assert.ok(DET_MILESTONE.validName("Ada Lovelace"));
});

test("there is nothing to score, so the target is the one the contract holds", () => {
  assert.ok(COURSERA_MILESTONE.validTarget(COURSERA_HAS_IT));
  assert.ok(!COURSERA_MILESTONE.validTarget(0), "a gift that asks for nothing is not a gift");
  assert.ok(!COURSERA_MILESTONE.validTarget(120), "a score belongs to the test, not here");
  assert.ok(DET_MILESTONE.validTarget(120) && !DET_MILESTONE.validTarget(COURSERA_HAS_IT));
});

test("a draft is answered only when the course is one, and never by the link alone", () => {
  const base = { ...EMPTY_DRAFT, conditionId: COURSERA_MILESTONE.condition.id, subject: "Ada", dollars: "10", days: "120", target: String(COURSERA_HAS_IT) };
  assert.equal(conditionAnswered(base), false, "no course named yet");
  assert.equal(conditionAnswered({ ...base, courseTitle: "https://www.coursera.org/learn/introduction-git-github" }), false, "what was pasted is not what is signed");
  assert.equal(conditionAnswered({ ...base, course: "introduction-git-github" }), true);
  assert.equal(conditionAnswered({ ...base, course: "introduction-git-github", subject: "" }), false, "and a certificate carries a name");
});

test("the route the register names is the one that exists, and it refuses a stranger", async () => {
  assert.equal(COURSERA_MILESTONE.readPath, "/api/coursera/certificate");
  assert.ok(COURSERA_MILESTONE.validLink("https://www.coursera.org/account/accomplishments/verify/MTI2AG9TKCRD"));
  assert.ok(!COURSERA_MILESTONE.validLink("https://example.test/nope"));
  const answer = await readCertificate(ask({ link: "https://www.coursera.org/account/accomplishments/verify/MTI2AG9TKCRD" }));
  assert.equal(answer.status, 401);
  assert.equal(((await answer.json()) as { error: string }).error, "SIGN_IN_REQUIRED");
});

test("anything that is not one of their links is refused without a fetch", async () => {
  const signedIn = await cookie();
  for (const link of ["", "https://example.test/abc", "coursera.org/", "../../etc/passwd", 42, null, "x".repeat(600)]) {
    const answer = await readCertificate(ask({ link }, signedIn));
    assert.equal(answer.status, 400, JSON.stringify(link));
    assert.equal(((await answer.json()) as { code?: string }).code ?? "INVALID_JSON", "INVALID_LINK", JSON.stringify(link));
  }
});
