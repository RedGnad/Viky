import { createPublicKey, verify } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import type { ConsentKind } from "./consent";
import type { SqlExecutor } from "./proof-session-store";

/**
 * The recipients' agreements and stops, kept with their signatures (the founder, 29 Sep 2026). Server only.
 *
 * One row per yes and per stop, never updated: the state of a gift is its latest row. The consent key an account signs
 * with is kept at its first signature, and every later one must be made by the same key: the same passkey makes it on
 * every device (src/client/consent-key.ts), so a different key is a different passkey, and is refused.
 *
 * The tables are made the first time they are written in a process: production does not run the migration on deploy.
 */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS viky_consents (
    id serial PRIMARY KEY,
    gift_id text NOT NULL,
    account text NOT NULL,
    kind text NOT NULL,
    text text NOT NULL,
    public_key text NOT NULL,
    signature text NOT NULL,
    signed_at timestamptz NOT NULL DEFAULT now(),
    anchor_tx text
  )`,
  `CREATE INDEX IF NOT EXISTS viky_consents_gift ON viky_consents (gift_id, signed_at)`,
  `CREATE INDEX IF NOT EXISTS viky_consents_account ON viky_consents (account)`,
  `CREATE TABLE IF NOT EXISTS viky_consent_keys (
    account text PRIMARY KEY,
    public_key text NOT NULL,
    first_signed_at timestamptz NOT NULL DEFAULT now()
  )`,
];

let executor: SqlExecutor | undefined;
let ready: Promise<void> | undefined;

export function configureConsentStore(custom: SqlExecutor | undefined): void {
  executor = custom;
  ready = undefined;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

export function ensureConsentSchema(): Promise<void> {
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

/** An Ed25519 signature over `message` by the raw 32-byte `publicKey`. */
export function ed25519Verifies(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey)]), format: "der", type: "spki" });
    return verify(null, Buffer.from(message), key, Buffer.from(signature));
  } catch {
    return false;
  }
}

/** The consent key an account signs with, kept at its first signature, or nothing yet. */
export async function consentKeyOf(account: string): Promise<string | null> {
  await ensureConsentSchema();
  const rows = await sql()`SELECT public_key FROM viky_consent_keys WHERE account = ${account.toLowerCase()}`;
  return rows[0] ? String(rows[0].public_key) : null;
}

/** Keeps an account's consent key the first time it signs; a second call changes nothing. Answers the key kept. */
export async function keepConsentKey(account: string, publicKey: string): Promise<string> {
  await ensureConsentSchema();
  await sql()`INSERT INTO viky_consent_keys (account, public_key) VALUES (${account.toLowerCase()}, ${publicKey.toLowerCase()}) ON CONFLICT (account) DO NOTHING`;
  return (await consentKeyOf(account)) ?? publicKey.toLowerCase();
}

export type ConsentRow = Readonly<{ id: number; giftId: string; account: string; kind: ConsentKind; text: string; publicKey: string; signature: string; signedAt: Date; anchorTx: string | null }>;

function rowOf(row: Record<string, unknown>): ConsentRow {
  return {
    id: Number(row.id),
    giftId: String(row.gift_id),
    account: String(row.account),
    kind: row.kind === "stop" ? "stop" : "yes",
    text: String(row.text),
    publicKey: String(row.public_key),
    signature: String(row.signature),
    signedAt: row.signed_at instanceof Date ? row.signed_at : new Date(String(row.signed_at)),
    anchorTx: row.anchor_tx === null || row.anchor_tx === undefined ? null : String(row.anchor_tx),
  };
}

export async function keepConsent(input: { giftId: string; account: string; kind: ConsentKind; text: string; publicKey: string; signature: string }): Promise<ConsentRow> {
  await ensureConsentSchema();
  const rows = await sql()`
    INSERT INTO viky_consents (gift_id, account, kind, text, public_key, signature)
    VALUES (${input.giftId}, ${input.account.toLowerCase()}, ${input.kind}, ${input.text}, ${input.publicKey.toLowerCase()}, ${input.signature.toLowerCase()})
    RETURNING *`;
  return rowOf(rows[0]);
}

/** The latest yes or stop of a gift, which is its state: agreed, stopped, or nothing yet. */
export async function latestConsent(giftId: string): Promise<ConsentRow | null> {
  await ensureConsentSchema();
  const rows = await sql()`SELECT * FROM viky_consents WHERE gift_id = ${giftId} ORDER BY signed_at DESC, id DESC LIMIT 1`;
  return rows[0] ? rowOf(rows[0]) : null;
}

/** Every yes and stop of a gift, oldest first: what its journal is marked by. */
export async function consentHistory(giftId: string): Promise<ConsentRow[]> {
  await ensureConsentSchema();
  const rows = await sql()`SELECT * FROM viky_consents WHERE gift_id = ${giftId} ORDER BY signed_at ASC, id ASC`;
  return rows.map(rowOf);
}

/** The latest row of every gift an account has signed for, newest first: what Me lists. */
export async function latestConsentsOf(account: string): Promise<ConsentRow[]> {
  await ensureConsentSchema();
  const rows = await sql()`
    SELECT DISTINCT ON (gift_id) * FROM viky_consents WHERE account = ${account.toLowerCase()}
    ORDER BY gift_id, signed_at DESC, id DESC`;
  return rows.map(rowOf).sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime());
}
