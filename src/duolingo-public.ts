import { keccak256, stringToHex, type Hex } from "viem";
import { countedFetch, ReclaimCeilingReached, ReclaimLimitReached } from "./attested-calls";
import { duolingoProfileUrl, isValidDuolingoUsername } from "./duolingo-public-terms";
import { localProofVerified, proofVerifierMode } from "./proof-verification";

/**
 * Attested read of a Duolingo public profile (D27). zkFetch (Reclaim) performs the HTTPS request and
 * returns a proof that Duolingo answered these bytes; the attestor signs it, in TEE mode. Viky never
 * touches a password, the person never signs in, and any third party can verify the proof.
 *
 * The network client and the proof verifier are injected so the logic is tested without Reclaim.
 */

export type ResponseMatch = { type: "regex"; value: string };

/** How this reading is named in the journal of attested fetches: it predates the list of sources and has no id there. */
const DUOLINGO_PROFILE_FETCH = "duolingo-profile";

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
  /** The month's limit of attested readings is reached: nothing was fetched (src/attested-calls.ts). */
  | "LIMIT_REACHED"
  /** A day\'s ceiling of attested readings is reached: nothing was fetched, and readings resume the next UTC day. */
  | "CEILING_REACHED"
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
  /** Attestor addresses whose signature is accepted; defaults to Reclaim's production attestor. */
  attestors?: readonly string[];
  /** The moment the proof is read, in seconds; the server's clock when absent. */
  now?: () => number;
};

/**
 * How old a proof may be when it is read: ten minutes from the attestor's own timestamp (the audit of 1 Oct 2026).
 * A reading is asked for and used in the same breath; a proof older than that is another moment's answer, kept or
 * replayed, and says nothing of the profile now.
 */
export const MAX_PROOF_AGE_SECONDS = 600;

/**
 * Reclaim's production attestor, the same address the Duolingo session verifier pins on chain. Measured
 * on 11 Sep 2026: a zkFetch in TEE mode returns `witnesses: [{ id: <this address>, url:
 * "wss://attestor.reclaimprotocol.org:444/ws" }]`. Override with RECLAIM_ATTESTOR_ADDRESSES (comma separated).
 */
export const DEFAULT_ATTESTORS: readonly string[] = ["0x244897572368Eadf65bfBc5aec98D8e5443a9072"];

export function allowedAttestors(): readonly string[] {
  const configured = process.env.RECLAIM_ATTESTOR_ADDRESSES?.split(",").map((a) => a.trim()).filter(Boolean);
  return configured && configured.length > 0 ? configured : DEFAULT_ATTESTORS;
}

/** True when every witness of the proof is a pinned attestor. A proof without witnesses is refused. */
export function attestorAccepted(proof: ZkFetchProof, attestors: readonly string[]): boolean {
  const witnesses = Array.isArray(proof.witnesses) ? (proof.witnesses as Array<{ id?: unknown }>) : [];
  if (witnesses.length === 0) return false;
  const allowed = new Set(attestors.map((a) => a.toLowerCase()));
  return witnesses.every((w) => typeof w?.id === "string" && allowed.has(w.id.toLowerCase()));
}

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
 * The fingerprint of a claim: the nullifier the contract stores against replay, and the one thing about a proof that
 * is safe to publish. It is derived from the claim's identifier alone, so anybody holding the proof can recompute it
 * and compare it with what the chain accepted (scripts/verify-day.ts), and it says nothing about the person.
 */
export function claimFingerprint(identifier: string): Hex {
  return keccak256(stringToHex(`viky:zkfetch:${identifier.toLowerCase()}`));
}

function sameMatches(given: unknown, expected: readonly ResponseMatch[]): boolean {
  if (!Array.isArray(given) || given.length !== expected.length) return false;
  return expected.every((match, index) => {
    const other = given[index] as { type?: unknown; value?: unknown } | undefined;
    return other?.type === match.type && other?.value === match.value;
  });
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
  // The patterns are part of what the attestor signed, and they decide which bytes of the page become "totalXp":
  // a proof read with other patterns could name another number as the experience. They must be exactly ours, in
  // our order (the audit of 1 Oct 2026; every other attested source already checked this, src/attested-read.ts).
  if (!sameMatches(parameters.responseMatches, PROFILE_RESPONSE_MATCHES)) {
    throw new PublicProfileError("PROOF_MISMATCH", "The proof was read with other patterns");
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
    nullifier: claimFingerprint(identifier),
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
    // The month's limit, by Viky's own count or by Reclaim's answer: its own refusal, never a failure to read Duolingo.
    if (error instanceof ReclaimLimitReached) throw new PublicProfileError("LIMIT_REACHED", error.message, { cause: error });
    // A day's ceiling: its own refusal too, and never a failure to read Duolingo.
    if (error instanceof ReclaimCeilingReached) throw new PublicProfileError("CEILING_REACHED", error.message, { cause: error });
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
  if (!attestorAccepted(proof, deps.attestors ?? allowedAttestors())) throw new PublicProfileError("PROOF_INVALID", "The proof was not signed by a pinned attestor");
  const profile = profileFromProof(proof, username);
  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1_000);
  if (now - profile.observedAt > MAX_PROOF_AGE_SECONDS) throw new PublicProfileError("PROOF_MISMATCH", "The proof is of an earlier moment than this reading");
  return profile;
}

