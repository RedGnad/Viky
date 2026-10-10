import { erc20Abi, getAddress, keccak256, stringToHex, type Abi, type Hex } from "viem";
import { BITREFILL_ACCOUNT_LIMITS, BitrefillError, createInvoice, giftCardById, operatorsFor, outcomeOf, readInvoice, readOrderCode, usdcUnits, type BitrefillInvoice, type BitrefillOperator, type GiftCardCode } from "./bitrefill";
import { openSecret, sealSecret } from "./connect-vault";
import { phoneKindOf } from "./phone-kind";
import { AUSD } from "./coins";
import { monadChain, waitForFinality } from "./monad/chain";
import { addMonadGasBuffer } from "./monad-gas";
import * as store from "./phone-order-store";
import type { PhoneOrder } from "./phone-order-store";
import { payInvoiceOnBase, refundAusd, treasuryAddress, treasuryCovers, TreasuryError } from "./phone-treasury";
import { bridgeStatus, quoteAusdToBaseUsdc, type BridgeQuote, type BridgeStatus } from "./relay-bridge";
import { relayerClients, relayerPreflight } from "./relayer";

/**
 * Your phone, the third way out (D238), from price to top-up. Server only. Three moves, each with its own route:
 *
 * 1. `price`: the operators for the number, Bitrefill's invoice for the amount, every ceiling checked, a row written.
 *    Nothing moves: the person's money leaves only once the invoice exists and has a price (the founder, 25 Sep 2026).
 * 2. `pay`: the person's AUSD goes to the treasury on Monad, by an authorization they sign with their passkey and the
 *    relayer carries, never more than they hold; then the treasury pays the invoice on Base.
 * 3. `follow`: Bitrefill delivers, or fails; a failure after the AUSD arrived sends it back, from the same treasury,
 *    automatically. Nobody profits from a failure.
 *
 * Every refusal is a code and a sentence that says what the ceiling is and that nothing was taken.
 */

/**
 * Viky's own ceilings for the pilot (the founder, 25 Sep 2026; per order, default applied), and for everybody together,
 * top-ups and gift cards alike, five orders and $500 a day (the founder, 27 Sep 2026, the words of the legal notice).
 * They sit within Bitrefill's basic account limits (terms section 8), which count top-ups alone.
 */
export const PHONE_CEILINGS = Object.freeze({ usdPerPersonPerDay: 50, usdPerOrder: 50, ordersPerDay: 5, usdPerDay: 500 });

const USDC = 1_000_000n;
const dollars = (units: bigint) => `$${(Number(units) / 1e6).toFixed(2)}`;

export type PhoneRefusal =
  | "NOT_CONFIGURED"
  | "INVALID_PHONE_NUMBER"
  | "COUNTRY_NOT_SERVED"
  | "OPERATOR_REFUSED"
  | "OVER_ORDER"
  | "OVER_PERSON_DAY"
  | "OVER_SERVICE_ITEMS"
  | "OVER_SERVICE_DAY"
  | "OVER_REFILL"
  | "TREASURY_SHORT"
  | "NOT_ENOUGH"
  | "PRICE_EXPIRED"
  | "NOT_YOURS"
  | "INVALID_AUTHORIZATION"
  | "PAYMENT_CONFIRMING"
  | "UNAVAILABLE";

export class PhoneOrderError extends Error {
  constructor(
    readonly code: PhoneRefusal,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 429 | 503 = 409,
  ) {
    super(message);
    this.name = "PhoneOrderError";
  }
}

/** The sentence each refusal says, with the ceiling in it where there is one. */
export const PHONE_REFUSALS = {
  notConfigured: "Phone top-ups are not open yet. Nothing was taken.",
  invalidNumber: "Type the number with its country code, like +221 77 123 45 67.",
  countryNotServed: "Viky cannot top up a phone in that country yet. Nothing was taken.",
  operatorRefused: "The phone company did not accept that top-up. Nothing was taken.",
  overOrder: () => `One top-up can be ${dollars(BigInt(PHONE_CEILINGS.usdPerOrder) * USDC)} at most for now. Nothing was taken.`,
  overPersonDay: (used: bigint) => `Up to ${dollars(BigInt(PHONE_CEILINGS.usdPerPersonPerDay) * USDC)} a day can go to phones for now, and ${dollars(used)} already went today. Nothing was taken.`,
  overServiceItems: () => `Viky can buy ${PHONE_CEILINGS.ordersPerDay} top-ups and gift cards a day for now, and today's are gone. Try again tomorrow. Nothing was taken.`,
  overServiceDay: () => `Viky can spend ${dollars(BigInt(PHONE_CEILINGS.usdPerDay) * USDC)} a day on top-ups and gift cards for now, and today's is spent. Try again tomorrow. Nothing was taken.`,
  overRefill: () => `One top-up can be ${dollars(BigInt(BITREFILL_ACCOUNT_LIMITS.usdPerRefill) * USDC)} at most. Nothing was taken.`,
  treasuryShort: "Viky cannot send top-ups right now. Nothing was taken.",
  notEnough: "That is more than you have.",
  priceExpired: "That price has run out. Start again: nothing was taken.",
  notYours: "That top-up is not one of yours.",
  invalidAuthorization: "That could not be confirmed. Nothing was taken.",
  // Said once the person's money may have been sent: never "Nothing was taken" from then on.
  paymentConfirming: "Your payment is being confirmed. Look again in a minute.",
  unavailable: "The phone company could not be reached. Nothing was taken.",
} as const;

