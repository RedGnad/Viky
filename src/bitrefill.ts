/**
 * Bitrefill, the third way out (D238): Viky buys a phone top-up, or later a gift card, for the person, with the money
 * the person sends it. Server only. This file talks to Bitrefill and nothing else: which operators serve a number, an
 * invoice for one product, and what became of it. Moving money is src/phone-treasury.ts's.
 *
 * Read on 25 Sep 2026 (docs.bitrefill.com, and the terms of 30 Apr 2026):
 * - `https://api-bitrefill.com/v2`, the Personal API with a Bearer key from Account > Developers. The Business API
 *   (Basic auth, an API id and secret) is what Bitrefill names for a platform; its credentials are read here too so the
 *   day it is granted nothing else changes.
 * - `GET /check_phone_number?phone_number=<E.164>` answers the operators for a number, each with packages or a range.
 * - `POST /invoices` with one product and `payment_method: "usdc_base"` answers an invoice priced in USDC with the
 *   address to pay on Base; Bitrefill does not take Monad, so the treasury pays it on Base. `refund_address` is where a
 *   failed delivery's money comes back.
 * - `GET /invoices/<id>`: `unpaid`, `payment_detected`, `payment_confirmed`, `pending`, `complete`, `blocked`, `denied`,
 *   `payment_error`; a phone top-up's order is `delivered` or `failed`, and carries no code.
 * - Limits of a basic account (terms §8): five phone items a day, 200 USD a refill, 500 USD a day, 2,000 USD a month.
 *   The pilot runs on one account, so they are the whole service's (the founder, 25 Sep 2026).
 */

export const BITREFILL_BASE_URL = "https://api-bitrefill.com/v2";

/** Where Viky pays: USDC on Base, one of the networks Bitrefill lists (docs, "Crypto Payments", read 25 Sep 2026). */
export const BITREFILL_PAYMENT_METHOD = "usdc_base";

/** The basic account's own ceilings (terms §8, 30 Apr 2026): the pilot's, for every person together. */
export const BITREFILL_ACCOUNT_LIMITS = Object.freeze({ phoneItemsPerDay: 5, usdPerRefill: 200, usdPerDay: 500, usdPerMonth: 2000 });

export type BitrefillErrorCode =
  | "NOT_CONFIGURED"
  | "INVALID_PHONE_NUMBER"
  | "COUNTRY_NOT_SERVED"
  | "UNSUPPORTED_OPERATOR"
  | "INVOICE_REFUSED"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "BAD_ANSWER";

export class BitrefillError extends Error {
  constructor(
    readonly code: BitrefillErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "BitrefillError";
  }
}

/** The account's key, as an Authorization header: the Personal API's Bearer key, or the Business API's pair. */
export function bitrefillAuthorization(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.BITREFILL_API_KEY?.trim();
  if (key) return `Bearer ${key}`;
  const id = env.BITREFILL_API_ID?.trim();
  const secret = env.BITREFILL_API_SECRET?.trim();
  if (id && secret) return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  throw new BitrefillError("NOT_CONFIGURED", "Bitrefill is not configured");
}

export function bitrefillConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    bitrefillAuthorization(env);
    return true;
  } catch {
    return false;
  }
}

/** A number in E.164, the form Bitrefill takes: a plus, a country code, eight to fifteen digits in all. */
export function e164Of(typed: string): string | undefined {
  const text = typed.replace(/[\s().-]/g, "");
  const international = text.startsWith("00") ? `+${text.slice(2)}` : text;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : undefined;
}

export type BitrefillPackage = Readonly<{ id: string; value: string; priceUsd: number }>;
export type BitrefillOperator = Readonly<{
  id: string;
  name: string;
  /** The currency the operator's amounts are in, XOF for Orange Sénégal. */
  currency: string;
  packages: readonly BitrefillPackage[];
  range: Readonly<{ min: number; max: number; step: number; priceRate: number }> | null;
}>;

