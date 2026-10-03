import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import { claimPass } from "./pass-guard";
import type { SqlExecutor } from "./proof-session-store";

/**
 * The journal of what Viky asks of Reclaim, the count of the month's allowance, and the limit Viky holds itself to
 * (3 Oct 2026).
 *
 * Reclaim's free tier gives up to 100 attested fetches (zkFetch) and 25 verifications a month, more on request only,
 * and its dashboard shows no count of the fetches. Until this journal neither did Viky: a fetch that failed left no row
 * anywhere. On 30 Sep 2026 one gift whose plain look kept failing cost 114 fetches in five hours, and it was seen three
 * days later, in the reading service's logs.
 *
 * One row per fetch the app asks for, written where the fetch is made (the default dependencies of
 * src/attested-read.ts and src/duolingo-public.ts), whether it gave a proof or not. Reclaim's own client reports the
 * same two things to Reclaim: that a fetch started, then that it gave a proof or failed (@reclaimprotocol/zk-fetch
 * 1.1.0, `sendLogs`). Which of the two Reclaim counts against the allowance is not published. What was measured: on
 * 3 Oct 2026 the cycle stood at 126 fetches started and 68 proofs, and the next fetch gave its proof. So the count
 * the limit goes by is the proofs given; the fetches started are kept and shown beside it.
 *
 * Two rows for a proof asked of a person: one when its session is opened (app/api/proof/session/route.ts), because a
 * session that never comes back is deleted from its own table after a day, and one when the proof comes back from
 * Reclaim (app/api/proof/verify/route.ts), whatever Viky then makes of it. The second is what Reclaim's dashboard
 * counts ("Proofs"), as far as it can be told from here: it showed none while one session had been opened.
 *
 * Past the limit Viky sends nothing to Reclaim and says so (`ReclaimLimitReached`, the refusal `LIMIT_REACHED`). The
 * same refusal is given when Reclaim itself answers that the quota is used up.
 */