function fromBitrefill(error: unknown): PhoneOrderError {
  if (!(error instanceof BitrefillError)) return new PhoneOrderError("UNAVAILABLE", PHONE_REFUSALS.unavailable, 503);
  switch (error.code) {
    case "NOT_CONFIGURED":
      return new PhoneOrderError("NOT_CONFIGURED", PHONE_REFUSALS.notConfigured, 503);
    case "INVALID_PHONE_NUMBER":
      return new PhoneOrderError("INVALID_PHONE_NUMBER", PHONE_REFUSALS.invalidNumber, 400);
    case "COUNTRY_NOT_SERVED":
      return new PhoneOrderError("COUNTRY_NOT_SERVED", PHONE_REFUSALS.countryNotServed, 409);
    case "UNSUPPORTED_OPERATOR":
    case "INVOICE_REFUSED":
      return new PhoneOrderError("OPERATOR_REFUSED", PHONE_REFUSALS.operatorRefused, 409);
    case "RATE_LIMITED":
      return new PhoneOrderError("UNAVAILABLE", PHONE_REFUSALS.unavailable, 429);
    default:
      return new PhoneOrderError("UNAVAILABLE", PHONE_REFUSALS.unavailable, 503);
  }
}

export type PhoneDeps = Readonly<{
  operatorsFor: typeof operatorsFor;
  createInvoice: typeof createInvoice;
  readInvoice: typeof readInvoice;
  treasuryAddress: () => Hex;
  treasuryCovers: (usdcUnits: bigint) => Promise<boolean>;
  payInvoiceOnBase: (input: { to: string; usdcUnits: bigint }) => Promise<{ hash: Hex }>;
  refundAusd: (input: { to: Hex; ausdUnits: bigint; nonce: Hex }) => Promise<{ hash: Hex }>;
  heldAusd: (account: Hex) => Promise<bigint>;
  /** Carries the person's authorization; `onSubmitted` hears the transaction's hash the moment it is sent. */
  relayToTreasury: (input: PersonAuthorization & { from: Hex; to: Hex }, onSubmitted?: (hash: Hex) => Promise<void>) => Promise<{ hash: Hex }>;
  /** Where one of the relayer's own transactions stands: final and successful, final and reverted, or not known yet. */
  relayLanded: (hash: Hex) => Promise<"landed" | "reverted" | "unknown">;
  /** Whether the token has consumed an authorization: used only to free a claim whose request stopped before sending. */
  authorizationUsed: (from: Hex, nonce: Hex) => Promise<boolean>;
  store: Pick<typeof store, "recordPricedOrder" | "loadPhoneOrder" | "markReceived" | "markPaid" | "markDelivered" | "markFailed" | "markRefunded" | "markAbandoned" | "usedToday" | "keepSealedCode" | "claimRelay" | "noteRelay" | "releaseRelay" | "unsettledOrders">;
  giftCardById: typeof giftCardById;
  readOrderCode: typeof readOrderCode;
  /** The vault's seal and its opening, so a code is never at rest in the clear. */
  seal: (text: string) => string;
  open: (sealed: string) => string;
  sleep: (ms: number) => Promise<void>;
  /**
   * The way an order is paid without a float (the founder, 28 Sep 2026): Relay's price and strict deposit address for
   * the invoice (src/relay-bridge.ts), the treasury's transfer of the order's AUSD to it, carried by the relayer as a
   * refund is, and where Relay's fill stands. Without them, the treasury pays the invoice from its own USDC on Base.
   */
  quoteBridge?: (input: { usdcUnits: bigint; payTo: string; treasury: Hex }) => Promise<BridgeQuote>;
  sendToBridge?: (input: { to: Hex; ausdUnits: bigint; nonce: Hex }) => Promise<{ hash: Hex }>;
  bridgeStatus?: (requestId: string) => Promise<BridgeStatus>;
}>;

/** The operators for a number, as the screen offers them: name, currency, the amounts it takes. */
export async function phoneOperators(phoneNumber: string, deps: Pick<PhoneDeps, "operatorsFor"> = livePhoneDeps()): Promise<readonly BitrefillOperator[]> {
  try {
    return await deps.operatorsFor(phoneNumber);
  } catch (error) {
    throw fromBitrefill(error);
  }
}

/**
 * The day's ceilings, Viky's and Bitrefill's account limits, for one more item of this amount. Checked when the price
 * is given and again when the person pays (the money path audit of 27 Sep 2026): a price moves nothing and does not
 * count, so orders priced one after another would otherwise all pass, and be paid together past every ceiling.
 */
