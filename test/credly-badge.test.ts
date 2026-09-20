import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import type { AttestedReadDeps } from "../src/attested-read";
import { attestedSource, CREDLY_ASSERTION, CREDLY_BADGE_PAGE } from "../src/attested-sources";
import {
  CREDLY_CERTIFICATIONS,
  CREDLY_GOAL_TYPE,
  CREDLY_HAS_IT,
  credlyBadgeIdOf,
  credlyCertification,
  credlyCertificationOfBadgeUrl,
  credlyHolderOfTitle,
  credlyIssuedDaySeconds,
  credlyProviderId,
  credlySubject,
  isValidCredlyBadgeId,
} from "../src/credly-badge";
import { attestCredlyBadge, CredlyReadError, readCredlyBadge, type PlainFetch } from "../src/credly-reading";
import type { ZkFetchProof } from "../src/duolingo-public";
import { CREDLY_MILESTONE } from "../src/milestone-conditions";
import { milestoneGoal } from "../src/milestone-goals";
import { SHAPE_HAVE_OR_NOT } from "../src/milestone-protocol";

/**
 * A certification on Credly: two public records of one badge, read together (20 Sep 2026).
 *
 * Every fixture below is a real answer, measured that day on three live badges and on a badge id nobody has. What
 * these tests guard is the thing that would quietly pay the wrong gift: a badge is identified by its issuer's id
 * and its badge class's id, never by the words on its page, and the two halves must be about the same badge.
 */

const BADGE = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const ASSERTION =
  '{"@context":"https://w3id.org/openbadges/v2","badge":"https://www.credly.com/api/v1/obi/v2/issuers/74381078-44ac-4581-8471-36bd1ce495b7/badge_classes/911500fa-32e7-4986-99de-94fb73040a20",' +
  `"evidence":[],"id":"https://www.credly.com/api/v1/obi/v2/badge_assertions/${BADGE}","issuedOn":"2024-08-30T22:14:09.000Z",` +
  '"recipient":{"type":"email","identity":"sha256$0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9","hashed":true},"type":"Assertion","verification":{"type":"hosted"}}';
const PAGE =
  '<meta property="og:title" content="AI Fundamentals with IBM SkillsBuild was issued by Cisco to Elio Vantar.">' +
  `<meta property="og:image" content="https://images.credly.com/images/26c21273/linkedin_thumb_image.png"><meta property="og:url" content="https://www.credly.com/badges/${BADGE}">`;
/** The whole answer for a badge nobody has: 200, and not one `og` tag in nine kilobytes. */
const NO_SUCH_PAGE = "<html><head><title>Credly</title></head><body></body></html>";

const ATTESTOR = "0x244897572368eadf65bfbc5aec98d8e5443a9072";

function proofOf(url: string, matches: readonly { type: string; value: string }[], extracted: Record<string, string>, timestampS = 1_789_653_320, identifier = `0x${"d2".repeat(32)}`): ZkFetchProof {
  return {
    claimData: {
      provider: "http",
      parameters: JSON.stringify({ url, method: "GET", headers: { accept: "application/json" }, body: "", responseMatches: matches }),
      context: JSON.stringify({ extractedParameters: extracted, providerHash: "0xb78a" }),
      identifier,
      timestampS,
    },
    signatures: ["0x00"],
    witnesses: [{ id: ATTESTOR, url: "wss://attestor.reclaimprotocol.org:444/ws" }],
  };
}

const RECORD = {
  badge: "https://www.credly.com/api/v1/obi/v2/issuers/74381078-44ac-4581-8471-36bd1ce495b7/badge_classes/911500fa-32e7-4986-99de-94fb73040a20",
  assertion: `https://www.credly.com/api/v1/obi/v2/badge_assertions/${BADGE}`,
  issuedOn: "2024-08-30",
};
const TITLE = { ogTitle: "AI Fundamentals with IBM SkillsBuild was issued by Cisco to Elio Vantar.", ogUrl: `https://www.credly.com/badges/${BADGE}` };

