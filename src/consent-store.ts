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
  // The public record of a yes and of a stop (the audit of 1 Oct 2026, ConsentAnchor): the place the row takes in its
  // gift's sequence on the anchor and the consent key's signature over the anchored message, kept until the relayer
  // has written them. The account's own signature binding its consent key is kept the same way, until it is written.
  `ALTER TABLE viky_consents ADD COLUMN IF NOT EXISTS anchor_sequence integer`,
  `ALTER TABLE viky_consents ADD COLUMN IF NOT EXISTS anchor_signature text`,
  `ALTER TABLE viky_consent_keys ADD COLUMN IF NOT EXISTS binding_signature text`,
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

export type ConsentRow = Readonly<{
  id: number;
  giftId: string;
  account: string;
  kind: ConsentKind;
  text: string;
  publicKey: string;
  signature: string;
  signedAt: Date;
  /** The transaction that wrote this row on the anchor, once it has. */
  anchorTx: string | null;
  /** The place it was signed for in its gift's sequence on the anchor, and the consent key's signature for it: there while it waits to be written. */
  anchorSequence: number | null;
  anchorSignature: string | null;
}>;

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
    anchorSequence: row.anchor_sequence === null || row.anchor_sequence === undefined ? null : Number(row.anchor_sequence),
    anchorSignature: row.anchor_signature === null || row.anchor_signature === undefined ? null : String(row.anchor_signature),
  };
}

export async function keepConsent(input: {
  giftId: string;
  account: string;
  kind: ConsentKind;
  text: string;
  publicKey: string;
  signature: string;
  /** What the anchor is to be given for this row, when it was signed for one. */
  anchor?: { sequence: number; signature: string } | null;
}): Promise<ConsentRow> {
  await ensureConsentSchema();
  const rows = await sql()`
    INSERT INTO viky_consents (gift_id, account, kind, text, public_key, signature, anchor_sequence, anchor_signature)
    VALUES (${input.giftId}, ${input.account.toLowerCase()}, ${input.kind}, ${input.text}, ${input.publicKey.toLowerCase()}, ${input.signature.toLowerCase()},
            ${input.anchor?.sequence ?? null}, ${input.anchor?.signature.toLowerCase() ?? null})
    RETURNING *`;
  return rowOf(rows[0]);
}

/** The row is on the anchor: the transaction that wrote it. */
export async function noteAnchored(id: number, txHash: string): Promise<void> {
  await ensureConsentSchema();
  await sql()`UPDATE viky_consents SET anchor_tx = ${txHash.toLowerCase()} WHERE id = ${id}`;
}

/**
 * The row stops waiting for the anchor: its place in the sequence was taken, so the signature made for that place can
 * never be written. The row itself stands as it did: it is the anchor's record of it that will not exist.
 */
export async function stopWaitingForAnchor(id: number): Promise<void> {
  await ensureConsentSchema();
  await sql()`UPDATE viky_consents SET anchor_signature = NULL WHERE id = ${id} AND anchor_tx IS NULL`;
}

/** Keeps the account's signature binding its consent key, until the anchor has it. A second one changes nothing. */
export async function keepBinding(account: string, signature: string): Promise<void> {
  await ensureConsentSchema();
  await sql()`UPDATE viky_consent_keys SET binding_signature = ${signature.toLowerCase()} WHERE account = ${account.toLowerCase()} AND binding_signature IS NULL`;
}

export async function bindingOf(account: string): Promise<string | null> {
  await ensureConsentSchema();
  const rows = await sql()`SELECT binding_signature FROM viky_consent_keys WHERE account = ${account.toLowerCase()}`;
  const value = rows[0]?.binding_signature;
  return value === null || value === undefined ? null : String(value);
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