export type BitrefillInvoice = Readonly<{
  id: string;
  status: string;
  /** What Bitrefill asks, in USDC, and where on Base. */
  payment: Readonly<{ method: string; address: string; price: string; currency: string }>;
  orders: ReadonlyArray<Readonly<{ id: string; status: string }>>;
}>;

export type BitrefillFetch = (url: string, init: RequestInit) => Promise<Response>;

type Deps = Readonly<{ fetch: BitrefillFetch; env: NodeJS.ProcessEnv }>;

function liveDeps(): Deps {
  return { fetch, env: process.env };
}

/** Bitrefill's own error codes that say something about the person's request, in the typed words of this file. */
function errorOf(status: number, body: { error_code?: unknown; message?: unknown }): BitrefillError {
  const code = typeof body.error_code === "string" ? body.error_code : "";
  const message = typeof body.message === "string" ? body.message : `Bitrefill answered ${status}`;
  if (status === 401 || status === 403) return new BitrefillError("NOT_CONFIGURED", "Bitrefill refused the account's key");
  if (status === 429) return new BitrefillError("RATE_LIMITED", "Bitrefill asks to wait before trying again");
  if (code === "invalid_phone_number") return new BitrefillError("INVALID_PHONE_NUMBER", message);
  if (code === "unsupported_operator") return new BitrefillError("UNSUPPORTED_OPERATOR", message);
  if (status >= 400 && status < 500) return new BitrefillError("INVOICE_REFUSED", message);
  return new BitrefillError("UNAVAILABLE", message);
}

