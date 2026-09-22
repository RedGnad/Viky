import { getIdentifierFromClaimInfo, recoverSignersOfSignedClaim, verifyAttestorTeeAttestation } from "@reclaimprotocol/js-sdk";
import { hexToBytes, type Hex } from "viem";

/**
 * The proof verifier switch: which code decides that an attestor's signature on a zkFetch proof is good.
 *
 * `reclaim`, the default, is the path that runs today: js-sdk `verifyProof`, which recovers the signers and accepts
 * the proof only if one of them is on the list it fetches from api.reclaimprotocol.org at verification time. It
 * runs before Viky's own pin (`attestorAccepted`), so on that path the witness Viky accepts is decided by
 * Reclaim's list, not by Viky. Measured on 22 Sep 2026 with a proof from an attestor of our own: refused with
 * "Identifier mismatch" whatever `RECLAIM_ATTESTOR_ADDRESSES` said (Viky-attestor, docs/step-1-report.md).
 *
 * `local` does at runtime what scripts/verify-day.ts does by hand, and nothing over the network: the claim's
 * identifier is recomputed from the signed claim, the signers are recovered from the signatures, every one of them
 * must be a pinned attestor, and the witnesses the proof names must be exactly those signers. When
 * `RECLAIM_ATTESTOR_IMAGE_DIGESTS` is set, every witness must also carry the attestation of the enclave that holds
 * its key, verified offline (js-sdk `verifyAttestorTeeAttestation`: certificate chain, signature, issuer, the key
 * bound in the nonce), and the enclave's image digest must be one of the pinned ones. Without a pinned digest an
 * attestor outside a TEE is accepted: that is the local proof of step 1, never a production setting (an attestor
 * outside a TEE is an operator key that decides payouts).
 *
 * The switch is `PROOF_VERIFIER`. Unset or `reclaim`: the path above, byte for byte what ran before this module
 * existed. `local`: this module. Anything else refuses to start rather than guess.
 */

export type ProofVerifierMode = "reclaim" | "local";

export function proofVerifierMode(value = process.env.PROOF_VERIFIER): ProofVerifierMode {
  const mode = value?.trim().toLowerCase() || "reclaim";
  if (mode === "reclaim" || mode === "local") return mode;
  throw new Error(`PROOF_VERIFIER must be "reclaim" or "local", received "${value}"`);
}

/** The enclave image digests an attestor may run under, comma separated, as GCP reports them (`sha256:...`). */
export function pinnedAttestorImageDigests(value = process.env.RECLAIM_ATTESTOR_IMAGE_DIGESTS): readonly string[] {
  return value?.split(",").map((digest) => digest.trim()).filter(Boolean) ?? [];
}

/** The part of a zkFetch proof this module reads. Structural, so it fits `ZkFetchProof` and js-sdk's `Proof`. */
export type SignedProof = {
  claimData: {
    provider: string;
    parameters: string;
    context: string;
    identifier: string;
    timestampS: number;
    owner?: string;
    epoch?: number;
  };
  signatures: string[];
  witnesses?: unknown;
};

type ClaimAttestation = { attestor_address?: unknown; claim_signature?: unknown; attestation_report?: unknown };
type Witness = { id?: unknown; claimAttestation?: ClaimAttestation };

export type LocalVerdict = Readonly<{ verified: true; signers: readonly string[] } | { verified: false; reason: string }>;

const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const refused = (reason: string): LocalVerdict => ({ verified: false, reason });

/**
 * Verifies a proof against the pinned attestors, offline. The order is the order of scripts/verify-day.ts: the
 * claim first, then who signed it, then what the proof says about who signed it, then the enclave.
 */
