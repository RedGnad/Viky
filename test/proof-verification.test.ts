import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSignDataForClaim, getIdentifierFromClaimInfo } from "@reclaimprotocol/js-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { attestorAccepted } from "../src/duolingo-public";
import { pinnedAttestorImageDigests, proofVerifierMode, verifyProofLocally, type SignedProof } from "../src/proof-verification";

/**
 * Offline: a claim shaped like an attestor's, signed here with keys that exist only for the test. The signing
 * scheme is js-sdk's own (`createSignDataForClaim` under an EIP-191 personal signature), so what is checked is the
 * check itself, not a fixture.
 */

const ATTESTOR_KEY = generatePrivateKey();
const ATTESTOR = privateKeyToAccount(ATTESTOR_KEY);
const STRANGER_KEY = generatePrivateKey();
const STRANGER = privateKeyToAccount(STRANGER_KEY);

async function signedProof(signerKey: `0x${string}`, overrides: Partial<SignedProof> = {}): Promise<SignedProof> {
  const info = {
    provider: "http",
    parameters: JSON.stringify({ url: "https://api.chess.com/pub/player/sevyb/stats", method: "GET", responseMatches: [{ type: "regex", value: '"rating":(?<rating>\\d+)' }] }),
    context: JSON.stringify({ extractedParameters: { rating: "383" }, providerHash: "0xabc" }),
  };
  const claimData = { ...info, identifier: getIdentifierFromClaimInfo(info), owner: "0x557efd2c1f7215aa040806df9a487f2bf70ccda5", timestampS: 1_790_106_529, epoch: 1 };
  const signature = await privateKeyToAccount(signerKey).signMessage({ message: createSignDataForClaim(claimData as never) });
  const signer = privateKeyToAccount(signerKey).address.toLowerCase();
  return { claimData, signatures: [signature], witnesses: [{ id: signer, url: "ws://localhost:8001/ws" }], ...overrides };
}

describe("the proof verifier switch", () => {
  it("is Reclaim's verifier unless told otherwise, and refuses to guess", () => {
    assert.equal(proofVerifierMode(undefined), "reclaim");
    assert.equal(proofVerifierMode(""), "reclaim");
    assert.equal(proofVerifierMode("reclaim"), "reclaim");
    assert.equal(proofVerifierMode(" Local "), "local");
    assert.throws(() => proofVerifierMode("both"), /PROOF_VERIFIER must be "reclaim" or "local"/);
  });

  it("reads pinned image digests as a comma separated list, empty when unset", () => {
    assert.deepEqual(pinnedAttestorImageDigests(undefined), []);
    assert.deepEqual(pinnedAttestorImageDigests(" sha256:aa , sha256:bb ,"), ["sha256:aa", "sha256:bb"]);
  });
});

