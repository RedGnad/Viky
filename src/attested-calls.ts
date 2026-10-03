import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import { claimPass } from "./pass-guard";
import type { SqlExecutor } from "./proof-session-store";

/**
 * The journal of what Viky asks of Reclaim, and the count of the month's allowance (3 Oct 2026).
 *
 * Reclaim's free tier gives up to 100 attested fetches (zkFetch) and 25 verifications a month, more on request only,
 * and its dashboard shows no count of the fetches. Until this journal neither did Viky: a fetch that failed left no row
 * anywhere. On 30 Sep 2026 one gift whose plain look kept failing cost 114 fetches in five hours, and it was seen three
 * days later, in the reading service's logs.
 *
 * One row per fetch the app asks for, written where the fetch is made (the default dependencies of
 * src/attested-read.ts and src/duolingo-public.ts), whether it gave a proof or not. Reclaim's own client reports the
 * same two things to Reclaim: that a fetch started, then that it gave a proof or failed (@reclaimprotocol/zk-fetch
 * 1.1.0, `sendLogs`). Which of the two Reclaim counts against the allowance is not published. Both are kept, and the
 * alerts go by the larger, the fetches started.
 *
 * One row too per proof a person is asked for (app/api/proof/session/route.ts): a session that never comes back is
 * deleted from its own table after a day, so only this row says it was opened. How many came back verified is read
 * from the sessions themselves. What Reclaim counts as a verification lies between the two.
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
CREATE INDEX IF NOT EXISTS viky_attested_calls_at ON viky_attested_calls (at)
`;

/** Reclaim's allowance for one cycle of the free tier, read on its pricing page and its dashboard on 3 Oct 2026. */
export const RECLAIM_ALLOWANCE = { fetches: 100, verifications: 25 } as const;

/** The day of the month a cycle starts, at midnight UTC: the dashboard showed the cycle of 23 Sep to 24 Oct 2026. */
export const RECLAIM_CYCLE_DAY = 23;

/** The shares of an allowance at which the operator is told: half, four fifths, and all of it. */
export const RECLAIM_ALERT_AT = [0.5, 0.8, 1] as const;

/**
 * What was already spent in the cycle that began on 23 Sep 2026 when this journal began, counted on 3 Oct 2026: 126
 * fetches of which 68 gave a proof in the reading service's own logs, which start on 28 Sep at 20:40 UTC, and the two
 * readings of 23 and 24 Sep that the gifts' journal holds. A fetch that failed before 28 Sep 20:40 is in neither, so
 * this is a floor. One proof was asked of a person, on 27 Sep, and never came back. It counts for that cycle alone.
 */
export const BEFORE_THE_JOURNAL = { cycleFrom: "2026-09-23T00:00:00.000Z", started: 128, proved: 70, asked: 1 } as const;

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
  /** Fetches asked of Reclaim in the cycle, and how many of them gave a proof. */
  fetches: Readonly<{ started: number; proved: number; allowed: number }>;
  /** Proofs asked of people in the cycle, and how many came back and were verified. */
  verifications: Readonly<{ asked: number; verified: number; allowed: number }>;
}>;

