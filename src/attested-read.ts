import { keccak256, stringToHex, type Hex } from "viem";
import { attestedSource, type AttestedSource, type ResponseMatch } from "./attested-sources";
import { allowedAttestors, attestorAccepted, type ZkFetchProof } from "./duolingo-public";

/**
 * One attested read of one page from the list in src/attested-sources.ts, for any source. Server only.
 *
 * Reclaim's zkFetch performs the HTTPS request through its TEE client and returns a proof that the site answered
 * these bytes, signed by the attestor. Nothing here trusts whoever ran the fetch: the attestor's signature is
 * verified, the attestor's address is pinned, and the proof must be about exactly the page and exactly the patterns
 * the source names. The last check matters for a source with several patterns on one page: a worker that returned a
 * proof of the right page under a looser pattern would otherwise pass off one cadence's rating as another's.
 *
 * The Duolingo reading keeps its own module (src/duolingo-public.ts), which predates this one and is running.
 */

export type AttestedReadErrorCode =
  | "INVALID_ACCOUNT"
  | "NOT_FOUND"
  /** The page answered, and one of the patterns found nothing in it. `pattern` says which. */
  | "NO_MATCH"
  | "FETCH_FAILED"
  | "PROOF_INVALID"
  | "PROOF_MISMATCH"
  | "NOT_CONFIGURED";

export class AttestedReadError extends Error {
  constructor(
    readonly code: AttestedReadErrorCode,
    message: string,
    readonly pattern?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AttestedReadError";
  }
}

export type AttestedReadDeps = {
  zkFetch: (source: AttestedSource, account: string) => Promise<ZkFetchProof>;
  verify: (proof: ZkFetchProof) => Promise<boolean>;
  attestors?: readonly string[];
};

export type AttestedReading = Readonly<{
  sourceId: string;
  account: string;
  /** What the source's patterns extracted, by group name. */
  values: Readonly<Record<string, string>>;
  /** Unix seconds, the attestor's own time of the fetch. */
  observedAt: number;
  /** Unique per proof: the replay guard a contract keeps. */
  nullifier: Hex;
  proof: ZkFetchProof;
}>;

function parseJson(value: string, what: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new AttestedReadError("PROOF_INVALID", `The proof's ${what} is not readable`, undefined, { cause: error });
  }
}

function sameMatches(given: unknown, expected: readonly ResponseMatch[]): boolean {
  if (!Array.isArray(given) || given.length !== expected.length) return false;
  return expected.every((match, index) => {
    const other = given[index] as { type?: unknown; value?: unknown } | undefined;
    return other?.type === match.type && other?.value === match.value;
  });
}

/**
 * Reads a proof against the source it claims to be about. Signature validity is checked before this is called; this
 * checks that the signed request is the one the source describes, and takes out what its patterns found.
 */
export function readingOfProof(source: AttestedSource, account: string, proof: ZkFetchProof): AttestedReading {
  const parameters = parseJson(proof.claimData.parameters, "parameters");
  const url = String(parameters.url ?? "");
  const method = String(parameters.method ?? "GET").toUpperCase();
  if (url !== source.url(account) || method !== "GET") throw new AttestedReadError("PROOF_MISMATCH", "The proof is not about this page");
  if (!sameMatches(parameters.responseMatches, source.matches)) throw new AttestedReadError("PROOF_MISMATCH", "The proof was read with other patterns");
  const context = parseJson(proof.claimData.context, "context");
  const extracted = context.extractedParameters;
  if (!extracted || typeof extracted !== "object") throw new AttestedReadError("PROOF_INVALID", "The proof carries nothing it read");
  const values = Object.fromEntries(Object.entries(extracted as Record<string, unknown>).map(([key, value]) => [key, String(value)]));
  const identifier = proof.claimData.identifier;
  if (!/^0x[0-9a-fA-F]{64}$/.test(identifier)) throw new AttestedReadError("PROOF_INVALID", "The proof has no identifier");
  const observedAt = Number(proof.claimData.timestampS);
  if (!Number.isSafeInteger(observedAt) || observedAt <= 0) throw new AttestedReadError("PROOF_INVALID", "The proof has no timestamp");
  return {
    sourceId: source.id,
    account,
    values,
    observedAt,
    nullifier: keccak256(stringToHex(`viky:zkfetch:${identifier.toLowerCase()}`)),
    proof,
  };
}

/**
 * What zkFetch's refusals mean, measured on 17 Sep 2026 against Chess.com: an unknown account ends the protocol with
 * "HTTP response status 404 is not a success status", and a page without what a pattern needs is refused by the
 * attestor with `Regex "<pattern>" didn't match`. Anything else is a failure to read, not a fact about the account.
 */
export function classifyFetchFailure(message: string, source: AttestedSource): AttestedReadError {
  if (/HTTP response status 404|received HTTP 404/i.test(message)) return new AttestedReadError("NOT_FOUND", "Nothing answers to that name");
  if (/didn't match|did not match/i.test(message)) {
    const pattern = source.matches.find((match) => message.includes(match.value))?.value;
    return new AttestedReadError("NO_MATCH", "The page does not carry what this reading needs", pattern);
  }
  return new AttestedReadError("FETCH_FAILED", "The page could not be read right now");
}