describe("the local verifier", () => {
  it("accepts a claim signed by a pinned attestor, and says who signed", async () => {
    const proof = await signedProof(ATTESTOR_KEY);
    const verdict = await verifyProofLocally(proof, [ATTESTOR.address], []);
    assert.deepEqual(verdict, { verified: true, signers: [ATTESTOR.address.toLowerCase()] });
  });

  it("accepts the pin in any letter case", async () => {
    const proof = await signedProof(ATTESTOR_KEY);
    assert.equal((await verifyProofLocally(proof, [ATTESTOR.address.toUpperCase().replace("0X", "0x")], [])).verified, true);
  });

  it("refuses a claim signed by any other key, naming the signer", async () => {
    const proof = await signedProof(STRANGER_KEY);
    const verdict = await verifyProofLocally(proof, [ATTESTOR.address], []);
    assert.equal(verdict.verified, false);
    assert.match((verdict as { reason: string }).reason, new RegExp(`signed by ${STRANGER.address.toLowerCase()}, not by a pinned attestor`));
  });

  it("refuses a signature moved onto another claim", async () => {
    const proof = await signedProof(ATTESTOR_KEY);
    const other = { ...proof.claimData, context: JSON.stringify({ extractedParameters: { rating: "2383" }, providerHash: "0xabc" }) };
    const verdict = await verifyProofLocally({ ...proof, claimData: other }, [ATTESTOR.address], []);
    assert.equal(verdict.verified, false);
    assert.match((verdict as { reason: string }).reason, /is not the hash of the signed claim/);
  });

  it("refuses a proof whose witnesses are not its signers", async () => {
    const proof = await signedProof(ATTESTOR_KEY, { witnesses: [{ id: STRANGER.address, url: "ws://localhost:8001/ws" }] });
    const verdict = await verifyProofLocally(proof, [ATTESTOR.address, STRANGER.address], []);
    assert.equal(verdict.verified, false);
    assert.match((verdict as { reason: string }).reason, /are not the signers/);
  });

  it("refuses a proof without witnesses, without signatures, or without a pin", async () => {
    const proof = await signedProof(ATTESTOR_KEY);
    assert.equal((await verifyProofLocally({ ...proof, witnesses: [] }, [ATTESTOR.address], [])).verified, false);
    assert.equal((await verifyProofLocally({ ...proof, signatures: [] }, [ATTESTOR.address], [])).verified, false);
    assert.equal((await verifyProofLocally(proof, [], [])).verified, false);
  });

  it("refuses a witness without an enclave attestation once an image digest is pinned", async () => {
    const proof = await signedProof(ATTESTOR_KEY);
    const verdict = await verifyProofLocally(proof, [ATTESTOR.address], ["sha256:0000"]);
    assert.equal(verdict.verified, false);
    assert.match((verdict as { reason: string }).reason, /carries no enclave attestation, and an image digest is pinned/);
  });

  it("refuses an attestation that names another attestor or another signature, before reading the report", async () => {
    const proof = await signedProof(ATTESTOR_KEY);
    const id = ATTESTOR.address.toLowerCase();
    const named = { ...proof, witnesses: [{ id, url: "", claimAttestation: { attestor_address: STRANGER.address, claim_signature: proof.signatures[0], attestation_report: "x.y.z" } }] };
    assert.match((await verifyProofLocally(named, [ATTESTOR.address], ["sha256:0000"]) as { reason: string }).reason, /names another attestor/);
    const covered = { ...proof, witnesses: [{ id, url: "", claimAttestation: { attestor_address: id, claim_signature: "0x" + "00".repeat(65), attestation_report: "x.y.z" } }] };
    assert.match((await verifyProofLocally(covered, [ATTESTOR.address], ["sha256:0000"]) as { reason: string }).reason, /does not cover this claim's signature/);
  });

  it("refuses a report that is not an attestation, with the verifier's own reason", async () => {
    const proof = await signedProof(ATTESTOR_KEY);
    const id = ATTESTOR.address.toLowerCase();
    const bogus = { ...proof, witnesses: [{ id, url: "", claimAttestation: { attestor_address: id, claim_signature: proof.signatures[0], attestation_report: "not.a.jwt" } }] };
    const verdict = await verifyProofLocally(bogus, [ATTESTOR.address], ["sha256:0000"]);
    assert.equal(verdict.verified, false);
    assert.match((verdict as { reason: string }).reason, /the enclave attestation of witness .* did not verify/);
  });

  it("refuses a forged signature under a witness list that names the pinned attestor, which the pin alone accepts", async () => {
    // The spoof measured on 22 Sep 2026 (Viky-attestor, docs/step-1b-report.md, run f2): the claim signed by a key
    // that is not pinned, with the unsigned witness list left naming the pinned attestor. `attestorAccepted` reads
    // that list and says yes; the local verifier reads the signature and says who really signed.
    const proof = await signedProof(STRANGER_KEY, { witnesses: [{ id: ATTESTOR.address.toLowerCase(), url: "ws://localhost:8001/ws" }] });
    assert.equal(attestorAccepted(proof as never, [ATTESTOR.address]), true);
    const verdict = await verifyProofLocally(proof, [ATTESTOR.address], []);
    assert.equal(verdict.verified, false);
    assert.match((verdict as { reason: string }).reason, new RegExp(`signed by ${STRANGER.address.toLowerCase()}, not by a pinned attestor`));
  });
});