/**
 * Fetches through the attested-fetch worker (scripts/zkfetch-worker.ts) when ZKFETCH_WORKER_URL is set:
 * Vercel functions run Node with `--no-experimental-require-module`, which zk-fetch's CommonJS build
 * cannot load, so the fetch runs elsewhere and only the proof comes back. The signature check and the
 * attestor pin stay here, so the worker cannot forge a reading.
 */
async function workerZkFetch(url: string): Promise<ZkFetchProof> {
  const base = process.env.ZKFETCH_WORKER_URL!.trim().replace(/\/$/, "");
  const secret = process.env.ZKFETCH_WORKER_SECRET?.trim();
  if (!secret) throw new PublicProfileError("NOT_CONFIGURED", "The attested fetch worker is not configured");
  const username = new URL(url).searchParams.get("username") ?? "";
  const response = await fetch(`${base}/read`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify({ username }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = (await response.json().catch(() => ({}))) as { proof?: ZkFetchProof; error?: string; message?: string };
  if (response.status === 404) throw new Error(`Response match not found: ${body.message ?? "no profile"}`);
  if (!response.ok || !body.proof) throw new Error(`worker ${response.status}: ${body.message ?? body.error ?? "no proof"}`);
  return body.proof;
}

/** The verifier behind the switch: the signature against Viky's own pinned attestors, nothing over the network. */
export function verifyProfileWithPin(proof: ZkFetchProof): Promise<boolean> {
  return localProofVerified(proof, allowedAttestors());
}

/**
 * The dependencies used by the routes and the daily pass: the worker when configured, else the local client. The
 * verifier is Reclaim's unless PROOF_VERIFIER says `local` (src/proof-verification.ts).
 */
export async function reclaimPublicProfileDeps(): Promise<PublicProfileDeps> {
  if (process.env.ZKFETCH_WORKER_URL?.trim()) {
    const { verifyProof } = await import("@reclaimprotocol/js-sdk");
    const local = proofVerifierMode() === "local";
    return {
      // Counted in the journal of the month's allowance each time it leaves (src/attested-calls.ts).
      zkFetch: (url) => countedFetch(DUOLINGO_PROFILE_FETCH, () => workerZkFetch(url)),
      verify: local
        ? verifyProfileWithPin
        : async (proof) => (await verifyProof(proof as never, { dangerouslyDisableContentValidation: true } as never)).isVerified === true,
    };
  }
  const own = await reclaimLocalProfileDeps();
  return { ...own, zkFetch: (url, matches) => countedFetch(DUOLINGO_PROFILE_FETCH, () => own.zkFetch(url, matches)) };
}

/**
 * The local dependencies: Reclaim's zkFetch client in TEE mode and the js-sdk verifier. Server only.
 * Content validation is Viky's own (`profileFromProof` checks URL, method and username against the
 * proof), so the SDK's provider-hash validation is disabled; the SDK checks the attestor signature and
 * Viky pins the attestor address. Measured on 11 Sep 2026: the proof object carries no attestor TEE
 * attestation in zk-fetch 1.1.0, so that attestation is not verified here; the fetch itself runs through
 * Reclaim's TEE client (`useTee`).
 */
export async function reclaimLocalProfileDeps(): Promise<PublicProfileDeps> {
  const appId = process.env.RECLAIM_ZKFETCH_APP_ID?.trim();
  const appSecret = process.env.RECLAIM_ZKFETCH_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new PublicProfileError("NOT_CONFIGURED", "The attested fetch is not configured");
  // Real runtime imports (the bundler leaves them alone): zk-fetch is CommonJS and requires ESM-only
  // packages, which only Node's own loader can resolve.
  const [{ ReclaimClient }, { verifyProof }] = await Promise.all([
    import(/* turbopackIgnore: true */ "@reclaimprotocol/zk-fetch") as Promise<typeof import("@reclaimprotocol/zk-fetch")>,
    import(/* turbopackIgnore: true */ "@reclaimprotocol/js-sdk") as Promise<typeof import("@reclaimprotocol/js-sdk")>,
  ]);
  const client = new ReclaimClient(appId, appSecret);
  const local = proofVerifierMode() === "local";
  return {
    zkFetch: async (url, matches) =>
      (await client.zkFetch(
        url,
        { method: "GET", headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Viky)" }, useTee: true } as never,
        { responseMatches: matches.map((m) => ({ ...m })) } as never,
      )) as unknown as ZkFetchProof,
    verify: local
      ? verifyProfileWithPin
      : async (proof) => {
          const result = await verifyProof(proof as never, { dangerouslyDisableContentValidation: true } as never);
          return result.isVerified === true;
        },
  };
}
