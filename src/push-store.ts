import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";

/**
 * Who asked to be told each morning, and what has already been told (N1, 17 Sep 2026).
 *
 * A subscription is one browser on one device, for one gift, asked for by one signed-in account. The same browser
 * subscribing to a second gift is a second row: a person who wants to hear about one gift and not another is told
 * about one gift and not another. Nothing is written until the person presses the button and their phone agrees.
 *
 * What a row holds is what the push service requires to reach that browser and nothing else: the service's own
 * endpoint and the two keys the browser generated for it. No name, no contact, no message. Deleting the row is the
 * whole of unsubscribing, and the same delete happens on its own the first time a push service says the browser is
 * gone (`forgetEndpoint`), so a dead subscription is never kept.
 *
 * `viky_told` is the other half of the promise: one row per gift and subject, claimed before a sending, so a day is
 * told about once even if the keeper writes its record twice.
 */

export const PUSH_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_push (
  endpoint text NOT NULL,
  gift_id text NOT NULL,
  account text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (endpoint, gift_id)
);
CREATE INDEX IF NOT EXISTS viky_push_gift ON viky_push (gift_id);
CREATE TABLE IF NOT EXISTS viky_told (
  gift_id text NOT NULL,
  subject text NOT NULL,
  told_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gift_id, subject)
);
`;

let executor: SqlExecutor | undefined;

export function configurePushStore(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

export async function ensurePushSchema(): Promise<void> {
  for (const statement of PUSH_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

/** One browser, as the push service and the encryption need it. */
export type StoredSubscription = Readonly<{ endpoint: string; giftId: string; account: string; p256dh: string; auth: string }>;

export type NewSubscription = Readonly<{ endpoint: string; giftId: string; account: string; p256dh: string; auth: string }>;

/** Remembers a browser for a gift. Pressing the button again on the same device changes nothing but the keys. */
export async function rememberSubscription(input: NewSubscription): Promise<void> {
  await sql()`
    INSERT INTO viky_push (endpoint, gift_id, account, p256dh, auth)
    VALUES (${input.endpoint}, ${input.giftId}, ${input.account.toLowerCase()}, ${input.p256dh}, ${input.auth})
    ON CONFLICT (endpoint, gift_id) DO UPDATE SET account = EXCLUDED.account, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`;
}

/** The one gesture that stops the morning message for this gift, on this device. */
export async function forgetSubscription(endpoint: string, giftId: string): Promise<void> {
  await sql()`DELETE FROM viky_push WHERE endpoint = ${endpoint} AND gift_id = ${giftId}`;
}

/** A browser the push service says is gone: it is gone for every gift, not only the one being told about. */
export async function forgetEndpoint(endpoint: string): Promise<number> {
  const rows = await sql()`DELETE FROM viky_push WHERE endpoint = ${endpoint} RETURNING gift_id`;
  return rows.length;
}

export async function subscriptionsForGift(giftId: string): Promise<StoredSubscription[]> {
  const rows = await sql()`SELECT endpoint, gift_id, account, p256dh, auth FROM viky_push WHERE gift_id = ${giftId} ORDER BY created_at`;
  return rows.map((row) => ({
    endpoint: String(row.endpoint),
    giftId: String(row.gift_id),
    account: String(row.account),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
  }));
}

/** Whether this browser is already being told about this gift, for the button to draw itself. */
export async function isSubscribed(endpoint: string, giftId: string): Promise<boolean> {
  const rows = await sql()`SELECT 1 FROM viky_push WHERE endpoint = ${endpoint} AND gift_id = ${giftId}`;
  return rows.length > 0;
}

/**
 * Claims one telling. True to the first caller and false to every other, so the same day is never told twice, however
 * many times the keeper writes its record or retries.
 */
export async function claimTelling(giftId: string, subject: string): Promise<boolean> {
  const rows = await sql()`
    INSERT INTO viky_told (gift_id, subject) VALUES (${giftId}, ${subject})
    ON CONFLICT (gift_id, subject) DO NOTHING
    RETURNING subject`;
  return rows.length > 0;
}
