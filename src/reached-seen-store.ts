import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";

/**
 * Which reached gifts each account has had its moment for (the founder, 29 Sep 2026). The moment a gift is reached is
 * played once, for the person it is for and for the funder, wherever they arrive next: a phone, then a laptop, sees it
 * once between them, which a device's own storage could not promise. One row per account and gift, written when the
 * moment is shown; "See it again" on the gift's page replays it without asking this table anything.
 */

const SCHEMA = `CREATE TABLE IF NOT EXISTS viky_reached_seen (
  account text NOT NULL,
  gift_id text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account, gift_id)
)`;

let executor: SqlExecutor | undefined;
let ready: Promise<void> | undefined;

export function configureReachedSeenStore(custom: SqlExecutor | undefined): void {
  executor = custom;
  ready = undefined;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

/** The table, made the first time it is needed in a process, so no deployment waits on a migration for it. */
export function ensureReachedSeenSchema(): Promise<void> {
  ready ??= (async () => {
    const strings = Object.assign([SCHEMA], { raw: [SCHEMA] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  })().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

/** Which of these gifts this account has already had the moment for. */
export async function reachedSeenOf(account: string, giftIds: readonly string[]): Promise<ReadonlySet<string>> {
  if (giftIds.length === 0) return new Set();
  await ensureReachedSeenSchema();
  const rows = await sql()`SELECT gift_id FROM viky_reached_seen WHERE account = ${account.toLowerCase()} AND gift_id = ANY(${[...giftIds]})`;
  return new Set(rows.map((row) => String(row.gift_id)));
}

/** The moment was shown to this account for this gift. A second write changes nothing. */
export async function markReachedSeen(account: string, giftId: string): Promise<void> {
  await ensureReachedSeenSchema();
  await sql()`INSERT INTO viky_reached_seen (account, gift_id) VALUES (${account.toLowerCase()}, ${giftId}) ON CONFLICT (account, gift_id) DO NOTHING`;
}
