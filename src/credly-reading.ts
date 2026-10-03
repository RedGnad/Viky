import type { Hex } from "viem";
import { attestedRead, AttestedReadError, reclaimAttestedReadDeps, type AttestedReadDeps, type AttestedReading } from "./attested-read";
import { CREDLY_ASSERTION, CREDLY_BADGE_PAGE } from "./attested-sources";
import {
  credlyAssertionUrl,
  credlyIssuedDaySeconds,
  credlyPairOfBadgeUrl,
  credlyPublicUrl,
  credlySubject,
  credlyTitleParts,
  isValidCredlyBadgeId,
  type CredlyPair,
} from "./credly-badge";
import type { ZkFetchProof } from "./duolingo-public";

/**
 * Reading a Credly badge, two ways (20 Sep 2026). Server only.
 *
 * A badge is two public things, so a reading is two readings of the same badge id: the Open Badges assertion, which
 * says the day and which certification it is, and the public page, which is the only place the holder's name is
 * published. Both halves are read every time, plainly for a screen and attested when money moves, from the patterns
 * in `src/attested-sources.ts`, so a screen can never say one thing and a proof another.
 *
 * What decides the certification is the pair of ids in the assertion, never a word: a title can be edited, reused or
 * translated, and the issuer's id and the badge class's id cannot. The pair is compared with the one the funder
 * signed by the subject, so a badge for another certification is simply another subject, and says so.
 */

export type CredlyReadErrorCode =
  /** Not a badge link or id at all. */
  | "INVALID_LINK"
  /** No badge answers to that id: the assertion answers 404 (measured 20 Sep 2026 on an id nobody has). */
  | "NO_BADGE"
  /** The pages answered and did not carry what a badge needs. */
  | "PROOF_INVALID"
  /** One of the two halves is about another badge. */
  | "PROOF_MISMATCH"
  | "FETCH_FAILED"
  /** The reading service runs older sources than this build, so nothing it fetches can be read here. */
  | "WORKER_OUT_OF_DATE"
  /** The month's limit of attested readings is reached: nothing was fetched (src/attested-calls.ts). */
  | "LIMIT_REACHED"
  /** A day\'s ceiling of attested readings is reached: nothing was fetched, and readings resume the next UTC day. */
  | "CEILING_REACHED"
  | "NOT_CONFIGURED";

export class CredlyReadError extends Error {
  constructor(
    readonly code: CredlyReadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "CredlyReadError";
  }
}

/** What a badge says, and nothing else its two pages carry. */
export type CredlyBadge = Readonly<{
  badgeId: string;
  /** The name the public page prints, kept only long enough to say whose badge it is. */
  name: string;
  /** The certification, as the funder's terms carry it: the issuer's id and the badge class's id. */
  pair: CredlyPair;
  /** Its title and its issuer as the page prints them, for a screen to show and never to judge by. */
  certificationTitle: string;
  issuer: string;
  /** The day it was issued, seconds at midnight UTC: the day the contract judges. */
  issuedDay: number;
  /** The person and the certification, hashed the way the funder signed them. */
  subject: Hex;
}>;

export type PlainFetch = (url: string, init: RequestInit) => Promise<Response>;

/** The pattern that says a page is a badge's own page at all, named so a refusal can tell absence from a new shape. */
const TITLE_PATTERN = CREDLY_BADGE_PAGE.matches[0].value;

/** A page's values, taken with the source's own patterns: one definition, used by both readings. */
function valuesOf(source: { matches: readonly { value: string }[] }, page: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of source.matches) {
    const found = new RegExp(match.value).exec(page);
    if (!found?.groups) continue;
    for (const [name, value] of Object.entries(found.groups)) if (value !== undefined) values[name] = value;
  }
  return values;
}

/**
 * The badge the two halves describe, or a typed refusal. Both halves must be about the badge that was asked for: a
 * page about somebody else's badge would otherwise hand its name to this reading.
 */
function badgeOf(badgeId: string, assertion: Record<string, string>, page: Record<string, string>): CredlyBadge {
  if (!assertion.badge || !assertion.assertion) throw new CredlyReadError("NO_BADGE", "No badge answers to that link");
  if (!assertion.assertion.toLowerCase().endsWith(badgeId)) throw new CredlyReadError("PROOF_MISMATCH", "That record is about another badge");
  const pair = credlyPairOfBadgeUrl(assertion.badge);
  if (!pair) throw new CredlyReadError("PROOF_INVALID", "That record did not say which certification it is");
  const issuedDay = credlyIssuedDaySeconds(assertion.issuedOn ?? "");
  if (issuedDay === undefined) throw new CredlyReadError("PROOF_INVALID", "That record did not carry the day it was issued");
  // The page is the only place the holder's name is published, and its own address says which badge it is about.
  if (!page.ogTitle) throw new CredlyReadError("PROOF_INVALID", "That badge's page did not carry what a reading needs");
  if (!(page.ogUrl ?? "").toLowerCase().endsWith(badgeId)) throw new CredlyReadError("PROOF_MISMATCH", "That page is about another badge");
  const parts = credlyTitleParts(page.ogTitle);
  if (!parts) throw new CredlyReadError("PROOF_INVALID", "That badge's page did not say whose it is");
  return {
    badgeId,
    name: parts.holder,
    pair,
    certificationTitle: parts.title,
    issuer: parts.issuer,
    issuedDay,
    subject: credlySubject(parts.holder, pair),
  };
}

