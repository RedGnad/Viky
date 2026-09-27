import { keccak256, stringToHex, type Hex } from "viem";
import { attestedSource, headersFor, matchesOf, type AttestedSource, type ResponseMatch } from "./attested-sources";
import { allowedAttestors, attestorAccepted, type ZkFetchProof } from "./duolingo-public";
import { localProofVerified, proofVerifierMode } from "./proof-verification";
import { READING_FINGERPRINT } from "./reading-fingerprint";
import { isTooManyRequests } from "./source-throttle";

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
  /** The source answered that this account may not be read: a page its owner has taken private again (403). */
  | "REFUSED"
  /** The source answered that the request is no longer one it will serve: a certificate past its life (400). */
  | "NOT_ACCEPTED"
  | "FETCH_FAILED"
  | "PROOF_INVALID"
  | "PROOF_MISMATCH"
  /** The reading service runs other sources than this build does, so nothing it fetches can be read here. */
  | "WORKER_OUT_OF_DATE"
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
  /** The fetch, with the person's key as a secret where the source takes one (D188): never logged, never in the proof. */
  zkFetch: (source: AttestedSource, account: string, bearer?: string) => Promise<ZkFetchProof>;
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
  // A page asked by POST signs its method and its body with it (D197): both must be the ones the source describes.
  const asked = source;
  const expectedMethod = asked.method ?? "GET";
  if (url !== source.url(account) || method !== expectedMethod) throw new AttestedReadError("PROOF_MISMATCH", "The proof is not about this page");
  if (asked.body && String(parameters.body ?? "") !== asked.body(account)) throw new AttestedReadError("PROOF_MISMATCH", "The proof asked the page something else");
  if (!sameMatches(parameters.responseMatches, matchesOf(source, account))) throw new AttestedReadError("PROOF_MISMATCH", "The proof was read with other patterns");
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
 *
 * 403 and 400 are read the same way, because a source can answer that a page is no longer for us rather than that it
 * is missing: a Duolingo English Test certificate answers 403 once its taker takes it private again and 400 once it
 * has expired (both measured on 18 Sep 2026 on real certificates, U3). Those are facts about the page, not failures
 * of ours, and the difference matters: the keeper holds a gift open on `FETCH_FAILED`, so a link somebody withdrew
 * would otherwise be held for ever instead of refused. Only the 404 phrasing has been seen from the worker itself;
 * the other two are mapped by the same phrasing and confirmed on the first real reading.
 */
export function classifyFetchFailure(message: string, source: AttestedSource, account = ""): AttestedReadError {
  // The platform asked the reader to slow down, or the service's own pace put the reading off: a failure to read
  // now, whose message says so ("THROTTLED"), so a reading can tell the person to try later with nothing counted.
  if (isTooManyRequests(message) || /^THROTTLED/.test(message)) return new AttestedReadError("FETCH_FAILED", `THROTTLED: the source is being read too often, try again later`);
  if (/HTTP response status 404|received HTTP 404/i.test(message)) return new AttestedReadError("NOT_FOUND", "Nothing answers to that name");
  if (/HTTP response status 403|received HTTP 403/i.test(message)) return new AttestedReadError("REFUSED", "That page is not public any more");
  if (/HTTP response status 400|received HTTP 400/i.test(message)) return new AttestedReadError("NOT_ACCEPTED", "The source will not serve that any more");
  if (/didn't match|did not match/i.test(message)) {
    const pattern = matchesOf(source, account).find((match) => message.includes(match.value))?.value;
    return new AttestedReadError("NO_MATCH", "The page does not carry what this reading needs", pattern);
  }
  return new AttestedReadError("FETCH_FAILED", "The page could not be read right now");
}

