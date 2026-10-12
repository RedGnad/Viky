import { neon } from "@neondatabase/serverless";
import type { Alert } from "./attested-calls";
import { conditionById, CONDITIONS, conditionOfGoal, ON_REQUEST_DAYS, type Condition } from "./conditions";
import { databaseUrl } from "./database-guard";
import { dateInWords } from "./moments";
import type { SqlExecutor } from "./proof-session-store";

/**
 * A source opened on request (the founder, 12 Oct 2026). Strava's developer program asks the owner of an application
 * for a paid subscription, and Viky takes it the day a gift asks for Strava, as a university is set up by its first
 * gift: the gift is the request. The line is offered and paid for like any other, its two people read a day two days
 * after the gift, and until the operator opens it nothing is asked of the source or of Reclaim for its gifts.
 *
 * The register says which lines are on request (`state: "on-request"`). This says which of them the operator has
 * opened since, in one row a line, written by `pnpm source:open` with no deployment. A line opened is open like the
 * others. Server only. When the rows cannot be read nothing is said opened: the line stays on request, which asks
 * nothing of anybody.
 */

/** How long after a gift its source is opened, at the latest: the day its two people read. */
export { ON_REQUEST_DAYS } from "./conditions";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS viky_sources_opened (
  condition_id text PRIMARY KEY,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by text
)`,
  `CREATE TABLE IF NOT EXISTS viky_source_asked (
  gift_id text PRIMARY KEY,
  condition_id text NOT NULL,
  told_at timestamptz NOT NULL DEFAULT now()
)`,
];

let executor: SqlExecutor | undefined;
let ready: Promise<void> | undefined;

export function configureOnRequest(custom: SqlExecutor | undefined): void {
  executor = custom;
  ready = undefined;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

/** The two tables, made the first time they are needed in a process, so no deployment waits on a migration. */
export function ensureOnRequestSchema(): Promise<void> {
  ready ??= (async () => {
    for (const statement of SCHEMA) {
      const strings = Object.assign([statement], { raw: [statement] }) as unknown as TemplateStringsArray;
      await sql()(strings);
    }
  })().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

/** The lines the register offers on request, opened since or not. */
export function linesOnRequest(): readonly Condition[] {
  return CONDITIONS.filter((condition) => condition.state === "on-request");
}

/** The lines the operator has opened. It never throws: rows that cannot be read say nothing is opened. */
export async function openedOnRequest(): Promise<ReadonlySet<string>> {
  if (linesOnRequest().length === 0) return new Set();
  try {
    await ensureOnRequestSchema();
    const rows = await sql()`SELECT condition_id FROM viky_sources_opened`;
    return new Set(rows.map((row) => String(row.condition_id)));
  } catch {
    return new Set();
  }
}

/** The lines still waiting to be opened: on request in the register, and not opened by the operator. */
export async function waitingToBeOpened(): Promise<ReadonlySet<string>> {
  const lines = linesOnRequest();
  if (lines.length === 0) return new Set();
  const opened = await openedOnRequest();
  return new Set(lines.map((line) => line.id).filter((id) => !opened.has(id)));
}

/** Whether this line is on request and not opened yet. A line in any other state never is, and asks no row. */
export async function waitsToBeOpened(conditionId: string | undefined): Promise<boolean> {
  if (!conditionId || conditionById(conditionId)?.state !== "on-request") return false;
  return (await waitingToBeOpened()).has(conditionId);
}

/**
 * Where a line stands once what the operator opened is known: a line on request and opened is open, like the others.
 * Any other state is the register's own.
 */
export function standingStateOf(condition: Pick<Condition, "id" | "state" | "live">, waiting: ReadonlySet<string>): NonNullable<Condition["state"]> {
  if (condition.state === "on-request") return waiting.has(condition.id) ? "on-request" : "open";
  return condition.state ?? (condition.live ? "open" : "asked-the-source");
}

/** The operator's line: opens a line on request. `opened` the first time, `already` afterwards. */
export async function openOnRequest(conditionId: string, operator: string | null): Promise<"opened" | "already"> {
  const condition = conditionById(conditionId);
  if (!condition || condition.state !== "on-request") throw new Error(`${conditionId} is not a line offered on request`);
  await ensureOnRequestSchema();
  const rows = await sql()`INSERT INTO viky_sources_opened (condition_id, opened_by) VALUES (${conditionId}, ${operator}) ON CONFLICT (condition_id) DO NOTHING RETURNING condition_id`;
  return rows.length > 0 ? "opened" : "already";
}

/** What the person on the other side reads while a line is being opened (the start route and the connected reading). */
export function beingOpenedInWords(condition: Pick<Condition, "source">): string {
  return `${condition.source} is being opened. Nothing is asked of you until it is.`;
}

// ---- The operator's mail -----------------------------------------------------------------------------------------

/** A gift that waits for its line to be opened: its number, and the day its two people read. */
export type AskingGift = Readonly<{ giftId: string; conditionId: string; fundedAt: number }>;

/** The day both people read, said for the operator on the server's clock (UTC): the gift's day plus two days. */
export function readyByInWords(fundedAt: number): string {
  return dateInWords((fundedAt + ON_REQUEST_DAYS * 86_400) * 1_000, "UTC");
}

/** What the operator does, in order, for a line asked for. Each line of the register on request has its steps here. */
const OPENING_STEPS: Readonly<Record<string, readonly string[]>> = {
  "strava-daily": ["Take Strava's subscription with the account that owns the application.", "In Strava's API settings, reactivate the application and raise it to ten athletes.", "Open Strava in Viky with the one line written here."],
};

/** The line the operator runs, and where: the same words every operator mail ends on. */
const theLine = (conditionId: string): string[] => [`pnpm source:open ${conditionId}`, "In production, with the operator's environment: VIKY_ALLOW_PRODUCTION_DATABASE=1 before the command above."];

const steps = (conditionId: string): string[] => (OPENING_STEPS[conditionId] ?? []).map((step, at) => `${at + 1}. ${step}`);

/** The mail sent once for a gift that asks for a line on request (the founder's mockup of 12 Oct 2026). */
export function sourceAskedAlert(gift: AskingGift): Alert {
  const source = conditionById(gift.conditionId)?.source ?? gift.conditionId;
  const readyBy = readyByInWords(gift.fundedAt);
  return {
    subject: `${source} asked for: gift ${gift.giftId}, ready by ${readyBy}`,
    text: [`A gift asks for ${source}. Both people read that it is ready by ${readyBy}.`, "", ...steps(gift.conditionId), "", ...theLine(gift.conditionId)].join("\n"),
  };
}

/** The morning's mail while gifts wait for a line: every one of them, the earliest day first, and the same steps. */
export function sourceStillAskedAlert(conditionId: string, gifts: readonly AskingGift[]): Alert {
  const source = conditionById(conditionId)?.source ?? conditionId;
  const waiting = [...gifts].sort((left, right) => left.fundedAt - right.fundedAt);
  const first = waiting[0]!;
  return {
    subject: `${source} still asked for: ${waiting.length === 1 ? `gift ${first.giftId}` : `${waiting.length} gifts`}, ready by ${readyByInWords(first.fundedAt)}`,
    text: [
      `${waiting.length === 1 ? "A gift still asks" : `${waiting.length} gifts still ask`} for ${source}, and it is not open.`,
      ...waiting.map((gift) => `Gift ${gift.giftId}: both people read that it is ready by ${readyByInWords(gift.fundedAt)}.`),
      "",
      ...steps(conditionId),
      "",
      ...theLine(conditionId),
    ].join("\n"),
  };
}

export type AskedDeps = Readonly<{
  /** Every gift Viky holds a record of, with the contract that holds it. */
  gifts: () => Promise<readonly Readonly<{ giftId: string; goalType: number; escrow: string | null }>[]>;
  /** The gift as its contract holds it: when it was funded, and whether it is over. Nothing when it cannot be read. */
  onChain: (escrow: string, giftId: string) => Promise<Readonly<{ fundedAt: number; cancelled: boolean; finalised: boolean }> | null>;
  send: (alert: Alert) => Promise<unknown>;
}>;

/** The gifts that wait for a line still to be opened: made on it, and neither taken back nor ended. */
export async function giftsAsking(deps: Pick<AskedDeps, "gifts" | "onChain">): Promise<readonly AskingGift[]> {
  const waiting = await waitingToBeOpened();
  if (waiting.size === 0) return [];
  const asking: AskingGift[] = [];
  for (const gift of await deps.gifts()) {
    const conditionId = conditionOfGoal(gift.goalType)?.id;
    if (!conditionId || !waiting.has(conditionId) || !gift.escrow) continue;
    const held = await deps.onChain(gift.escrow, gift.giftId).catch(() => null);
    if (!held || held.cancelled || held.finalised) continue;
    asking.push({ giftId: gift.giftId, conditionId, fundedAt: held.fundedAt });
  }
  return asking;
}

/**
 * Tells the operator of each gift that asks for a line, once for a gift: called by the pass that runs every hour,
 * so a gift is told whichever way it was paid, within the hour. A gift is marked told before its mail leaves; one whose mail
 * did not leave is in the next morning's reminder. Returns the gifts told by this call.
 */
export async function tellOfGiftsAsking(deps: AskedDeps): Promise<readonly string[]> {
  if ((await waitingToBeOpened()).size === 0) return [];
  await ensureOnRequestSchema();
  const told = new Set((await sql()`SELECT gift_id FROM viky_source_asked`).map((row) => String(row.gift_id)));
  const candidates = (await deps.gifts()).filter((gift) => !told.has(gift.giftId));
  const asking = await giftsAsking({ gifts: async () => candidates, onChain: deps.onChain });
  const sent: string[] = [];
  for (const gift of asking) {
    const claimed = await sql()`INSERT INTO viky_source_asked (gift_id, condition_id) VALUES (${gift.giftId}, ${gift.conditionId}) ON CONFLICT (gift_id) DO NOTHING RETURNING gift_id`;
    if (claimed.length === 0) continue;
    await deps.send(sourceAskedAlert(gift));
    sent.push(gift.giftId);
  }
  return sent;
}

/** The morning's reminders, one a line that gifts still wait for; nothing when none waits. */
export async function remindersOfGiftsAsking(deps: Pick<AskedDeps, "gifts" | "onChain">): Promise<readonly Readonly<{ conditionId: string; alert: Alert }>[]> {
  const asking = await giftsAsking(deps);
  const lines = [...new Set(asking.map((gift) => gift.conditionId))];
  return lines.map((conditionId) => ({ conditionId, alert: sourceStillAskedAlert(conditionId, asking.filter((gift) => gift.conditionId === conditionId)) }));
}