function honest(overrides: Partial<Record<string, (account: string) => ZkFetchProof>> = {}): AttestedReadDeps {
  return {
    zkFetch: async (source, account) => {
      const custom = overrides[source.id];
      if (custom) return custom(account);
      if (source.id === CREDLY_ASSERTION.id) return proofOf(source.url(account), source.matches, RECORD);
      return proofOf(source.url(account), source.matches, TITLE, 1_789_653_330, `0x${"5b".repeat(32)}`);
    },
    verify: async () => true,
    attestors: [ATTESTOR],
  };
}

const plainly: PlainFetch = async (url) => {
  if (url.includes("/badge_assertions/")) {
    return url.includes(BADGE) ? new Response(ASSERTION, { status: 200 }) : new Response('{"data":{"message":"Resource not found."}}', { status: 404 });
  }
  return url.includes(BADGE) ? new Response(PAGE, { status: 200 }) : new Response(NO_SUCH_PAGE, { status: 200 });
};

test("a badge is named by its link, its public link or its id alone, and by nothing else", () => {
  for (const pasted of [
    `https://www.credly.com/badges/${BADGE}/public_url`,
    `https://www.credly.com/badges/${BADGE}`,
    `credly.com/badges/${BADGE}/linked_in_profile`,
    BADGE.toUpperCase(),
  ]) {
    assert.equal(credlyBadgeIdOf(pasted), BADGE, pasted);
  }
  for (const nothing of ["", "https://example.test/badges/" + BADGE, "credly.com/org/cisco/badge/python-essentials-1.1", "../../etc/passwd", BADGE.slice(0, 20)]) {
    assert.equal(credlyBadgeIdOf(nothing), undefined, nothing);
  }
  assert.ok(isValidCredlyBadgeId(BADGE) && !isValidCredlyBadgeId("not-a-badge"));
  assert.ok(CREDLY_MILESTONE.validLink(`https://www.credly.com/badges/${BADGE}/public_url`));
  assert.ok(!CREDLY_MILESTONE.validLink("https://example.test/nope"));
});

test("the certification is the pair of ids the issuer publishes, never the words on the page", () => {
  const first = CREDLY_CERTIFICATIONS[0];
  assert.equal(first.id, "ai-fundamentals-with-ibm-skillsbuild", "the one the demo is made on");
  assert.equal(credlyCertificationOfBadgeUrl(RECORD.badge), first);
  // The same issuer, another badge class: another certification, which is what stops one course paying another's gift.
  assert.equal(credlyCertificationOfBadgeUrl(RECORD.badge.replace("911500fa-32e7-4986-99de-94fb73040a20", "10b1a2de-f36b-4730-b1ca-8505e19f4390"))?.id, "introduction-to-cybersecurity");
  // A class nobody registered here, and an issuer nobody registered here: neither is read at all.
  assert.equal(credlyCertificationOfBadgeUrl(RECORD.badge.replace("911500fa-32e7-4986-99de-94fb73040a20", "00000000-0000-4000-8000-000000000000")), undefined);
  assert.equal(credlyCertificationOfBadgeUrl(RECORD.badge.replace("74381078-44ac-4581-8471-36bd1ce495b7", "00000000-0000-4000-8000-000000000000")), undefined);
  assert.equal(credlyCertificationOfBadgeUrl("nonsense"), undefined);
  // Each one is its own gift: the subject binds the person and the certification together.
  assert.notEqual(credlySubject("Ada Lovelace", "python-essentials-1"), credlySubject("Ada Lovelace", "introduction-to-cybersecurity"));
  assert.notEqual(credlySubject("Ada Lovelace", "python-essentials-1"), credlySubject("Grace Hopper", "python-essentials-1"));
  assert.equal(CREDLY_MILESTONE.subject({ name: "Ada Lovelace", course: "python-essentials-1" }), credlySubject("Ada Lovelace", "python-essentials-1"));
  // And the funder chooses from that list rather than naming anything: `slugOf` answers only for one of them.
  assert.equal(CREDLY_MILESTONE.course?.slugOf("python-essentials-1"), "python-essentials-1");
  assert.equal(CREDLY_MILESTONE.course?.slugOf("some-other-course"), undefined);
  assert.equal(CREDLY_MILESTONE.course?.choices?.length, CREDLY_CERTIFICATIONS.length);
  assert.ok(CREDLY_CERTIFICATIONS.every((one) => credlyCertification(one.id) === one));
});