async function assertWithinTheDay(account: Hex, units: bigint, deps: PhoneDeps): Promise<void> {
  const [mine, everything] = await Promise.all([deps.store.usedToday(account), deps.store.usedToday()]);
  if (mine.usdcUnits + units > BigInt(PHONE_CEILINGS.usdPerPersonPerDay) * USDC) throw new PhoneOrderError("OVER_PERSON_DAY", PHONE_REFUSALS.overPersonDay(mine.usdcUnits));
  if (everything.items + 1 > PHONE_CEILINGS.ordersPerDay) throw new PhoneOrderError("OVER_SERVICE_ITEMS", PHONE_REFUSALS.overServiceItems());
  if (everything.usdcUnits + units > BigInt(PHONE_CEILINGS.usdPerDay) * USDC) throw new PhoneOrderError("OVER_SERVICE_DAY", PHONE_REFUSALS.overServiceDay());
}

/** `feeUnits`: what the person pays beyond the invoice, the transfer's fee to Relay, shown with the price. */
export type PricedPhoneOrder = Readonly<{ orderId: string; operatorName: string; localAmount: string; localCurrency: string; ausdUnits: bigint; feeUnits: bigint; to: Hex }>;

/**
 * What the order costs the person, and how it is paid. Through Relay, the person pays the invoice's USDC plus Relay's
 * fee, both in their own AUSD, and nothing comes out of a float; without Relay, one AUSD for one USDC, paid from the
 * treasury's USDC on Base, which must cover it.
 */
async function costOf(units: bigint, invoice: BitrefillInvoice, treasury: Hex, deps: PhoneDeps): Promise<{ ausdUnits: bigint; bridgeTo: string | null; bridgeRequest: string | null }> {
  if (!deps.quoteBridge) {
    if (!(await deps.treasuryCovers(units))) throw new PhoneOrderError("TREASURY_SHORT", PHONE_REFUSALS.treasuryShort, 503);
    return { ausdUnits: units, bridgeTo: null, bridgeRequest: null };
  }
  try {
    const quote = await deps.quoteBridge({ usdcUnits: units, payTo: invoice.payment.address, treasury });
    return { ausdUnits: quote.ausdUnits, bridgeTo: quote.depositAddress, bridgeRequest: quote.requestId };
  } catch (error) {
    console.error(`Relay gave no price for invoice ${invoice.id}: ${error instanceof Error ? error.message : String(error)}`);
    throw new PhoneOrderError("UNAVAILABLE", PHONE_REFUSALS.unavailable, 503);
  }
}

/** The nonce of the treasury's transfer of an order's AUSD to Relay: the order's own, so it can go once and never twice. */
export function bridgeNonce(orderId: string): Hex {
  return keccak256(stringToHex(`viky:phone-bridge:v1:${orderId}`));
}

/**
 * Prices a top-up and writes it down, moving nothing. The invoice comes first because its price is what every ceiling
 * is measured in; an invoice that breaks one is simply never paid, and Bitrefill lets it lapse.
 */
export async function pricePhoneTopUp(
  input: Readonly<{ account: Hex; phoneNumber: string; operatorId: string; packageId?: string; value?: number }>,
  deps: PhoneDeps = livePhoneDeps(),
): Promise<PricedPhoneOrder> {
  const operators = await phoneOperators(input.phoneNumber, deps);
  const operator = operators.find((candidate) => candidate.id === input.operatorId);
  if (!operator) throw new PhoneOrderError("OPERATOR_REFUSED", PHONE_REFUSALS.operatorRefused);
  let to: Hex;
  try {
    to = deps.treasuryAddress();
  } catch {
    throw new PhoneOrderError("NOT_CONFIGURED", PHONE_REFUSALS.notConfigured, 503);
  }
  let invoice: BitrefillInvoice;
  try {
    invoice = await deps.createInvoice({ productId: operator.id, packageId: input.packageId, value: input.value, phoneNumber: input.phoneNumber, refundAddress: to });
  } catch (error) {
    throw fromBitrefill(error);
  }
  let units: bigint;
  try {
    units = usdcUnits(invoice.payment.price);
  } catch {
    throw new PhoneOrderError("UNAVAILABLE", PHONE_REFUSALS.unavailable, 503);
  }
  if (units > BigInt(BITREFILL_ACCOUNT_LIMITS.usdPerRefill) * USDC) throw new PhoneOrderError("OVER_REFILL", PHONE_REFUSALS.overRefill());
  if (units > BigInt(PHONE_CEILINGS.usdPerOrder) * USDC) throw new PhoneOrderError("OVER_ORDER", PHONE_REFUSALS.overOrder());
  await assertWithinTheDay(input.account, units, deps);
  const cost = await costOf(units, invoice, to, deps);
  if ((await deps.heldAusd(input.account)) < cost.ausdUnits) throw new PhoneOrderError("NOT_ENOUGH", PHONE_REFUSALS.notEnough);
  const localAmount = input.value !== undefined ? String(input.value) : (operator.packages.find((p) => p.id === input.packageId)?.value ?? "");
  const order = await deps.store.recordPricedOrder({
    account: getAddress(input.account),
    // Credit or data, by Bitrefill's own name for the product (D271): the judges' count says which was used.
    kind: phoneKindOf(operator) === "data" ? "data" : "phone",
    productId: operator.id,
    operatorName: operator.name,
    localAmount,
    localCurrency: operator.currency,
    phoneNumber: input.phoneNumber,
    invoiceId: invoice.id,
    usdcUnits: units,
    ausdUnits: cost.ausdUnits,
    bridgeTo: cost.bridgeTo,
    bridgeRequest: cost.bridgeRequest,
  });
  return { orderId: order.id, operatorName: order.operatorName, localAmount: order.localAmount, localCurrency: order.localCurrency, ausdUnits: order.ausdUnits, feeUnits: order.ausdUnits - order.usdcUnits, to };
}

