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
  const listed = Array.isArray(raw.packages) ? raw.packages : raw.packages && typeof raw.packages === "object" ? [raw.packages] : undefined;
  const packages = listed
    ? listed.flatMap((item) => {
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
  // Bitrefill's v2 answer (docs.bitrefill.com, "Searches for providers for the specified phone number", read 27 Sep
  // 2026): `data` is the operator's product when it recognises the number (`operator_found`), or the list of the
  // products that may serve it when it does not. There is no `operators` field: reading one found none, for every number.
  const data = await call<unknown>(`/check_phone_number?phone_number=${encodeURIComponent(e164)}`, { method: "GET" }, deps);
  const products = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  const operators = products.flatMap((raw) => operatorOf(raw as Record<string, unknown>) ?? []);
  if (operators.length === 0) throw new BitrefillError("COUNTRY_NOT_SERVED", "No operator Bitrefill serves answers for that number");
  return operators;
}

/**
 * An USDC invoice's price, as USDC with its decimals. Bitrefill prices it in USDC's smallest unit, six decimals: the
 * invoice of a 2,000 XOF top-up read `"price":"3500000"` with `"currency":"USDC"`, which is 3.50 USDC (read on
 * production, 28 Sep 2026; the documentation gives no unit). A price already written with a decimal point is kept.
 */
function priceInUsdc(price: unknown, currency: unknown): string {
  const text = String(price).trim();
  if (!/^usdc$/i.test(String(currency ?? "")) || !/^\d+$/.test(text)) return text;
  const units = BigInt(text);
  return `${units / 1_000_000n}.${(units % 1_000_000n).toString().padStart(6, "0")}`;
}

function invoiceOf(raw: Record<string, unknown>): BitrefillInvoice {
  const payment = (raw.payment ?? {}) as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof payment.address !== "string" || payment.price === undefined) throw new BitrefillError("BAD_ANSWER", "Bitrefill answered an invoice without a price or an address");
  const orders = Array.isArray(raw.orders) ? raw.orders.map((o) => ({ id: String((o as Record<string, unknown>).id), status: String((o as Record<string, unknown>).status) })) : [];
  return {
    id: raw.id,
    status: String(raw.status ?? ""),
    payment: { method: String(payment.method ?? ""), address: payment.address, price: priceInUsdc(payment.price, payment.currency), currency: String(payment.currency ?? "") },
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
  // The journal line of every invoice, for the reconciliation and to read what Bitrefill actually prices it in: its
  // product prices come in satoshis whatever the account shows (read on production, 28 Sep 2026). No personal data.
  console.log(JSON.stringify({ at: new Date().toISOString(), bitrefillInvoice: invoice.id, method: invoice.payment.method, currency: invoice.payment.currency, price: invoice.payment.price }));
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

/**
 * Gift cards (D271's second step): the cards Bitrefill lists for a country (`GET /products?country=<XX>&type=gift_card`,
 * paged by `meta._next`, docs "Searching Products", read 26 Sep 2026), which is the catalogue its site shows as "Works
 * in SN" (64 in Senegal, 65 in Ivory Coast, read the same day). Each carries Bitrefill's own `country_name`, which its
 * product pages print as "Works in: Senegal".
 */
export type BitrefillGiftCard = Readonly<{
  id: string;
  name: string;
  countryCode: string;
  countryName: string;
  currency: string;
  packages: readonly BitrefillPackage[];
  range: BitrefillOperator["range"];
}>;

function giftCardOf(raw: Record<string, unknown>): BitrefillGiftCard | undefined {
  const operator = operatorOf(raw);
  if (!operator) return undefined;
  if (raw.in_stock === false) return undefined;
  return {
    id: operator.id,
    name: operator.name,
    countryCode: typeof raw.country_code === "string" ? raw.country_code.toUpperCase() : "",
    countryName: typeof raw.country_name === "string" ? raw.country_name : "",
    currency: operator.currency,
    packages: operator.packages,
    range: operator.range,
  };
}

/** Every gift card Bitrefill lists for a country, in stock, in Bitrefill's own order. */
export async function giftCardsFor(country: string, deps: Deps = liveDeps()): Promise<readonly BitrefillGiftCard[]> {
  if (!/^[A-Z]{2}$/.test(country)) throw new BitrefillError("COUNTRY_NOT_SERVED", "No country to list gift cards for");
  const cards: BitrefillGiftCard[] = [];
  let path: string | null = `/products?country=${country}&type=gift_card&limit=50`;
  for (let page = 0; path && page < 10; page += 1) {
    const response: { data?: unknown; meta?: { _next?: unknown } } = await callWhole(path, deps);
    for (const raw of Array.isArray(response.data) ? response.data : []) {
      const card = giftCardOf(raw as Record<string, unknown>);
      if (card) cards.push(card);
    }
    const next = typeof response.meta?._next === "string" ? response.meta._next : null;
    path = next ? next.replace(/^https:\/\/api-bitrefill\.com\/v2/, "") : null;
  }
  if (cards.length === 0) throw new BitrefillError("COUNTRY_NOT_SERVED", "Bitrefill lists no gift card for that country");
  return cards;
}

/** One gift card by its id, for pricing it: the name and the amounts it takes. */
export async function giftCardById(id: string, deps: Deps = liveDeps()): Promise<BitrefillGiftCard> {
  if (!/^[a-z0-9][a-z0-9_-]{1,80}$/i.test(id)) throw new BitrefillError("INVOICE_REFUSED", "That is not a gift card");
  const card = giftCardOf(await call<Record<string, unknown>>(`/products/${id}`, { method: "GET" }, deps));
  if (!card) throw new BitrefillError("INVOICE_REFUSED", "That gift card is not available");
  return card;
}

/**
 * The countries Bitrefill tops up a phone in (D274): Bitrefill publishes no list of countries, so its phone top-ups are
 * read page by page (`GET /products?category=refill`, fifty a page, docs.bitrefill.com "Retrieve product list", read
 * 27 Sep 2026) and their `country_code` kept. Sixty pages at most; the caller holds the answer for a day.
 */
export async function refillCountries(deps: Deps = liveDeps()): Promise<readonly string[]> {
  const countries = new Set<string>();
  let path: string | null = "/products?category=refill&limit=50";
  for (let page = 0; path && page < 60; page += 1) {
    const response: { data?: unknown; meta?: { _next?: unknown } } = await callWhole(path, deps);
    for (const raw of Array.isArray(response.data) ? response.data : []) {
      const code = (raw as { country_code?: unknown }).country_code;
      if (typeof code === "string" && /^[A-Za-z]{2}$/.test(code)) countries.add(code.toLowerCase());
    }
    const next = typeof response.meta?._next === "string" ? response.meta._next : null;
    path = next ? next.replace(/^https:\/\/api-bitrefill\.com\/v2/, "") : null;
  }
  return [...countries];
}

/** The whole answer of a paged list, `data` and `meta` together. */
async function callWhole(path: string, deps: Deps): Promise<{ data?: unknown; meta?: { _next?: unknown } }> {
  const authorization = bitrefillAuthorization(deps.env);
  let response: Response;
  try {
    response = await deps.fetch(`${BITREFILL_BASE_URL}${path}`, { method: "GET", headers: { authorization, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new BitrefillError("UNAVAILABLE", "Bitrefill could not be reached", { cause: error });
  }
  const body = (await response.json().catch(() => ({}))) as { data?: unknown; meta?: { _next?: unknown }; error_code?: unknown; message?: unknown };
  if (!response.ok) throw errorOf(response.status, body);
  return body;
}

/**
 * The order of the list the person reads (the founder, 26 Sep 2026): first the cards of their own country, by its
 * country or its currency, and the ones the founder named for it; then Bitrefill's own card, which works on the whole
 * shop; then the rest, in Bitrefill's order. Nothing is removed.
 */
const FIRST_FOR: Readonly<Record<string, readonly RegExp[]>> = { CI: [/^amazon\.fr\b/i] };

export function orderGiftCards(cards: readonly BitrefillGiftCard[], country: string, localCurrency: string | null): readonly BitrefillGiftCard[] {
  const rank = (card: BitrefillGiftCard): number => {
    if (card.countryCode === country || (localCurrency && card.currency === localCurrency) || (FIRST_FOR[country] ?? []).some((pattern) => pattern.test(card.name))) return 0;
    if (/^bitrefill[-_]giftcard/i.test(card.id)) return 1;
    return 2;
  };
  return cards.map((card, index) => ({ card, index })).sort((a, b) => rank(a.card) - rank(b.card) || a.index - b.index).map((entry) => entry.card);
}

/** Where a card works, in Bitrefill's words: its product pages print "Works in:" and the country it gives. */
export function worksIn(card: Pick<BitrefillGiftCard, "countryName">): string {
  return card.countryName ? `Works in: ${card.countryName}` : "";
}

/** What a delivered gift card carries, whichever form Bitrefill gives it in: an object of fields, or a sentence. */
export type GiftCardCode = Readonly<{ code?: string; link?: string; pin?: string; instructions?: string; expires?: string }>;

export function giftCardCodeOf(redemption: unknown): GiftCardCode | undefined {
  if (typeof redemption === "string") return redemption.trim() ? { instructions: redemption.trim() } : undefined;
  if (!redemption || typeof redemption !== "object") return undefined;
  const r = redemption as Record<string, unknown>;
  const text = (key: string) => (typeof r[key] === "string" && (r[key] as string).trim() ? (r[key] as string).trim() : undefined);
  const code: GiftCardCode = { code: text("code"), link: text("link"), pin: text("pin"), instructions: text("instructions"), expires: text("expiration_date") };
  return Object.values(code).some(Boolean) ? code : undefined;
}

/** A delivered order's code, read from Bitrefill when the invoice is complete. */
export async function readOrderCode(orderId: string, deps: Deps = liveDeps()): Promise<GiftCardCode | undefined> {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(orderId)) throw new BitrefillError("BAD_ANSWER", "That is not an order id");
  const order = await call<Record<string, unknown>>(`/orders/${orderId}`, { method: "GET" }, deps);
  return giftCardCodeOf(order.redemption_info);
}