test("the holder is the last thing the one title says, and a day is the day the record gives", () => {
  assert.equal(credlyHolderOfTitle(TITLE.ogTitle), "Elio Vantar");
  // Titles and issuers that carry the words the shape is made of: the name is still the name.
  assert.equal(credlyHolderOfTitle("Introduction to Python was issued by Cisco to Ada Lovelace."), "Ada Lovelace");
  assert.equal(credlyHolderOfTitle("How to get to work was issued by The Something to Do Institute to Ada Lovelace."), "Ada Lovelace");
  assert.equal(credlyHolderOfTitle("Python Essentials 1 was issued by Cisco to Alba Marchetti--Solene."), "Alba Marchetti--Solene");
  for (const nothing of ["", "Credly", "AI Fundamentals was issued by Cisco.", "was issued by to ."]) assert.equal(credlyHolderOfTitle(nothing), undefined, nothing);
  // 2024-08-30, at midnight UTC, which is the day the contract judges.
  assert.equal(credlyIssuedDaySeconds("2024-08-30T22:14:09.000Z"), 1_724_976_000);
  assert.equal(credlyIssuedDaySeconds("2024-08-30"), 1_724_976_000);
  assert.equal(credlyIssuedDaySeconds("yesterday"), undefined);
  assert.equal(credlyIssuedDaySeconds(""), undefined);
});

test("a plain reading is the two records together, and an unknown badge is refused by the one that knows", async () => {
  const badge = await readCredlyBadge(BADGE, plainly);
  assert.equal(badge.name, "Elio Vantar");
  assert.equal(badge.certificationId, "ai-fundamentals-with-ibm-skillsbuild");
  assert.equal(badge.certificationTitle, "AI Fundamentals with IBM SkillsBuild");
  assert.equal(badge.issuer, "Cisco");
  assert.equal(badge.issuedDay, 1_724_976_000);
  assert.equal(badge.subject, credlySubject("Elio Vantar", "ai-fundamentals-with-ibm-skillsbuild"));

  // The record answers 404 for an id nobody has, while its page answers 200 with nothing in it: the record decides.
  await assert.rejects(readCredlyBadge("00000000-0000-4000-8000-000000000000", plainly), (error: unknown) => error instanceof CredlyReadError && error.code === "NO_BADGE");
  await assert.rejects(readCredlyBadge("not-a-badge", plainly), (error: unknown) => error instanceof CredlyReadError && error.code === "INVALID_LINK");

  // A page about another badge cannot lend its name to this one, whichever half is switched.
  const otherPage: PlainFetch = async (url) => (url.includes("/badge_assertions/") ? new Response(ASSERTION, { status: 200 }) : new Response(PAGE.replace(BADGE, "1b2c3d4e-5f60-4b7c-9d8e-0f1a2b3c4d5e"), { status: 200 }));
  await assert.rejects(readCredlyBadge(BADGE, otherPage), (error: unknown) => error instanceof CredlyReadError && error.code === "PROOF_MISMATCH");

  // A real badge for a certification nobody registered is refused as such, never read as this gift's.
  const otherClass: PlainFetch = async (url) =>
    url.includes("/badge_assertions/") ? new Response(ASSERTION.replace("911500fa-32e7-4986-99de-94fb73040a20", "aaaaaaaa-0000-4000-8000-000000000000"), { status: 200 }) : new Response(PAGE, { status: 200 });
  await assert.rejects(readCredlyBadge(BADGE, otherClass), (error: unknown) => error instanceof CredlyReadError && error.code === "NOT_LISTED");

  // A page that lost its title is a shape that changed under us, and it is ours to fix rather than the person's.
  const noTitle: PlainFetch = async (url) => (url.includes("/badge_assertions/") ? new Response(ASSERTION, { status: 200 }) : new Response(NO_SUCH_PAGE, { status: 200 }));
  await assert.rejects(readCredlyBadge(BADGE, noTitle), (error: unknown) => error instanceof CredlyReadError && error.code === "PROOF_INVALID");
});

