import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import { GiftApiError } from "./gift-api";
import type { SqlExecutor } from "./proof-session-store";

/**
 * The ledger of the phone way out (D238): one row per order, from the price Bitrefill gave to the top-up delivered or
 * the AUSD sent back. It is what reconciles the treasury: every AUSD that came in on Monad is next to the invoice it
 * paid on Base, or next to the refund that returned it.
 *
 * The phone number is kept for the order and no longer: it is written when the invoice is made and erased when the
 * order ends, delivered or refunded (the founder, 25 Sep 2026). What stays is the operator, the amounts and the hashes.
 *
 * States, in order: `priced` (Bitrefill's invoice exists, nothing moved), `received` (the person's AUSD is in the
 * treasury), `paid` (the treasury paid the invoice on Base), then `delivered`, or `failed` and `refunded`.
 */

export const PHONE_ORDER_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_phone_orders (
  id text PRIMARY KEY,
  account text NOT NULL,
  kind text NOT NULL,
  product_id text NOT NULL,
  operator_name text NOT NULL,
  local_amount text NOT NULL,
  local_currency text NOT NULL,
  phone_number text,
  invoice_id text NOT NULL UNIQUE,
  usdc_units text NOT NULL,
  ausd_units text NOT NULL,
  ausd_tx text UNIQUE,
  payment_tx text UNIQUE,
  refund_tx text UNIQUE,
  state text NOT NULL,
  failure text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS viky_phone_orders_account ON viky_phone_orders (account, created_at DESC);
CREATE INDEX IF NOT EXISTS viky_phone_orders_day ON viky_phone_orders (created_at)
`;

export type PhoneOrderState = "priced" | "received" | "paid" | "delivered" | "failed" | "refunded";

export type PhoneOrder = Readonly<{
  id: string;
  account: string;
  kind: "phone" | "gift_card";
  productId: string;
  operatorName: string;
  localAmount: string;
  localCurrency: string;
  phoneNumber: string | null;
  invoiceId: string;
  usdcUnits: bigint;
  ausdUnits: bigint;
  ausdTx: string | null;
  paymentTx: string | null;
  refundTx: string | null;
  state: PhoneOrderState;
  failure: string | null;
  createdAt: Date;
}>;

let executor: SqlExecutor | undefined;

export function configurePhoneOrderStore(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  if (!process.env.DATABASE_URL?.trim()) throw new GiftApiError("NOT_CONFIGURED", "Viky is not ready for this yet. Nothing was taken.", 503);
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

export async function ensurePhoneOrderSchema(): Promise<void> {
  for (const statement of PHONE_ORDER_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

function rowOf(row: Record<string, unknown>): PhoneOrder {
  return {
    id: String(row.id),
    account: String(row.account),
    kind: row.kind === "gift_card" ? "gift_card" : "phone",
    productId: String(row.product_id),
    operatorName: String(row.operator_name),
    localAmount: String(row.local_amount),
    localCurrency: String(row.local_currency),
    phoneNumber: row.phone_number === null || row.phone_number === undefined ? null : String(row.phone_number),
    invoiceId: String(row.invoice_id),
    usdcUnits: BigInt(String(row.usdc_units)),
    ausdUnits: BigInt(String(row.ausd_units)),
    ausdTx: row.ausd_tx ? String(row.ausd_tx) : null,
    paymentTx: row.payment_tx ? String(row.payment_tx) : null,
    refundTx: row.refund_tx ? String(row.refund_tx) : null,
    state: String(row.state) as PhoneOrderState,
    failure: row.failure ? String(row.failure) : null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
  };
}

/** A priced order, before anything moved: Bitrefill's invoice, its price in USDC, and the AUSD the person will send. */
export async function recordPricedOrder(input: Omit<PhoneOrder, "id" | "ausdTx" | "paymentTx" | "refundTx" | "state" | "failure" | "createdAt">): Promise<PhoneOrder> {
  const id = `ph_${randomBytes(9).toString("base64url")}`;
  const rows = await sql()`
    INSERT INTO viky_phone_orders (id, account, kind, product_id, operator_name, local_amount, local_currency, phone_number, invoice_id, usdc_units, ausd_units, state)
    VALUES (${id}, ${input.account}, ${input.kind}, ${input.productId}, ${input.operatorName}, ${input.localAmount}, ${input.localCurrency}, ${input.phoneNumber}, ${input.invoiceId}, ${input.usdcUnits.toString()}, ${input.ausdUnits.toString()}, 'priced')
    RETURNING *`;
  return rowOf(rows[0]);
}

export async function loadPhoneOrder(id: string): Promise<PhoneOrder | null> {
  const rows = await sql()`SELECT * FROM viky_phone_orders WHERE id = ${id}`;
  return rows[0] ? rowOf(rows[0]) : null;
}

/**
 * One step forward, and only from the state it follows: a step asked twice, or out of order, changes nothing and says
 * so, so a retried request never pays an invoice twice or refunds twice.
 */
async function advance(id: string, from: readonly PhoneOrderState[], to: PhoneOrderState, fields: Readonly<{ ausdTx?: string; paymentTx?: string; refundTx?: string; failure?: string; erasePhone?: boolean }>): Promise<PhoneOrder | null> {
  const rows = await sql()`
    UPDATE viky_phone_orders SET
      state = ${to},
      ausd_tx = COALESCE(${fields.ausdTx ?? null}, ausd_tx),
      payment_tx = COALESCE(${fields.paymentTx ?? null}, payment_tx),
      refund_tx = COALESCE(${fields.refundTx ?? null}, refund_tx),
      failure = COALESCE(${fields.failure ?? null}, failure),
      phone_number = CASE WHEN ${fields.erasePhone === true} THEN NULL ELSE phone_number END,
      updated_at = now()
    WHERE id = ${id} AND state = ANY(${from as unknown as string[]})
    RETURNING *`;
  return rows[0] ? rowOf(rows[0]) : null;
}

export const markReceived = (id: string, ausdTx: string) => advance(id, ["priced"], "received", { ausdTx });
export const markPaid = (id: string, paymentTx: string) => advance(id, ["received"], "paid", { paymentTx });
export const markDelivered = (id: string) => advance(id, ["paid"], "delivered", { erasePhone: true });
export const markFailed = (id: string, failure: string) => advance(id, ["received", "paid"], "failed", { failure });
export const markRefunded = (id: string, refundTx: string) => advance(id, ["failed"], "refunded", { refundTx, erasePhone: true });
/** A priced order the person never sent money for: nothing moved, so nothing is kept of the number either. */
export const markAbandoned = (id: string) => advance(id, ["priced"], "failed", { failure: "abandoned", erasePhone: true });

/**
 * What counts against a ceiling, since midnight UTC: the orders whose money came in and did not come back. `account`
 * narrows it to one person; without it, it is the whole service, which is what Bitrefill's account limits count.
 */
export async function usedToday(account?: string, now: Date = new Date()): Promise<{ items: number; usdcUnits: bigint }> {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const rows = account
    ? await sql()`SELECT count(*)::int AS items, COALESCE(sum(usdc_units::numeric), 0)::text AS units FROM viky_phone_orders WHERE account = ${account} AND created_at >= ${day} AND state IN ('received', 'paid', 'delivered', 'failed')`
    : await sql()`SELECT count(*)::int AS items, COALESCE(sum(usdc_units::numeric), 0)::text AS units FROM viky_phone_orders WHERE created_at >= ${day} AND state IN ('received', 'paid', 'delivered', 'failed')`;
  return { items: Number(rows[0]?.items ?? 0), usdcUnits: BigInt(String(rows[0]?.units ?? "0").split(".")[0]) };
}

/**
 * The reconciliation, in one read: every order whose AUSD came in must end paid and delivered, or refunded. What is
 * listed here is money the treasury holds for somebody, with the order that says why.
 */
export async function unsettledOrders(): Promise<readonly PhoneOrder[]> {
  const rows = await sql()`SELECT * FROM viky_phone_orders WHERE state IN ('received', 'paid', 'failed') ORDER BY created_at`;
  return rows.map(rowOf);
}
