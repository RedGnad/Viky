import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import { COUNTING_PASS_UTC, RECOUNT_PASS_UTC, SETTLING_PASS_UTC, type PassTime } from "./pass-schedule";
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
 * stores grow (src/gift-store.ts, src/milestone-store.ts). `refusals` is the first of them: rows written before it
 * existed carry an empty object, which is what they knew.
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
ALTER TABLE viky_passes ADD COLUMN IF NOT EXISTS refusals jsonb NOT NULL DEFAULT '{}'::jsonb;
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

/** Which of the schedules a run was (src/pass-schedule.ts). */
export type PassPlanName = "counting" | "settling" | "recount";

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
  /** Every refusal a reading met, by code, ours or not. A row written before this column existed has none. */
  refusals: Readonly<Record<string, number>>;
}>;

/** What a run hands the journal. The two counts are derived by `recordPass`, never given. */
export type NewPass = Omit<PassRow, "id" | "heldOurs" | "errors">;

export async function recordPass(pass: NewPass): Promise<void> {
  const errors = Object.values(pass.failures).reduce((total, count) => total + count, 0);
  await sql()`
    INSERT INTO viky_passes (plan, started_at, ended_at, readings_attempted, readings_succeeded, held_ours, errors, holds, failures, refusals)
    VALUES (${pass.plan}, ${pass.startedAt.toISOString()}, ${pass.endedAt.toISOString()}, ${pass.readingsAttempted}, ${pass.readingsSucceeded},
            ${pass.holds.length}, ${errors}, ${JSON.stringify(pass.holds)}, ${JSON.stringify(pass.failures)}, ${JSON.stringify(pass.refusals)})`;
}

/**
 * How far after its scheduled minute a run may start and still count as kept. **The platform's own rule, not ours.**
 *
 * It was a quarter of an hour, chosen on the belief that "a cron fires within a minute or so of its schedule". That
 * belief was wrong for the plan this runs on, and the page built on it accused us of something we had not done: on
 * 19 Sep 2026 the journal showed the settling pass as 0 runs of 2 on time, while both had run exactly as the platform
 * promises. Vercel's own documentation, read the same day: "Vercel may invoke these cron jobs at any point within the
 * specified hour to help distribute load across all accounts. For example, an expression like `0 8 * * *` could
 * trigger an invocation anytime between `08:00:00` and `08:59:59`." (For paid teams it is the minute; this is not one.)
 *
 * So what is measured here is the promise itself: the run began inside the clock hour its schedule names. That is not
 * the same as sixty minutes around the minute, and the difference matters: for `30 0 * * *` a run at 01:14 is 44
 * minutes from the minute and outside the hour that was promised, so it is late, while a run at 00:05 is early and
 * kept. What the delay actually was is reported beside it rather than hidden behind a pass mark, because a judge
 * reading a reliability figure deserves the number, and because the day we move to a plan that promises the minute,
 * the same figures will show it without a word changing.
 */

/** The scheduled moment of a pass as a second of the UTC day, from the schedule itself (src/pass-schedule.ts). */
function secondOfDay(time: PassTime): number {
  return time.hour * 3_600 + time.minute * 60;
}

export type PassPlanCounts = Readonly<{
  plan: PassPlanName;
  runs: number;
  /** Runs that began inside the hour their schedule names, which is what the platform undertakes to do. */
  onTime: number;
  /** How long after its scheduled minute the earliest and the latest run began, in seconds. */
  soonestSeconds: number;
  latestSeconds: number;
  /**
   * When this plan's own first recorded run began (the audit of 8 Oct 2026): a pass added later than the others has
   * fewer days behind it, and its runs are counted over its own days, never over the journal's.
   */
  firstAt: Date;
}>;

/** A plan with no recorded run is absent from `plans`: the journal counts runs, it does not invent them. */
export type PassesSince = Readonly<{ firstPassAt: Date | null; plans: readonly PassPlanCounts[] }>;

