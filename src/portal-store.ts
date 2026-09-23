import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";
import { countryInWords, isPortalId, type PortalExtract } from "./university-shown";

/**
 * The student portals Viky has proved, one row each (D165). Not the 11,882 shells of the Reclaim directory: a row is
 * written only once a provider has been registered on that portal from a real student account and a proof has come
 * back with the field the row names. The chooser's "Which university?" searches this table and nothing else, so a
 * funder can only pick a portal somebody has actually shown.
 *
 * A row pins what a proof for that portal must be: the Reclaim provider by id and version, its one request by hash,
 * and the field and pattern that mean enrolled. `proven_at` and `proven_by` say when and by which operator account.
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
  provenAt: Date;
  provenBy: string;
}>;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;

/** What a row must be to be written at all: the guard on the operator's own command. */
export function portalProblem(input: Omit<Portal, "provenAt">): string | undefined {
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
  return undefined;
}

export async function savePortal(input: Omit<Portal, "provenAt"> & { provenAt?: Date }): Promise<void> {
  const problem = portalProblem(input);
  if (problem) throw new Error(`A portal row needs ${problem}`);
  await sql()`
    INSERT INTO viky_portals (portal_id, name, university, country, provider_id, provider_version, request_hash, login_url, extract, proven_at, proven_by)
    VALUES (${input.portalId}, ${input.name.trim()}, ${input.university.trim()}, ${input.country}, ${input.providerId}, ${input.providerVersion}, ${input.requestHash.toLowerCase()},
            ${input.loginUrl}, ${JSON.stringify(input.extract)}::jsonb, ${(input.provenAt ?? new Date()).toISOString()}, ${input.provenBy.toLowerCase()})
    ON CONFLICT (portal_id) DO UPDATE SET
      name = EXCLUDED.name, university = EXCLUDED.university, country = EXCLUDED.country, provider_id = EXCLUDED.provider_id,
      provider_version = EXCLUDED.provider_version, request_hash = EXCLUDED.request_hash, login_url = EXCLUDED.login_url,
      extract = EXCLUDED.extract, proven_at = EXCLUDED.proven_at, proven_by = EXCLUDED.proven_by`;
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
    provenAt: new Date(String(row.proven_at)),
    provenBy: String(row.proven_by),
  };
}

export async function loadPortal(portalId: string): Promise<Portal | null> {
  if (!isPortalId(portalId)) return null;
  const rows = await sql()`SELECT * FROM viky_portals WHERE portal_id = ${portalId}`;
  return rows[0] ? toPortal(rows[0]) : null;
}

/** The portal a proof was read with, by the request it made: how a proof names its portal without saying so. */
export async function portalByRequestHash(requestHash: string): Promise<Portal | null> {
  const hash = requestHash.trim().toLowerCase();
  if (!HASH.test(hash)) return null;
  const rows = await sql()`SELECT * FROM viky_portals WHERE request_hash = ${hash} LIMIT 1`;
  return rows[0] ? toPortal(rows[0]) : null;
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
  return { pair: portal.portalId, title: portal.university, issuer: countryInWords(portal.country), path: "" };
}

export async function countPortals(): Promise<number> {
  const rows = await sql()`SELECT count(*)::int AS n FROM viky_portals`;
  return Number(rows[0]?.n ?? 0);
}
