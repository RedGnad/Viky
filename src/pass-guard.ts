import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";

/**
 * A guard that lets something run once per stretch of time, claimed in the database so two instances cannot both run
 * it. Written for the milestones' frequent pass (src/frequent-pass.ts), whose address is public and carries no secret,
 * and used since 3 Oct 2026 for two other things that must happen once: a proof taken after a look that failed
 * (src/milestone-reading.ts) and an alert about the month's allowance of attested fetches (src/attested-calls.ts).
 */

const SCHEMA = `CREATE TABLE IF NOT EXISTS viky_pass_guard (
  name text PRIMARY KEY,
  ran_at timestamptz NOT NULL
)`;

let executor: SqlExecutor | undefined;
let ready: Promise<void> | undefined;

export function configurePassGuard(custom: SqlExecutor | undefined): void {
  executor = custom;
  ready = undefined;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

export function ensurePassGuardSchema(): Promise<void> {
  ready ??= (async () => {
    const strings = Object.assign([SCHEMA], { raw: [SCHEMA] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  })().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

/** Whether this call may run the pass: true once per `everySeconds`, whichever instance asks first. */
export async function claimPass(name: string, everySeconds: number, nowMs: number = Date.now()): Promise<boolean> {
  await ensurePassGuardSchema();
  const now = new Date(nowMs).toISOString();
  const before = new Date(nowMs - everySeconds * 1_000).toISOString();
  const rows = await sql()`
    INSERT INTO viky_pass_guard (name, ran_at) VALUES (${name}, ${now})
    ON CONFLICT (name) DO UPDATE SET ran_at = EXCLUDED.ran_at WHERE viky_pass_guard.ran_at < ${before}
    RETURNING name`;
  return rows.length > 0;
}

/** When a guarded pass last ran, or nothing when it never has. */
export async function lastGuardedPass(name: string): Promise<Date | null> {
  await ensurePassGuardSchema();
  const rows = await sql()`SELECT ran_at FROM viky_pass_guard WHERE name = ${name}`;
  const value = rows[0]?.ran_at;
  return value === null || value === undefined ? null : value instanceof Date ? value : new Date(String(value));
}