export async function attestedRead(sourceId: string, account: string, deps: AttestedReadDeps): Promise<AttestedReading> {
  const source = attestedSource(sourceId);
  if (!source) throw new AttestedReadError("NOT_CONFIGURED", `No attested source is named ${sourceId}`);
  if (!source.accepts(account)) throw new AttestedReadError("INVALID_ACCOUNT", "That is not a name this source could have");
  let proof: ZkFetchProof;
  try {
    proof = await deps.zkFetch(source, account);
  } catch (error) {
    if (error instanceof AttestedReadError) throw error;
    throw classifyFetchFailure(error instanceof Error ? error.message : String(error), source);
  }
  let valid = false;
  try {
    valid = await deps.verify(proof);
  } catch (error) {
    throw new AttestedReadError("PROOF_INVALID", "The proof could not be verified", undefined, { cause: error });
  }
  if (!valid) throw new AttestedReadError("PROOF_INVALID", "The proof did not verify");
  if (!attestorAccepted(proof, deps.attestors ?? allowedAttestors())) throw new AttestedReadError("PROOF_INVALID", "The proof was not signed by a pinned attestor");
  return readingOfProof(source, account, proof);
}

/** The headers a source is read with. Chess.com answers a request without a user agent with a challenge page. */
function headersFor(source: AttestedSource): Record<string, string> {
  return { accept: "application/json", "user-agent": source.userAgent ?? "Mozilla/5.0 (Viky)" };
}

/**
 * Through the attested-fetch worker when ZKFETCH_WORKER_URL is set (Vercel functions cannot load zk-fetch, D27). The
 * worker is told a source and an account, never a URL, and only the proof comes back; everything is checked here.
 */
async function workerZkFetch(source: AttestedSource, account: string): Promise<ZkFetchProof> {
  const base = process.env.ZKFETCH_WORKER_URL!.trim().replace(/\/$/, "");
  const secret = process.env.ZKFETCH_WORKER_SECRET?.trim();
  if (!secret) throw new AttestedReadError("NOT_CONFIGURED", "The attested fetch worker is not configured");
  let response: Response;
  try {
    response = await fetch(`${base}/read`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ source: source.id, account }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    throw new AttestedReadError("FETCH_FAILED", "The attested fetch worker did not answer", undefined, { cause: error });
  }
  const body = (await response.json().catch(() => ({}))) as { proof?: ZkFetchProof; error?: string; message?: string };
  if (response.ok && body.proof) return body.proof;
  // The worker passes zkFetch's own words on, so they are read the same way as a local refusal.
  if (body.message) throw classifyFetchFailure(body.message, source);
  throw new AttestedReadError("FETCH_FAILED", `The attested fetch worker answered ${response.status}`);
}

async function localZkFetch(source: AttestedSource, account: string): Promise<ZkFetchProof> {
  const appId = process.env.RECLAIM_ZKFETCH_APP_ID?.trim();
  const appSecret = process.env.RECLAIM_ZKFETCH_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new AttestedReadError("NOT_CONFIGURED", "The attested fetch is not configured");
  // A real runtime import, as in src/duolingo-public.ts: zk-fetch is CommonJS requiring ESM-only packages.
  const { ReclaimClient } = (await import(/* turbopackIgnore: true */ "@reclaimprotocol/zk-fetch")) as typeof import("@reclaimprotocol/zk-fetch");
  const client = new ReclaimClient(appId, appSecret);
  return (await client.zkFetch(
    source.url(account),
    { method: "GET", headers: headersFor(source), useTee: true } as never,
    { responseMatches: source.matches.map((match) => ({ ...match })) } as never,
  )) as unknown as ZkFetchProof;
}

/** The dependencies the routes and the passes use: the worker when configured, the local client otherwise. */
export function reclaimAttestedReadDeps(): AttestedReadDeps {
  // Content validation is ours (`readingOfProof`), so the SDK's provider-hash validation is off; it still checks the
  // attestor's signature, and the attestor's address is pinned in `attestedRead`.
  const options = { dangerouslyDisableContentValidation: true } as never;
  if (process.env.ZKFETCH_WORKER_URL?.trim()) {
    // Imported the way src/duolingo-public.ts imports it on this path, which is the one that runs on Vercel.
    return {
      zkFetch: workerZkFetch,
      verify: async (proof) => (await (await import("@reclaimprotocol/js-sdk")).verifyProof(proof as never, options)).isVerified === true,
    };
  }
  return {
    zkFetch: localZkFetch,
    verify: async (proof) => {
      const { verifyProof } = (await import(/* turbopackIgnore: true */ "@reclaimprotocol/js-sdk")) as typeof import("@reclaimprotocol/js-sdk");
      return (await verifyProof(proof as never, options)).isVerified === true;
    },
  };
}

/** The fetch half alone, for the worker process: it returns the proof and leaves every check to whoever asked. */
export const localAttestedFetch = localZkFetch;
