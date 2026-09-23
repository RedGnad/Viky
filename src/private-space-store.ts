import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";
import type { SealedSpace } from "./private-space";

/**
 * Where the funder's private space is kept: one sealed envelope per account, which this server cannot open (the key
 * is derived in the browser from the passkey and never sent). The revision lets two devices writing at once find out,
 * rather than the later one silently erasing what the earlier one kept.
 */

export const PRIVATE_SPACE_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_private_spaces (
  account text PRIMARY KEY,
  nonce text NOT NULL,
  ciphertext text NOT NULL,
  revision integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

let executor: SqlExecutor | undefined;

export function configurePrivateSpaceStore(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

export async function ensurePrivateSpaceSchema(): Promise<void> {
  for (const statement of PRIVATE_SPACE_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

export type KeptSpace = Readonly<{ sealed: SealedSpace | null; revision: number }>;

export async function loadPrivateSpace(account: string): Promise<KeptSpace> {
  const rows = await sql()`SELECT nonce, ciphertext, revision FROM viky_private_spaces WHERE account = ${account.toLowerCase()}`;
  const row = rows[0];
  if (!row) return { sealed: null, revision: 0 };
  return { sealed: { version: 1, nonce: String(row.nonce), ciphertext: String(row.ciphertext) }, revision: Number(row.revision) };
}

/**
 * Keeps the envelope if the account's space is still at the revision the device read, and answers the new one;
 * answers null when another device kept something in between.
 */
export async function keepPrivateSpace(account: string, sealed: SealedSpace, readRevision: number): Promise<number | null> {
  const who = account.toLowerCase();
  const next = readRevision + 1;
  const rows =
    readRevision === 0
      ? await sql()`
          INSERT INTO viky_private_spaces (account, nonce, ciphertext, revision, updated_at)
          VALUES (${who}, ${sealed.nonce}, ${sealed.ciphertext}, 1, now())
          ON CONFLICT (account) DO NOTHING
          RETURNING revision`
      : await sql()`
          UPDATE viky_private_spaces SET nonce = ${sealed.nonce}, ciphertext = ${sealed.ciphertext}, revision = ${next}, updated_at = now()
          WHERE account = ${who} AND revision = ${readRevision}
          RETURNING revision`;
  return rows[0] ? Number(rows[0].revision) : null;
}
