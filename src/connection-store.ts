import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";
import type { ConnectSource } from "./connect-state";

/**
 * The accounts a person connected to a gift (D188): one row per gift, the source, the source's own id of the
 * account, and the keys, sealed by the vault (src/connect-vault.ts) and never in the clear. What is not here: any
 * reading, any number, any proof. A reading is judged and dropped; the row holds what the next morning needs and
 * nothing of the mornings before.
 *
 * "Disconnect and erase" (rule 3) deletes the row: not a flag, a deletion. What survives it is on the chain and in
 * the journal, the day's verdicts, and the pseudonym of the account the gift bound, which is a hash.
 */

export const CONNECTION_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_connections (
  gift_id text PRIMARY KEY,
  source text NOT NULL,
  external_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  refreshed_at timestamptz
);
`;

let executor: SqlExecutor | undefined;

export function configureConnectionStore(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

export async function ensureConnectionSchema(): Promise<void> {
  for (const statement of CONNECTION_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

export type Connection = Readonly<{
  giftId: string;
  source: ConnectSource;
  /** The source's own id of the account: Fitbit's encoded user id, Strava's athlete id. */
  externalId: string;
  /** Sealed (src/connect-vault.ts); opened for one reading and dropped. */
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
  connectedAt: Date;
  refreshedAt: Date | null;
}>;

function toConnection(row: Record<string, unknown>): Connection {
  return {
    giftId: String(row.gift_id),
    source: row.source === "strava" ? "strava" : "fitbit",
    externalId: String(row.external_id),
    accessToken: String(row.access_token),
    refreshToken: String(row.refresh_token),
    expiresAt: new Date(String(row.expires_at)),
    scope: String(row.scope),
    connectedAt: new Date(String(row.connected_at)),
    refreshedAt: row.refreshed_at ? new Date(String(row.refreshed_at)) : null,
  };
}

/** Writes a connection, or replaces the gift's: connecting again is one row, never two. */
export async function saveConnection(input: Omit<Connection, "connectedAt" | "refreshedAt">): Promise<void> {
  await sql()`
    INSERT INTO viky_connections (gift_id, source, external_id, access_token, refresh_token, expires_at, scope)
    VALUES (${input.giftId}, ${input.source}, ${input.externalId}, ${input.accessToken}, ${input.refreshToken}, ${input.expiresAt.toISOString()}, ${input.scope})
    ON CONFLICT (gift_id) DO UPDATE SET
      source = EXCLUDED.source, external_id = EXCLUDED.external_id, access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token, expires_at = EXCLUDED.expires_at, scope = EXCLUDED.scope,
      connected_at = now(), refreshed_at = NULL`;
}

export async function loadConnection(giftId: string): Promise<Connection | null> {
  const rows = await sql()`SELECT * FROM viky_connections WHERE gift_id = ${giftId}`;
  return rows[0] ? toConnection(rows[0]) : null;
}

/** The keys rotated by a refresh, sealed again by the caller before they get here. */
export async function saveRefreshedTokens(giftId: string, tokens: Readonly<{ accessToken: string; refreshToken: string; expiresAt: Date }>): Promise<void> {
  await sql()`
    UPDATE viky_connections
       SET access_token = ${tokens.accessToken}, refresh_token = ${tokens.refreshToken}, expires_at = ${tokens.expiresAt.toISOString()}, refreshed_at = now()
     WHERE gift_id = ${giftId}`;
}

/** Erases the connection whole. True when a row was there. */
export async function eraseConnection(giftId: string): Promise<boolean> {
  const rows = await sql()`DELETE FROM viky_connections WHERE gift_id = ${giftId} RETURNING gift_id`;
  return rows.length === 1;
}

/** What a screen may know of a connection: that it exists, since when, and to which source. No id, no key. */
export function connectionInWords(connection: Connection | null): Readonly<{ connected: boolean; source: ConnectSource | null; since: string | null }> {
  return connection ? { connected: true, source: connection.source, since: connection.connectedAt.toISOString() } : { connected: false, source: null, since: null };
}
