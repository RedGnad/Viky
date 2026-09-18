import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import { COUNTING_PASS_UTC, SETTLING_PASS_UTC, type PassTime } from "./pass-schedule";
import type { SqlExecutor } from "./proof-session-store";

/**
 * The journal of the keeper's passes (src/daily-pass.ts): one row per run, written when the run ends, whether it
 * finished or threw. It exists so the product can state one honest reliability figure instead of a promise: how many
 * passes ran, how many started at their scheduled minute, how many readings they took, and what became of the days a
 * pass held because the reading failed for a reason of ours.
 *
 * Every number is what the run itself counted while it ran. Nothing is estimated afterwards and nothing is
 * back-filled: the journal knows only the runs it recorded, and `passesSince` says from when.
 *
 * Later columns are added under the create, as `ALTER TABLE viky_passes ADD COLUMN IF NOT EXISTS`, the way the other
 * stores grow (src/gift-store.ts, src/milestone-store.ts). There is no later column yet.
 */

export const PASS_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_passes (
  id serial PRIMARY KEY,
  plan text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  readings_attempted integer NOT NULL,
  readings_succeeded integer NOT NULL,
  held_ours integer NOT NULL,
  errors integer NOT NULL,
  holds jsonb NOT NULL DEFAULT '[]'::jsonb,
  failures jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS viky_passes_plan ON viky_passes (plan, started_at DESC);
`;

let executor: SqlExecutor | undefined;

export function configurePassLog(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

export async function ensurePassSchema(): Promise<void> {
  for (const statement of PASS_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

/** Which of the two schedules a run was (src/pass-schedule.ts). */
export type PassPlanName = "counting" | "settling";

/** A gift a pass held for a reason of ours, and the UTC day number the hold was about. */
export type PassHold = Readonly<{ giftId: string; day: number }>;

/** One recorded run. */
export type PassRow = Readonly<{
  id: number;
  plan: PassPlanName;
  startedAt: Date;
  endedAt: Date;
  /** The gifts the run asked its reader about, and those that answered with a reading. A settling pass reads nothing. */
  readingsAttempted: number;
  readingsSucceeded: number;
  /** The number of `holds`, and the number of `failures`: they are counted from them, so they cannot disagree. */
  heldOurs: number;
  errors: number;
  holds: readonly PassHold[];
  /** The refusal codes that were ours, by code, plus the run's own failure when it threw part way. */
  failures: Readonly<Record<string, number>>;
}>;

/** What a run hands the journal. The two counts are derived by `recordPass`, never given. */
export type NewPass = Omit<PassRow, "id" | "heldOurs" | "errors">;

export async function recordPass(pass: NewPass): Promise<void> {
  const errors = Object.values(pass.failures).reduce((total, count) => total + count, 0);
  await sql()`
    INSERT INTO viky_passes (plan, started_at, ended_at, readings_attempted, readings_succeeded, held_ours, errors, holds, failures)
    VALUES (${pass.plan}, ${pass.startedAt.toISOString()}, ${pass.endedAt.toISOString()}, ${pass.readingsAttempted}, ${pass.readingsSucceeded},
            ${pass.holds.length}, ${errors}, ${JSON.stringify(pass.holds)}, ${JSON.stringify(pass.failures)})`;
}

/**
 * How far after its scheduled minute a run may start and still count as kept. Our choice, not the platform's: a cron
 * fires within a minute or so of its schedule and can be delayed further under load, so a quarter of an hour is wide
 * enough to forgive that delay and far too narrow for a missed slot to pass as a kept one.
 */
export const ON_TIME_TOLERANCE_SECONDS = 15 * 60;

/** The scheduled moment of a pass as a second of the UTC day, from the schedule itself (src/pass-schedule.ts). */
function secondOfDay(time: PassTime): number {
  return time.hour * 3_600 + time.minute * 60;
}

export type PassPlanCounts = Readonly<{ plan: PassPlanName; runs: number; onTime: number }>;

/** A plan with no recorded run is absent from `plans`: the journal counts runs, it does not invent them. */
export type PassesSince = Readonly<{ firstPassAt: Date | null; plans: readonly PassPlanCounts[] }>;

export async function passesSince(): Promise<PassesSince> {
  // The gap is circular over the day, so a counting pass scheduled at 00:30 that started at 23:58 is 32 minutes
  // from its slot, not 1,408.
  const rows = await sql()`
    SELECT plan,
           count(*)::int AS runs,
           count(*) FILTER (WHERE least(gap, 86400 - gap) <= ${ON_TIME_TOLERANCE_SECONDS}::int)::int AS on_time,
           min(min(started_at)) OVER () AS first_pass_at
      FROM (
        SELECT plan,
               started_at,
               abs(EXTRACT(EPOCH FROM (started_at AT TIME ZONE 'UTC')::time)
                   - CASE plan WHEN 'counting' THEN ${secondOfDay(COUNTING_PASS_UTC)}::int WHEN 'settling' THEN ${secondOfDay(SETTLING_PASS_UTC)}::int END) AS gap
          FROM viky_passes
      ) started
     GROUP BY plan
     ORDER BY plan`;
  const first = rows[0]?.first_pass_at;
  return {
    firstPassAt: first === null || first === undefined ? null : first instanceof Date ? first : new Date(String(first)),
    plans: rows.map((row) => ({ plan: String(row.plan) as PassPlanName, runs: Number(row.runs), onTime: Number(row.on_time) })),
  };
}

export type ReadingTotals = Readonly<{ attempted: number; succeeded: number }>;

/** Every reading the recorded passes asked for, and every one that answered. */
export async function readingTotals(): Promise<ReadingTotals> {
  const rows = await sql()`
    SELECT coalesce(sum(readings_attempted), 0)::int AS attempted, coalesce(sum(readings_succeeded), 0)::int AS succeeded
      FROM viky_passes`;
  return { attempted: Number(rows[0]?.attempted ?? 0), succeeded: Number(rows[0]?.succeeded ?? 0) };
}

/**
 * What became of the days the passes held. `lost` is the one the founder's rule wants to be zero: a day held because
 * our own reading failed, and settled as returned all the same.
 */
export type HeldDays = Readonly<{ caughtUp: number; lost: number; open: number }>;

export async function heldDays(): Promise<HeldDays> {
  // One row per distinct held day, not per hold: two passes in a row can hold the same day, and it is still one day.
  const rows = await sql()`
    SELECT count(*) FILTER (WHERE settled.outcome = 'earned')::int AS caught_up,
           count(*) FILTER (WHERE settled.outcome = 'returned')::int AS lost,
           count(*) FILTER (WHERE settled.outcome IS NULL)::int AS still_open
      FROM (
        SELECT DISTINCT hold->>'giftId' AS gift_id, (hold->>'day')::int AS day
          FROM viky_passes, jsonb_array_elements(holds) AS hold
      ) held
      LEFT JOIN viky_days settled ON settled.gift_id = held.gift_id AND settled.day = held.day`;
  return {
    caughtUp: Number(rows[0]?.caught_up ?? 0),
    lost: Number(rows[0]?.lost ?? 0),
    open: Number(rows[0]?.still_open ?? 0),
  };
}

/**
 * How many whole days the journal has been keeping records, counted from its first row. It lives here rather than in
 * the page so the clock is read outside a render, and it counts whole days only: a journal switched on this morning
 * has been speaking for no days yet, and saying "one day" of it would make one run look like a day of runs.
 */
export function daysSince(first: Date, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - first.getTime()) / 86_400_000));
}