export type PersonAuthorization = Readonly<{ value: bigint; validAfter: bigint; validBefore: bigint; nonce: Hex; signature: Hex }>;

export type PhoneOrderStatus = Readonly<{
  orderId: string;
  state: "on_its_way" | "delivered" | "refunded" | "refund_pending";
  amount: string;
  operatorName: string;
  kind: "phone" | "gift_card";
  /** A delivered gift card's code, opened for the account that owns the order and nobody else. */
  code?: GiftCardCode;
}>;

function openedCode(order: PhoneOrder, open: ((sealed: string) => string) | undefined): GiftCardCode | undefined {
  if (!order.codeSealed || !open) return undefined;
  try {
    return JSON.parse(open(order.codeSealed)) as GiftCardCode;
  } catch {
    return undefined;
  }
}

function statusOf(order: PhoneOrder, open?: (sealed: string) => string): PhoneOrderStatus {
  const delivered = order.state === "delivered";
  // A gift card is delivered to the person when its code is there to show; until then it is on its way.
  const code = order.kind === "gift_card" && delivered ? openedCode(order, open) : undefined;
  const state = delivered && (order.kind !== "gift_card" || code) ? "delivered" : order.state === "refunded" ? "refunded" : order.state === "failed" ? "refund_pending" : "on_its_way";
  return { orderId: order.id, state, amount: dollars(order.ausdUnits), operatorName: order.operatorName, kind: order.kind === "gift_card" ? "gift_card" : "phone", ...(code ? { code } : {}) };
}

/**
 * A gift card, priced and written down, moving nothing: the card and the amount the person chose, Bitrefill's invoice,
 * and the same ceilings as a top-up, with the account's own limit on items a day.
 */
export async function priceGiftCard(input: Readonly<{ account: Hex; productId: string; packageId?: string; value?: number }>, deps: PhoneDeps = livePhoneDeps()): Promise<PricedPhoneOrder> {
  let card;
  try {
    card = await deps.giftCardById(input.productId);
  } catch (error) {
    throw fromBitrefill(error);
  }
  let to: Hex;
  try {
    to = deps.treasuryAddress();
  } catch {
    throw new PhoneOrderError("NOT_CONFIGURED", PHONE_REFUSALS.notConfigured, 503);
  }
  let invoice: BitrefillInvoice;
  try {
    invoice = await deps.createInvoice({ productId: card.id, packageId: input.packageId, value: input.value, refundAddress: to });
  } catch (error) {
    throw fromBitrefill(error);
  }
  let units: bigint;
  try {
    units = usdcUnits(invoice.payment.price);
  } catch {
    throw new PhoneOrderError("UNAVAILABLE", PHONE_REFUSALS.unavailable, 503);
  }
  if (units > BigInt(PHONE_CEILINGS.usdPerOrder) * USDC) throw new PhoneOrderError("OVER_ORDER", PHONE_REFUSALS.overOrder());
  await assertWithinTheDay(input.account, units, deps);
  const cost = await costOf(units, invoice, to, deps);
  if ((await deps.heldAusd(input.account)) < cost.ausdUnits) throw new PhoneOrderError("NOT_ENOUGH", PHONE_REFUSALS.notEnough);
  const localAmount = input.value !== undefined ? String(input.value) : (card.packages.find((p) => p.id === input.packageId)?.value ?? "");
  const order = await deps.store.recordPricedOrder({
    account: getAddress(input.account),
    kind: "gift_card",
    productId: card.id,
    operatorName: card.name,
    localAmount,
    localCurrency: card.currency,
    phoneNumber: null,
    invoiceId: invoice.id,
    usdcUnits: units,
    ausdUnits: cost.ausdUnits,
    bridgeTo: cost.bridgeTo,
    bridgeRequest: cost.bridgeRequest,
  });
  return { orderId: order.id, operatorName: order.operatorName, localAmount: order.localAmount, localCurrency: order.localCurrency, ausdUnits: order.ausdUnits, feeUnits: order.ausdUnits - order.usdcUnits, to };
}

