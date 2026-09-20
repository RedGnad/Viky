import assert from "node:assert/strict";
import test from "node:test";
import { GET as search } from "../app/api/credly/search/route";
import { credlyCertificationsOf, credlyPair, credlyPairOf, credlyPairOfBadgeUrl, credlySearchUrl, credlySubject, isValidCredlySearch } from "../src/credly-badge";
import { CREDLY_MILESTONE } from "../src/milestone-conditions";

/**
 * A certification is found by Credly's own search and carried by its pair of ids (the founder's line of 20 Sep
 * 2026). The answer below is the real one, trimmed to five of its fifty results, taken the same day for the words
 * "introduction to cybersecurity": four issuers award a badge of that exact name, which is why the issuer stands
 * beside every line and why the words are never what the terms carry.
 */
const ANSWER = {
  data: {
    results: [
      { id: "10b1a2de-f36b-4730-b1ca-8505e19f4390", issuer_id: "74381078-44ac-4581-8471-36bd1ce495b7", name: "Introduction to Cybersecurity", issuer_name: "Cisco", url: "/org/cisco/badge/introduction-to-cybersecurity", cost: null, level: null },
      { id: "4849d5ed-91f9-40f9-88a5-8eba5204de22", issuer_id: "d5a90a02-5fe7-4915-a42d-8273c91cab0f", name: "Introduction to Cybersecurity Careers", issuer_name: "IBM", url: "/org/ibm/badge/introduction-to-cybersecurity-careers", cost: "Paid", level: "Foundational" },
      { id: "6d85b251-c8fe-42a0-ae08-931aef359e94", issuer_id: "fbc97d1c-87cc-4a6a-868e-74c71d5e9d77", name: "Introduction to Cybersecurity", issuer_name: "Vinçotte (a Kiwa company)", url: "/org/vincotte/badge/introduction-to-cybersecurity", cost: "Paid", level: "Foundational" },
      { id: "not-a-uuid", issuer_id: "74381078-44ac-4581-8471-36bd1ce495b7", name: "Broken", issuer_name: "Nobody", url: "/x" },
      { id: "83227d0b-3d12-4eba-8782-dee2e3083374", issuer_id: "09fe3904-fda3-483d-8592-726d72bd1e1d", name: "Introduction to Cybersecurity", issuer_name: "Quinnipiac University", url: "/org/quinnipiac/badge/introduction-to-cybersecurity" },
    ],
  },
};

const CISCO_INTRO = "74381078-44ac-4581-8471-36bd1ce495b7/10b1a2de-f36b-4730-b1ca-8505e19f4390";

test("the search names the same certification the assertion names, by the same pair of ids", () => {
  const found = credlyCertificationsOf(ANSWER);
  assert.equal(found.length, 4, "the entry with no badge class id is not a certification");
  assert.deepEqual(found[0], { pair: CISCO_INTRO, title: "Introduction to Cybersecurity", issuer: "Cisco", path: "/org/cisco/badge/introduction-to-cybersecurity" });
  // Read by hand from a live badge of Cisco's on 20 Sep 2026: the assertion's `badge` URL carries the same pair.
  assert.equal(
    credlyPairOfBadgeUrl("https://www.credly.com/api/v1/obi/v2/issuers/74381078-44ac-4581-8471-36bd1ce495b7/badge_classes/10b1a2de-f36b-4730-b1ca-8505e19f4390"),
    CISCO_INTRO,
  );
  // Three issuers, one name: only the pair tells them apart, and each is its own gift.
  const named = found.filter((one) => one.title === "Introduction to Cybersecurity");
  assert.equal(named.length, 3);
  assert.equal(new Set(named.map((one) => one.pair)).size, 3);
  assert.notEqual(credlySubject("Ada Lovelace", named[0].pair), credlySubject("Ada Lovelace", named[1].pair));
  assert.equal(credlyCertificationsOf(ANSWER, 2).length, 2, "and a screen asks for as many as it can show");
  assert.deepEqual(credlyCertificationsOf(null), []);
  assert.deepEqual(credlyCertificationsOf({ data: { results: "no" } }), []);
});

test("the terms carry the pair and nothing else, checked by shape before anything is signed", () => {
  assert.equal(credlyPair("74381078-44AC-4581-8471-36BD1CE495B7", "10b1a2de-f36b-4730-b1ca-8505e19f4390"), CISCO_INTRO, "as Credly writes them, lower case");
  assert.equal(credlyPairOf(CISCO_INTRO), CISCO_INTRO);
  assert.equal(credlyPairOf("introduction-to-cybersecurity"), undefined, "words are not a certification");
  assert.equal(credlyPairOf(`${CISCO_INTRO}/extra`), undefined);
  assert.equal(credlyPairOf(""), undefined);
  assert.equal(CREDLY_MILESTONE.course?.slugOf(CISCO_INTRO), CISCO_INTRO);
  assert.equal(CREDLY_MILESTONE.course?.slugOf("comptia"), undefined);
  assert.equal(CREDLY_MILESTONE.course?.search?.path, "/api/credly/search");
  assert.equal(CREDLY_MILESTONE.subject({ name: "Ada Lovelace", course: CISCO_INTRO }), credlySubject("Ada Lovelace", CISCO_INTRO));
});

test("the route asks Credly with the funder's words and nothing else, and refuses to ask with none", async () => {
  assert.equal(credlySearchUrl(" comptia security+ "), "https://www.credly.com/api/v1/global_search/badge_template?q=comptia%20security%2B");
  assert.ok(isValidCredlySearch("ai") && !isValidCredlySearch("a") && !isValidCredlySearch("x".repeat(81)));
  for (const q of ["", "a", "x".repeat(81)]) {
    const answer = await search(new Request(`https://viky.test/api/credly/search?q=${encodeURIComponent(q)}`, { headers: { host: "viky.test" } }));
    assert.equal(answer.status, 400, JSON.stringify(q));
    assert.equal(((await answer.json()) as { code: string }).code, "INVALID_SEARCH");
  }
});
