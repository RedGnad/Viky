import { claimFingerprint } from "./duolingo-public";

type Kept = Readonly<{ claimData?: Readonly<{ identifier?: unknown }> }>;

/**
 * The proof a published fingerprint is of, among those a reading kept (the founder, 13 Oct 2026).
 *
 * A reading of a Chess.com climb keeps two proofs, the profile then the ratings, and the fingerprint it publishes,
 * which is the one the contract records, is the second's (src/chess-reading.ts). `pnpm verify:day --reading` took the
 * first of the file: it worked out the profile's fingerprint, and answered no twice on a true reading, to the question
 * of the published fingerprint and to the question of the chain.
 *
 * The proof whose own fingerprint is the published one is taken. With nothing published, or none that matches, it is
 * the first, and the command's third question then says what it found.
 */
export function proofOfFingerprint<P extends Kept>(kept: P | readonly P[], published: string | undefined): P {
  const proofs: readonly P[] = Array.isArray(kept) ? (kept as readonly P[]) : [kept as P];
  const wanted = published?.trim().toLowerCase();
  if (!wanted) return proofs[0];
  const its = proofs.find((proof) => typeof proof?.claimData?.identifier === "string" && claimFingerprint(proof.claimData.identifier).toLowerCase() === wanted);
  return its ?? proofs[0];
}
