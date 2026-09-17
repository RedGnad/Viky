import { randomBytes } from "node:crypto";
import { databaseUrl } from "./database-guard";
import { neon } from "@neondatabase/serverless";
import { getAddress, type Hex } from "viem";
import { GiftApiError } from "./gift-api";
import type { SqlExecutor } from "./proof-session-store";

/**
 * Every send of a person's own money, written down once it is final, so the confirmation can print a reference
 * the person can quote and an operator can find (decision 7 of the design pass, 17 Sep 2026).
 *
 * Nothing here moves money and nothing here is read before a send: the row is the receipt, not the authority.
 * The relayed sends are written by the route that relays them; the sends a person makes from their own account,
 * for the chain's own coin, are written by a second route once the browser reports the hash, and that route
 * reads the transaction back before believing it.
 */

export const SENDS_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_sends (
  id text PRIMARY KEY,
  account text NOT NULL,
  coin text NOT NULL,
  destination text NOT NULL,
  amount text NOT NULL,
  tx_hash text NOT NULL UNIQUE,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS viky_sends_account ON viky_sends (account, sent_at DESC);
`;

let executor: SqlExecutor | undefined;

export function configureSendStore(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  if (!process.env.DATABASE_URL?.trim()) throw new GiftApiError("NOT_CONFIGURED", "Viky is not ready for this yet.", 503);
  const url = databaseUrl();
  return neon(url) as unknown as SqlExecutor;
}

export async function ensureSendsSchema(): Promise<void> {
  for (const statement of SENDS_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

export function newSendId(): string {
  return randomBytes(12).toString("hex");
}

/**
 * The reference a person reads: the first eight characters of the hash. Short enough to say out loud, and it
 * names one transaction on the chain to anybody who has to find it, without a word the person never sees.
 */
export function sendReference(txHash: Hex): string {
  return txHash.slice(2, 10);
}

export type SendRecord = Readonly<{ id: string; account: Hex; coin: Hex; destination: Hex; amount: bigint; txHash: Hex; sentAtMs: number }>;

export async function recordSend(input: Omit<SendRecord, "id" | "sentAtMs">): Promise<{ id: string; reference: string }> {
  const id = newSendId();
  await sql()`
    INSERT INTO viky_sends (id, account, coin, destination, amount, tx_hash)
    VALUES (${id}, ${input.account.toLowerCase()}, ${input.coin.toLowerCase()}, ${input.destination.toLowerCase()}, ${input.amount.toString()}, ${input.txHash.toLowerCase()})
    ON CONFLICT (tx_hash) DO NOTHING`;
  return { id, reference: sendReference(input.txHash) };
}

export async function loadSends(account: string): Promise<SendRecord[]> {
  const rows = await sql()`SELECT * FROM viky_sends WHERE account = ${account.toLowerCase()} ORDER BY sent_at DESC`;
  return rows.map((row) => ({
    id: String(row.id),
    account: getAddress(String(row.account)),
    coin: getAddress(String(row.coin)),
    destination: getAddress(String(row.destination)),
    amount: BigInt(String(row.amount)),
    txHash: String(row.tx_hash) as Hex,
    sentAtMs: new Date(String(row.sent_at)).getTime(),
  }));
}