export async function verifyProofLocally(proof: SignedProof, attestors: readonly string[], digests: readonly string[] = pinnedAttestorImageDigests()): Promise<LocalVerdict> {
  const claim = proof.claimData;
  if (!claim || typeof claim !== "object") return refused("the proof carries no claim");
  if (!Array.isArray(proof.signatures) || proof.signatures.length === 0) return refused("the proof carries no signature");
  if (!proof.signatures.every((signature) => typeof signature === "string" && SIGNATURE.test(signature))) return refused("a signature is not 65 bytes of hex");
  if (attestors.length === 0) return refused("no attestor is pinned");

  // 1. Internally consistent: the identifier is the hash of the signed provider, parameters and context.
  let recomputed: string;
  try {
    recomputed = getIdentifierFromClaimInfo({ provider: claim.provider, parameters: claim.parameters, context: claim.context }).toLowerCase();
  } catch (error) {
    return refused(`the identifier could not be recomputed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (recomputed !== String(claim.identifier).toLowerCase()) return refused(`the identifier ${claim.identifier} is not the hash of the signed claim (${recomputed})`);

  // 2. Signed by a pinned attestor: every signature, not one of them.
  let signers: string[];
  try {
    signers = recoverSignersOfSignedClaim({
      claim: claim as never,
      signatures: proof.signatures.map((signature) => hexToBytes(signature as Hex)),
    } as never).map((signer: string) => signer.toLowerCase());
  } catch (error) {
    return refused(`a signature could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  const pinned = new Set(attestors.map((attestor) => attestor.toLowerCase()));
  const strangers = signers.filter((signer) => !pinned.has(signer));
  if (strangers.length > 0) return refused(`signed by ${strangers.join(", ")}, not by a pinned attestor (${attestors.join(", ")})`);

  // 3. The witnesses the proof names are exactly the signers: the unsigned list cannot claim another attestor.
  const witnesses = Array.isArray(proof.witnesses) ? (proof.witnesses as Witness[]) : [];
  if (witnesses.length === 0) return refused("the proof names no witness");
  const named = witnesses.map((witness) => (typeof witness?.id === "string" && ADDRESS.test(witness.id) ? witness.id.toLowerCase() : ""));
  if (named.some((id) => id === "")) return refused("a witness has no address");
  if (new Set(named).size !== new Set(signers).size || !named.every((id) => signers.includes(id))) {
    return refused(`the witnesses named (${named.join(", ")}) are not the signers (${[...new Set(signers)].join(", ")})`);
  }

  // 4. The enclave, when one is pinned: each witness's key is bound to an attested image, and the image is ours.
  if (digests.length > 0) {
    const signatures = new Set(proof.signatures.map((signature) => signature.toLowerCase()));
    for (const witness of witnesses) {
      const id = String(witness.id).toLowerCase();
      const attestation = witness.claimAttestation;
      if (!attestation || typeof attestation !== "object") return refused(`witness ${id} carries no enclave attestation, and an image digest is pinned`);
      if (String(attestation.attestor_address).toLowerCase() !== id) return refused(`the attestation of witness ${id} names another attestor`);
      if (!signatures.has(String(attestation.claim_signature).toLowerCase())) return refused(`the attestation of witness ${id} does not cover this claim's signature`);
      if (typeof attestation.attestation_report !== "string" || !attestation.attestation_report) return refused(`the attestation of witness ${id} carries no report`);
      const result = await verifyAttestorTeeAttestation(attestation.attestation_report, id);
      if (!result.isVerified) return refused(`the enclave attestation of witness ${id} did not verify: ${result.error ?? "no reason given"}`);
      if (!result.imageDigest || !digests.includes(result.imageDigest)) {
        return refused(`witness ${id} runs image ${result.imageDigest ?? "unknown"}, not a pinned one (${digests.join(", ")})`);
      }
    }
  }

  return { verified: true, signers };
}

/**
 * The `verify` a reading's dependencies use in `local` mode: true or false, as js-sdk's answer is read today, with
 * the reason said out loud in the logs, because the sentence a person then reads ("The proof did not verify")
 * promises that we know why.
 */
export async function localProofVerified(proof: SignedProof, attestors: readonly string[]): Promise<boolean> {
  const verdict = await verifyProofLocally(proof, attestors);
  if (!verdict.verified) {
    console.error(JSON.stringify({ at: new Date().toISOString(), proofVerifier: "local", identifier: proof.claimData?.identifier ?? null, refused: verdict.reason }));
  }
  return verdict.verified;
}