export async function attestedRead(sourceId: string, account: string, deps: AttestedReadDeps, bearer?: string): Promise<AttestedReading> {
  const source = attestedSource(sourceId);
  if (!source) throw new AttestedReadError("NOT_CONFIGURED", `No attested source is named ${sourceId}`);
  if (!source.accepts(account)) throw new AttestedReadError("INVALID_ACCOUNT", "That is not a name this source could have");
  // A connected source opens with the person's key and with nothing else; a public one takes none (D188).
  const auth = source.auth;
  if (auth === "bearer" && !bearer) throw new AttestedReadError("NOT_CONFIGURED", "This source is read with the person's key, and none was given");
  if (auth !== "bearer" && bearer) throw new AttestedReadError("NOT_CONFIGURED", "This source takes no key");
  let proof: ZkFetchProof;
  try {
    proof = await deps.zkFetch(source, account, bearer);
  } catch (error) {
    if (error instanceof AttestedReadError) throw error;
    throw classifyFetchFailure(error instanceof Error ? error.message : String(error), source, account);
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

/** How long an agreement is taken as still true. A disagreement is never held: it is asked again at the next read. */
const AGREEMENT_HOLDS_MS = 60_000;
const agreedAt = new Map<string, number>();

/**
 * Asks the worker what it runs before asking it for anything (incident of 18 Sep 2026). The worker publishes the
 * number of the two files an attested read is made of, and this build carries its own: different numbers mean the
 * proof coming back would be judged against patterns the worker never fetched, which is what happened that night and
 * what was shown as "try again in a minute". Nothing is fetched and nobody is told to retry.
 */
async function workerIsCurrent(base: string): Promise<void> {
  const agreed = agreedAt.get(base) ?? 0;
  if (Date.now() - agreed < AGREEMENT_HOLDS_MS) return;
  let theirs: string | undefined;
  try {
    const response = await fetch(`${base}/health`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const body = (await response.json().catch(() => ({}))) as { reading?: { fingerprint?: string } };
    theirs = body.reading?.fingerprint;
  } catch (error) {
    // A worker that does not answer at all is a worker that is down, which is its own refusal and not this one.
    throw new AttestedReadError("FETCH_FAILED", "The attested fetch worker did not answer", undefined, { cause: error });
  }
  if (theirs === READING_FINGERPRINT) {
    agreedAt.set(base, Date.now());
    return;
  }
  // Said out loud, because the sentence a person reads promises that we know: the logs are where we are told.
  console.error(JSON.stringify({ at: new Date().toISOString(), worker: base, readingFingerprint: { ours: READING_FINGERPRINT, theirs: theirs ?? null }, error: "WORKER_OUT_OF_DATE" }));
  throw new AttestedReadError("WORKER_OUT_OF_DATE", "The attested fetch worker runs other sources than this build");
}

/**
 * Through the attested-fetch worker when ZKFETCH_WORKER_URL is set (Vercel functions cannot load zk-fetch, D27). The
 * worker is told a source and an account, never a URL, and only the proof comes back; everything is checked here.
 */
async function workerZkFetch(source: AttestedSource, account: string, bearer?: string): Promise<ZkFetchProof> {
  const base = process.env.ZKFETCH_WORKER_URL!.trim().replace(/\/$/, "");
  const secret = process.env.ZKFETCH_WORKER_SECRET?.trim();
  if (!secret) throw new AttestedReadError("NOT_CONFIGURED", "The attested fetch worker is not configured");
  await workerIsCurrent(base);
  let response: Response;
  try {
    response = await fetch(`${base}/read`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      // The person's key rides in the body, over the channel the worker's own secret guards, and in no log (D188).
      body: JSON.stringify({ source: source.id, account, ...(bearer ? { bearer } : {}) }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    throw new AttestedReadError("FETCH_FAILED", "The attested fetch worker did not answer", undefined, { cause: error });
  }
  const body = (await response.json().catch(() => ({}))) as { proof?: ZkFetchProof; error?: string; message?: string; retryAfterSeconds?: number };
  if (response.ok && body.proof) return body.proof;
  // Put off by the pace: the wait the service gives travels with the refusal, so the person can be told when to come back.
  if (body.error === "THROTTLED") throw new AttestedReadError("FETCH_FAILED", `THROTTLED${typeof body.retryAfterSeconds === "number" && body.retryAfterSeconds > 0 ? ` retry-after=${Math.ceil(body.retryAfterSeconds)}` : ""}: ${body.message ?? "the source is being read too often, try again later"}`);
  // The worker passes zkFetch's own words on, so they are read the same way as a local refusal.
  if (body.message) throw classifyFetchFailure(body.message, source);
  throw new AttestedReadError("FETCH_FAILED", `The attested fetch worker answered ${response.status}`);
}

async function localZkFetch(source: AttestedSource, account: string, bearer?: string): Promise<ZkFetchProof> {
  const appId = process.env.RECLAIM_ZKFETCH_APP_ID?.trim();
  const appSecret = process.env.RECLAIM_ZKFETCH_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new AttestedReadError("NOT_CONFIGURED", "The attested fetch is not configured");
  // A real runtime import, as in src/duolingo-public.ts: zk-fetch is CommonJS requiring ESM-only packages.
  const { ReclaimClient } = (await import(/* turbopackIgnore: true */ "@reclaimprotocol/zk-fetch")) as typeof import("@reclaimprotocol/zk-fetch");
  const client = new ReclaimClient(appId, appSecret);
  // The person's key, where the source takes one, goes in the secret half of the fetch: zkFetch keeps secret headers
  // out of the proof and out of the attestor's sight (D188, rule 5).
  return (await client.zkFetch(
    source.url(account),
    {
      method: source.method ?? "GET",
      headers: source.body ? { ...headersFor(source), "content-type": "application/json" } : headersFor(source),
      ...(source.body ? { body: source.body!(account) } : {}),
      useTee: true,
    } as never,
    { responseMatches: matchesOf(source, account).map((match) => ({ ...match })), ...(bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : {}) } as never,
  )) as unknown as ZkFetchProof;
}

// Content validation is ours (`readingOfProof`), so the SDK's provider-hash validation is off; it still checks the
// attestor's signature, and the attestor's address is pinned in `attestedRead`.
const options = { dangerouslyDisableContentValidation: true } as never;

/**
 * The verifier that runs today on Vercel, unchanged: js-sdk imported the way src/duolingo-public.ts imports it on
 * this path. It is a named function so that a test can check the default dependencies hand out this one.
 */
export async function verifyWithReclaimBundled(proof: ZkFetchProof): Promise<boolean> {
  return (await (await import("@reclaimprotocol/js-sdk")).verifyProof(proof as never, options)).isVerified === true;
}

/** The verifier that runs today where Node loads the fetch itself (the worker, the scripts), unchanged. */
export async function verifyWithReclaimAtRuntime(proof: ZkFetchProof): Promise<boolean> {
  const { verifyProof } = (await import(/* turbopackIgnore: true */ "@reclaimprotocol/js-sdk")) as typeof import("@reclaimprotocol/js-sdk");
  return (await verifyProof(proof as never, options)).isVerified === true;
}

/** The verifier behind the switch: the signature against Viky's own pinned attestors, nothing over the network. */
export function verifyWithPin(proof: ZkFetchProof): Promise<boolean> {
  return localProofVerified(proof, allowedAttestors());
}

/**
 * The dependencies the routes and the passes use: the worker when configured, the local client otherwise. The
 * verifier is Reclaim's unless PROOF_VERIFIER says `local` (src/proof-verification.ts).
 */
export function reclaimAttestedReadDeps(): AttestedReadDeps {
  const local = proofVerifierMode() === "local";
  if (process.env.ZKFETCH_WORKER_URL?.trim()) {
    return { zkFetch: workerZkFetch, verify: local ? verifyWithPin : verifyWithReclaimBundled };
  }
  return { zkFetch: localZkFetch, verify: local ? verifyWithPin : verifyWithReclaimAtRuntime };
}

/** The fetch half alone, for the worker process: it returns the proof and leaves every check to whoever asked. */
export const localAttestedFetch = localZkFetch;