test("an attested reading is two proofs of the same badge, taken together", async () => {
  const reading = await attestCredlyBadge(BADGE, honest());
  assert.equal(reading.name, "Elio Vantar");
  assert.equal(reading.certificationId, "ai-fundamentals-with-ibm-skillsbuild");
  assert.equal(reading.issuedDay, 1_724_976_000);
  assert.equal(reading.proofs.length, 2, "the record, then the page");
  assert.equal(reading.observedAt, 1_789_653_330, "the later of the two halves");

  const otherBadge = honest({ [CREDLY_BADGE_PAGE.id]: (account) => proofOf(CREDLY_BADGE_PAGE.url(account), CREDLY_BADGE_PAGE.matches, { ...TITLE, ogUrl: "https://www.credly.com/badges/1b2c3d4e-5f60-4b7c-9d8e-0f1a2b3c4d5e" }) });
  await assert.rejects(attestCredlyBadge(BADGE, otherBadge), (error: unknown) => error instanceof CredlyReadError && error.code === "PROOF_MISMATCH");

  const apart = honest({ [CREDLY_ASSERTION.id]: (account) => proofOf(CREDLY_ASSERTION.url(account), CREDLY_ASSERTION.matches, RECORD, 1_789_653_330 - 3_600) });
  await assert.rejects(attestCredlyBadge(BADGE, apart), (error: unknown) => error instanceof CredlyReadError && error.code === "PROOF_MISMATCH");

  const unsigned: AttestedReadDeps = { ...honest(), verify: async () => false };
  await assert.rejects(attestCredlyBadge(BADGE, unsigned), (error: unknown) => error instanceof CredlyReadError && error.code === "PROOF_INVALID");

  const otherAttestor: AttestedReadDeps = { ...honest(), attestors: ["0x0000000000000000000000000000000000000001"] };
  await assert.rejects(attestCredlyBadge(BADGE, otherAttestor), (error: unknown) => error instanceof CredlyReadError && error.code === "PROOF_INVALID");

  await assert.rejects(attestCredlyBadge("not-a-badge", honest()), (error: unknown) => error instanceof CredlyReadError && error.code === "INVALID_LINK");
});

test("nothing carries the hashed email out of the reading, and the goal is the one the owner registered", () => {
  // The record carries the holder's email address, hashed. No pattern matches it, so the attestor never hands it over.
  const patterns = [...CREDLY_ASSERTION.matches, ...CREDLY_BADGE_PAGE.matches].map((match) => match.value).join(" ");
  assert.doesNotMatch(patterns, /recipient|identity|sha256/i);
  for (const match of CREDLY_ASSERTION.matches) assert.match(ASSERTION, new RegExp(match.value), match.value);
  for (const match of CREDLY_BADGE_PAGE.matches) assert.match(PAGE, new RegExp(match.value), match.value);
  assert.equal(attestedSource("credly-assertion"), CREDLY_ASSERTION);
  assert.equal(attestedSource("credly-badge-page"), CREDLY_BADGE_PAGE);
  assert.equal(CREDLY_ASSERTION.url(BADGE), `https://www.credly.com/api/v1/obi/v2/badge_assertions/${BADGE}`);
  assert.equal(CREDLY_BADGE_PAGE.url(BADGE), `https://www.credly.com/badges/${BADGE}/public_url`);

  const goal = milestoneGoal(CREDLY_GOAL_TYPE);
  assert.equal(CREDLY_GOAL_TYPE, 11);
  assert.equal(goal?.providerId, credlyProviderId());
  assert.equal(goal?.providerId, keccak256(stringToHex("viky:provider:credly-badge-zkfetch:v1")));
  assert.equal(goal?.shape, SHAPE_HAVE_OR_NOT, "a certification is had or not");
  assert.equal(CREDLY_MILESTONE.goalType, CREDLY_GOAL_TYPE);
  assert.ok(CREDLY_MILESTONE.validTarget(CREDLY_HAS_IT) && !CREDLY_MILESTONE.validTarget(0) && !CREDLY_MILESTONE.validTarget(120));
});
