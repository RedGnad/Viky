import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";
import { countryInWords, isPortalId, resultsProblem, scaleKey, type PortalExtract, type ResultsExtract } from "./university-shown";
import { isAgentVersion, type WitnessPin } from "./witness-portal";

/**
 * The universities Viky lists, and the Reclaim providers that read their student portals (D165, D313).
 *
 * A row is a university: its name, its country and the address its students sign in at. Since D313 (the founder, 28
 * Sep 2026) the list is the world's: every university of Reclaim's directory whose portal answers, written by
 * `pnpm portal:directory` from data/university-register.json.
 *
 * What reads the portal is a provider, one per sense: `enrolment` (staying enrolled) and `results` (the year passed, a
 * grade reached). A university may have neither: a funder can still choose it, a request goes to the operator with the
 * exact instruction for the provider to build, and the person reads that it is set up within two days. Each provider
 * carries how its proofs are verified: `tee`, a classic provider pinned by version and request hash, verified with the
 * enclave's attestation; or `witness`, a Reclaim AI provider verified by the pinned witness's signature on its own
 * domain (a university's results may live on another site than its enrolment, so the domain is the provider's), and
 * once its first proof has been read, on its pin. "A student account" is no longer a sense a gift can be made on.
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
ALTER TABLE viky_portals ADD COLUMN IF NOT EXISTS proves text NOT NULL DEFAULT 'enrolment';
ALTER TABLE viky_portals ADD COLUMN IF NOT EXISTS verification text NOT NULL DEFAULT 'tee';
ALTER TABLE viky_portals ADD COLUMN IF NOT EXISTS witness_domain text;
ALTER TABLE viky_portals ADD COLUMN IF NOT EXISTS pin jsonb;
-- Since D313 a row is the university alone: the columns of its one provider are no longer read, and a new row writes
-- them empty.
ALTER TABLE viky_portals ALTER COLUMN provider_id SET DEFAULT '';
ALTER TABLE viky_portals ALTER COLUMN provider_version SET DEFAULT '';
ALTER TABLE viky_portals ALTER COLUMN request_hash SET DEFAULT '';
ALTER TABLE viky_portals ALTER COLUMN extract SET DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS viky_portals_country ON viky_portals (country, university);
-- One provider per university and per sense (D313).
CREATE TABLE IF NOT EXISTS viky_portal_providers (
  portal_id text NOT NULL,
  sense text NOT NULL,
  provider_id text NOT NULL,
  verification text NOT NULL,
  domain text,
  provider_version text NOT NULL DEFAULT '',
  request_hash text NOT NULL DEFAULT '',
  extract jsonb,
  pin jsonb,
  added_by text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  pinned_at timestamptz,
  PRIMARY KEY (portal_id, sense)
);
CREATE INDEX IF NOT EXISTS viky_portal_providers_hash ON viky_portal_providers (request_hash);
-- What a row held before D312, carried over once: a classic provider proved for enrolment, and a results page. A row
-- that proved a student account alone carries nothing: that is not a sense any more.
INSERT INTO viky_portal_providers (portal_id, sense, provider_id, verification, provider_version, request_hash, extract, added_by, added_at)
  SELECT portal_id, 'enrolment', provider_id, 'tee', provider_version, request_hash, extract, proven_by, proven_at FROM viky_portals
   WHERE proves = 'enrolment' AND verification = 'tee' AND provider_id <> '' AND request_hash <> ''
  ON CONFLICT (portal_id, sense) DO NOTHING;
INSERT INTO viky_portal_providers (portal_id, sense, provider_id, verification, provider_version, request_hash, extract, added_by, added_at)
  SELECT portal_id, 'results', results->>'providerId', 'tee', results->>'providerVersion', lower(results->>'requestHash'), results - 'providerId' - 'providerVersion' - 'requestHash', proven_by, proven_at
    FROM viky_portals WHERE results IS NOT NULL
  ON CONFLICT (portal_id, sense) DO NOTHING;
-- A first proof from a witness provider with no pin yet (D312): checked on what is sure, held, never paid alone, until
-- the operator reads what the pattern read and pins the provider (or refuses, in the person's words).
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
ALTER TABLE viky_portal_reviews ADD COLUMN IF NOT EXISTS sense text NOT NULL DEFAULT 'enrolment';
CREATE INDEX IF NOT EXISTS viky_portal_reviews_gift ON viky_portal_reviews (gift_id, created_at DESC);
-- A university chosen for a sense it has no provider for (D313): the operator builds it within two days from the exact
-- instruction written here, and the person reads that it is set up within two days.
CREATE TABLE IF NOT EXISTS viky_provider_requests (
  portal_id text NOT NULL,
  sense text NOT NULL,
  instruction text NOT NULL,
  first_gift_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  built_at timestamptz,
  PRIMARY KEY (portal_id, sense)
);
-- When the operator was emailed about it (the founder, 28 Sep 2026): once per request.
ALTER TABLE viky_provider_requests ADD COLUMN IF NOT EXISTS alerted_at timestamptz;
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
    const text = statement.replace(/^\s*--.*$/gm, "").trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

export type PortalSense = "enrolment" | "results";
export const PORTAL_SENSES: readonly PortalSense[] = ["enrolment", "results"];

/** What a results page is read for: passed, the grade and its scale, the year when the page dates itself (D174). */
export type ResultsFields = Omit<ResultsExtract, "providerId" | "providerVersion" | "requestHash">;

