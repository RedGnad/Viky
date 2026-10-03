import { AsyncLocalStorage } from "node:async_hooks";
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
 *
 * And a breaker, since every paid reading passes here (the founder, 3 Oct 2026). The month's limit stops a month; it
 * does not stop a loop. So each UTC day has two ceilings, counted on the proofs given like the month: one for a gift
 * and one for all of them (`DAILY_CEILING`, each moved by a setting). At a ceiling nothing leaves for Reclaim, the
 * refusal is `CEILING_REACHED`, which is ours and against which nothing is settled, the operator is told once with the
 * gift and the reason, and the person reads that it resumes the next day. A reading says which gift it is for and why
 * (`readingFor`), and the journal keeps both.
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
ALTER TABLE viky_attested_calls ADD COLUMN IF NOT EXISTS gift text;
ALTER TABLE viky_attested_calls ADD COLUMN IF NOT EXISTS reason text;
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

/**
 * The most proofs a UTC day may take: for one gift, four, which is what a Chess.com climb started and reached the
 * same day costs (two fetches each time), and for all gifts together, eight.
 */
export const DAILY_CEILING = { perGift: 4, all: 8 } as const;

/**
 * The ceilings in force: `RECLAIM_DAILY_PER_GIFT` and `RECLAIM_DAILY_ALL` when they are set, a whole number each. Zero
 * is a number: it stops every paid reading, for a gift or for all, until the setting is changed.
 */
export function dailyCeilings(env: Environment = process.env): { perGift: number; all: number } {
  return { perGift: wholeNumber(env.RECLAIM_DAILY_PER_GIFT) ?? DAILY_CEILING.perGift, all: wholeNumber(env.RECLAIM_DAILY_ALL) ?? DAILY_CEILING.all };
}

/**
 * The day of the month the count starts again, at midnight UTC. Reclaim's dashboard shows the cycle as "23/09 -
 * 24/10": it began on the 23rd and is shown to end on the 24th, and which of the two days theirs starts again on is
 * not published. Ours takes the later one (the founder, 3 Oct 2026), for the screen as for the limit: our count never
 * starts again before theirs.
 */
export const RECLAIM_CYCLE_DAY = 24;

/**
 * What is left of an allowance when the operator is told: fifteen, ten, five, and none, which is the limit (the
 * founder, 3 Oct 2026). By what is left and not by a share of the whole: that day thirty readings were left for
 * three weeks and a judging, and "four fifths" said nothing of them.
 */
export const RECLAIM_ALERT_LEFT = [15, 10, 5, 0] as const;

/**
 * The judging of the event this is built for, in UTC days, both included. Each of those mornings the operator is sent
 * what the day before spent (`morningSummaryDue`), from six o'clock UTC.
 */
export const JUDGING = { from: "2026-10-14", until: "2026-10-27" } as const;
export const MORNING_SUMMARY_HOUR_UTC = 6;

/**
 * What was already spent in the cycle Reclaim began on 23 Sep 2026 when this journal began, counted on 3 Oct 2026: 126
 * fetches of which 68 gave a proof in the reading service's own logs, which start on 28 Sep at 20:40 UTC, and the two
 * readings of 23 and 24 Sep that the gifts' journal holds. A fetch that failed before 28 Sep 20:40 is in neither, so
 * this is a floor. One proof was asked of a person, on 27 Sep, and never came back. It counts for that cycle alone,
 * which in this count is the one that starts again on 24 Oct (`RECLAIM_CYCLE_DAY`): the reading of 23 Sep is in the
 * figure, so nothing Reclaim counted in its cycle is left out of ours.
 */
export const BEFORE_THE_JOURNAL = { cycleFrom: "2026-09-24T00:00:00.000Z", started: 128, proved: 70, asked: 1, shown: 0 } as const;

/**
 * Of what was counted before the journal began, what one fault of ours cost on 30 Sep 2026: a Chess.com gift whose
 * ratings answered 404, read by the pass of every five minutes, which took a new proof of the profile at each round
 * and found no rating behind it. 114 fetches in five hours, 57 of them a proof, none of them of any use. The rest of
 * the proofs counted then were real use.
 */