/** A delivered gift card's code, read from Bitrefill, sealed and kept once; nothing when Bitrefill has none yet. */
async function keepCode(order: PhoneOrder, invoice: BitrefillInvoice | undefined, deps: PhoneDeps): Promise<PhoneOrder> {
  if (order.kind !== "gift_card" || order.codeSealed) return order;
  const orderId = invoice?.orders[0]?.id ?? (await deps.readInvoice(order.invoiceId).catch(() => undefined))?.orders[0]?.id;
  if (!orderId) return order;
  const code = await deps.readOrderCode(orderId).catch(() => undefined);
  if (!code) return order;
  let sealed: string;
  try {
    sealed = deps.seal(JSON.stringify(code));
  } catch {
    // No vault where this runs: the code is not kept in the clear, and the order stays on its way until it can be sealed.
    console.error(`a gift card's code could not be sealed yet: ${order.id}`);
    return order;
  }
  return (await deps.store.keepSealedCode(order.id, sealed)) ?? (await deps.store.loadPhoneOrder(order.id)) ?? order;
}

/** The nonce of an order's refund: the order's own, so a refund can happen once and never twice. */
export function refundNonce(orderId: string): Hex {
  return keccak256(stringToHex(`viky:phone-refund:v1:${orderId}`));
}

/** Sends the AUSD back and marks it; a refund that could not be sent yet stays `failed` and is tried again by `follow`. */
async function refund(order: PhoneOrder, failure: string, deps: PhoneDeps): Promise<PhoneOrder> {
  const failed = (await deps.store.markFailed(order.id, failure)) ?? (await deps.store.loadPhoneOrder(order.id)) ?? order;
  // Nothing came in, nothing goes back: a lapsed price is `failed` with no AUSD received, and is never refunded.
  if (failed.state !== "failed" || failed.ausdTx === null) return failed;
  try {
    const sent = await deps.refundAusd({ to: getAddress(order.account), ausdUnits: order.ausdUnits, nonce: refundNonce(order.id) });
    return (await deps.store.markRefunded(order.id, sent.hash)) ?? failed;
  } catch (error) {
    console.error(`a phone order's refund could not be sent yet: ${order.id} ${error instanceof Error ? error.message : String(error)}`);
    return failed;
  }
}

const confirming = () => new PhoneOrderError("PAYMENT_CONFIRMING", PHONE_REFUSALS.paymentConfirming);
const notConfirmed = () => new PhoneOrderError("INVALID_AUTHORIZATION", PHONE_REFUSALS.invalidAuthorization);

/**
 * The person's money goes, and the invoice is paid. Checked before anything moves: the order is theirs and still
 * priced, the invoice still waits for its money, the authorization is for the treasury and for this amount exactly.
 *
 * One order is paid by one relay (the audit of 27 Sep 2026): the request that claims the order carries the
 * authorization and records its transaction's hash as soon as it is sent. Whether the money arrived is read from that
 * transaction alone, final, never from the token's record of a nonce, which says neither where nor how much.
 */
export async function payPhoneTopUp(input: Readonly<{ account: Hex; orderId: string; authorization: PersonAuthorization }>, deps: PhoneDeps = livePhoneDeps()): Promise<PhoneOrderStatus> {
  const order = await deps.store.loadPhoneOrder(input.orderId);
  if (!order || getAddress(order.account) !== getAddress(input.account)) throw new PhoneOrderError("NOT_YOURS", PHONE_REFUSALS.notYours, 404);
  // A lapsed price moved nothing: it is refused as lapsed, never shown as money on its way back.
  if (order.state === "failed" && order.ausdTx === null) throw new PhoneOrderError("PRICE_EXPIRED", PHONE_REFUSALS.priceExpired);
  if (order.state !== "priced") return statusOf(order, deps.open);
  const from = getAddress(input.account);
  // A relay already sent for this order is settled from its own transaction before anything else.
  if (order.relayTx?.startsWith("0x")) return payReceived(await receivedBy(order, order.relayTx as Hex, deps), order, deps);
  let invoice: BitrefillInvoice;
  try {
    invoice = await deps.readInvoice(order.invoiceId);
  } catch (error) {
    throw fromBitrefill(error);
  }
  if (invoice.status !== "unpaid") {
    if (order.relayTx) throw confirming();
    await deps.store.markAbandoned(order.id);
    throw new PhoneOrderError("PRICE_EXPIRED", PHONE_REFUSALS.priceExpired);
  }
  if (input.authorization.value !== order.ausdUnits) throw new PhoneOrderError("INVALID_AUTHORIZATION", PHONE_REFUSALS.invalidAuthorization, 400);
  if (usdcUnits(invoice.payment.price) !== order.usdcUnits) throw new PhoneOrderError("PRICE_EXPIRED", PHONE_REFUSALS.priceExpired);
  if ((await deps.heldAusd(input.account)) < order.ausdUnits) throw new PhoneOrderError("NOT_ENOUGH", PHONE_REFUSALS.notEnough);
  // Paid through Relay, the order needs nothing of the treasury's own; paid from Base, the treasury must cover it.
  if (!order.bridgeTo && !(await deps.treasuryCovers(order.usdcUnits))) throw new PhoneOrderError("TREASURY_SHORT", PHONE_REFUSALS.treasuryShort, 503);
  await assertWithinTheDay(from, order.usdcUnits, deps);

  const claim = `pending:${input.authorization.nonce}`;
  if (!(await claimRelay(order, from, input.authorization.nonce, deps))) {
    // Another request holds the order's one relay: its transaction, once sent, is what this answers from.
    const current = (await deps.store.loadPhoneOrder(order.id)) ?? order;
    if (current.state !== "priced") return statusOf(current, deps.open);
    if (current.relayTx?.startsWith("0x")) return payReceived(await receivedBy(current, current.relayTx as Hex, deps), current, deps);
    throw confirming();
  }
  let sent: Hex | undefined;
  try {
    sent = (
      await deps.relayToTreasury({ ...input.authorization, from, to: deps.treasuryAddress() }, async (hash) => {
        sent = hash;
        await deps.store.noteRelay(order.id, hash);
      })
    ).hash;
  } catch {
    if (!sent) {
      // Refused before anything was sent (the simulation, the relayer's own checks): nothing moved.
      await deps.store.releaseRelay(order.id, claim);
      throw notConfirmed();
    }
    return payReceived(await receivedBy(order, sent, deps), order, deps);
  }
  return payReceived(await deps.store.markReceived(order.id, sent), order, deps, invoice);
}

