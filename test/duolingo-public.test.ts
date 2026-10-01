import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BINDING_CODE_ALPHABET,
  BINDING_CODE_LENGTH,
  displayNameHasCode,
  duolingoProfileUrl,
  DUOLINGO_PUBLIC_PROVIDER_ID,
  isValidDuolingoUsername,
  newBindingCode,
} from "../src/duolingo-public-terms";
import { fetchPublicProfile, MAX_PROOF_AGE_SECONDS, profileFromProof, PROFILE_RESPONSE_MATCHES, PublicProfileError, type ZkFetchProof } from "../src/duolingo-public";

// A proof shaped like zkFetch's output, carrying the parameters Reclaim extracts with our regexes.
function proofFor(username: string, extracted: Record<string, string>, overrides: Partial<ZkFetchProof["claimData"]> = {}): ZkFetchProof {
  return {
    claimData: {
      provider: "http",
      parameters: JSON.stringify({ url: duolingoProfileUrl(username), method: "GET", responseMatches: PROFILE_RESPONSE_MATCHES }),
      context: JSON.stringify({ extractedParameters: extracted, providerHash: "0xabc" }),
      identifier: "0x" + "ab".repeat(32),
      timestampS: 1_789_000_000,
      ...overrides,
    },
    signatures: ["0x" + "cd".repeat(65)],
    witnesses: [{ id: "0x244897572368eadf65bfbc5aec98d8e5443a9072", url: "wss://attestor.reclaimprotocol.org:444/ws" }],
  };
}

const LUIS = { id: "14", totalXp: "156020", username: "Luis", name: "Luis", streak: "3939" };

describe("public Duolingo terms", () => {
  it("accepts real usernames and refuses anything that could reshape the URL", () => {
    assert.ok(isValidDuolingoUsername("ama_learns"));
    assert.ok(isValidDuolingoUsername("Luis"));
    assert.ok(!isValidDuolingoUsername(""));
    assert.ok(!isValidDuolingoUsername("a b"));
    assert.ok(!isValidDuolingoUsername("x&y=z"));
    assert.equal(duolingoProfileUrl("ama learns"), "https://www.duolingo.com/2017-06-30/users?username=ama%20learns");
  });

  it("generates codes from the unambiguous alphabet only", () => {
    let byte = 0;
    const code = newBindingCode(() => byte++ % 256);
    assert.equal(code.length, BINDING_CODE_LENGTH);
    for (const c of code) assert.ok(BINDING_CODE_ALPHABET.includes(c));
    assert.ok(!/[O0I1]/.test(code));
  });

  it("finds the code in a display name regardless of case, spaces and dashes", () => {
    assert.ok(displayNameHasCode("Ama vk-7k3q", "VK7K3Q"));
    assert.ok(displayNameHasCode("VK7K3Q", "vk7k3q"));
    assert.ok(displayNameHasCode("Ama V K 7 K 3 Q", "VK7K3Q"));
    assert.ok(!displayNameHasCode("Ama", "VK7K3Q"));
    assert.ok(!displayNameHasCode("Ama VK7K3", "VK7K3Q"));
    assert.ok(!displayNameHasCode("anything", "short"));
  });

  it("has a fixed provider id for the goal registry", () => {
    assert.match(DUOLINGO_PUBLIC_PROVIDER_ID, /^0x[0-9a-f]{64}$/);
  });
});