export const LOST_ON_30_SEP_2026 = { fetches: 114, proofs: 57 } as const;

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

/** The cycle a moment falls in: from the 24th at midnight UTC to the next 24th. */
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
 * The day a cycle's reserves start again, as a screen says it: "24 Oct", the first day of the next cycle, in UTC, so it
 * is written the same on the server and in every browser. West of UTC the reserves are back the evening before.
 */
export function startsAgainInWords(nowMs: number = Date.now()): string {
  const until = cycleOf(nowMs).until;
  return `${until.getUTCDate()} ${MONTHS[until.getUTCMonth()]}`;
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

/** What is left of an allowance: never less than nothing, whatever was used past it. */
export function leftOf(used: number, allowed: number): number {
  return Math.max(0, allowed - used);
}

/** The mark what is left has come down to, among those the operator is told at, or none while more is left than the first. */
export function leftMarkReached(used: number, allowed: number): number | null {
  const left = leftOf(used, allowed);
  const reached = RECLAIM_ALERT_LEFT.filter((mark) => left <= mark);
  return reached.length > 0 ? reached[reached.length - 1] : null;
}

/** The days of daily gifts that a reading could still count, and when the first of their windows closes (UTC seconds). */
export type DaysWaiting = Readonly<{ days: number; gifts: number; nearestEndsAt: number | null }>;

/** What the operator reads when what is left of an allowance comes down to a mark. At the limit it says what is waiting. */
export function allowanceAlert(use: CycleUse, what: "fetches" | "verifications", waiting: DaysWaiting | null = null): Alert {
  const { fetches, verifications } = use;
  const atTheLimit = what === "fetches" ? fetches.proved >= fetches.allowed : verifications.shown >= verifications.allowed;
  // What is left comes first: it is what there is to decide on. At the limit the subject says the limit.
  const subject =
    what === "fetches"
      ? atTheLimit
        ? `Reclaim: the limit is reached, ${fetches.proved} readings this cycle, of ${fetches.allowed}`
        : `Reclaim: ${leftOf(fetches.proved, fetches.allowed)} readings left until ${utcDayInWords(use.until)}, ${fetches.proved} of ${fetches.allowed} used`
      : atTheLimit
        ? `Reclaim: the limit is reached, ${verifications.shown} proofs shown by people this cycle, of ${verifications.allowed}`
        : `Reclaim: ${leftOf(verifications.shown, verifications.allowed)} proofs of people left until ${utcDayInWords(use.until)}, ${verifications.shown} of ${verifications.allowed} used`;
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
      `Readings: ${fetches.proved} attested fetches gave a proof, of ${fetches.started} started, for an allowance of ${fetches.allowed}: ${leftOf(fetches.proved, fetches.allowed)} left.`,
      `Proofs of people: ${verifications.shown} came back from Reclaim, of ${verifications.asked} asked, ${verifications.verified} verified, for an allowance of ${verifications.allowed}: ${leftOf(verifications.shown, verifications.allowed)} left.`,
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
 * The alerts that have just become due, each claimed so it is said once in its cycle: the mark what is left of each
 * allowance has come down to, and nothing when it was told already. Already under a mark when first looked at, only
 * the lowest one reached is told, not those above it.
 */
export async function allowanceAlertsDue(nowMs: number = Date.now(), deps: AlertsDueDeps = { use: cycleUse, claim: claimPass }): Promise<Alert[]> {
  const use = await deps.use(nowMs);
  const due: Alert[] = [];
  const kinds = [
    ["fetches", use.fetches.proved, use.fetches.allowed],
    ["verifications", use.verifications.shown, use.verifications.allowed],
  ] as const;
  for (const [what, used, allowed] of kinds) {
    const mark = leftMarkReached(used, allowed);
    if (mark === null) continue;
    if (!(await deps.claim(`reclaim:${what}:${use.from.slice(0, 10)}:left-${mark}`, TOLD_ONCE_SECONDS, nowMs))) continue;
    const waiting = what === "fetches" && mark === 0 && deps.waiting ? await deps.waiting(nowMs).catch(() => null) : null;
    due.push(allowanceAlert(use, what, waiting));
  }
  return due;
}

// --- the morning's summary, during the judging -----------------------------------------------------------------------

/** What a UTC day spent, a line for each gift and reason: the fetches that gave a proof, and those that did not. */
export type DaySpent = ReadonlyArray<Readonly<{ gift: string | null; reason: string | null; proved: number; failed: number }>>;

/** The fetches of the UTC day that began at `dayStartMs`, by gift and by reason, the costliest first. */
export async function spentOn(dayStartMs: number): Promise<DaySpent> {
  await ensureAttestedCallsSchema();
  const rows = await sql()`
    SELECT gift, reason, count(*) FILTER (WHERE ok)::int AS proved, count(*) FILTER (WHERE NOT ok)::int AS failed
      FROM viky_attested_calls
     WHERE kind = 'fetch' AND at >= ${new Date(dayStartMs).toISOString()} AND at < ${new Date(dayStartMs + 86_400_000).toISOString()}
     GROUP BY gift, reason
     ORDER BY proved DESC, failed DESC, gift`;
  return rows.map((row) => ({ gift: row.gift === null || row.gift === undefined ? null : String(row.gift), reason: row.reason === null || row.reason === undefined ? null : String(row.reason), proved: Number(row.proved), failed: Number(row.failed) }));
}

/** Whether a moment is inside the judging, by its UTC day. */
export function inJudging(nowMs: number): boolean {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  return day >= JUDGING.from && day <= JUDGING.until;
}

const proofs = (count: number) => `${count} ${count === 1 ? "proof" : "proofs"}`;

/**
 * What the operator reads each morning of the judging: what the day before spent, by gift and by reason, what is left
 * of each reserve, and the day they start again. `use` is the cycle's count at the moment the summary is made.
 */
export function morningSummary(dayStartMs: number, spent: DaySpent, use: CycleUse): Alert {
  const day = utcDayInWords(new Date(dayStartMs).toISOString());
  const proved = spent.reduce((sum, line) => sum + line.proved, 0);
  const failed = spent.reduce((sum, line) => sum + line.failed, 0);
  const left = leftOf(use.fetches.proved, use.fetches.allowed);
  const lines = spent.map((line) => `- ${line.gift ? `gift ${line.gift}` : "no gift named"}, ${line.reason ?? "no reason given"}: ${proofs(line.proved)}${line.failed > 0 ? `, ${line.failed} without` : ""}`);
  return {
    subject: `Reclaim, ${day}: ${proofs(proved)} spent, ${left} left until ${utcDayInWords(use.until)}`,
    text: [
      `On ${day} (UTC), ${proved} attested ${proved === 1 ? "fetch" : "fetches"} gave a proof${failed > 0 ? ` and ${failed} did not` : ""}.`,
      ...(lines.length > 0 ? ["By gift and by reason:", ...lines] : ["Nothing was asked of Reclaim that day."]),
      "",
      `Readings left: ${left} of ${use.fetches.allowed} (${use.fetches.proved} gave a proof this cycle, of ${use.fetches.started} started).`,
      `Proofs of people left: ${leftOf(use.verifications.shown, use.verifications.allowed)} of ${use.verifications.allowed} (${use.verifications.shown} came back this cycle).`,
      `Both reserves start again on ${utcDayInWords(use.until)} (UTC).`,
    ].join("\n"),
  };
}

export type MorningSummaryDeps = Readonly<{
  claim: (name: string, everySeconds: number, nowMs: number) => Promise<boolean>;
  spent: (dayStartMs: number) => Promise<DaySpent>;
  use: (nowMs: number) => Promise<CycleUse>;
}>;

/**
 * The summary of the day before, when it is due: a morning of the judging, from six o'clock UTC, once. Asked by the
 * call that already arrives every five minutes (app/api/cron/milestones), so it leaves within minutes of six.
 */
export async function morningSummaryDue(nowMs: number = Date.now(), deps: MorningSummaryDeps = { claim: claimPass, spent: spentOn, use: cycleUse }): Promise<Alert | null> {
  const now = new Date(nowMs);
  if (!inJudging(nowMs) || now.getUTCHours() < MORNING_SUMMARY_HOUR_UTC) return null;
  const today = Math.floor(nowMs / 86_400_000);
  if (!(await deps.claim(`reclaim-summary:${today}`, 2 * 86_400, nowMs))) return null;
  const yesterday = (today - 1) * 86_400_000;
  return morningSummary(yesterday, await deps.spent(yesterday), await deps.use(nowMs));
}

export type AttestedCall = Readonly<{
  kind: "fetch" | "asked" | "verification";
  source: string;
  ok: boolean;
  code?: string | null;
  /** What makes a row one of its kind: a session's id, so a proof looked at twice is counted once. */
  ref?: string | null;
  /** The gift a fetch was for and why it was taken, when the reading said so (`readingFor`). */
  gift?: string | null;
  reason?: string | null;
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
      INSERT INTO viky_attested_calls (kind, source, ok, code, ref, gift, reason)
      VALUES (${call.kind}, ${call.source.slice(0, 80)}, ${call.ok}, ${call.code ? call.code.slice(0, 40) : null}, ${call.ref ? call.ref.slice(0, 200) : null},
              ${call.gift ? call.gift.slice(0, 80) : null}, ${call.reason ? call.reason.slice(0, 120) : null})
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

// --- the breaker ---------------------------------------------------------------------------------------------------

/**
 * What a reading says of itself before it pays for anything: the gift it is for, why it is taken, and how many
 * attested fetches it is made of. A Chess.com reading is two, the profile and then the ratings: it is admitted whole
 * or not at all, so a ceiling never leaves half a reading paid for.
 */
export type ReadingAbout = { giftId: string | null; reason: string; fetches: number };

type ReadingInFlight = ReadingAbout & { admitted: number };

const reading = new AsyncLocalStorage<ReadingInFlight>();

/** Runs a reading with what it is about, which every fetch it makes is counted and judged under. */
export function readingFor<T>(about: Readonly<{ giftId: string | null; reason: string; fetches?: number }>, run: () => Promise<T>): Promise<T> {
  return reading.run({ giftId: about.giftId, reason: about.reason, fetches: about.fetches ?? 1, admitted: 0 }, run);
}

/** Says more of the reading under way, once it is known: its reason, and how many fetches it is made of. */
export function readingIs(more: Readonly<{ reason?: string; fetches?: number }>): void {
  const about = reading.getStore();
  if (!about) return;
  if (more.reason !== undefined) about.reason = more.reason;
  if (more.fetches !== undefined) about.fetches = more.fetches;
}

/** The moment the next UTC day begins, in seconds: when a day's ceiling is lifted. */
export function nextDayAt(nowMs: number): number {
  return (Math.floor(nowMs / 86_400_000) + 1) * 86_400;
}

/** A day's ceiling is reached: nothing was sent to Reclaim. `scope` says whose ceiling, the gift's or everybody's. */
export class ReclaimCeilingReached extends Error {
  readonly code = "CEILING_REACHED";

  constructor(
    readonly scope: "gift" | "all",
    /** When readings resume, in UTC seconds: the start of the next UTC day. */
    readonly resumesAt: number,
  ) {
    super(scope === "gift" ? "The day's ceiling of attested readings for this gift is reached" : "The day's ceiling of attested readings is reached");
    this.name = "ReclaimCeilingReached";
  }
}

/** The proofs given so far in the UTC day of a moment: for one gift, and for all. */
export type DayUse = Readonly<{ gift: number; all: number }>;

export async function dayUse(giftId: string | null, nowMs: number = Date.now()): Promise<DayUse> {
  await ensureAttestedCallsSchema();
  const from = new Date(Math.floor(nowMs / 86_400_000) * 86_400_000).toISOString();
  const [counted] = await sql()`
    SELECT count(*) FILTER (WHERE gift = ${giftId})::int AS gift, count(*)::int AS everything
      FROM viky_attested_calls
     WHERE kind = 'fetch' AND ok AND at >= ${from}`;
  return { gift: giftId === null ? 0 : Number(counted?.gift ?? 0), all: Number(counted?.everything ?? 0) };
}

/**
 * Which ceiling a reading of `needs` more proofs would pass, or none. The gift's own is asked first: it is the one a
 * loop meets, and the one whose alert names the gift.
 */
export function ceilingPassed(use: DayUse, giftId: string | null, needs: number, ceilings: { perGift: number; all: number }): "gift" | "all" | null {
  if (giftId !== null && use.gift + needs > ceilings.perGift) return "gift";
  return use.all + needs > ceilings.all ? "all" : null;
}

/**
 * Whether the day has room for `needs` more proofs for a gift, with nobody told when it has not: asked by a reading
 * that is optional, so that it never takes the room a reading that pays will need (src/milestone-reading.ts). A count
 * that cannot be read stops nothing.
 */
export async function roomToday(giftId: string | null, needs: number, nowMs: number = Date.now(), read: typeof dayUse = dayUse): Promise<boolean> {
  try {
    return ceilingPassed(await read(giftId, nowMs), giftId, needs, dailyCeilings()) === null;
  } catch (error) {
    console.error(`day's ceiling not read: ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`);
    return true;
  }
}

/** What the operator reads when a ceiling stops a reading: the gift, the reason, the day's count, and how to move it. */
export function ceilingAlert(input: Readonly<{ scope: "gift" | "all"; about: ReadingAbout | null; use: DayUse; ceilings: { perGift: number; all: number }; resumesAt: number }>): Alert {
  const { scope, about, use, ceilings } = input;
  const gift = about?.giftId ? `gift ${about.giftId}` : "a reading that names no gift";
  const resumes = `${new Date(input.resumesAt * 1_000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  return {
    subject: scope === "gift" ? `Reclaim: ${gift} reached its ceiling of ${ceilings.perGift} proofs for the day` : `Reclaim: the ceiling of ${ceilings.all} proofs for the day is reached`,
    text: [
      `Stopped: ${gift}, ${about?.reason ?? "no reason given"}. Nothing was sent to Reclaim for it.`,
      `Today (UTC): ${about?.giftId ? `${use.gift} proofs for this gift, of ${ceilings.perGift} a day. ` : ""}${use.all} proofs for all gifts, of ${ceilings.all} a day.`,
      scope === "gift" ? "Other gifts are still read. This one is read again from the next UTC day." : "No gift is read attested until the next UTC day.",
      `Readings resume at ${resumes}. Nothing is settled against a reading that was not taken: the person reads why on the gift's page.`,
      "",
      "A gift that reaches its ceiling is usually a loop: look at its rows in viky_attested_calls (gift, reason, code) before raising anything.",
      "To raise a ceiling for good or for a day, set RECLAIM_DAILY_PER_GIFT or RECLAIM_DAILY_ALL: no new code is needed.",
    ].join("\n"),
  };
}

/**
 * Tells the operator of something that stopped paid readings for the day, once in that UTC day under `name`. The alert
 * is made only when it is this call's to send. Never throws.
 */
export async function tellOnceToday(name: string, alert: () => Promise<Alert> | Alert, nowMs: number = Date.now()): Promise<void> {
  try {
    if (!(await claimPass(`${name}:${Math.floor(nowMs / 86_400_000)}`, 2 * 86_400, nowMs))) return;
    const { sendAlert } = await import("./provider-alert");
    await sendAlert(await alert());
  } catch (error) {
    console.error(`alert not sent (${name}): ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`);
  }
}

/** Tells the operator of a ceiling reached, once for a gift, or for all, in a day. */
export function tellOfTheCeiling(scope: "gift" | "all", about: ReadingAbout | null, use: DayUse, nowMs: number = Date.now()): Promise<void> {
  const name = scope === "gift" ? `reclaim-ceiling:gift:${about?.giftId ?? "none"}` : "reclaim-ceiling:all";
  return tellOnceToday(name, () => ceilingAlert({ scope, about, use, ceilings: dailyCeilings(), resumesAt: nextDayAt(nowMs) }), nowMs);
}

/** What the operator reads when a gift at its target was given the day's tries and none settled it. */
export function targetNotSettledAlert(giftId: string, tries: number, use: DayUse | null, resumesAt: number): Alert {
  return {
    subject: `Gift ${giftId}: at its target, and ${tries} proofs today did not settle it`,
    text: [
      `Gift ${giftId} was read at its target ${tries} times today, and none of those readings settled it. No more proof is taken for it until ${new Date(resumesAt * 1_000).toISOString().slice(0, 16).replace("T", " ")} UTC.`,
      use === null ? "The day's count could not be read." : `Today (UTC): ${use.gift} proofs were given for this gift, ${use.all} for all gifts.`,
      "A proof at the target settles a gift at once. When it does not, the fetch or the sending failed: look at the gift's readings and at its rows in viky_attested_calls (gift, reason, code) before the next day's tries.",
      "Nothing is settled against it meanwhile: the gift is held.",
    ].join("\n"),
  };
}

/** Tells the operator that the day's tries at the target are spent for a gift, once in the day. */
export function tellOfTriesSpent(giftId: string, tries: number, nowMs: number = Date.now()): Promise<void> {
  return tellOnceToday(`milestone-target-spent:${giftId}`, async () => targetNotSettledAlert(giftId, tries, await dayUse(giftId, nowMs).catch(() => null), nextDayAt(nowMs)), nowMs);
}

/**
 * The breaker itself: the ceiling a reading would pass now, told to the operator, or nothing. A count that cannot be
 * read stops nothing, as for the month's limit.
 */
export async function ceilingNow(about: ReadingAbout | null, needs: number, nowMs: number = Date.now()): Promise<ReclaimCeilingReached | null> {
  let use: DayUse;
  try {
    use = await dayUse(about?.giftId ?? null, nowMs);
  } catch (error) {
    console.error(`day's ceiling not read: ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`);
    return null;
  }
  const scope = ceilingPassed(use, about?.giftId ?? null, needs, dailyCeilings());
  if (scope === null) return null;
  await tellOfTheCeiling(scope, about, use, nowMs);
  return new ReclaimCeilingReached(scope, nextDayAt(nowMs));
}

export type CountedFetchDeps = Readonly<{
  note: (call: AttestedCall) => Promise<void>;
  limits: () => Promise<{ readings: boolean }>;
  /** The day's ceilings (`ceilingNow`); a test of the other things omits it. */
  ceiling?: (about: ReadingAbout | null, needs: number) => Promise<ReclaimCeilingReached | null>;
}>;

/**
 * Runs one attested fetch and writes it down, proof or not. Past the month's limit nothing is fetched and the refusal
 * is `ReclaimLimitReached`; it is the same refusal when Reclaim answers that the quota is used up. At a day's ceiling
 * nothing is fetched either, and the refusal is `ReclaimCeilingReached`. Any other answer or refusal of the fetch
 * passes through untouched.
 *
 * A reading made of several fetches is admitted at its first, for all of them: the ceiling is asked whether the whole
 * reading fits, and the fetches that follow in the same reading pass.
 */
export async function countedFetch<T>(source: string, fetch: () => Promise<T>, deps: CountedFetchDeps = { note: noteAttestedCall, limits: () => limitsNow(), ceiling: ceilingNow }): Promise<T> {
  if ((await deps.limits()).readings) throw new ReclaimLimitReached("readings");
  const about = reading.getStore() ?? null;
  if (deps.ceiling && !(about && about.admitted > 0)) {
    const needs = Math.max(1, about?.fetches ?? 1);
    const reached = await deps.ceiling(about, needs);
    if (reached) throw reached;
    if (about) about.admitted = needs;
  }
  if (about && about.admitted > 0) about.admitted -= 1;
  const told = { gift: about?.giftId ?? null, reason: about?.reason ?? null };
  let proof: T;
  try {
    proof = await fetch();
  } catch (error) {
    if (isReclaimQuotaRefusal(error)) {
      await deps.note({ kind: "fetch", source, ok: false, code: "LIMIT_REACHED", ...told });
      throw new ReclaimLimitReached("readings", { cause: error });
    }
    if (!neverLeftForReclaim(error)) {
      const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "FAILED";
      await deps.note({ kind: "fetch", source, ok: false, code, ...told });
    }
    throw error;
  }
  await deps.note({ kind: "fetch", source, ok: true, ...told });
  return proof;
}