/** A claim, or a claim taken again from a request that stopped before sending: its authorization was never used. */
async function claimRelay(order: PhoneOrder, from: Hex, nonce: Hex, deps: PhoneDeps): Promise<boolean> {
  if (await deps.store.claimRelay(order.id, nonce)) return true;
  const held = (await deps.store.loadPhoneOrder(order.id))?.relayTx;
  if (!held?.startsWith("pending:")) return false;
  if (await deps.authorizationUsed(from, held.slice("pending:".length) as Hex).catch(() => true)) return false;
  return (await deps.store.claimRelay(order.id, nonce, held)) !== null;
}

/** The order's AUSD, received once its own relay is final and successful; a revert moved nothing and frees the order. */
async function receivedBy(order: PhoneOrder, hash: Hex, deps: PhoneDeps): Promise<PhoneOrder | null> {
  const landed = await deps.relayLanded(hash).catch(() => "unknown" as const);
  if (landed === "unknown") throw confirming();
  if (landed === "reverted") {
    await deps.store.releaseRelay(order.id, hash);
    throw notConfirmed();
  }
  return deps.store.markReceived(order.id, hash);
}

/**
 * Pays the invoice for an order whose AUSD is in the treasury. Only the request that moved the order to `received`
 * pays; any other answers where it stands. An invoice that can no longer be paid sends the AUSD back.
 */
async function payReceived(inTreasury: PhoneOrder | null, order: PhoneOrder, deps: PhoneDeps, known?: BitrefillInvoice): Promise<PhoneOrderStatus> {
  if (!inTreasury) return statusOf((await deps.store.loadPhoneOrder(order.id)) ?? order, deps.open);
  let invoice = known;
  if (!invoice) {
    invoice = await deps.readInvoice(inTreasury.invoiceId).catch(() => undefined);
    if (!invoice) return statusOf(inTreasury);
    if (invoice.status !== "unpaid") return statusOf(await refund(inTreasury, `bitrefill:${invoice.status}`, deps));
  }
  if (inTreasury.bridgeTo && deps.sendToBridge) return payThroughBridge(inTreasury, deps);
  let paid: Hex;
  try {
    paid = (await deps.payInvoiceOnBase({ to: invoice.payment.address, usdcUnits: inTreasury.usdcUnits })).hash;
  } catch (error) {
    if (!(error instanceof TreasuryError && error.code === "PAYMENT_UNCONFIRMED" && error.hash)) {
      const reason = error instanceof TreasuryError ? error.code : "PAYMENT_FAILED";
      return statusOf(await refund(inTreasury, reason, deps));
    }
    paid = error.hash;
  }
  // From here the invoice is paid, or may still be: whatever fails below, the AUSD is never sent back for it.
  try {
    await deps.store.markPaid(inTreasury.id, paid);
  } catch (error) {
    console.error(`a phone order was paid on Base but not recorded: ${inTreasury.id} ${paid} ${error instanceof Error ? error.message : String(error)}`);
    return statusOf(inTreasury);
  }
  return followPhoneTopUp({ account: getAddress(inTreasury.account), orderId: inTreasury.id }, deps, 45_000);
}

/**
 * The order's AUSD, from the treasury to Relay's deposit address, which pays the invoice on Base. The treasury signs it
 * with the order's own nonce and the relayer carries it; a send that failed is read back from the token, so it is never
 * sent twice, and never refunded when it went.
 */
async function payThroughBridge(inTreasury: PhoneOrder, deps: PhoneDeps): Promise<PhoneOrderStatus> {
  const nonce = bridgeNonce(inTreasury.id);
  let sent: string;
  try {
    sent = (await deps.sendToBridge!({ to: getAddress(inTreasury.bridgeTo!), ausdUnits: inTreasury.ausdUnits, nonce })).hash;
  } catch (error) {
    const went = await deps.authorizationUsed(deps.treasuryAddress(), nonce).catch(() => null);
    if (went === false) return statusOf(await refund(inTreasury, "BRIDGE_NOT_SENT", deps));
    console.error(`a phone order's transfer to Relay may have gone: ${inTreasury.id} ${error instanceof Error ? error.message : String(error)}`);
    if (went === null) return statusOf(inTreasury);
    sent = `authorization:${nonce}`;
  }
  try {
    await deps.store.markPaid(inTreasury.id, sent);
  } catch (error) {
    console.error(`a phone order was sent to Relay but not recorded: ${inTreasury.id} ${sent} ${error instanceof Error ? error.message : String(error)}`);
    return statusOf(inTreasury);
  }
  return followPhoneTopUp({ account: getAddress(inTreasury.account), orderId: inTreasury.id }, deps, 45_000);
}