/** The cycle's use so far: the journal's rows, the verified sessions, and what was spent before the journal began. */
export async function cycleUse(nowMs: number = Date.now()): Promise<CycleUse> {
  await ensureAttestedCallsSchema();
  const { from, until } = cycleOf(nowMs);
  const [counted] = await sql()`
    SELECT count(*) FILTER (WHERE kind = 'fetch')::int AS started,
           count(*) FILTER (WHERE kind = 'fetch' AND ok)::int AS proved,
           count(*) FILTER (WHERE kind = 'verification')::int AS asked
      FROM viky_attested_calls
     WHERE at >= ${from.toISOString()} AND at < ${until.toISOString()}`;
  // The sessions the server makes for its own readings are named `public:` and `connected:`. A person's is Reclaim's own id.
  const [sessions] = await sql()`
    SELECT count(*)::int AS verified
      FROM viky_proof_sessions
     WHERE consumed_at >= ${from.toISOString()} AND consumed_at < ${until.toISOString()}
       AND session_id NOT LIKE 'public:%' AND session_id NOT LIKE 'connected:%'`;
  const before = from.toISOString() === BEFORE_THE_JOURNAL.cycleFrom ? BEFORE_THE_JOURNAL : { started: 0, proved: 0, asked: 0 };
  return {
    from: from.toISOString(),
    until: until.toISOString(),
    fetches: { started: Number(counted?.started ?? 0) + before.started, proved: Number(counted?.proved ?? 0) + before.proved, allowed: RECLAIM_ALLOWANCE.fetches },
    verifications: { asked: Number(counted?.asked ?? 0) + before.asked, verified: Number(sessions?.verified ?? 0), allowed: RECLAIM_ALLOWANCE.verifications },
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "23 Sep 2026", in UTC, written the same on the server and in every browser. */
function dayInWords(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The cycle's count as the judges page says it: what was started, what gave a proof, what was asked of people, and
 * whether the allowance is passed. Every figure is the journal's at the moment the page is served.
 */
export function cycleInWords(use: CycleUse | null): string {
  if (!use) return "The cycle's count could not be read right now.";
  const { fetches, verifications } = use;
  const over = fetches.started >= fetches.allowed || verifications.asked >= verifications.allowed;
  return [
    `In the cycle that began on ${dayInWords(use.from)}, Viky has started ${counted(fetches.started, "attested fetch", "attested fetches")}, of which ${fetches.proved} gave a proof,`,
    `and has asked ${counted(verifications.asked, "proof", "proofs")} of a person, of which ${verifications.verified} came back verified.`,
    over ? "That is past the allowance. Readings have gone on since, and what Reclaim does past it is not published." : "That is inside the allowance.",
  ].join(" ");
}

export type Alert = Readonly<{ subject: string; text: string }>;

/** The share of an allowance already reached, among those the operator is told at, or none below the first. */
export function shareReached(used: number, allowed: number): number | null {
  const reached = RECLAIM_ALERT_AT.filter((share) => used >= Math.ceil(allowed * share));
  return reached.length > 0 ? reached[reached.length - 1] : null;
}

function day(iso: string): string {
  return iso.slice(0, 10);
}

/** What the operator reads when a share of an allowance is reached. */
export function allowanceAlert(use: CycleUse, what: "fetches" | "verifications"): Alert {
  const { fetches, verifications } = use;
  const subject =
    what === "fetches"
      ? `Reclaim: ${fetches.started} attested fetches this cycle, of ${fetches.allowed}`
      : `Reclaim: ${verifications.asked} proofs asked of people this cycle, of ${verifications.allowed}`;
  return {
    subject,
    text: [
      `Cycle from ${day(use.from)} to ${day(use.until)} (UTC).`,
      `Attested fetches: ${fetches.started} started, ${fetches.proved} of them gave a proof, for an allowance of ${fetches.allowed}.`,
      `Proofs asked of people: ${verifications.asked} asked, ${verifications.verified} came back verified, for an allowance of ${verifications.allowed}.`,
      "",
      "Reclaim gives more on request only, and does not publish what it does past the allowance: ask before it is used up.",
      "The count is on /api/health, under reclaim.",
    ].join("\n"),
  };
}

/** Claims a telling once: the name carries the cycle, and two months is longer than any cycle. */
const TOLD_ONCE_SECONDS = 62 * 86_400;

/**
 * The alerts that have just become due, each claimed so it is said once in its cycle: the highest share reached of
 * each allowance, and nothing when it was told already. Already past a share when first looked at, only that one is
 * told, not those under it.
 */
export async function allowanceAlertsDue(
  nowMs: number = Date.now(),
  deps: { use: (nowMs: number) => Promise<CycleUse>; claim: (name: string, everySeconds: number, nowMs: number) => Promise<boolean> } = { use: cycleUse, claim: claimPass },
): Promise<Alert[]> {
  const use = await deps.use(nowMs);
  const due: Alert[] = [];
  const kinds = [
    ["fetches", use.fetches.started, use.fetches.allowed],
    ["verifications", use.verifications.asked, use.verifications.allowed],
  ] as const;
  for (const [what, used, allowed] of kinds) {
    const share = shareReached(used, allowed);
    if (share === null) continue;
    if (await deps.claim(`reclaim:${what}:${day(use.from)}:${share}`, TOLD_ONCE_SECONDS, nowMs)) due.push(allowanceAlert(use, what));
  }
  return due;
}

export type AttestedCall = Readonly<{ kind: "fetch" | "verification"; source: string; ok: boolean; code?: string | null }>;

/** What happens after a row is written: the operator is told when a share of the allowance has just been reached. */
async function tellWhenFilling(): Promise<void> {
  const due = await allowanceAlertsDue();
  if (due.length === 0) return;
  // Imported here and not at the top, so the reading service, which loads src/attested-read.ts, loads no mail client.
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
    await sql()`INSERT INTO viky_attested_calls (kind, source, ok, code) VALUES (${call.kind}, ${call.source.slice(0, 80)}, ${call.ok}, ${call.code ? call.code.slice(0, 40) : null})`;
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

/** Runs one attested fetch and writes it down, proof or not. The fetch's own answer or refusal passes through untouched. */
export async function countedFetch<T>(source: string, fetch: () => Promise<T>, note: (call: AttestedCall) => Promise<void> = noteAttestedCall): Promise<T> {
  let proof: T;
  try {
    proof = await fetch();
  } catch (error) {
    if (!neverLeftForReclaim(error)) {
      const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "FAILED";
      await note({ kind: "fetch", source, ok: false, code });
    }
    throw error;
  }
  await note({ kind: "fetch", source, ok: true });
  return proof;
}