export async function passesSince(): Promise<PassesSince> {
  // Two different questions, and they are not the same arithmetic. Whether the promise was kept: did the run begin
  // inside the clock hour its schedule names. How late it was: how far its start sits from the scheduled minute,
  // counted the short way round the day, so a counting pass scheduled at 00:30 that started at 23:58 is 32 minutes
  // from its slot and not 1,408.
  const rows = await sql()`
    SELECT plan,
           count(*)::int AS runs,
           count(*) FILTER (WHERE started_hour = scheduled_hour)::int AS on_time,
           min(least(gap, 86400 - gap))::int AS soonest,
           max(least(gap, 86400 - gap))::int AS latest,
           min(started_at) AS plan_first_at,
           min(min(started_at)) OVER () AS first_pass_at
      FROM (
        SELECT plan,
               started_at,
               EXTRACT(HOUR FROM (started_at AT TIME ZONE 'UTC'))::int AS started_hour,
               CASE plan WHEN 'counting' THEN ${COUNTING_PASS_UTC.hour}::int WHEN 'settling' THEN ${SETTLING_PASS_UTC.hour}::int WHEN 'recount' THEN ${RECOUNT_PASS_UTC.hour}::int END AS scheduled_hour,
               abs(EXTRACT(EPOCH FROM (started_at AT TIME ZONE 'UTC')::time)
                   - CASE plan WHEN 'counting' THEN ${secondOfDay(COUNTING_PASS_UTC)}::int WHEN 'settling' THEN ${secondOfDay(SETTLING_PASS_UTC)}::int WHEN 'recount' THEN ${secondOfDay(RECOUNT_PASS_UTC)}::int END) AS gap
          FROM viky_passes
      ) started
     GROUP BY plan
     ORDER BY plan`;
  const first = rows[0]?.first_pass_at;
  return {
    firstPassAt: first === null || first === undefined ? null : first instanceof Date ? first : new Date(String(first)),
    plans: rows.map((row) => ({
      plan: String(row.plan) as PassPlanName,
      runs: Number(row.runs),
      onTime: Number(row.on_time),
      soonestSeconds: Number(row.soonest ?? 0),
      latestSeconds: Number(row.latest ?? 0),
      firstAt: row.plan_first_at instanceof Date ? row.plan_first_at : new Date(String(row.plan_first_at)),
    })),
  };
}

/** When the latest recorded run of each schedule began, or nothing for a schedule that has never run. */
export type LastPasses = Readonly<Record<PassPlanName, Date | null>>;

export async function lastPasses(): Promise<LastPasses> {
  const rows = await sql()`SELECT plan, max(started_at) AS last FROM viky_passes GROUP BY plan`;
  const last = (plan: PassPlanName): Date | null => {
    const value = rows.find((row) => String(row.plan) === plan)?.last;
    return value === null || value === undefined ? null : value instanceof Date ? value : new Date(String(value));
  };
  return { counting: last("counting"), settling: last("settling"), recount: last("recount") };
}

/**
 * What the latest counting pass since a moment left behind, for the second reading of the morning (src/daily-pass.ts,
 * `recountPass`): the gifts it held, and whether it stopped part way. Nothing when no counting pass began since then.
 *
 * `stopped` is read from the row itself: a reading refused for a reason of ours adds one error and holds its gift, so
 * a row with more errors than held gifts is a run that threw, and the gifts after the throw were never read.
 */
export type CountingLeft = Readonly<{ held: readonly string[]; stopped: boolean }>;

export async function countingSince(since: Date): Promise<CountingLeft | null> {
  const rows = await sql()`
    SELECT errors, holds FROM viky_passes
     WHERE plan = 'counting' AND started_at >= ${since.toISOString()}
     ORDER BY started_at DESC, id DESC LIMIT 1`;
  if (!rows[0]) return null;
  const holds = (typeof rows[0].holds === "string" ? JSON.parse(rows[0].holds) : rows[0].holds) as PassHold[];
  const held = [...new Set(holds.map((hold) => String(hold.giftId)))];
  return { held, stopped: Number(rows[0].errors) > held.length };
}

export type ReadingTotals = Readonly<{ attempted: number; succeeded: number }>;

/** Every reading the recorded passes asked for, and every one that answered. */
export async function readingTotals(): Promise<ReadingTotals> {
  const rows = await sql()`
    SELECT coalesce(sum(readings_attempted), 0)::int AS attempted, coalesce(sum(readings_succeeded), 0)::int AS succeeded
      FROM viky_passes`;
  return { attempted: Number(rows[0]?.attempted ?? 0), succeeded: Number(rows[0]?.succeeded ?? 0) };
}

/** A refusal a reading met, by the code the contract or the source gave it, and how many times. */
export type RefusalCount = Readonly<{ code: string; times: number }>;

/**
 * Every refusal the recorded passes met, by code, most frequent first.
 *
 * It answers the question the other figures leave open: a morning where nothing was credited was either a quiet
 * morning or a morning of refusals, and until this column existed the journal could not tell them apart (the audit of
 * 18 Sep, gap a). The codes are the contract's and the sources' own words, counted and never translated.
 */
export async function refusalsByCode(): Promise<readonly RefusalCount[]> {
  const rows = await sql()`
    SELECT code, sum(times)::int AS times
      FROM viky_passes, jsonb_each_text(refusals) AS refusal(code, times_text),
           LATERAL (SELECT times_text::int AS times) counted
     GROUP BY code
     ORDER BY times DESC, code`;
  return rows.map((row) => ({ code: String(row.code), times: Number(row.times) }));
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