describe("profileFromProof", () => {
  it("reads the profile and binds the nullifier to the proof identifier", () => {
    const profile = profileFromProof(proofFor("luis", LUIS), "luis");
    assert.equal(profile.profileId, "14");
    assert.equal(profile.totalXp, 156020);
    assert.equal(profile.streak, 3939);
    assert.equal(profile.displayName, "Luis");
    assert.equal(profile.username, "Luis");
    assert.equal(profile.observedAt, 1_789_000_000);
    assert.match(profile.nullifier, /^0x[0-9a-f]{64}$/);
    const again = profileFromProof(proofFor("luis", LUIS, { identifier: "0x" + "ef".repeat(32) }), "luis");
    assert.notEqual(again.nullifier, profile.nullifier);
  });

  it("refuses a proof about another URL, method or username", () => {
    assert.throws(() => profileFromProof(proofFor("other", LUIS), "luis"), (e: unknown) => e instanceof PublicProfileError && e.code === "PROOF_MISMATCH");
    assert.throws(
      () => profileFromProof(proofFor("luis", LUIS, { parameters: JSON.stringify({ url: duolingoProfileUrl("luis"), method: "POST" }) }), "luis"),
      (e: unknown) => e instanceof PublicProfileError && e.code === "PROOF_MISMATCH",
    );
    assert.throws(() => profileFromProof(proofFor("luis", { ...LUIS, username: "someone" }), "luis"), (e: unknown) => e instanceof PublicProfileError && e.code === "PROOF_MISMATCH");
  });

  it("refuses an incomplete or malformed proof", () => {
    assert.throws(() => profileFromProof(proofFor("luis", { ...LUIS, totalXp: "" }), "luis"), (e: unknown) => e instanceof PublicProfileError && e.code === "PROOF_INVALID");
    assert.throws(() => profileFromProof(proofFor("luis", LUIS, { identifier: "nope" }), "luis"), (e: unknown) => e instanceof PublicProfileError && e.code === "PROOF_INVALID");
    assert.throws(() => profileFromProof(proofFor("luis", LUIS, { context: "{" }), "luis"), (e: unknown) => e instanceof PublicProfileError && e.code === "PROOF_INVALID");
  });

  it("matches the regexes' first hit to the user-level fields on real responses", () => {
    for (const name of ["luis", "duolingo"]) {
      let raw: string;
      try {
        raw = readFileSync(`private-fixtures/duolingo-public-${name}.json`, "utf8");
      } catch {
        return; // fixture absent: skipped
      }
      const expected = (JSON.parse(raw) as { users: Array<Record<string, unknown>> }).users[0];
      const extracted: Record<string, string> = {};
      for (const match of PROFILE_RESPONSE_MATCHES) {
        const m = new RegExp(match.value).exec(raw);
        assert.ok(m?.groups, `no match for ${match.value}`);
        Object.assign(extracted, m.groups);
      }
      assert.equal(extracted.id, String(expected.id));
      assert.equal(extracted.totalXp, String(expected.totalXp));
      assert.equal(extracted.username, String(expected.username));
      assert.equal(extracted.name, String(expected.name));
    }
  });
});