type ProviderBase = Readonly<{
  portalId: string;
  providerId: string;
  /** How its proofs are verified: the enclave's attestation, or the pinned witness alone (D311, D312). */
  verification: "tee" | "witness";
  /** For a witness provider: the domain its proofs must read, "ucad.sn". */
  domain: string | null;
  /** A classic provider's pinned version and request hash; a witness provider's, once pinned. */
  providerVersion: string;
  requestHash: string;
  /** For a witness provider: what its first proof read, fixed by the operator; nothing until then. */
  pin: WitnessPin | null;
  addedBy: string;
}>;

export type EnrolmentProvider = ProviderBase & Readonly<{ sense: "enrolment"; extract: PortalExtract | null }>;
export type ResultsProvider = ProviderBase & Readonly<{ sense: "results"; extract: ResultsFields | null }>;
export type PortalProvider = EnrolmentProvider | ResultsProvider;

export type Portal = Readonly<{
  portalId: string;
  /** How the chooser names it: "UCAD, portail étudiant". */
  name: string;
  university: string;
  /** Two letters, the country the university is in. */
  country: string;
  /** Where its students sign in. */
  loginUrl: string;
  provenAt: Date;
  provenBy: string;
  /** Written from the directory and not yet from a student's session (D193): kept for the register, never printed. */
  unverified: boolean;
  enrolment: EnrolmentProvider | null;
  results: ResultsProvider | null;
}>;

/** A witness provider whose first proof has not been read yet: its proofs are held, never paid alone. */
export function awaitingPin(provider: PortalProvider): boolean {
  return provider.verification === "witness" && (provider.pin === null || provider.extract === null);
}

