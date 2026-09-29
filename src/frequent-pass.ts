import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import { liveMilestonePassDeps, milestonePass, type MilestonePassDeps, type MilestonePassLine } from "./milestone-pass";
import { runMilestoneReading } from "./milestone-reading";
import type { SqlExecutor } from "./proof-session-store";

/**
 * A pass over the milestones still climbing every five minutes, called from outside by a free scheduler
 * (cron-job.org, the founder, 29 Sep 2026), so a target reached in the afternoon is told within minutes rather than at
 * the next nightly pass. It reads and tells, nothing else: settling and sending back stay with the two nightly passes.
 *
 * Its address is public and carries no secret, so it guards itself: at most one pass every four minutes, claimed in the
 * database so two instances cannot both run one, and a call in between does nothing. Four and not five: the scheduler
 * calls every five minutes and a call can arrive a little early, which a five-minute guard would drop, leaving every
 * gift read every ten. Gifts are read one after another,
 * never in parallel, which is how Chess.com asks to be read. What a reading reaches is told with the table that tells
 * each gift's news once (`claimTelling`).
 */

export const FREQUENT_PASS_EVERY_SECONDS = 4 * 60;
/** A gift read this recently, by its open page, is not read again by this pass; the last pass's reading is older. */
export const FREQUENT_PASS_RECENT_SECONDS = 4 * 60;

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

/** The pass itself: every milestone still climbing, read one after another, and what is reached told. */
export function frequentMilestonePass(deps: MilestonePassDeps = frequentPassDeps()): Promise<MilestonePassLine[]> {
  return milestonePass(false, deps);
}

function frequentPassDeps(): MilestonePassDeps {
  const live = liveMilestonePassDeps();
  return {
    ...live,
    reach: (giftId) => runMilestoneReading({ giftId, purpose: "reach", recentSeconds: FREQUENT_PASS_RECENT_SECONDS }),
    // Creations left half made are the nightly passes' to complete.
    completeCreations: undefined,
  };
}
