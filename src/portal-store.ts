import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";
import { ACCOUNT_ONLY_MARK, countryInWords, isPortalId, resultsProblem, type PortalExtract, type PortalProves, type ResultsExtract } from "./university-shown";
import { isAgentVersion, type WitnessPin } from "./witness-portal";

/**
 * The student portals Viky has proved, one row each (D165). Not the 11,882 shells of the Reclaim directory: a row is
 * written only once a provider has been registered on that portal from a real student account and a proof has come
 * back with the field the row names. The chooser's "Which university?" searches this table and nothing else, so a
 * funder can only pick a portal somebody has actually shown.
 *
 * A row pins what a proof for that portal must be: the Reclaim provider by id and version, its one request by hash,
 * and the field and pattern that mean enrolled. `proven_at` and `proven_by` say when and by which operator account.
 *
 * The results page is a second extraction on the same row (`results`, D174): its own provider and request, the
 * field that says passed, the field that carries the grade and its scale, and the year's field when the page dates
 * itself. It is written by `pnpm portal:results` once a proof has come back from that page too, and a row without
 * it takes no gift on the year or on a grade.
 */

export const PORTAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_portals (
  portal_id text PRIMARY KEY,
  name text NOT NULL,
  university text NOT NULL,
  country text NOT NULL,
  provider_id text NOT NULL,
  provider_version text NOT NULL,
  request_hash text NOT NULL,
  login_url text NOT NULL,
  extract jsonb NOT NULL,
  proven_at timestamptz NOT NULL,
  proven_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE viky_portals ADD COLUMN IF NOT EXISTS results jsonb;
ALTER TABLE viky_portals ADD COLUMN IF NOT EXISTS unverified boolean NOT NULL DEFAULT false;
-- What the portal proves (D267): 'enrolment', its status for the year, or 'account', a signed-in student account alone.
ALTER TABLE viky_portals ADD COLUMN IF NOT EXISTS proves text NOT NULL DEFAULT 'enrolment';
-- How a proof from the portal is verified (D311): 'tee', the SDK with the enclave's attestation, or 'witness', a Reclaim
-- AI provider verified by the pinned witness's signature on the portal's domain, and, once pinned, its pattern.
ALTER TABLE viky_portals ADD COLUMN IF NOT EXISTS verification text NOT NULL DEFAULT 'tee';
ALTER TABLE viky_portals ADD COLUMN IF NOT EXISTS witness_domain text;
ALTER TABLE viky_portals ADD COLUMN IF NOT EXISTS pin jsonb;
-- A first proof from a witness portal with no pin yet (D311): checked on what is sure, held, never paid alone, until the
-- operator reads what the pattern read and pins the portal (or refuses, in the person's words).
CREATE TABLE IF NOT EXISTS viky_portal_reviews (
  session_id text PRIMARY KEY,
  portal_id text NOT NULL,
  gift_id text NOT NULL,
  account text NOT NULL,
  provider_version text NOT NULL,
  reading jsonb NOT NULL,
  proofs jsonb NOT NULL,
  observed_at bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS viky_portal_reviews_gift ON viky_portal_reviews (gift_id, created_at DESC);
`;

let executor: SqlExecutor | undefined;

export function configurePortalStore(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

export async function ensurePortalSchema(): Promise<void> {
  for (const statement of PORTAL_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

export type Portal = Readonly<{
  portalId: string;
  /** How the chooser names it: "UCAD, portail étudiant". */
  name: string;
  university: string;
  /** Two letters, the country the university is in, for the corridor's own reading of the list. */
  country: string;
  providerId: string;
  providerVersion: string;
  requestHash: string;
  loginUrl: string;
  extract: PortalExtract;
  /** The results page, once proved from a student's session too; nothing while only enrolment has been (D174). */
  results: ResultsExtract | null;
  provenAt: Date;
  provenBy: string;
  /**
   * Defined from the portal's public pages and not yet from a student's session (D193): the extraction may miss, the
   * chooser says "unverified" beside the university, and the first real session confirms or corrects it.
   */
  unverified: boolean;
  /** What a proof from this portal carries (D267): the year's enrolment status, or a student account alone. */
  proves: PortalProves;
  /** How a proof from it is verified (D311): the enclave's attestation, or the pinned witness alone. */
  verification: "tee" | "witness";
  /** For a witness portal: the site's domain a proof must read, "ucad.sn". */
  witnessDomain: string | null;
  /** For a witness portal: what its first proof read, fixed by the operator; nothing until then. */
  pin: WitnessPin | null;
}>;

/** A witness portal whose first proof has not been read yet: its proofs are held, never paid alone. */
export function awaitingPin(portal: Portal): boolean {
  return portal.verification === "witness" && portal.pin === null;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;

/** What a row must be to be written at all: the guard on the operator's own command. */
type PortalInput = Omit<Portal, "provenAt" | "results" | "unverified" | "proves" | "verification" | "witnessDomain" | "pin"> & {
  results?: ResultsExtract | null;
  unverified?: boolean;
  proves?: PortalProves;
  verification?: "tee" | "witness";
  witnessDomain?: string | null;
  pin?: WitnessPin | null;
};

export function portalProblem(input: PortalInput): string | undefined {
  if (input.proves !== undefined && input.proves !== "enrolment" && input.proves !== "account") return "what the portal proves: enrolment or account";
  if (input.verification === "witness") {
    // A witness portal (D311): its domain always; its request, field and version only once its first proof is pinned.
    if (!input.witnessDomain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(input.witnessDomain)) return "the portal's domain, like ucad.sn";
    if (!isPortalId(input.portalId)) return "the portal id is lower case letters, digits and dashes, 64 at most";
    if (!input.name.trim() || !input.university.trim()) return "a name and a university";
    if (!/^[A-Z]{2}$/.test(input.country)) return "a country of two capital letters";
    if (!/^[0-9a-f-]{36}$/.test(input.providerId)) return "a Reclaim provider id, 36 characters";
    if (!/^https:\/\//.test(input.loginUrl)) return "the portal's sign-in address, https";
    if (!ADDRESS.test(input.provenBy)) return "the operator account that proved it";
    if (!input.pin) return undefined;
    if (!isAgentVersion(input.pin.providerVersion)) return "a pinned version the agent wrote, like 1.0.0-ai.1";
    if (!HASH.test(input.pin.specHash)) return "the pinned request spec's hash";
    if (!input.extract.field.trim() || !input.extract.matches.trim() || !input.extract.keeps.trim()) return "what is extracted: the field, what it must match, and what is kept in words";
    try {
      new RegExp(input.extract.matches);
    } catch {
      return "the pattern is not a valid regular expression";
    }
    return undefined;
  }
  if (!isPortalId(input.portalId)) return "the portal id is lower case letters, digits and dashes, 64 at most";
  if (!input.name.trim() || !input.university.trim()) return "a name and a university";
  if (!/^[A-Z]{2}$/.test(input.country)) return "a country of two capital letters";
  if (!/^[0-9a-f-]{36}$/.test(input.providerId)) return "a Reclaim provider id, 36 characters";
  if (!/^\d+\.\d+\.\d+$/.test(input.providerVersion)) return "a provider version like 1.0.0";
  if (!HASH.test(input.requestHash)) return "the request hash, 32 bytes of hex";
  if (!/^https:\/\//.test(input.loginUrl)) return "the portal's sign-in address, https";
  if (!input.extract.field.trim() || !input.extract.matches.trim() || !input.extract.keeps.trim()) return "what is extracted: the field, what it must match, and what is kept in words";
  try {
    new RegExp(input.extract.matches);
  } catch {
    return "the pattern is not a valid regular expression";
  }
  if (!ADDRESS.test(input.provenBy)) return "the operator account that proved it";
  if (input.results !== undefined && input.results !== null) {
    const problem = resultsProblem(input.results);
    if (problem) return `for the results page, ${problem}`;
    if (input.results.requestHash.toLowerCase() === input.requestHash.toLowerCase()) return "a results request that is not the enrolment's own";
  }
  return undefined;
}

/**
 * Writes a proved portal, or proves it again. The results extraction is kept when the command does not name one:
 * proving enrolment a second time must not undo the results page proved the first time.
 */
export async function savePortal(given: PortalInput & { provenAt?: Date }): Promise<void> {
  // Writing a witness row again must not undo its pin (D311): what the pin fixed stays, whatever the register says.
  const pinned = given.verification === "witness" && !given.pin ? await loadPortal(given.portalId) : null;
  const input = pinned?.pin
    ? { ...given, pin: pinned.pin, extract: pinned.extract, proves: pinned.proves, providerVersion: pinned.providerVersion, requestHash: pinned.requestHash, provenBy: pinned.provenBy, provenAt: pinned.provenAt, unverified: false }
    : given;
  const problem = portalProblem(input);
  if (problem) throw new Error(`A portal row needs ${problem}`);
  const results = input.results ? JSON.stringify(normaliseResults(input.results)) : null;
  await sql()`
    INSERT INTO viky_portals (portal_id, name, university, country, provider_id, provider_version, request_hash, login_url, extract, results, proven_at, proven_by, unverified, proves, verification, witness_domain, pin)
    VALUES (${input.portalId}, ${input.name.trim()}, ${input.university.trim()}, ${input.country}, ${input.providerId}, ${input.providerVersion}, ${input.requestHash.toLowerCase()},
            ${input.loginUrl}, ${JSON.stringify(input.extract)}::jsonb, ${results}::jsonb, ${(input.provenAt ?? new Date()).toISOString()}, ${input.provenBy.toLowerCase()}, ${input.unverified === true}, ${input.proves ?? "enrolment"},
            ${input.verification ?? "tee"}, ${input.witnessDomain ?? null}, ${input.pin ? JSON.stringify(input.pin) : null}::jsonb)
    ON CONFLICT (portal_id) DO UPDATE SET
      name = EXCLUDED.name, university = EXCLUDED.university, country = EXCLUDED.country, provider_id = EXCLUDED.provider_id,
      provider_version = EXCLUDED.provider_version, request_hash = EXCLUDED.request_hash, login_url = EXCLUDED.login_url,
      extract = EXCLUDED.extract, results = COALESCE(EXCLUDED.results, viky_portals.results), proven_at = EXCLUDED.proven_at, proven_by = EXCLUDED.proven_by,
      unverified = EXCLUDED.unverified, proves = EXCLUDED.proves, verification = EXCLUDED.verification, witness_domain = EXCLUDED.witness_domain,
      pin = COALESCE(EXCLUDED.pin, viky_portals.pin)`;
}

/** Writes the results page of a portal already proved for enrolment (D174). False when no such portal exists. */
export async function saveResults(portalId: string, results: ResultsExtract): Promise<boolean> {
  const portal = await loadPortal(portalId);
  if (!portal) return false;
  const problem = portalProblem({ ...portal, results });
  if (problem) throw new Error(`A portal row needs ${problem}`);
  await sql()`UPDATE viky_portals SET results = ${JSON.stringify(normaliseResults(results))}::jsonb WHERE portal_id = ${portalId}`;
  return true;
}

function normaliseResults(results: ResultsExtract): ResultsExtract {
  return { ...results, requestHash: results.requestHash.toLowerCase() };
}

function toResults(value: unknown): ResultsExtract | null {
  if (value === null || value === undefined) return null;
  const parsed = (typeof value === "string" ? JSON.parse(value) : value) as ResultsExtract;
  return resultsProblem(parsed) ? null : parsed;
}

function toPortal(row: Record<string, unknown>): Portal {
  const extract = (typeof row.extract === "string" ? JSON.parse(row.extract) : row.extract) as PortalExtract;
  return {
    portalId: String(row.portal_id),
    name: String(row.name),
    university: String(row.university),
    country: String(row.country),
    providerId: String(row.provider_id),
    providerVersion: String(row.provider_version),
    requestHash: String(row.request_hash),
    loginUrl: String(row.login_url),
    extract: { field: String(extract.field), matches: String(extract.matches), keeps: String(extract.keeps) },
    results: toResults(row.results),
    provenAt: new Date(String(row.proven_at)),
    provenBy: String(row.proven_by),
    unverified: row.unverified === true,
    proves: row.proves === "account" ? "account" : "enrolment",
    verification: row.verification === "witness" ? "witness" : "tee",
    witnessDomain: row.witness_domain === null || row.witness_domain === undefined ? null : String(row.witness_domain),
    pin: toPin(row.pin),
  };
}

function toPin(value: unknown): WitnessPin | null {
  if (value === null || value === undefined) return null;
  const pin = (typeof value === "string" ? JSON.parse(value) : value) as WitnessPin;
  return typeof pin.specHash === "string" && typeof pin.url === "string" ? pin : null;
}

/** Pins a witness portal from its first proof, with what the operator read it proves and the field that says it (D311). */
export async function pinPortal(portalId: string, input: { pin: WitnessPin; extract: PortalExtract; proves: PortalProves; operator: string }): Promise<boolean> {
  const portal = await loadPortal(portalId);
  if (!portal || portal.verification !== "witness") return false;
  const next = { ...portal, pin: input.pin, extract: input.extract, proves: input.proves, providerVersion: input.pin.providerVersion, requestHash: input.pin.specHash, provenBy: input.operator };
  const problem = portalProblem(next);
  if (problem) throw new Error(`A pinned portal needs ${problem}`);
  await sql()`
    UPDATE viky_portals
       SET pin = ${JSON.stringify(input.pin)}::jsonb, extract = ${JSON.stringify(input.extract)}::jsonb, proves = ${input.proves},
           provider_version = ${input.pin.providerVersion}, request_hash = ${input.pin.specHash.toLowerCase()}, proven_by = ${input.operator.toLowerCase()}, proven_at = now(), unverified = false
     WHERE portal_id = ${portalId}`;
  return true;
}

export type PortalReview = Readonly<{
  sessionId: string;
  portalId: string;
  giftId: string;
  account: string;
  providerVersion: string;
  reading: Readonly<Record<string, unknown>>;
  proofs: unknown;
  observedAt: number;
  status: "pending" | "pinned" | "refused";
  reason: string | null;
}>;

function toReview(row: Record<string, unknown>): PortalReview {
  const json = (value: unknown) => (typeof value === "string" ? JSON.parse(value) : value);
  const status = row.status === "pinned" || row.status === "refused" ? row.status : "pending";
  return {
    sessionId: String(row.session_id),
    portalId: String(row.portal_id),
    giftId: String(row.gift_id),
    account: String(row.account),
    providerVersion: String(row.provider_version),
    reading: json(row.reading) as Record<string, unknown>,
    proofs: json(row.proofs),
    observedAt: Number(row.observed_at),
    status,
    reason: row.reason === null || row.reason === undefined ? null : String(row.reason),
  };
}

/** Holds a first proof for review. False when that session is already held: a proof is held once. */
export async function holdForReview(input: Omit<PortalReview, "status" | "reason">): Promise<boolean> {
  const rows = await sql()`
    INSERT INTO viky_portal_reviews (session_id, portal_id, gift_id, account, provider_version, reading, proofs, observed_at)
    VALUES (${input.sessionId}, ${input.portalId}, ${input.giftId}, ${input.account.toLowerCase()}, ${input.providerVersion}, ${JSON.stringify(input.reading)}::jsonb, ${JSON.stringify(input.proofs)}::jsonb, ${input.observedAt})
    ON CONFLICT (session_id) DO NOTHING
    RETURNING session_id`;
  return rows.length > 0;
}

export async function loadReview(sessionId: string): Promise<PortalReview | null> {
  const rows = await sql()`SELECT * FROM viky_portal_reviews WHERE session_id = ${sessionId}`;
  return rows[0] ? toReview(rows[0]) : null;
}

/** The latest review of a gift, for its page: pending says "checked within a day", refused says why. */
export async function latestReviewOf(giftId: string): Promise<PortalReview | null> {
  const rows = await sql()`SELECT * FROM viky_portal_reviews WHERE gift_id = ${giftId} ORDER BY created_at DESC LIMIT 1`;
  return rows[0] ? toReview(rows[0]) : null;
}

export async function pendingReviews(): Promise<readonly PortalReview[]> {
  const rows = await sql()`SELECT * FROM viky_portal_reviews WHERE status = 'pending' ORDER BY created_at LIMIT 100`;
  return rows.map(toReview);
}

/** Closes a review, once: the proofs are dropped with it, since they carry one person's account. */
export async function decideReview(sessionId: string, status: "pinned" | "refused", reason: string | null): Promise<boolean> {
  const rows = await sql()`
    UPDATE viky_portal_reviews SET status = ${status}, reason = ${reason}, decided_at = now(), proofs = 'null'::jsonb
     WHERE session_id = ${sessionId} AND status = 'pending'
     RETURNING session_id`;
  return rows.length > 0;
}

/** How many witness portals are listed and how many carry a pin, for the judges' page. */
export async function witnessPortalCounts(): Promise<{ listed: number; pinned: number } | null> {
  try {
    const rows = await sql()`SELECT count(*)::int AS listed, count(pin)::int AS pinned FROM viky_portals WHERE verification = 'witness'`;
    return { listed: Number(rows[0]?.listed ?? 0), pinned: Number(rows[0]?.pinned ?? 0) };
  } catch {
    return null;
  }
}

export async function loadPortal(portalId: string): Promise<Portal | null> {
  if (!isPortalId(portalId)) return null;
  const rows = await sql()`SELECT * FROM viky_portals WHERE portal_id = ${portalId}`;
  return rows[0] ? toPortal(rows[0]) : null;
}

/**
 * The portal a proof was read with, by the request it made: how a proof names its portal without saying so. Either
 * of its two pages answers, the enrolment's request or the results page's (D174).
 */
export async function portalByRequestHash(requestHash: string): Promise<Portal | null> {
  const hash = requestHash.trim().toLowerCase();
  if (!HASH.test(hash)) return null;
  const rows = await sql()`SELECT * FROM viky_portals WHERE request_hash = ${hash} OR results->>'requestHash' = ${hash} LIMIT 1`;
  return rows[0] ? toPortal(rows[0]) : null;
}

/** Which of a portal's two pages a request was, for the operator's own reading of a proof. */
export function pageOfRequest(portal: Portal, requestHash: string): "enrolment" | "results" | null {
  const hash = requestHash.trim().toLowerCase();
  if (portal.requestHash.toLowerCase() === hash) return "enrolment";
  if (portal.results && portal.results.requestHash.toLowerCase() === hash) return "results";
  return null;
}

/** The words as they will be searched on: trimmed, with the two characters a pattern would read as its own removed. */
function searchWords(words: string): string {
  return words.replace(/[%_]/g, "").trim();
}

/** Whether words are enough to search on: two characters at least once the pattern characters are gone, eighty at most. */
export function isValidPortalSearch(words: string): boolean {
  const cleaned = searchWords(words);
  return cleaned.length >= 2 && cleaned.length <= 80;
}

/** The portals whose name, university or country carries the words, twenty at most, by name. */
export async function searchPortals(words: string): Promise<readonly Portal[]> {
  if (!isValidPortalSearch(words)) return [];
  const needle = `%${searchWords(words)}%`;
  const rows = await sql()`
    SELECT * FROM viky_portals
     WHERE name ILIKE ${needle} OR university ILIKE ${needle} OR country ILIKE ${needle}
     ORDER BY university, name
     LIMIT 20`;
  return rows.map(toPortal);
}

/**
 * A portal as the chooser lists it, in the shape every search of the sheet reads (`CertificationFound`): what is
 * pressed is the portal id, and the line reads "Université Cheikh Anta Diop, Senegal". The portal's sign-in address
 * is not sent: the funder chooses a university, and the person signs in from their own gift page.
 */
export function portalFound(portal: Portal): Readonly<{ pair: string; title: string; issuer: string; path: string }> {
  // What the portal proves is on the line the funder presses (D267): a portal that shows a student account and no
  // enrolment status says so. Whether anybody has shown it yet is not: that stays in the register and on the judges'
  // page, the founder's rule of 26 Sep 2026, which retires D193's mark from the flow.
  return { pair: portal.portalId, title: portal.proves === "account" ? `${portal.university}${ACCOUNT_ONLY_MARK}` : portal.university, issuer: countryInWords(portal.country), path: "" };
}

/**
 * Every portal, for "Which university?" asked as a list (D247): the table is small and it is ours, so the chooser
 * reads it whole and groups it by country. Two hundred at most, the day the list is long enough to need a bound.
 */
export async function listPortals(): Promise<readonly Portal[]> {
  const rows = await sql()`SELECT * FROM viky_portals ORDER BY country, university, name LIMIT 200`;
  return rows.map(toPortal);
}

/**
 * A portal as the list gives it: its university's name alone, its country, and the country's code to group and order
 * by. No "(unverified)" (the founder, 26 Sep 2026, D264): every university with a portal row is listed by its name, and
 * a portal nobody has exercised yet meets its test at the moment of the proof, through the reading's own failure state.
 */
export function portalListed(portal: Portal): Readonly<{ pair: string; title: string; issuer: string; country: string; proves: PortalProves }> {
  // What the portal proves travels with the name (D267) and is said in the gift's sentence, never on the list's line.
  return { pair: portal.portalId, title: portal.university, issuer: countryInWords(portal.country), country: portal.country, proves: portal.proves };
}

/**
 * How many universities are listed, and how many have been read at least once (D267): a portal counts as read when an
 * attested reading started or reached a gift made on it. For the judges' page, never for the flow.
 */
export async function portalsListedAndRead(): Promise<{ listed: number; read: number } | null> {
  try {
    const listed = await sql()`SELECT count(*)::int AS n FROM viky_portals`;
    const read = await sql()`
      SELECT count(DISTINCT g.portal)::int AS n
        FROM viky_milestone_readings r
        JOIN viky_milestone_gifts g ON g.gift_id = r.gift_id
       WHERE g.portal IS NOT NULL AND r.attested AND r.outcome IN ('reached', 'started')`;
    return { listed: Number(listed[0]?.n ?? 0), read: Number(read[0]?.n ?? 0) };
  } catch {
    return null;
  }
}

export async function countPortals(): Promise<number> {
  const rows = await sql()`SELECT count(*)::int AS n FROM viky_portals`;
  return Number(rows[0]?.n ?? 0);
}