/**
 * Where a top-up stands, moving it on when Bitrefill has: delivered ends it, a failure refunds it, and a refund that
 * could not be sent is tried again. Waits up to `waitMs` for a change, then answers where it stands.
 */
export async function followPhoneTopUp(input: Readonly<{ account: Hex; orderId: string }>, deps: PhoneDeps = livePhoneDeps(), waitMs = 0): Promise<PhoneOrderStatus> {
  let order = await deps.store.loadPhoneOrder(input.orderId);
  if (!order || getAddress(order.account) !== getAddress(input.account)) throw new PhoneOrderError("NOT_YOURS", PHONE_REFUSALS.notYours, 404);
  if (order.state === "failed") {
    const settled = await refund(order, order.failure ?? "failed", deps);
    if (settled.state === "failed" && settled.ausdTx === null) throw new PhoneOrderError("PRICE_EXPIRED", PHONE_REFUSALS.priceExpired);
    return statusOf(settled);
  }
  // A gift card delivered before its code could be read is read again here.
  if (order.state === "delivered") return statusOf(await keepCode(order, undefined, deps), deps.open);
  const until = Date.now() + waitMs;
  while (order.state === "paid") {
    let invoice: BitrefillInvoice | undefined;
    try {
      invoice = await deps.readInvoice(order.invoiceId);
    } catch {
      invoice = undefined;
    }
    const outcome = invoice ? outcomeOf(invoice) : "waiting";
    if (outcome === "delivered") return statusOf(await keepCode((await deps.store.markDelivered(order.id)) ?? order, invoice, deps), deps.open);
    if (outcome === "failed") return statusOf(await refund(order, `bitrefill:${invoice?.status ?? "failed"}`, deps));
    // Paid through Relay and the invoice still waiting: a fill Relay could not complete came back to the treasury, and
    // goes back to the person.
    if (outcome === "waiting" && invoice?.status === "unpaid" && order.bridgeRequest && deps.bridgeStatus) {
      const bridge = await deps.bridgeStatus(order.bridgeRequest);
      if (bridge === "refund" || bridge === "failure") return statusOf(await refund(order, `relay:${bridge}`, deps));
    }
    if (Date.now() >= until) break;
    await deps.sleep(3_000);
    order = (await deps.store.loadPhoneOrder(order.id)) ?? order;
  }
  return statusOf(order, deps.open);
}

/** Bitrefill's invoice statuses that say it received the payment (docs.bitrefill.com, core concepts, read 27 Sep 2026). */
const INVOICE_PAID = ["payment_detected", "payment_confirmed", "pending", "complete"];

export type FollowLine = Readonly<{ orderId: string; state: string }>;

/**
 * Every order whose money came in and has not ended, moved on with nobody's screen open (the money path audit of
 * 27 Sep 2026): run by the daily settling pass, so a failure after the money arrived is sent back when the order is
 * next read, by the person or at the latest by the next pass. An order whose AUSD arrived and whose payment on Base is
 * not known is paid only when Bitrefill says it received it; otherwise it waits for an operator, and never pays twice.
 */