async function readPage(url: string, accept: string, fetchImpl: PlainFetch): Promise<{ status: number; body: string }> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { accept, "user-agent": "Mozilla/5.0 (Viky)" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new CredlyReadError("FETCH_FAILED", "The badge could not be read right now", { cause: error });
  }
  return { status: response.status, body: await response.text().catch(() => "") };
}

/** The badge behind an id, read plainly. Every refusal is typed, and none of them guesses. */
export async function readCredlyBadge(badgeId: string, fetchImpl: PlainFetch = fetch): Promise<CredlyBadge> {
  if (!isValidCredlyBadgeId(badgeId)) throw new CredlyReadError("INVALID_LINK", "That is not a badge link");
  const id = badgeId.trim().toLowerCase();
  const assertion = await readPage(credlyAssertionUrl(id), "application/json", fetchImpl);
  // An unknown badge answers 404 here while its page answers 200 with no title at all, so this is what says it exists.
  if (assertion.status === 404) throw new CredlyReadError("NO_BADGE", "No badge answers to that link");
  if (assertion.status !== 200) throw new CredlyReadError("FETCH_FAILED", `Credly answered ${assertion.status}`);
  const page = await readPage(credlyPublicUrl(id), "text/html", fetchImpl);
  if (page.status !== 200) throw new CredlyReadError("FETCH_FAILED", `The badge's page answered ${page.status}`);
  return badgeOf(id, valuesOf(CREDLY_ASSERTION, assertion.body), valuesOf(CREDLY_BADGE_PAGE, page.body));
}

export type AttestedCredlyReading = CredlyBadge &
  Readonly<{
    /** The attestor's own time of the read: the later of the two halves. */
    observedAt: number;
    /** One reading, one use, from the assertion's proof. */
    nullifier: Hex;
    proofs: readonly ZkFetchProof[];
  }>;

/** How far apart the two halves of a reading may be taken, as for a Chess.com reading. */
const HALVES_APART_SECONDS = 5 * 60;

function credlyError(error: unknown, half: "assertion" | "page"): CredlyReadError {
  if (!(error instanceof AttestedReadError)) return new CredlyReadError("FETCH_FAILED", "The badge could not be read right now", { cause: error });
  switch (error.code) {
    case "INVALID_ACCOUNT":
      return new CredlyReadError("INVALID_LINK", "That is not a badge link", { cause: error });
    case "NOT_FOUND":
      // Only the assertion says which badges exist. The page answers 200 for an id nobody has, so a 404 there is
      // Credly failing rather than the badge missing, and it must never tell somebody their badge is gone.
      return half === "assertion"
        ? new CredlyReadError("NO_BADGE", "No badge answers to that link", { cause: error })
        : new CredlyReadError("FETCH_FAILED", "Credly could not give that badge's page right now", { cause: error });
    case "REFUSED":
    case "NOT_ACCEPTED":
      return new CredlyReadError("FETCH_FAILED", "Credly would not answer that reading", { cause: error });
    case "NO_MATCH":
      // A page with no title at all is what an unknown badge gives, so that one pattern means "no badge"; any other
      // pattern missing from a page that does carry one is a shape that changed, which is ours to fix.
      return error.pattern === TITLE_PATTERN
        ? new CredlyReadError("NO_BADGE", "No badge answers to that link", { cause: error })
        : new CredlyReadError("PROOF_INVALID", "That badge did not carry what a reading needs", { cause: error });
    default:
      return new CredlyReadError(error.code, error.message, { cause: error });
  }
}

/** The reading that can move money. Both pages are read again every time, so a badge taken down stops paying. */
export async function attestCredlyBadge(badgeId: string, deps: AttestedReadDeps = reclaimAttestedReadDeps()): Promise<AttestedCredlyReading> {
  if (!isValidCredlyBadgeId(badgeId)) throw new CredlyReadError("INVALID_LINK", "That is not a badge link");
  const id = badgeId.trim().toLowerCase();
  let assertion: AttestedReading;
  let page: AttestedReading;
  try {
    assertion = await attestedRead(CREDLY_ASSERTION.id, id, deps);
  } catch (error) {
    throw credlyError(error, "assertion");
  }
  try {
    page = await attestedRead(CREDLY_BADGE_PAGE.id, id, deps);
  } catch (error) {
    throw credlyError(error, "page");
  }
  if (Math.abs(page.observedAt - assertion.observedAt) > HALVES_APART_SECONDS) {
    throw new CredlyReadError("PROOF_MISMATCH", "The two halves of the reading were taken too far apart");
  }
  const badge = badgeOf(id, assertion.values, page.values);
  return {
    ...badge,
    observedAt: Math.max(assertion.observedAt, page.observedAt),
    nullifier: assertion.nullifier,
    proofs: [assertion.proof, page.proof],
  };
}
