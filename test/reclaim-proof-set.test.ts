import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import { getIdentifierFromClaimInfo, type Proof } from "@reclaimprotocol/js-sdk";
import {
  assertReclaimSessionProvenance,
  assertSdkProofSet,
  DUOLINGO_MAX_SIGNED_JSON_BYTES,
  PINNED_RECLAIM_WITNESS,
} from "../src/reclaim-proof-set";
import { sessionIdHash, toDirectProofBundle } from "../src/reclaim-onchain";

const OWNER = "0x000000000000000000000000000000000000a11c";
const SIGNATURE = `0x${"22".repeat(65)}`;

export function sdkProof(overrides: Record<string, unknown> = {}): Proof {
  const parameters =
    typeof overrides.parameters === "string"
      ? overrides.parameters
      : '{"headers":{"accept":"application/json","x-client":"lock-in"},"method":"GET"}';
  const context =
    typeof overrides.context === "string"
      ? overrides.context
      : '{"contextAddress":"0x000000000000000000000000000000000000a11c","reclaimSessionId":"session_12345678"}';
  const claimData = {
    provider: "http",
    parameters,
    context,
    owner: OWNER,
    timestampS: 1_784_000_000,
    epoch: 1,
  };
  const identifier = getIdentifierFromClaimInfo(claimData);
  return {
    identifier,
    claimData: {
      ...claimData,
      identifier,
    },
    signatures: [SIGNATURE],
    witnesses: [{ id: OWNER, url: "https://witness.example" }],
    extractedParameterValues: {},
    teeAttestation: {
      proof_version: "v3",
      tee_provider: "gcp",
      tee_technology: "confidential-space",
      nonce: "nonce",
      timestamp: "2026-07-15T00:00:00Z",
      workload: { container_name: "attestor", image_digest: "sha256:1" },
      verifier: { container_name: "verifier", image_digest: "sha256:2" },
      attestation: { token: "server-verified-only" },
    },
    ...overrides,
  } as Proof;
}

const ONE = { expectedCount: 1, maxSignedJsonBytes: DUOLINGO_MAX_SIGNED_JSON_BYTES };

test("requires the concrete SDK proof shape with a signatures array", () => {
  const valid = sdkProof();
  assert.equal(assertSdkProofSet(valid, ONE)[0], valid);
  assert.throws(() => assertSdkProofSet({ ...valid, signatures: SIGNATURE }, ONE), /signature in an array/);
  assert.doesNotThrow(() => assertSdkProofSet({ ...valid, witnesses: [] }, ONE));
  assert.throws(() => assertSdkProofSet([valid, valid], ONE), /proof count/);
  assert.throws(() => assertSdkProofSet(valid, { ...ONE, expectedCount: 0 }), /expected proof count/);
});

test("the TEE attestation is required: this is where the AI fallback is refused (refusal case 2)", () => {
  const valid = sdkProof();
  assert.throws(() => assertSdkProofSet({ ...valid, teeAttestation: undefined }, ONE), /TEE attestation is missing/);
  assert.throws(() => assertSdkProofSet({ ...valid, teeAttestation: "yes" }, ONE), /TEE attestation is missing/);
});

test("rejects claim data that does not match the SDK-canonical identifier", () => {
  const valid = sdkProof();
  const changed = {
    ...valid,
    claimData: { ...valid.claimData, context: valid.claimData.context.replace("session_12345678", "session_attacker") },
  };
  assert.throws(() => assertSdkProofSet(changed, ONE), /does not match its identifier/);
});

for (const header of ["cookie", "Authorization", "x-auth-token", "client_secret", "x-api-key"]) {
  test(`rejects sensitive signed header ${header}`, () => {
    const value = sdkProof({ parameters: JSON.stringify({ headers: { [header]: "must-not-be-public" }, method: "GET" }) });
    assert.throws(() => assertSdkProofSet(value, ONE), /forbidden sensitive header/);
  });
}

