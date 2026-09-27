import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getAddress } from "viem";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";

/**
 * The treasury's turn to pay on Base (the money path audit of 27 Sep 2026): one payment at a time for one paying
 * address, across every server instance. Each payment reads the treasury's next nonce from Base itself, so two at once
 * from two instances could sign the same nonce, and one could replace the other. A payment takes the turn before it reads
 * anything, and hands it back once its fate is known.
 *
 * The turn is one row per paying address, taken by one conditional statement: it is taken when there is no row, or
 * when the row's time is over; two requests at once cannot both take it. Its time covers the longest life of the
 * function that pays (`BASE_PAYMENT_LEASE_SECONDS`), so a turn is taken back only from a function that no longer runs.
 *
 * A run with no database at all (a test, a script) has no turn to take and pays at once: no order can exist there,
 * since the order store refuses without one. With a database named, a store that does not answer pays nothing.
 */

/** The pay route's `maxDuration` (app/api/phone/pay/route.ts): after it, the function holding the turn has been stopped. */
export const BASE_PAYMENT_LEASE_SECONDS = 120;

/** How long a payment waits for the turn before it gives up, having signed and sent nothing. */
export const BASE_PAYMENT_WAIT_MS = 20_000;

const LEASE = `${BASE_PAYMENT_LEASE_SECONDS} seconds`;

export const BASE_PAYMENT_LEASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_base_payment_lease (
  payer text PRIMARY KEY,
  holder text NOT NULL,
  expires_at timestamptz NOT NULL
)
`;

let executor: SqlExecutor | undefined;
export function configureBasePaymentLeaseStore(custom: SqlExecutor | undefined): void {
  executor = custom;
  schema = undefined;
}
function sql(): SqlExecutor | undefined {
  if (executor) return executor;
  if (!process.env.DATABASE_URL?.trim()) return undefined;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

let schema: Promise<void> | undefined;
/** Made on first use, so the first payment of a deployment never runs before its table exists. Once per instance. */
function ensureBasePaymentLeaseSchema(run: SqlExecutor): Promise<void> {
  schema ??= (async () => {
    const strings = Object.assign([BASE_PAYMENT_LEASE_SCHEMA], { raw: [BASE_PAYMENT_LEASE_SCHEMA] }) as unknown as TemplateStringsArray;
    await run(strings);
  })().catch((error: unknown) => {
    schema = undefined;
    throw error;
  });
  return schema;
}

/** Takes the turn in one statement, or answers that someone else holds it. */
async function take(run: SqlExecutor, payer: string, holder: string): Promise<boolean> {
  await ensureBasePaymentLeaseSchema(run);
  const taken = await run`
    INSERT INTO viky_base_payment_lease (payer, holder, expires_at)
    VALUES (${payer}, ${holder}, now() + ${LEASE}::interval)
    ON CONFLICT (payer) DO UPDATE SET holder = EXCLUDED.holder, expires_at = EXCLUDED.expires_at
      WHERE viky_base_payment_lease.expires_at <= now()
    RETURNING holder`;
  return taken.length === 1;
}

/** Hands the turn back, only if it is still this holder's. Never throws: a turn not handed back ends with its time. */
async function release(run: SqlExecutor, payer: string, holder: string): Promise<void> {
  try {
    await run`DELETE FROM viky_base_payment_lease WHERE payer = ${payer} AND holder = ${holder}`;
  } catch (error) {
    console.error(`the treasury's turn on Base was not handed back, it ends in ${BASE_PAYMENT_LEASE_SECONDS} seconds: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export type BasePaymentTurn = Readonly<{ release: () => Promise<void> }>;

/**
 * The turn for this paying address, waited for up to `waitMs`, or null when another payment still holds it then. A
 * store that cannot be reached throws: the caller pays nothing either way.
 */
export async function takeBasePaymentTurn(payer: string, options: Readonly<{ waitMs?: number; pollMs?: number }> = {}): Promise<BasePaymentTurn | null> {
  const run = sql();
  if (!run) return { release: async () => undefined };
  const key = getAddress(payer).toLowerCase();
  const holder = randomUUID();
  const until = Date.now() + (options.waitMs ?? BASE_PAYMENT_WAIT_MS);
  const pollMs = options.pollMs ?? 500;
  for (;;) {
    if (await take(run, key, holder)) return { release: () => release(run, key, holder) };
    const left = until - Date.now();
    if (left <= 0) return null;
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, left)));
  }
}