export async function followUnsettledOrders(deps: PhoneDeps = livePhoneDeps()): Promise<readonly FollowLine[]> {
  const lines: FollowLine[] = [];
  for (const order of await deps.store.unsettledOrders()) {
    try {
      if (order.state === "received") {
        const invoice = await deps.readInvoice(order.invoiceId).catch(() => undefined);
        if (!invoice) {
          lines.push({ orderId: order.id, state: "received, the invoice could not be read" });
          continue;
        }
        if (outcomeOf(invoice) === "failed") {
          lines.push({ orderId: order.id, state: statusOf(await refund(order, `bitrefill:${invoice.status}`, deps)).state });
          continue;
        }
        if (!INVOICE_PAID.includes(invoice.status)) {
          lines.push({ orderId: order.id, state: `received, invoice ${invoice.status}: for an operator` });
          continue;
        }
        await deps.store.markPaid(order.id, `invoice:${order.invoiceId}`);
      }
      lines.push({ orderId: order.id, state: (await followPhoneTopUp({ account: getAddress(order.account), orderId: order.id }, deps)).state });
    } catch (error) {
      lines.push({ orderId: order.id, state: `not followed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return lines;
}

/**
 * The orders the morning's pass leaves for somebody, as one email, or nothing (the final audit of 9 Oct 2026): an
 * order whose money came in and that waits for an operator, one that could not be followed, one whose money is still
 * to be sent back. Each was a line of the scheduled task's answer, which nobody reads, while the person read "On its
 * way" and then nothing.
 */
export function ordersToTell(lines: readonly FollowLine[]): Readonly<{ subject: string; text: string }> | null {
  const waiting = lines.filter((line) => line.state.includes("for an operator") || line.state.startsWith("not followed") || line.state === "refund_pending");
  if (waiting.length === 0) return null;
  return {
    subject: `${waiting.length} phone or gift card ${waiting.length === 1 ? "order waits" : "orders wait"} for somebody`,
    text: [
      "The settling pass followed the orders whose money came in and has not ended, and left:",
      ...waiting.map((line) => `- order ${line.orderId}: ${line.state}`),
      "The person reads \"On its way\" meanwhile. An order \"for an operator\" is paid by nobody until its invoice is read by hand; one \"refund_pending\" still owes its money back.",
    ].join("\n"),
  };
}

const TRANSFER_ABI = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

/** The person's AUSD to the treasury, from the authorization they signed: the same carrying as their own sends. */
async function relayToTreasury(input: PersonAuthorization & { from: Hex; to: Hex }, onSubmitted?: (hash: Hex) => Promise<void>): Promise<{ hash: Hex }> {
  const clients = relayerClients();
  await relayerPreflight(clients);
  const args = [input.from, input.to, input.value, input.validAfter, input.validBefore, input.nonce, input.signature] as const;
  await clients.publicClient.simulateContract({ address: AUSD.address, abi: TRANSFER_ABI, functionName: "transferWithAuthorization", args, account: clients.address });
  const estimate = await clients.publicClient.estimateContractGas({ address: AUSD.address, abi: TRANSFER_ABI, functionName: "transferWithAuthorization", args, account: clients.address });
  const hash = await clients.walletClient.writeContract({ address: AUSD.address, abi: TRANSFER_ABI, functionName: "transferWithAuthorization", args, gas: addMonadGasBuffer(estimate), account: clients.walletClient.account!, chain: monadChain });
  try {
    await onSubmitted?.(hash);
  } catch (error) {
    // The transaction is out; failing to note it must not stop us waiting for it.
    console.error(`a phone order's relay ${hash} was sent but could not be recorded: ${error instanceof Error ? error.message : String(error)}`);
  }
  const receipt = await waitForFinality(clients.publicClient, hash);
  if (receipt.status !== "success") throw new Error("reverted");
  return { hash };
}

const AUTHORIZATION_STATE_ABI = [
  { type: "function", name: "authorizationState", stateMutability: "view", inputs: [{ name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }], outputs: [{ type: "bool" }] },
] as const satisfies Abi;

async function relayLanded(hash: Hex): Promise<"landed" | "reverted" | "unknown"> {
  const { publicClient } = relayerClients();
  const receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
  if (!receipt) return "unknown";
  const finalized = await publicClient.getBlock({ blockTag: "finalized" });
  if (finalized.number < receipt.blockNumber) return "unknown";
  return receipt.status === "success" ? "landed" : "reverted";
}

async function authorizationUsed(from: Hex, nonce: Hex): Promise<boolean> {
  const clients = relayerClients();
  return (await clients.publicClient.readContract({ address: AUSD.address, abi: AUTHORIZATION_STATE_ABI, functionName: "authorizationState", args: [from, nonce] })) as boolean;
}

async function heldAusd(account: Hex): Promise<bigint> {
  const clients = relayerClients();
  return (await clients.publicClient.readContract({ address: AUSD.address, abi: erc20Abi, functionName: "balanceOf", args: [getAddress(account)] })) as bigint;
}

export function livePhoneDeps(): PhoneDeps {
  return {
    operatorsFor,
    createInvoice,
    readInvoice,
    treasuryAddress: () => treasuryAddress(),
    treasuryCovers: (units) => treasuryCovers(units),
    payInvoiceOnBase: (input) => payInvoiceOnBase(input),
    refundAusd: (input) => refundAusd(input),
    heldAusd,
    relayToTreasury,
    relayLanded,
    authorizationUsed,
    store,
    giftCardById,
    readOrderCode,
    seal: (text) => sealSecret(text),
    open: (sealed) => openSecret(sealed),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    quoteBridge: (input) => quoteAusdToBaseUsdc(input),
    // The same carrying as a refund: the treasury signs an AUSD transfer with the order's nonce, the relayer pays its fee.
    sendToBridge: (input) => refundAusd(input),
    bridgeStatus: (requestId) => bridgeStatus(requestId),
  };
}

/** The currency a country pays in, for the cards of its own currency at the head of the list (the CFA zones first). */
const LOCAL_CURRENCY: Readonly<Record<string, string>> = { SN: "XOF", CI: "XOF", ML: "XOF", BF: "XOF", NE: "XOF", BJ: "XOF", TG: "XOF", GW: "XOF", CM: "XAF", GA: "XAF", CG: "XAF", TD: "XAF", CF: "XAF", GQ: "XAF", MA: "MAD", TN: "TND", FR: "EUR", BE: "EUR" };

export function localCurrencyOf(country: string): string | null {
  return LOCAL_CURRENCY[country] ?? null;
}
