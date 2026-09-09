// ABI components of a Reclaim proof, extracted from Lock-in's contract ABI module. They describe the
// proof shape the Solidity SDK expects, not any escrow.

export const reclaimClaimInfoComponents = [
  { name: "provider", type: "string" },
  { name: "parameters", type: "string" },
  { name: "context", type: "string" },
] as const;

export const reclaimCompleteClaimComponents = [
  { name: "identifier", type: "bytes32" },
  { name: "owner", type: "address" },
  { name: "timestampS", type: "uint32" },
  { name: "epoch", type: "uint32" },
] as const;

export const reclaimSignedClaimComponents = [
  { name: "claim", type: "tuple", components: reclaimCompleteClaimComponents },
  { name: "signatures", type: "bytes[]" },
] as const;

export const reclaimProofComponents = [
  { name: "claimInfo", type: "tuple", components: reclaimClaimInfoComponents },
  { name: "signedClaim", type: "tuple", components: reclaimSignedClaimComponents },
] as const;

export const directProofBundleComponents = [
  { name: "sessionId", type: "string" },
  { name: "proofs", type: "tuple[]", components: reclaimProofComponents },
] as const;