/** A results provider as the readers of a results page take it (src/university-shown.ts), or nothing before its pin. */
export function resultsExtractOf(provider: ResultsProvider | null): ResultsExtract | null {
  if (!provider || !provider.extract) return null;
  return { providerId: provider.providerId, providerVersion: provider.providerVersion, requestHash: provider.requestHash, ...provider.extract };
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const UUID = /^[0-9a-f-]{36}$/;
const DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;

export type PortalRowInput = Readonly<{
  portalId: string;
  name: string;
  university: string;
  country: string;
  loginUrl: string;
  provenBy: string;
  unverified?: boolean;
  provenAt?: Date;
}>;

/** What a university row must be to be written at all. */
export function rowProblem(input: PortalRowInput): string | undefined {
  if (!isPortalId(input.portalId)) return "the portal id is lower case letters, digits and dashes, 64 at most";
  if (!input.name.trim() || !input.university.trim()) return "a name and a university";
  if (!/^[A-Z]{2}$/.test(input.country)) return "a country of two capital letters";
  if (!/^https:\/\//.test(input.loginUrl)) return "the portal's sign-in address, https";
  if (!ADDRESS.test(input.provenBy)) return "the operator account that proved it";
  return undefined;
}

function extractProblem(extract: PortalExtract): string | undefined {
  if (!extract.field.trim() || !extract.matches.trim() || !extract.keeps.trim()) return "what is extracted: the field, what it must match, and what is kept in words";
  try {
    new RegExp(extract.matches);
  } catch {
    return "the pattern is not a valid regular expression";
  }
  return undefined;
}

/** What a provider must be to be written: a classic one whole, a witness one with its domain, and whole once pinned. */
export function providerProblem(provider: PortalProvider): string | undefined {
  if (!isPortalId(provider.portalId)) return "the portal id is lower case letters, digits and dashes, 64 at most";
  if (provider.sense !== "enrolment" && provider.sense !== "results") return "a sense: enrolment or results";
  if (!UUID.test(provider.providerId)) return "a Reclaim provider id, 36 characters";
  if (!ADDRESS.test(provider.addedBy)) return "the operator account that added it";
  if (provider.verification === "witness") {
    if (!provider.domain || !DOMAIN.test(provider.domain)) return "the domain its proofs read, like ucad.sn";
    if (!provider.pin) return provider.extract === null ? undefined : "a field to read only once the provider is pinned";
    if (!isAgentVersion(provider.pin.providerVersion)) return "a pinned version the agent wrote, like 1.0.0-ai.1";
    if (!HASH.test(provider.pin.specHash)) return "the pinned request spec's hash";
  } else if (provider.verification === "tee") {
    if (!/^\d+\.\d+\.\d+$/.test(provider.providerVersion)) return "a provider version like 1.0.0";
    if (!HASH.test(provider.requestHash)) return "the request hash, 32 bytes of hex";
  } else {
    return "how its proofs are verified: tee or witness";
  }
  if (!provider.extract) return "what is extracted";
  if (provider.sense === "enrolment") return extractProblem(provider.extract);
  const probe = resultsProblem({ providerId: provider.providerId, providerVersion: "1.0.0", requestHash: `0x${"0".repeat(64)}`, ...provider.extract });
  return probe ? `for the results page, ${probe}` : undefined;
}

/**
 * The shape an operator's command has always written (D165, D174): the university, and the classic providers proved
 * with a student in the same session, for enrolment and for the results page. Either may be missing since D313.
 */
export type PortalInput = PortalRowInput &
  Readonly<{
    providerId?: string;
    providerVersion?: string;
    requestHash?: string;
    extract?: PortalExtract;
    results?: ResultsExtract | null;
  }>;

function enrolmentOfInput(input: PortalInput): EnrolmentProvider | null {
  if (!input.providerId) return null;
  return {
    portalId: input.portalId,
    sense: "enrolment",
    providerId: input.providerId,
    verification: "tee",
    domain: null,
    providerVersion: input.providerVersion ?? "",
    requestHash: (input.requestHash ?? "").toLowerCase(),
    extract: input.extract ?? null,
    pin: null,
    addedBy: input.provenBy.toLowerCase(),
  };
}

function resultsOfInput(input: PortalInput): ResultsProvider | null {
  if (!input.results) return null;
  const { providerId, providerVersion, requestHash, ...fields } = input.results;
  return { portalId: input.portalId, sense: "results", providerId, verification: "tee", domain: null, providerVersion, requestHash: requestHash.toLowerCase(), extract: fields, pin: null, addedBy: input.provenBy.toLowerCase() };
}

export function portalProblem(input: PortalInput): string | undefined {
  const row = rowProblem(input);
  if (row) return row;
  const enrolment = enrolmentOfInput(input);
  const enrolmentProblem = enrolment ? providerProblem(enrolment) : undefined;
  if (enrolmentProblem) return enrolmentProblem;
  const results = resultsOfInput(input);
  if (results) {
    const problem = resultsProblem(input.results);
    if (problem) return `for the results page, ${problem}`;
    if (enrolment && results.requestHash === enrolment.requestHash) return "a results request that is not the enrolment's own";
  }
  return undefined;
}

/**
 * Writes a university, and the classic providers the command names. A provider already there is kept when the command
 * names none: proving enrolment again must not undo the results page proved the first time, and writing a row again
 * from the register must not undo what the operator pinned.
 */
export async function savePortal(input: PortalInput): Promise<void> {
  const problem = portalProblem(input);
  if (problem) throw new Error(`A portal row needs ${problem}`);
  await sql()`
    INSERT INTO viky_portals (portal_id, name, university, country, login_url, proven_at, proven_by, unverified)
    VALUES (${input.portalId}, ${input.name.trim()}, ${input.university.trim()}, ${input.country}, ${input.loginUrl},
            ${(input.provenAt ?? new Date()).toISOString()}, ${input.provenBy.toLowerCase()}, ${input.unverified === true})
    ON CONFLICT (portal_id) DO UPDATE SET
      name = EXCLUDED.name, university = EXCLUDED.university, country = EXCLUDED.country, login_url = EXCLUDED.login_url,
      proven_at = EXCLUDED.proven_at, proven_by = EXCLUDED.proven_by, unverified = EXCLUDED.unverified`;
  const enrolment = enrolmentOfInput(input);
  if (enrolment) await saveProvider(enrolment);
  const results = resultsOfInput(input);
  if (results) await saveProvider(results);
}

/**
 * Writes many universities at once, a few hundred a statement (the world's list, D313): rows alone, never a provider,
 * and a row already there keeps everything but its name, country and address. Returns how many were written.
 */
export async function savePortalRows(rows: readonly PortalRowInput[]): Promise<number> {
  for (const row of rows) {
    const problem = rowProblem(row);
    if (problem) throw new Error(`${row.portalId}: a portal row needs ${problem}`);
  }
  let written = 0;
  for (let at = 0; at < rows.length; at += 400) {
    const chunk = rows.slice(at, at + 400).map((row) => ({
      portal_id: row.portalId,
      name: row.name.trim(),
      university: row.university.trim(),
      country: row.country,
      login_url: row.loginUrl,
      proven_by: row.provenBy.toLowerCase(),
      unverified: row.unverified === true,
    }));
    const back = await sql()`
      INSERT INTO viky_portals (portal_id, name, university, country, login_url, proven_at, proven_by, unverified)
      SELECT portal_id, name, university, country, login_url, now(), proven_by, unverified
        FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb)
          AS r(portal_id text, name text, university text, country text, login_url text, proven_by text, unverified boolean)
      ON CONFLICT (portal_id) DO UPDATE SET
        name = EXCLUDED.name, university = EXCLUDED.university, country = EXCLUDED.country, login_url = EXCLUDED.login_url
      RETURNING portal_id`;
    written += back.length;
  }
  return written;
}

/** Writes one provider of a university, replacing the one of the same sense. */
export async function saveProvider(provider: PortalProvider): Promise<void> {
  const problem = providerProblem(provider);
  if (problem) throw new Error(`A provider needs ${problem}`);
  const rows = await sql()`SELECT 1 FROM viky_portals WHERE portal_id = ${provider.portalId}`;
  if (rows.length === 0) throw new Error(`no university ${provider.portalId}`);
  await sql()`
    INSERT INTO viky_portal_providers (portal_id, sense, provider_id, verification, domain, provider_version, request_hash, extract, pin, added_by)
    VALUES (${provider.portalId}, ${provider.sense}, ${provider.providerId}, ${provider.verification}, ${provider.domain},
            ${provider.providerVersion}, ${provider.requestHash.toLowerCase()}, ${provider.extract ? JSON.stringify(provider.extract) : null}::jsonb,
            ${provider.pin ? JSON.stringify(provider.pin) : null}::jsonb, ${provider.addedBy.toLowerCase()})
    ON CONFLICT (portal_id, sense) DO UPDATE SET
      provider_id = EXCLUDED.provider_id, verification = EXCLUDED.verification, domain = EXCLUDED.domain,
      provider_version = EXCLUDED.provider_version, request_hash = EXCLUDED.request_hash, extract = EXCLUDED.extract,
      pin = EXCLUDED.pin, added_by = EXCLUDED.added_by, added_at = now(), pinned_at = NULL`;
}

/** Writes the results page of a portal already written (D174). False when no such portal exists. */
export async function saveResults(portalId: string, results: ResultsExtract): Promise<boolean> {
  const portal = await loadPortal(portalId);
  if (!portal) return false;
  const problem = resultsProblem(results);
  if (problem) throw new Error(`A portal row needs for the results page, ${problem}`);
  if (portal.enrolment && portal.enrolment.requestHash === results.requestHash.toLowerCase()) throw new Error("A portal row needs a results request that is not the enrolment's own");
  const provider = resultsOfInput({ ...portal, results });
  if (provider) await saveProvider(provider);
  return true;
}

function json(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function toPin(value: unknown): WitnessPin | null {
  if (value === null || value === undefined) return null;
  const pin = json(value) as WitnessPin;
  return pin && typeof pin.specHash === "string" && typeof pin.url === "string" ? pin : null;
}

function toProvider(row: Record<string, unknown>): PortalProvider {
  const base = {
    portalId: String(row.portal_id),
    providerId: String(row.provider_id),
    verification: row.verification === "witness" ? ("witness" as const) : ("tee" as const),
    domain: row.domain === null || row.domain === undefined ? null : String(row.domain),
    providerVersion: String(row.provider_version ?? ""),
    requestHash: String(row.request_hash ?? ""),
    pin: toPin(row.pin),
    addedBy: String(row.added_by),
  };
  const extract = row.extract === null || row.extract === undefined ? null : json(row.extract);
  if (row.sense === "results") return { ...base, sense: "results", extract: extract as ResultsFields | null };
  const enrolment = extract as PortalExtract | null;
  return { ...base, sense: "enrolment", extract: enrolment ? { field: String(enrolment.field), matches: String(enrolment.matches), keeps: String(enrolment.keeps) } : null };
}

function toPortal(row: Record<string, unknown>, providers: readonly PortalProvider[]): Portal {
  const portalId = String(row.portal_id);
  const own = providers.filter((provider) => provider.portalId === portalId);
  return {
    portalId,
    name: String(row.name),
    university: String(row.university),
    country: String(row.country),
    loginUrl: String(row.login_url),
    provenAt: new Date(String(row.proven_at)),
    provenBy: String(row.proven_by),
    unverified: row.unverified === true,
    enrolment: (own.find((provider) => provider.sense === "enrolment") as EnrolmentProvider | undefined) ?? null,
    results: (own.find((provider) => provider.sense === "results") as ResultsProvider | undefined) ?? null,
  };
}

async function withProviders(rows: readonly Record<string, unknown>[]): Promise<Portal[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => String(row.portal_id));
  const providers = (await sql()`SELECT * FROM viky_portal_providers WHERE portal_id = ANY(${ids})`).map(toProvider);
  return rows.map((row) => toPortal(row, providers));
}

export async function loadPortal(portalId: string): Promise<Portal | null> {
  if (!isPortalId(portalId)) return null;
  const rows = await sql()`SELECT * FROM viky_portals WHERE portal_id = ${portalId}`;
  return (await withProviders(rows))[0] ?? null;
}

/** Pins a witness provider from its first proof, with the field or fields the operator read it by (D312). */
export async function pinProvider(portalId: string, sense: PortalSense, input: { pin: WitnessPin; extract: PortalExtract | ResultsFields; operator: string }): Promise<boolean> {
  const portal = await loadPortal(portalId);
  const provider = portal?.[sense];
  if (!provider || provider.verification !== "witness") return false;
  const next = { ...provider, pin: input.pin, extract: input.extract, providerVersion: input.pin.providerVersion, requestHash: input.pin.specHash.toLowerCase() } as PortalProvider;
  const problem = providerProblem(next);
  if (problem) throw new Error(`A pinned provider needs ${problem}`);
  await sql()`
    UPDATE viky_portal_providers
       SET pin = ${JSON.stringify(input.pin)}::jsonb, extract = ${JSON.stringify(input.extract)}::jsonb,
           provider_version = ${input.pin.providerVersion}, request_hash = ${input.pin.specHash.toLowerCase()}, pinned_at = now(), added_by = ${input.operator.toLowerCase()}
     WHERE portal_id = ${portalId} AND sense = ${sense}`;
  await sql()`UPDATE viky_portals SET unverified = false WHERE portal_id = ${portalId}`;
  return true;
}

export type PortalReview = Readonly<{
  sessionId: string;
  portalId: string;
  sense: PortalSense;
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
  const status = row.status === "pinned" || row.status === "refused" ? row.status : "pending";
  return {
    sessionId: String(row.session_id),
    portalId: String(row.portal_id),
    sense: row.sense === "results" ? "results" : "enrolment",
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
    INSERT INTO viky_portal_reviews (session_id, portal_id, sense, gift_id, account, provider_version, reading, proofs, observed_at)
    VALUES (${input.sessionId}, ${input.portalId}, ${input.sense}, ${input.giftId}, ${input.account.toLowerCase()}, ${input.providerVersion},
            ${JSON.stringify(input.reading)}::jsonb, ${JSON.stringify(input.proofs)}::jsonb, ${input.observedAt})
    ON CONFLICT (session_id) DO NOTHING
    RETURNING session_id`;
  return rows.length > 0;
}

export async function loadReview(sessionId: string): Promise<PortalReview | null> {
  const rows = await sql()`SELECT * FROM viky_portal_reviews WHERE session_id = ${sessionId}`;
  return rows[0] ? toReview(rows[0]) : null;
}

/** The latest review of a gift, for its page: pending says "checked within two days", refused says why. */
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

export type ProviderRequest = Readonly<{ portalId: string; sense: PortalSense; instruction: string; firstGiftId: string | null; createdAt: Date; builtAt: Date | null; alertedAt: Date | null }>;

function toRequest(row: Record<string, unknown>): ProviderRequest {
  return {
    portalId: String(row.portal_id),
    sense: row.sense === "results" ? "results" : "enrolment",
    instruction: String(row.instruction),
    firstGiftId: row.first_gift_id === null || row.first_gift_id === undefined ? null : String(row.first_gift_id),
    createdAt: new Date(String(row.created_at)),
    builtAt: row.built_at === null || row.built_at === undefined ? null : new Date(String(row.built_at)),
    alertedAt: row.alerted_at === null || row.alerted_at === undefined ? null : new Date(String(row.alerted_at)),
  };
}

/**
 * Asks the operator for a university's provider of one sense (D313), once: a second gift on the same university and
 * sense finds the request already there. A request marked built while no provider exists any more is asked again.
 */
export async function requestProvider(input: { portalId: string; sense: PortalSense; instruction: string; giftId: string | null }): Promise<ProviderRequest> {
  await sql()`
    INSERT INTO viky_provider_requests (portal_id, sense, instruction, first_gift_id)
    VALUES (${input.portalId}, ${input.sense}, ${input.instruction}, ${input.giftId})
    ON CONFLICT (portal_id, sense) DO UPDATE SET first_gift_id = COALESCE(viky_provider_requests.first_gift_id, EXCLUDED.first_gift_id), built_at = CASE
      WHEN EXISTS (SELECT 1 FROM viky_portal_providers p WHERE p.portal_id = EXCLUDED.portal_id AND p.sense = EXCLUDED.sense) THEN viky_provider_requests.built_at
      ELSE NULL END`;
  const rows = await sql()`SELECT * FROM viky_provider_requests WHERE portal_id = ${input.portalId} AND sense = ${input.sense}`;
  return toRequest(rows[0]);
}

export async function openRequests(): Promise<readonly ProviderRequest[]> {
  const rows = await sql()`SELECT * FROM viky_provider_requests WHERE built_at IS NULL ORDER BY created_at LIMIT 200`;
  return rows.map(toRequest);
}

export async function requestOf(portalId: string, sense: PortalSense): Promise<ProviderRequest | null> {
  const rows = await sql()`SELECT * FROM viky_provider_requests WHERE portal_id = ${portalId} AND sense = ${sense}`;
  return rows[0] ? toRequest(rows[0]) : null;
}

/** Notes that the operator was emailed about a request: once, the first time. */
export async function markRequestAlerted(portalId: string, sense: PortalSense): Promise<boolean> {
  const rows = await sql()`UPDATE viky_provider_requests SET alerted_at = now() WHERE portal_id = ${portalId} AND sense = ${sense} AND alerted_at IS NULL RETURNING portal_id`;
  return rows.length > 0;
}

export async function markRequestBuilt(portalId: string, sense: PortalSense): Promise<void> {
  await sql()`UPDATE viky_provider_requests SET built_at = now() WHERE portal_id = ${portalId} AND sense = ${sense} AND built_at IS NULL`;
}

/** For the judges' page: universities listed, providers by sense, witness providers and how many carry a pin, requests open. */
export async function providerCounts(): Promise<{ listed: number; enrolment: number; results: number; witness: number; pinned: number; requested: number } | null> {
  try {
    const listed = await sql()`SELECT count(*)::int AS n FROM viky_portals`;
    const providers = await sql()`
      SELECT count(*) FILTER (WHERE sense = 'enrolment')::int AS enrolment, count(*) FILTER (WHERE sense = 'results')::int AS results,
             count(*) FILTER (WHERE verification = 'witness')::int AS witness, count(*) FILTER (WHERE verification = 'witness' AND pin IS NOT NULL)::int AS pinned
        FROM viky_portal_providers`;
    const requests = await sql()`SELECT count(*)::int AS n FROM viky_provider_requests WHERE built_at IS NULL`;
    const one = providers[0] ?? {};
    return {
      listed: Number(listed[0]?.n ?? 0),
      enrolment: Number(one.enrolment ?? 0),
      results: Number(one.results ?? 0),
      witness: Number(one.witness ?? 0),
      pinned: Number(one.pinned ?? 0),
      requested: Number(requests[0]?.n ?? 0),
    };
  } catch {
    return null;
  }
}

/** The witness providers, each with its university, for the judges' page: "witness signature, no enclave" on each. */
export async function witnessProviders(): Promise<readonly (PortalProvider & { university: string; country: string })[] | null> {
  try {
    const rows = await sql()`
      SELECT p.*, u.university AS university_name, u.country AS university_country
        FROM viky_portal_providers p JOIN viky_portals u ON u.portal_id = p.portal_id
       WHERE p.verification = 'witness' ORDER BY u.country, u.university, p.sense LIMIT 500`;
    return rows.map((row) => ({ ...toProvider(row), university: String(row.university_name), country: String(row.university_country) }));
  } catch {
    return null;
  }
}

/**
 * The portal a proof was read with, by the request it made: how a proof names its portal without saying so. Either
 * of its two providers answers (D174).
 */
export async function portalByRequestHash(requestHash: string): Promise<Portal | null> {
  const hash = requestHash.trim().toLowerCase();
  if (!HASH.test(hash)) return null;
  const rows = await sql()`SELECT u.* FROM viky_portals u JOIN viky_portal_providers p ON p.portal_id = u.portal_id WHERE p.request_hash = ${hash} LIMIT 1`;
  return (await withProviders(rows))[0] ?? null;
}

/** Which of a portal's two providers a request was, for the operator's own reading of a proof. */
export function pageOfRequest(portal: Portal, requestHash: string): PortalSense | null {
  const hash = requestHash.trim().toLowerCase();
  if (portal.enrolment && portal.enrolment.requestHash.toLowerCase() === hash) return "enrolment";
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

/** The universities whose name, university or country carries the words, twenty at most, by name. */
export async function searchPortals(words: string): Promise<readonly Portal[]> {
  if (!isValidPortalSearch(words)) return [];
  const needle = `%${searchWords(words)}%`;
  const rows = await sql()`
    SELECT * FROM viky_portals
     WHERE name ILIKE ${needle} OR university ILIKE ${needle} OR country ILIKE ${needle}
     ORDER BY university, name
     LIMIT 20`;
  return withProviders(rows);
}

/**
 * A university as the chooser lists it, in the shape every search of the sheet reads (`CertificationFound`): what is
 * pressed is the portal id, and the line reads "Université Cheikh Anta Diop, Senegal". Nothing about which of its
 * providers exist: a university without one is chosen all the same, and its provider is built within two days (D313).
 */
export function portalFound(portal: Pick<Portal, "portalId" | "university" | "country">): Readonly<{ pair: string; title: string; issuer: string; path: string }> {
  return { pair: portal.portalId, title: portal.university, issuer: countryInWords(portal.country), path: "" };
}

/** The countries the list holds and how many universities each, for "Which university?" asked country first (D313). */
export async function portalCountries(): Promise<readonly { code: string; count: number }[]> {
  const rows = await sql()`SELECT country, count(*)::int AS n FROM viky_portals GROUP BY country ORDER BY country`;
  return rows.map((row) => ({ code: String(row.country), count: Number(row.n) }));
}

/** One country's universities, by name: the chooser reads a country at a time, since the world's list is thousands long. */
export async function portalsIn(country: string): Promise<readonly Portal[]> {
  if (!/^[A-Z]{2}$/.test(country)) return [];
  const rows = await sql()`SELECT * FROM viky_portals WHERE country = ${country} ORDER BY university, name LIMIT 5000`;
  return withProviders(rows);
}

/**
 * A university as the list gives it: its name alone, its country, the country's code to group and order by, and the
 * grading scale its results provider pins, when it pins one, so a grade is typed on it (the founder, 28 Sep 2026).
 */
export function portalListed(portal: Pick<Portal, "portalId" | "university" | "country"> & Partial<Pick<Portal, "results">>): Readonly<{ pair: string; title: string; issuer: string; country: string; scale: string | null }> {
  const scale = resultsExtractOf(portal.results ?? null)?.grade.scale;
  return { pair: portal.portalId, title: portal.university, issuer: countryInWords(portal.country), country: portal.country, scale: scale ? scaleKey(scale) : null };
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

/** How many gifts were made on a portal: a portal a gift names is never removed. */
export async function giftsOnPortal(portalId: string): Promise<number> {
  const rows = await sql()`SELECT count(*)::int AS n FROM viky_milestone_gifts WHERE portal = ${portalId}`;
  return Number(rows[0]?.n ?? 0);
}

/**
 * Removes a portal nobody can prove from, once no gift names it (the founder, 28 Sep 2026: a university whose portal
 * cannot be read is not offered). False when there was no such row. Its providers, requests and held reviews go with it.
 */
export async function removePortal(portalId: string): Promise<boolean> {
  if (!isPortalId(portalId)) return false;
  if ((await giftsOnPortal(portalId)) > 0) throw new Error(`${portalId} is named by a gift: it stays`);
  await sql()`DELETE FROM viky_portal_reviews WHERE portal_id = ${portalId}`;
  await sql()`DELETE FROM viky_portal_providers WHERE portal_id = ${portalId}`;
  await sql()`DELETE FROM viky_provider_requests WHERE portal_id = ${portalId}`;
  const rows = await sql()`DELETE FROM viky_portals WHERE portal_id = ${portalId} RETURNING portal_id`;
  return rows.length > 0;
}