async function call<T>(path: string, init: RequestInit, deps: Deps): Promise<T> {
  const authorization = bitrefillAuthorization(deps.env);
  let response: Response;
  try {
    response = await deps.fetch(`${BITREFILL_BASE_URL}${path}`, {
      ...init,
      headers: { authorization, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new BitrefillError("UNAVAILABLE", "Bitrefill could not be reached", { cause: error });
  }
  const body = (await response.json().catch(() => ({}))) as { data?: unknown; error_code?: unknown; message?: unknown };
  if (!response.ok) throw errorOf(response.status, body);
  if (body.data === undefined) throw new BitrefillError("BAD_ANSWER", "Bitrefill answered without data");
  return body.data as T;
}

function operatorOf(raw: Record<string, unknown>): BitrefillOperator | undefined {
  if (typeof raw.id !== "string" || typeof raw.name !== "string") return undefined;
  const packages = Array.isArray(raw.packages)
    ? raw.packages.flatMap((item) => {
        const p = item as Record<string, unknown>;
        const price = Number(p.price);
        return typeof p.id === "string" && Number.isFinite(price) && price > 0 ? [{ id: p.id, value: String(p.value), priceUsd: price }] : [];
      })
    : [];
  const r = raw.range as Record<string, unknown> | undefined;
  const range =
    r && [r.min, r.max, r.step, r.price_rate].every((n) => Number.isFinite(Number(n)) && Number(n) > 0)
      ? { min: Number(r.min), max: Number(r.max), step: Number(r.step), priceRate: Number(r.price_rate) }
      : null;
  return { id: raw.id, name: raw.name, currency: typeof raw.currency === "string" ? raw.currency : "", packages, range };
}

/** The operators that serve a number, or a refusal by name: a number of a country Bitrefill does not serve has none. */
export async function operatorsFor(phoneNumber: string, deps: Deps = liveDeps()): Promise<readonly BitrefillOperator[]> {
  const e164 = e164Of(phoneNumber);
  if (!e164) throw new BitrefillError("INVALID_PHONE_NUMBER", "That is not a phone number in international form");
  const data = await call<{ operators?: unknown }>(`/check_phone_number?phone_number=${encodeURIComponent(e164)}`, { method: "GET" }, deps);
  const operators = Array.isArray(data.operators) ? data.operators.flatMap((raw) => operatorOf(raw as Record<string, unknown>) ?? []) : [];
  if (operators.length === 0) throw new BitrefillError("COUNTRY_NOT_SERVED", "No operator Bitrefill serves answers for that number");
  return operators;
}

function invoiceOf(raw: Record<string, unknown>): BitrefillInvoice {
  const payment = (raw.payment ?? {}) as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof payment.address !== "string" || payment.price === undefined) throw new BitrefillError("BAD_ANSWER", "Bitrefill answered an invoice without a price or an address");
  const orders = Array.isArray(raw.orders) ? raw.orders.map((o) => ({ id: String((o as Record<string, unknown>).id), status: String((o as Record<string, unknown>).status) })) : [];
  return {
    id: raw.id,
    status: String(raw.status ?? ""),
    payment: { method: String(payment.method ?? ""), address: payment.address, price: String(payment.price), currency: String(payment.currency ?? "") },
    orders,
  };
}

/**
 * An invoice for one product, priced in USDC to be paid on Base. Nothing is paid here: the invoice is the price, and
 * the person's money moves only once it exists (the founder, 25 Sep 2026).
 */
export async function createInvoice(
  input: Readonly<{ productId: string; packageId?: string; value?: number; phoneNumber?: string; refundAddress: string }>,
  deps: Deps = liveDeps(),
): Promise<BitrefillInvoice> {
  const product: Record<string, unknown> = { product_id: input.productId, quantity: 1 };
  if (input.packageId) product.package_id = input.packageId;
  else if (input.value !== undefined) product.value = input.value;
  else throw new BitrefillError("INVOICE_REFUSED", "An invoice needs a package or a value");
  if (input.phoneNumber) {
    const e164 = e164Of(input.phoneNumber);
    if (!e164) throw new BitrefillError("INVALID_PHONE_NUMBER", "That is not a phone number in international form");
    product.phone_number = e164;
  }
  const data = await call<Record<string, unknown>>(
    "/invoices",
    { method: "POST", body: JSON.stringify({ products: [product], payment_method: BITREFILL_PAYMENT_METHOD, refund_address: input.refundAddress, auto_pay: false }) },
    deps,
  );
  const invoice = invoiceOf(data);
  if (invoice.payment.method && invoice.payment.method !== BITREFILL_PAYMENT_METHOD) throw new BitrefillError("BAD_ANSWER", `Bitrefill priced the invoice in ${invoice.payment.method}`);
  return invoice;
}

export async function readInvoice(id: string, deps: Deps = liveDeps()): Promise<BitrefillInvoice> {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) throw new BitrefillError("BAD_ANSWER", "That is not an invoice id");
  return invoiceOf(await call<Record<string, unknown>>(`/invoices/${id}`, { method: "GET" }, deps));
}

/** An invoice's state, in the three things the rest of Viky asks: still going, delivered, or over without delivery. */
export type InvoiceOutcome = "waiting" | "delivered" | "failed";

export function outcomeOf(invoice: BitrefillInvoice): InvoiceOutcome {
  if (["blocked", "denied", "payment_error"].includes(invoice.status)) return "failed";
  if (invoice.orders.some((order) => order.status === "failed" || order.status === "refunded")) return "failed";
  if (invoice.status === "complete" && invoice.orders.length > 0 && invoice.orders.every((order) => order.status === "delivered")) return "delivered";
  return "waiting";
}

/** A USDC price as Bitrefill prints it ("5.123456"), in units of six decimals, rounded up so Viky never underpays. */
export function usdcUnits(price: string): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(price.trim());
  if (!match) throw new BitrefillError("BAD_ANSWER", `Bitrefill priced the invoice at ${price}`);
  const whole = BigInt(match[1]) * 1_000_000n;
  const decimals = match[2] ?? "";
  const kept = BigInt((decimals.slice(0, 6) || "0").padEnd(6, "0"));
  const rest = /[1-9]/.test(decimals.slice(6)) ? 1n : 0n;
  return whole + kept + rest;
}