describe("the proof is this reading's, read with our patterns (the audit of 1 Oct 2026)", () => {
  const mismatch = (e: unknown) => e instanceof PublicProfileError && e.code === "PROOF_MISMATCH";
  const withMatches = (matches: unknown) => proofFor("luis", LUIS, { parameters: JSON.stringify({ url: duolingoProfileUrl("luis"), method: "GET", responseMatches: matches }) });

  it("refuses a proof read with other patterns than ours, in any way they differ", () => {
    // The patterns decide which bytes of the page become the experience: these name the streak as "totalXp".
    const swapped = PROFILE_RESPONSE_MATCHES.map((match) => (match.value.includes("totalXp") ? { type: "regex", value: '"streak":(?<totalXp>\\d+)' } : match));
    assert.throws(() => profileFromProof(withMatches(swapped), "luis"), mismatch);
    assert.throws(() => profileFromProof(withMatches(PROFILE_RESPONSE_MATCHES.slice(0, 4)), "luis"), mismatch, "one pattern fewer");
    assert.throws(() => profileFromProof(withMatches([...PROFILE_RESPONSE_MATCHES, { type: "regex", value: "x" }]), "luis"), mismatch, "one more");
    assert.throws(() => profileFromProof(withMatches([...PROFILE_RESPONSE_MATCHES].reverse()), "luis"), mismatch, "another order");
    assert.throws(() => profileFromProof(withMatches(undefined), "luis"), mismatch, "none at all");
    assert.throws(() => profileFromProof(withMatches(PROFILE_RESPONSE_MATCHES.map((match) => ({ ...match, type: "contains" }))), "luis"), mismatch);
    // Ours, as a proof of production carries them (read on viky.cash on 1 Oct 2026: the keys in the other order).
    assert.equal(profileFromProof(withMatches(PROFILE_RESPONSE_MATCHES.map((match) => ({ value: match.value, type: match.type }))), "luis").totalXp, 156020);
  });

  it("refuses a proof more than ten minutes old, and takes one that is ten minutes old", async () => {
    const at = 1_789_000_000;
    const read = (now: number) => fetchPublicProfile("luis", { zkFetch: async () => proofFor("luis", LUIS), verify: async () => true, now: () => now });
    assert.equal(MAX_PROOF_AGE_SECONDS, 600);
    assert.equal((await read(at + 5)).totalXp, 156020);
    assert.equal((await read(at + 600)).observedAt, at);
    await assert.rejects(read(at + 601), mismatch);
    await assert.rejects(read(at + 86_400), mismatch, "yesterday's proof says nothing of today");
    // With no clock given it is the server's own: a proof stamped in 2026 and read now is long past.
    await assert.rejects(fetchPublicProfile("luis", { zkFetch: async () => proofFor("luis", LUIS, { timestampS: 1_700_000_000 }), verify: async () => true }), mismatch);
  });
});

/** The moment the fixtures' proofs are stamped with: the tests below read them five seconds later. */
const SOON = () => 1_789_000_005;

describe("fetchPublicProfile", () => {
  it("verifies before reading and types every failure", async () => {
    const ok = await fetchPublicProfile("luis", { zkFetch: async () => proofFor("luis", LUIS), verify: async () => true, now: SOON });
    assert.equal(ok.totalXp, 156020);
    await assert.rejects(fetchPublicProfile("bad name", { zkFetch: async () => proofFor("luis", LUIS), verify: async () => true }), (e: unknown) => e instanceof PublicProfileError && e.code === "INVALID_USERNAME");
    await assert.rejects(fetchPublicProfile("luis", { zkFetch: async () => proofFor("luis", LUIS), verify: async () => false }), (e: unknown) => e instanceof PublicProfileError && e.code === "PROOF_INVALID");
    await assert.rejects(fetchPublicProfile("nobody", { zkFetch: async () => { throw new Error("Response match not found for regex"); }, verify: async () => true }), (e: unknown) => e instanceof PublicProfileError && e.code === "PROFILE_NOT_FOUND");
    await assert.rejects(fetchPublicProfile("luis", { zkFetch: async () => { throw new Error("socket hang up"); }, verify: async () => true }), (e: unknown) => e instanceof PublicProfileError && e.code === "FETCH_FAILED");
  });

  it("refuses a proof signed by an attestor that is not pinned, or with no witness at all", async () => {
    const foreign = { ...proofFor("luis", LUIS), witnesses: [{ id: "0x" + "11".repeat(20), url: "wss://elsewhere" }] };
    await assert.rejects(fetchPublicProfile("luis", { zkFetch: async () => foreign, verify: async () => true }), (e: unknown) => e instanceof PublicProfileError && e.code === "PROOF_INVALID");
    const none = { ...proofFor("luis", LUIS), witnesses: [] };
    await assert.rejects(fetchPublicProfile("luis", { zkFetch: async () => none, verify: async () => true }), (e: unknown) => e instanceof PublicProfileError && e.code === "PROOF_INVALID");
    const ok = await fetchPublicProfile("luis", { zkFetch: async () => foreign, verify: async () => true, attestors: ["0x" + "11".repeat(20)], now: SOON });
    assert.equal(ok.totalXp, 156020);
  });
});