export const ATTESTED_CALLS_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_attested_calls (
  id serial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  source text NOT NULL,
  ok boolean NOT NULL,
  code text
);
ALTER TABLE viky_attested_calls ADD COLUMN IF NOT EXISTS ref text;
CREATE INDEX IF NOT EXISTS viky_attested_calls_at ON viky_attested_calls (at);
CREATE UNIQUE INDEX IF NOT EXISTS viky_attested_calls_ref ON viky_attested_calls (kind, ref) WHERE ref IS NOT NULL
`;

/** Reclaim's allowance for one cycle of the free tier, read on its pricing page and its dashboard on 3 Oct 2026. */
export const RECLAIM_ALLOWANCE = { fetches: 100, verifications: 25 } as const;

type Environment = Readonly<Record<string, string | undefined>>;

function wholeNumber(value: string | undefined): number | null {
  const text = value?.trim() ?? "";
  return /^\d{1,7}$/.test(text) ? Number(text) : null;
}

/**
 * The allowance in force: the free tier's, or what `RECLAIM_FETCH_ALLOWANCE` and `RECLAIM_VERIFICATION_ALLOWANCE` say
 * when Reclaim has granted more. Reclaim gives more on request only, and the day it does, a setting moves the limit
 * without a deployment of new code.
 */
export function reclaimAllowance(env: Environment = process.env): { fetches: number; verifications: number } {
  return {
    fetches: wholeNumber(env.RECLAIM_FETCH_ALLOWANCE) ?? RECLAIM_ALLOWANCE.fetches,
    verifications: wholeNumber(env.RECLAIM_VERIFICATION_ALLOWANCE) ?? RECLAIM_ALLOWANCE.verifications,
  };
}

/** The day of the month a cycle starts, at midnight UTC: the dashboard showed the cycle of 23 Sep to 24 Oct 2026. */
export const RECLAIM_CYCLE_DAY = 23;

/** The shares of an allowance at which the operator is told: half, four fifths, and all of it, which is the limit. */
export const RECLAIM_ALERT_AT = [0.5, 0.8, 1] as const;

/**
 * What was already spent in the cycle that began on 23 Sep 2026 when this journal began, counted on 3 Oct 2026: 126
 * fetches of which 68 gave a proof in the reading service's own logs, which start on 28 Sep at 20:40 UTC, and the two
 * readings of 23 and 24 Sep that the gifts' journal holds. A fetch that failed before 28 Sep 20:40 is in neither, so
 * this is a floor. One proof was asked of a person, on 27 Sep, and never came back. It counts for that cycle alone.
 */
export const BEFORE_THE_JOURNAL = { cycleFrom: "2026-09-23T00:00:00.000Z", started: 128, proved: 70, asked: 1, shown: 0 } as const;

let executor: SqlExecutor | undefined;
let ready: Promise<void> | undefined;

export function configureAttestedCalls(custom: SqlExecutor | undefined): void {
  executor = custom;
  ready = undefined;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

/** Production never runs a migration: the table is made by whoever writes or reads it first. */
export function ensureAttestedCallsSchema(): Promise<void> {
  ready ??= (async () => {
    for (const statement of ATTESTED_CALLS_SCHEMA.split(";")) {
      const text = statement.trim();
      if (!text) continue;
      const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
      await sql()(strings);
    }
  })().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

/** The cycle a moment falls in: from the 23rd at midnight UTC to the next 23rd. */
export function cycleOf(nowMs: number): { from: Date; until: Date } {
  const now = new Date(nowMs);
  const before = now.getUTCDate() < RECLAIM_CYCLE_DAY ? 1 : 0;
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - before, RECLAIM_CYCLE_DAY));
  return { from, until: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, RECLAIM_CYCLE_DAY)) };
}

export type CycleUse = Readonly<{
  from: string;
  until: string;
  /** Fetches asked of Reclaim in the cycle, and how many of them gave a proof: the limit goes by the proofs. */
  fetches: Readonly<{ started: number; proved: number; allowed: number }>;
  /** Proofs asked of people in the cycle, how many came back from Reclaim, which the limit goes by, and how many were verified. */
  verifications: Readonly<{ asked: number; shown: number; verified: number; allowed: number }>;
}>;

/** The cycle's use so far: the journal's rows, and what was spent before the journal began. */
export async function cycleUse(nowMs: number = Date.now(), env: Environment = process.env): Promise<CycleUse> {
  await ensureAttestedCallsSchema();
  const { from, until } = cycleOf(nowMs);
  const [counted] = await sql()`
    SELECT count(*) FILTER (WHERE kind = 'fetch')::int AS started,
           count(*) FILTER (WHERE kind = 'fetch' AND ok)::int AS proved,
           count(*) FILTER (WHERE kind = 'asked')::int AS asked,
           count(*) FILTER (WHERE kind = 'verification')::int AS shown,
           count(*) FILTER (WHERE kind = 'verification' AND ok)::int AS verified
      FROM viky_attested_calls
     WHERE at >= ${from.toISOString()} AND at < ${until.toISOString()}`;
  const before = from.toISOString() === BEFORE_THE_JOURNAL.cycleFrom ? BEFORE_THE_JOURNAL : { started: 0, proved: 0, asked: 0, shown: 0 };
  const allowed = reclaimAllowance(env);
  return {
    from: from.toISOString(),
    until: until.toISOString(),
    fetches: { started: Number(counted?.started ?? 0) + before.started, proved: Number(counted?.proved ?? 0) + before.proved, allowed: allowed.fetches },
    verifications: {
      asked: Number(counted?.asked ?? 0) + before.asked,
      shown: Number(counted?.shown ?? 0) + before.shown,
      verified: Number(counted?.verified ?? 0),
      allowed: allowed.verifications,
    },
  };
}

/** Which of the two limits the cycle has reached: the readings', counted on proofs given, and the proofs' of people. */
export function limitsOf(use: CycleUse): { readings: boolean; proofs: boolean } {
  return { readings: use.fetches.proved >= use.fetches.allowed, proofs: use.verifications.shown >= use.verifications.allowed };
}

/**
 * The limits right now. A count that cannot be read stops nothing: a reading is not refused because its journal did
 * not answer, and the failure is a line in the logs.
 */
export async function limitsNow(nowMs: number = Date.now(), read: (nowMs: number) => Promise<CycleUse> = cycleUse): Promise<{ readings: boolean; proofs: boolean }> {
  try {
    return limitsOf(await read(nowMs));
  } catch (error) {
    console.error(`reclaim limit not read: ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`);
    return { readings: false, proofs: false };
  }
}

/** The month's limit is reached: nothing was sent to Reclaim, or Reclaim itself answered that the quota is used up. */
export class ReclaimLimitReached extends Error {
  readonly code = "LIMIT_REACHED";

  constructor(
    readonly what: "readings" | "proofs",
    options?: { cause?: unknown },
  ) {
    super(what === "readings" ? "The month's limit of attested readings is reached" : "The month's limit of proofs is reached", options);
    this.name = "ReclaimLimitReached";
  }
}

/**
 * Whether a failure is Reclaim saying the quota is used up. What it answers on the path Viky uses today, an
 * application's own secret and the TEE, is not published and was never seen: on 3 Oct 2026 fetches still passed at 126
 * started. Two shapes are known and read here. Its coming client refuses a fetch with HTTP 402 or 429 and the words
 * "Builder zkFetch quota exceeded" (reclaimprotocol/zk-fetch, pull request 24, read on 3 Oct 2026). Its verification
 * client passes the backend's own sentence on when a session is refused (@reclaimprotocol/js-sdk, `InitSessionError`),
 * so any sentence that names a quota, a limit reached or a payment required is taken as that. A bare 429 is not: it is
 * what a platform answers when it asks to slow down.
 */
export function isReclaimQuotaRefusal(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  if (name === "BuilderQuotaExceededError") return true;
  const message = error instanceof Error ? error.message : String(error);
  if (/quota/i.test(message)) return true;
  // A platform that asks to slow down says "rate limit" or 429, and that is its own pace, not Reclaim's month.
  if (/\b429\b|rate.?limit|too many requests/i.test(message)) return false;
  return /payment required|\bHTTP 402\b|limit (was |has been |is )?(reached|exceeded)|exceeded (your|the|its) (monthly |plan )?(limit|allowance)/i.test(message);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "23 Sep 2026", in UTC, written the same on the server and in every browser. */
export function utcDayInWords(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * The cycle's count as the judges page says it: readings and proofs against their allowances, and the cycle's dates.
 * Every figure is the journal's at the moment the page is served.
 */
export function cycleInWords(use: CycleUse | null): string {
  if (!use) return "The cycle's count could not be read right now.";
  const { fetches, verifications } = use;
  return [
    `Cycle from ${utcDayInWords(use.from)} to ${utcDayInWords(use.until)}.`,
    `Readings: ${fetches.proved} of ${fetches.allowed} (attested fetches that gave a proof; ${fetches.started} were started).`,
    `Proofs shown by people: ${verifications.shown} of ${verifications.allowed} (${verifications.asked} asked, ${verifications.verified} verified).`,
  ].join(" ");
}

export type Alert = Readonly<{ subject: string; text: string }>;

/** The share of an allowance already reached, among those the operator is told at, or none below the first. */
export function shareReached(used: number, allowed: number): number | null {
  const reached = RECLAIM_ALERT_AT.filter((share) => used >= Math.ceil(allowed * share));
  return reached.length > 0 ? reached[reached.length - 1] : null;
}

/** The days of daily gifts that a reading could still count, and when the first of their windows closes (UTC seconds). */
export type DaysWaiting = Readonly<{ days: number; gifts: number; nearestEndsAt: number | null }>;

/** What the operator reads when a share of an allowance is reached. At the limit it says what is waiting. */
export function allowanceAlert(use: CycleUse, what: "fetches" | "verifications", waiting: DaysWaiting | null = null): Alert {
  const { fetches, verifications } = use;
  const atTheLimit = what === "fetches" ? fetches.proved >= fetches.allowed : verifications.shown >= verifications.allowed;
  const subject =
    what === "fetches"
      ? `Reclaim: ${atTheLimit ? "the limit is reached, " : ""}${fetches.proved} readings this cycle, of ${fetches.allowed}`
      : `Reclaim: ${atTheLimit ? "the limit is reached, " : ""}${verifications.shown} proofs shown by people this cycle, of ${verifications.allowed}`;
  const stopped =
    what === "fetches"
      ? "From now Viky sends no attested reading to Reclaim, and each person whose gift waits for one reads why on its page."
      : "From now Viky opens no new proof at Reclaim, and a person reads why before starting one.";
  const days =
    waiting === null
      ? "The days waiting for a reading could not be counted."
      : waiting.days === 0
        ? "No day of a daily gift is waiting for a reading right now."
        : `${waiting.days} ${waiting.days === 1 ? "day" : "days"} of ${waiting.gifts} daily ${waiting.gifts === 1 ? "gift" : "gifts"} ${waiting.days === 1 ? "waits" : "wait"} for a reading. The first of them goes back to its funder at ${new Date((waiting.nearestEndsAt ?? 0) * 1_000).toISOString().slice(0, 16).replace("T", " ")} UTC unless it is read before.`;
  return {
    subject,
    text: [
      `Cycle from ${utcDayInWords(use.from)} to ${utcDayInWords(use.until)} (UTC).`,
      `Readings: ${fetches.proved} attested fetches gave a proof, of ${fetches.started} started, for an allowance of ${fetches.allowed}.`,
      `Proofs of people: ${verifications.shown} came back from Reclaim, of ${verifications.asked} asked, ${verifications.verified} verified, for an allowance of ${verifications.allowed}.`,
      ...(atTheLimit ? ["", stopped, ...(what === "fetches" ? [days] : [])] : []),
      "",
      "Reclaim gives more on request only: ask, then set RECLAIM_FETCH_ALLOWANCE or RECLAIM_VERIFICATION_ALLOWANCE to what it grants.",
      "The count is on /api/health, under reclaim.",
    ].join("\n"),
  };
}

/** Claims a telling once: the name carries the cycle, and two months is longer than any cycle. */
const TOLD_ONCE_SECONDS = 62 * 86_400;

export type AlertsDueDeps = Readonly<{
  use: (nowMs: number) => Promise<CycleUse>;
  claim: (name: string, everySeconds: number, nowMs: number) => Promise<boolean>;
  /** What waits for a reading, asked only when the readings' limit has just been reached. */
  waiting?: (nowMs: number) => Promise<DaysWaiting>;
}>;

/**
 * The alerts that have just become due, each claimed so it is said once in its cycle: the highest share reached of
 * each allowance, and nothing when it was told already. Already past a share when first looked at, only that one is
 * told, not those under it.
 */
export async function allowanceAlertsDue(nowMs: number = Date.now(), deps: AlertsDueDeps = { use: cycleUse, claim: claimPass }): Promise<Alert[]> {
  const use = await deps.use(nowMs);
  const due: Alert[] = [];
  const kinds = [
    ["fetches", use.fetches.proved, use.fetches.allowed],
    ["verifications", use.verifications.shown, use.verifications.allowed],
  ] as const;
  for (const [what, used, allowed] of kinds) {
    const share = shareReached(used, allowed);
    if (share === null) continue;
    if (!(await deps.claim(`reclaim:${what}:${use.from.slice(0, 10)}:${share}`, TOLD_ONCE_SECONDS, nowMs))) continue;
    const waiting = what === "fetches" && share === 1 && deps.waiting ? await deps.waiting(nowMs).catch(() => null) : null;
    due.push(allowanceAlert(use, what, waiting));
  }
  return due;
}

export type AttestedCall = Readonly<{
  kind: "fetch" | "asked" | "verification";
  source: string;
  ok: boolean;
  code?: string | null;
  /** What makes a row one of its kind: a session's id, so a proof looked at twice is counted once. */
  ref?: string | null;
}>;

/** What happens after a row is written: the operator is told when a share of the allowance has just been reached. */
async function tellWhenFilling(): Promise<void> {
  // Imported here and not at the top, so the reading service, which loads src/attested-read.ts, loads neither the mail
  // client nor the gifts' store.
  const { daysWaiting } = await import("./days-waiting");
  const due = await allowanceAlertsDue(Date.now(), { use: cycleUse, claim: claimPass, waiting: daysWaiting });
  if (due.length === 0) return;
  const { sendAlert } = await import("./provider-alert");
  for (const alert of due) await sendAlert(alert);
}

/**
 * Writes one row. Never throws: a reading that moves somebody's money must not be lost because its count could not be
 * written, so a failure here is a line in the logs and nothing more.
 */
export async function noteAttestedCall(call: AttestedCall, after: () => Promise<void> = tellWhenFilling): Promise<void> {
  try {
    await ensureAttestedCallsSchema();
    await sql()`
      INSERT INTO viky_attested_calls (kind, source, ok, code, ref)
      VALUES (${call.kind}, ${call.source.slice(0, 80)}, ${call.ok}, ${call.code ? call.code.slice(0, 40) : null}, ${call.ref ? call.ref.slice(0, 200) : null})
      ON CONFLICT (kind, ref) WHERE ref IS NOT NULL DO UPDATE SET ok = viky_attested_calls.ok OR EXCLUDED.ok`;
    await after();
  } catch (error) {
    console.error(`attested call not counted (${call.kind} ${call.source}): ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`);
  }
}

/**
 * Whether a fetch that threw never left for Reclaim, so that it is not counted: nothing is configured, the reading
 * service runs other sources (src/attested-read.ts refuses before asking it), or the service put the reading off to
 * keep a platform's pace, which it answers at once without fetching (scripts/zkfetch-worker.ts, "is read again in").
 * A platform that itself asked to slow down was fetched, and is counted. So is a service that did not answer: it may
 * have fetched before it fell silent, and a count that errs is better high.
 */
export function neverLeftForReclaim(error: unknown): boolean {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "";
  if (code === "NOT_CONFIGURED" || code === "WORKER_OUT_OF_DATE") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /THROTTLED/.test(message) && !/asked to slow down/.test(message);
}

export type CountedFetchDeps = Readonly<{ note: (call: AttestedCall) => Promise<void>; limits: () => Promise<{ readings: boolean }> }>;

/**
 * Runs one attested fetch and writes it down, proof or not. Past the month's limit nothing is fetched and the refusal
 * is `ReclaimLimitReached`; it is the same refusal when Reclaim answers that the quota is used up. Any other answer or
 * refusal of the fetch passes through untouched.
 */
export async function countedFetch<T>(source: string, fetch: () => Promise<T>, deps: CountedFetchDeps = { note: noteAttestedCall, limits: () => limitsNow() }): Promise<T> {
  if ((await deps.limits()).readings) throw new ReclaimLimitReached("readings");
  let proof: T;
  try {
    proof = await fetch();
  } catch (error) {
    if (isReclaimQuotaRefusal(error)) {
      await deps.note({ kind: "fetch", source, ok: false, code: "LIMIT_REACHED" });
      throw new ReclaimLimitReached("readings", { cause: error });
    }
    if (!neverLeftForReclaim(error)) {
      const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "FAILED";
      await deps.note({ kind: "fetch", source, ok: false, code });
    }
    throw error;
  }
  await deps.note({ kind: "fetch", source, ok: true });
  return proof;
}
