import { keccak256, stringToHex, type Hex } from "viem";
import { duolingoProfileUrl, isValidDuolingoUsername } from "./duolingo-public-terms";

/**
 * Attested read of a Duolingo public profile (D27). zkFetch (Reclaim) performs the HTTPS request and
 * returns a proof that Duolingo answered these bytes; the attestor signs it, in TEE mode. Viky never
 * touches a password, the person never signs in, and any third party can verify the proof.
 *
 * The network client and the proof verifier are injected so the logic is tested without Reclaim.
 */

export type ResponseMatch = { type: "regex"; value: string };

/** Each first match is the user-level field: checked on real responses on 11 Sep 2026 (`id` is the first key). */
export const PROFILE_RESPONSE_MATCHES: readonly ResponseMatch[] = [
  { type: "regex", value: '"id":(?<id>\\d+)' },
  { type: "regex", value: '"totalXp":(?<totalXp>\\d+)' },
  { type: "regex", value: '"username":"(?<username>[^"]+)"' },
  { type: "regex", value: '"name":"(?<name>[^"]*)"' },
  { type: "regex", value: '"streak":(?<streak>\\d+)' },
];

/** The shape zkFetch returns (the Reclaim proof object). Only the fields Viky reads are typed. */
export type ZkFetchProof = {
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

export type PublicProfile = Readonly<{
  username: string;
  profileId: string;
  displayName: string;
  totalXp: number;
  streak: number;
  /** Unix seconds, the attestor's timestamp of the fetch. */
  observedAt: number;
  /** keccak of the proof identifier: unique per proof, the check-in nullifier. */
  nullifier: Hex;
  proof: ZkFetchProof;
}>;

export type PublicProfileErrorCode =
  | "INVALID_USERNAME"
  | "PROFILE_NOT_FOUND"
  | "FETCH_FAILED"
  | "PROOF_INVALID"
  | "PROOF_MISMATCH"
  | "NOT_CONFIGURED";

export class PublicProfileError extends Error {
  constructor(
    readonly code: PublicProfileErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PublicProfileError";
  }
}

export type PublicProfileDeps = {
  zkFetch: (url: string, matches: readonly ResponseMatch[]) => Promise<ZkFetchProof>;
  verify: (proof: ZkFetchProof) => Promise<boolean>;
};

function parseJson(value: string, what: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new PublicProfileError("PROOF_INVALID", `The proof's ${what} is not readable`, { cause: error });
  }
}

/**
 * Reads the profile out of a proof and checks the proof is about the expected request: the URL of the
 * public endpoint for that username, a GET, and a username that matches. Signature validity is the
 * verifier's job (`deps.verify`), done before this is called.
 */
export function profileFromProof(proof: ZkFetchProof, expectedUsername: string): PublicProfile {
  const parameters = parseJson(proof.claimData.parameters, "parameters");
  const url = String(parameters.url ?? "");
  const method = String(parameters.method ?? "GET").toUpperCase();
  if (url.toLowerCase() !== duolingoProfileUrl(expectedUsername).toLowerCase() || method !== "GET") {
    throw new PublicProfileError("PROOF_MISMATCH", "The proof is not about this profile");
  }
  const context = parseJson(proof.claimData.context, "context");
  const extracted = (context.extractedParameters ?? {}) as Record<string, unknown>;
  const id = String(extracted.id ?? "");
  const totalXp = String(extracted.totalXp ?? "");
  const username = String(extracted.username ?? "");
  const displayName = String(extracted.name ?? "");
  const streak = String(extracted.streak ?? "0");
  if (!/^\d{1,18}$/.test(id) || !/^\d{1,12}$/.test(totalXp) || !/^\d{1,9}$/.test(streak) || username.length === 0) {
    throw new PublicProfileError("PROOF_INVALID", "The proof does not carry a complete profile");
  }
  if (username.toLowerCase() !== expectedUsername.toLowerCase()) {
    throw new PublicProfileError("PROOF_MISMATCH", "The proof is about another username");
  }
  const identifier = proof.claimData.identifier;
  if (!/^0x[0-9a-fA-F]{64}$/.test(identifier)) throw new PublicProfileError("PROOF_INVALID", "The proof has no identifier");
  const observedAt = Number(proof.claimData.timestampS);
  if (!Number.isSafeInteger(observedAt) || observedAt <= 0) throw new PublicProfileError("PROOF_INVALID", "The proof has no timestamp");
  return {
    username,
    profileId: id,
    displayName,
    totalXp: Number(totalXp),
    streak: Number(streak),
    observedAt,
    nullifier: keccak256(stringToHex(`viky:zkfetch:${identifier.toLowerCase()}`)),
    proof,
  };
}

/** Fetches and verifies the public profile of a username. Every failure is typed. */
export async function fetchPublicProfile(username: string, deps: PublicProfileDeps): Promise<PublicProfile> {
  if (!isValidDuolingoUsername(username)) throw new PublicProfileError("INVALID_USERNAME", "That does not look like a Duolingo username");
  let proof: ZkFetchProof;
  try {
    proof = await deps.zkFetch(duolingoProfileUrl(username), PROFILE_RESPONSE_MATCHES);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // zkFetch rejects when a responseMatch finds nothing: an unknown username answers `{"users":[]}`.
    if (/match|regex|not found/i.test(message)) {
      throw new PublicProfileError("PROFILE_NOT_FOUND", "No public Duolingo profile with that username", { cause: error });
    }
    throw new PublicProfileError("FETCH_FAILED", "Duolingo could not be read right now", { cause: error });
  }
  let valid = false;
  try {
    valid = await deps.verify(proof);
  } catch (error) {
    throw new PublicProfileError("PROOF_INVALID", "The proof could not be verified", { cause: error });
  }
  if (!valid) throw new PublicProfileError("PROOF_INVALID", "The proof did not verify");
  return profileFromProof(proof, username);
}

/** The production dependencies: Reclaim's zkFetch client in TEE mode and the js-sdk verifier. Server only. */
export async function reclaimPublicProfileDeps(): Promise<PublicProfileDeps> {
  const appId = process.env.RECLAIM_ZKFETCH_APP_ID?.trim();
  const appSecret = process.env.RECLAIM_ZKFETCH_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new PublicProfileError("NOT_CONFIGURED", "The attested fetch is not configured");
  const [{ ReclaimClient }, { verifyProof }] = await Promise.all([import("@reclaimprotocol/zk-fetch"), import("@reclaimprotocol/js-sdk")]);
  const client = new ReclaimClient(appId, appSecret);
  return {
    zkFetch: async (url, matches) =>
      (await client.zkFetch(
        url,
        { method: "GET", headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Viky)" }, useTee: true } as never,
        { responseMatches: matches.map((m) => ({ ...m })) } as never,
      )) as unknown as ZkFetchProof,
    verify: async (proof) => {
      // Content validation is Viky's own (profileFromProof checks URL, method and username against the
      // proof); the SDK checks the attestor signature and, in TEE mode, the attestor's attestation.
      const result = await verifyProof(proof as never, { dangerouslyDisableContentValidation: true, attestorTeeAttestation: {} } as never);
      return result.isVerified === true && result.isAttestorTeeAttestationVerified === true;
    },
  };
}
