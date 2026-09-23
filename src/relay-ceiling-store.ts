import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";

/**
 * Where the relayer's ceilings are counted (D204): one row per scope and window bucket, held in the database rather
 * than in a warm instance's memory, so every server counts the same actions and a new instance starts from the truth.
 * The increment is one statement, so two requests at once each see their own count.
 */

export const RELAY_CEILING_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_relay_counts (
  scope text NOT NULL,
  bucket timestamptz NOT NULL,
  count integer NOT NULL,
  PRIMARY KEY (scope, bucket)
);
`;

let executor: SqlExecutor | undefined;

export function configureRelayCeilingStore(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

export async function ensureRelayCeilingSchema(): Promise<void> {
  for (const statement of RELAY_CEILING_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

export type CountRow = Readonly<{ scope: string; bucket: Date }>;

export const countKey = (row: CountRow): string => `${row.scope}|${row.bucket.toISOString()}`;

/** Counts this action against every row at once, and answers each count as it stands with it. */
export async function countRelays(rows: readonly CountRow[]): Promise<Map<string, number>> {
  const scopes = rows.map((row) => row.scope);
  const buckets = rows.map((row) => row.bucket.toISOString());
  const answered = await sql()`
    INSERT INTO viky_relay_counts (scope, bucket, count)
    SELECT s, b::timestamptz, 1 FROM unnest(${scopes}::text[], ${buckets}::text[]) AS t(s, b)
    ON CONFLICT (scope, bucket) DO UPDATE SET count = viky_relay_counts.count + 1
    RETURNING scope, bucket, count`;
  const counts = new Map<string, number>();
  for (const row of answered) counts.set(countKey({ scope: String(row.scope), bucket: new Date(String(row.bucket)) }), Number(row.count));
  return counts;
}

/** Takes a refused action back out of the counts: only what the relayer was asked to pay for is counted. */
export async function uncountRelays(rows: readonly CountRow[]): Promise<void> {
  const scopes = rows.map((row) => row.scope);
  const buckets = rows.map((row) => row.bucket.toISOString());
  await sql()`
    UPDATE viky_relay_counts SET count = count - 1
    WHERE count > 0 AND (scope, bucket) IN (SELECT s, b::timestamptz FROM unnest(${scopes}::text[], ${buckets}::text[]) AS t(s, b))`;
}

/** Rows of windows long over, which nothing reads any more. */
export async function forgetRelayCountsBefore(moment: Date): Promise<void> {
  await sql()`DELETE FROM viky_relay_counts WHERE bucket < ${moment.toISOString()}::timestamptz`;
}
