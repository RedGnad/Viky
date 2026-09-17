import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MILESTONE_CLAIM_TYPES, MILESTONE_DOMAIN, MILESTONE_PROOF_TYPES, type MilestoneClaimMessage, type MilestoneProofMessage } from "./milestone-protocol";

/**
 * The two attestations the milestone contract takes from the evidence signer: a claim, once the link's key has been
 * checked, and a proof, once an attested reading has been verified. The signer is the one the daily contract uses;
 * the domain's name and the contract's address keep the two contracts' signatures apart. Server only: it reads a key.
 */

function evidenceSignerKey(): Hex {
  const key = process.env.EVIDENCE_SIGNER_PRIVATE_KEY?.trim();
  if (!key) throw new Error("EVIDENCE_SIGNER_PRIVATE_KEY is not configured");
  return (key.startsWith("0x") ? key : `0x${key}`) as Hex;
}

export async function signMilestoneClaim(message: MilestoneClaimMessage, contract: Hex): Promise<Hex> {
  return privateKeyToAccount(evidenceSignerKey()).signTypedData({
    domain: { ...MILESTONE_DOMAIN, verifyingContract: contract },
    types: MILESTONE_CLAIM_TYPES,
    primaryType: "Claim",
    message,
  });
}

export async function signMilestoneProof(message: MilestoneProofMessage, contract: Hex): Promise<Hex> {
  return privateKeyToAccount(evidenceSignerKey()).signTypedData({
    domain: { ...MILESTONE_DOMAIN, verifyingContract: contract },
    types: MILESTONE_PROOF_TYPES,
    primaryType: "Proof",
    message,
  });
}