test("keeps parameters byte-exact and canonicalises only the SDK-signed context", () => {
  const parameters = '{"body":"","method":"GET","paramValues":{"name":"LI-ABC"}}';
  const context =
    '{"contextAddress":"0x000000000000000000000000000000000000a11c","reclaimSessionId":"session_12345678","extractedParameters":{"xp":"10","id":"7"},"contextMessage":"0:baseline"}';
  const value = sdkProof({ parameters, context });
  const checked = assertSdkProofSet(value, ONE);
  const bundle = toDirectProofBundle("session_12345678", checked);
  assert.equal(bundle.proofs[0].claimInfo.parameters, parameters);
  assert.equal(
    bundle.proofs[0].claimInfo.context,
    '{"contextAddress":"0x000000000000000000000000000000000000a11c","contextMessage":"0:baseline","extractedParameters":{"id":"7","xp":"10"},"reclaimSessionId":"session_12345678"}',
  );
  assert.deepEqual(bundle.proofs[0].signedClaim.signatures, [SIGNATURE]);
  assert.throws(() => toDirectProofBundle("bad session id!", checked), /Invalid Reclaim session id/);
});

test("derives the session hash with the exact Solidity encoding and pins the witness", () => {
  assert.equal(sessionIdHash("session_12345678"), keccak256(stringToHex("session_12345678")));
  assert.equal(PINNED_RECLAIM_WITNESS, "0x244897572368Eadf65bfBc5aec98D8e5443a9072");
});

const SESSION = {
  sessionId: "a8f5b7a8d2",
  appId: "0x15678cD04e54ccc2bC1c24cb455be3C60Eb11ADf",
  providerId: "cdf8cb3b-2976-4413-ab2d-693ae5028380",
  providerVersionString: "1.0.8",
  statusV2: "PROOF_SUBMITTED",
  proofs: [{}, {}],
};

const EXPECTED = {
  sessionId: "a8f5b7a8d2",
  appId: "0x15678cD04e54ccc2bC1c24cb455be3C60Eb11ADf",
  providerId: "cdf8cb3b-2976-4413-ab2d-693ae5028380",
  providerVersion: "1.0.8",
};

test("accepts a session executed by the exact pinned provider and submitted deterministically", () => {
  assert.doesNotThrow(() => assertReclaimSessionProvenance({ session: SESSION, expected: EXPECTED }));
  // App id casing is cosmetic; the identity is not.
  assert.doesNotThrow(() =>
    assertReclaimSessionProvenance({ session: { ...SESSION, appId: SESSION.appId.toLowerCase() }, expected: EXPECTED }),
  );
});

test("rejects a Reclaim session whose provenance does not match the initiated one", () => {
  const cases: Array<[Record<string, unknown> | undefined, RegExp]> = [
    [undefined, /incomplete/],
    [{ ...SESSION, sessionId: "other" }, /session mismatch/],
    [{ ...SESSION, appId: "0x0000000000000000000000000000000000000bad" }, /application mismatch/],
    [{ ...SESSION, providerId: "f3ec8292-d8f3-487c-a79d-f53f482f88e2" }, /provider mismatch/],
    // A -ai prerelease or any other build is not the audited deterministic provider.
    [{ ...SESSION, providerVersionString: "1.0.8-ai.1" }, /provider version mismatch/],
    [{ ...SESSION, providerVersionString: "1.0.7" }, /provider version mismatch/],
    // The AI submission path must be refused explicitly, as must any unknown terminal state.
    [{ ...SESSION, statusV2: "AI_PROOF_SUBMITTED" }, /Unexpected Reclaim submission state/],
    [{ ...SESSION, statusV2: "ERROR_SUBMISSION_FAILED" }, /Unexpected Reclaim submission state/],
    [{ ...SESSION, statusV2: undefined }, /Unexpected Reclaim submission state/],
    [{ ...SESSION, proofs: undefined }, /proof set is absent/],
  ];
  for (const [session, expected] of cases) {
    assert.throws(
      () => assertReclaimSessionProvenance({ session: session as never, expected: EXPECTED }),
      expected,
    );
  }
});

test("refuses to verify when the application id is not configured", () => {
  assert.throws(
    () => assertReclaimSessionProvenance({ session: SESSION, expected: { ...EXPECTED, appId: "" } }),
    /application id is not configured/,
  );
});
