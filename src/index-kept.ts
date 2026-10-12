import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import { askIndex, indexFrom, type IndexRead } from "./envio-index";
import { momentInWords } from "./judges-first-use";
import type { SqlExecutor } from "./proof-session-store";

/**
 * The last answer of the index, kept (the founder, 12 Oct 2026). The index runs on Envio's hosted service, on a plan
 * that counts its hours, and nothing published says what happens past them. So each answer the judges page gets is
 * kept, and when the index does not answer the page shows the last one, with the block it had reached and the moment
 * it was read, instead of showing nothing. Server only.
 *
 * What is kept is the answer as it came, in one row. It is read back through the same checks as a fresh answer
 * (`indexFrom`), so a row that is not an answer shows nothing. Nothing that moves money reads it, as nothing reads
 * the index itself.
 */

/** The plan the hosted index runs on, as Envio's dashboard states it (read on 12 Oct 2026). */
export const INDEX_PLAN = { name: "Development", free: true, indexingHoursAMonth: 750, readOn: "12 Oct 2026" } as const;

/** An answer is written again once the one kept is this old: a page served many times a minute writes once. */
export const KEEP_EVERY_MS = 10 * 60 * 1_000;

const SCHEMA = `CREATE TABLE IF NOT EXISTS viky_index_kept (
  id text PRIMARY KEY,
  read_at timestamptz NOT NULL,
  block bigint NOT NULL,
  answer jsonb NOT NULL
)`;

let executor: SqlExecutor | undefined;
let ready: Promise<void> | undefined;

export function configureIndexKept(custom: SqlExecutor | undefined): void {
  executor = custom;
  ready = undefined;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

/** The table, made the first time it is needed in a process, so no deployment waits on a migration for it. */
export function ensureIndexKeptSchema(): Promise<void> {
  ready ??= (async () => {
    const strings = Object.assign([SCHEMA], { raw: [SCHEMA] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  })().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

/**
 * Keeps an answer of the index. The one kept is replaced only by an answer that has reached at least its block, so an
 * index that starts again from its first block never takes the place of a whole reading, and only once it is ten
 * minutes old.
 */
export async function keepIndex(index: Pick<IndexRead, "block">, answer: unknown, now: Date = new Date()): Promise<void> {
  await ensureIndexKeptSchema();
  const at = now.toISOString();
  const before = new Date(now.getTime() - KEEP_EVERY_MS).toISOString();
  await sql()`
    INSERT INTO viky_index_kept (id, read_at, block, answer) VALUES ('last', ${at}, ${index.block}, ${JSON.stringify(answer)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET read_at = EXCLUDED.read_at, block = EXCLUDED.block, answer = EXCLUDED.answer
     WHERE viky_index_kept.block <= EXCLUDED.block AND viky_index_kept.read_at <= ${before}`;
}

/** The last answer kept, read as an answer is, with the moment it was read. Nothing when none is kept. */
export async function lastIndexKept(): Promise<IndexRead | null> {
  await ensureIndexKeptSchema();
  const rows = await sql()`SELECT read_at, answer FROM viky_index_kept WHERE id = 'last'`;
  const row = rows[0];
  if (!row) return null;
  const index = indexFrom(typeof row.answer === "string" ? JSON.parse(row.answer) : row.answer);
  const readAt = new Date(String(row.read_at instanceof Date ? row.read_at.toISOString() : row.read_at));
  if (!index || Number.isNaN(readAt.getTime())) return null;
  return { ...index, keptFrom: readAt };
}

/**
 * The index for the judges page: its answer of now, which is kept, or the last answer kept when it does not answer,
 * or nothing. It never throws: a database that cannot be reached keeps nothing and shows what the index says.
 */
export async function indexToShow(ask: typeof askIndex = askIndex, now: Date = new Date()): Promise<IndexRead | null> {
  const asked = await ask();
  if (asked) {
    await keepIndex(asked.index, asked.answer, now).catch(() => undefined);
    return asked.index;
  }
  return lastIndexKept().catch(() => null);
}

/** When the figures a block prints were read: as the page is served, or at the last reading kept, with its moment. */
export function whenIndexRead(index: Pick<IndexRead, "keptFrom">): string {
  return index.keptFrom ? `at its last reading, on ${momentInWords(index.keptFrom)}` : "as this page is served";
}
