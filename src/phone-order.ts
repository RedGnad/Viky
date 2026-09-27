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

/** Every item Bitrefill's basic account may buy in a day, gift cards and top-ups together (terms section 8). */
export const ACCOUNT_ITEMS_PER_DAY = 15;

/** Viky's own ceilings for the pilot, beside Bitrefill's account limits (the founder, 25 Sep 2026; per order, default applied). */
export const PHONE_CEILINGS = Object.freeze({ usdPerPersonPerDay: 50, usdPerOrder: 50 });

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
  | "OVER_SERVICE_ALL_ITEMS"
  | "OVER_SERVICE_DAY"
  | "OVER_REFILL"
  | "TREASURY_SHORT"
  | "NOT_ENOUGH"
  | "PRICE_EXPIRED"
  | "NOT_YOURS"
  | "INVALID_AUTHORIZATION"
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
  overServiceItems: () => `Viky can send ${BITREFILL_ACCOUNT_LIMITS.phoneItemsPerDay} top-ups a day for now, and today's are gone. Try again tomorrow. Nothing was taken.`,
  overServiceAllItems: () => `Viky can buy ${ACCOUNT_ITEMS_PER_DAY} cards and top-ups a day for now, and today's are gone. Try again tomorrow. Nothing was taken.`,
  overServiceDay: () => `Viky can send ${dollars(BigInt(BITREFILL_ACCOUNT_LIMITS.usdPerDay) * USDC)} of top-ups a day for now, and today's is spent. Try again tomorrow. Nothing was taken.`,
  overRefill: () => `One top-up can be ${dollars(BigInt(BITREFILL_ACCOUNT_LIMITS.usdPerRefill) * USDC)} at most. Nothing was taken.`,
  treasuryShort: "Viky cannot send top-ups right now. Nothing was taken.",
  notEnough: "That is more than you have.",
  priceExpired: "That price has run out. Start again: nothing was taken.",
  notYours: "That top-up is not one of yours.",
  invalidAuthorization: "That could not be confirmed. Nothing was taken.",
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
  relayToTreasury: (input: PersonAuthorization & { from: Hex; to: Hex }) => Promise<{ hash: Hex }>;
  /** Whether the token has consumed an authorization: the truth when a relay failed after it may have been sent. */
  authorizationUsed: (from: Hex, nonce: Hex) => Promise<boolean>;
  store: Pick<typeof store, "recordPricedOrder" | "loadPhoneOrder" | "markReceived" | "markPaid" | "markDelivered" | "markFailed" | "markRefunded" | "markAbandoned" | "usedToday" | "keepSealedCode">;
  giftCardById: typeof giftCardById;
  readOrderCode: typeof readOrderCode;
  /** The vault's seal and its opening, so a code is never at rest in the clear. */
  seal: (text: string) => string;
  open: (sealed: string) => string;
  sleep: (ms: number) => Promise<void>;
}>;

/** The operators for a number, as the screen offers them: name, currency, the amounts it takes. */
export async function phoneOperators(phoneNumber: string, deps: Pick<PhoneDeps, "operatorsFor"> = livePhoneDeps()): Promise<readonly BitrefillOperator[]> {
  try {
    return await deps.operatorsFor(phoneNumber);
  } catch (error) {
    throw fromBitrefill(error);
  }
}

export type PricedPhoneOrder = Readonly<{ orderId: string; operatorName: string; localAmount: string; localCurrency: string; ausdUnits: bigint; to: Hex }>;

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
  const [mine, phones, everything] = await Promise.all([deps.store.usedToday(input.account), deps.store.usedToday(undefined, undefined, "phone"), deps.store.usedToday()]);
  if (mine.usdcUnits + units > BigInt(PHONE_CEILINGS.usdPerPersonPerDay) * USDC) throw new PhoneOrderError("OVER_PERSON_DAY", PHONE_REFUSALS.overPersonDay(mine.usdcUnits));
  if (phones.items + 1 > BITREFILL_ACCOUNT_LIMITS.phoneItemsPerDay) throw new PhoneOrderError("OVER_SERVICE_ITEMS", PHONE_REFUSALS.overServiceItems());
  if (everything.items + 1 > ACCOUNT_ITEMS_PER_DAY) throw new PhoneOrderError("OVER_SERVICE_ALL_ITEMS", PHONE_REFUSALS.overServiceAllItems());
  if (phones.usdcUnits + units > BigInt(BITREFILL_ACCOUNT_LIMITS.usdPerDay) * USDC) throw new PhoneOrderError("OVER_SERVICE_DAY", PHONE_REFUSALS.overServiceDay());
  if ((await deps.heldAusd(input.account)) < units) throw new PhoneOrderError("NOT_ENOUGH", PHONE_REFUSALS.notEnough);
  if (!(await deps.treasuryCovers(units))) throw new PhoneOrderError("TREASURY_SHORT", PHONE_REFUSALS.treasuryShort, 503);
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
    // One AUSD for one USDC: both are dollars with six decimals, and the treasury is funded to pay the difference in fees.
    usdcUnits: units,
    ausdUnits: units,
  });
  return { orderId: order.id, operatorName: order.operatorName, localAmount: order.localAmount, localCurrency: order.localCurrency, ausdUnits: order.ausdUnits, to };
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
  const [mine, everything] = await Promise.all([deps.store.usedToday(input.account), deps.store.usedToday()]);
  if (mine.usdcUnits + units > BigInt(PHONE_CEILINGS.usdPerPersonPerDay) * USDC) throw new PhoneOrderError("OVER_PERSON_DAY", PHONE_REFUSALS.overPersonDay(mine.usdcUnits));
  if (everything.items + 1 > ACCOUNT_ITEMS_PER_DAY) throw new PhoneOrderError("OVER_SERVICE_ALL_ITEMS", PHONE_REFUSALS.overServiceAllItems());
  if ((await deps.heldAusd(input.account)) < units) throw new PhoneOrderError("NOT_ENOUGH", PHONE_REFUSALS.notEnough);
  if (!(await deps.treasuryCovers(units))) throw new PhoneOrderError("TREASURY_SHORT", PHONE_REFUSALS.treasuryShort, 503);
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
    ausdUnits: units,
  });
  return { orderId: order.id, operatorName: order.operatorName, localAmount: order.localAmount, localCurrency: order.localCurrency, ausdUnits: order.ausdUnits, to };
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

/**
 * The person's money goes, and the invoice is paid. Checked before anything moves: the order is theirs and still
 * priced, the invoice still waits for its money, the authorization is for the treasury and for this amount exactly.
 */
export async function payPhoneTopUp(input: Readonly<{ account: Hex; orderId: string; authorization: PersonAuthorization }>, deps: PhoneDeps = livePhoneDeps()): Promise<PhoneOrderStatus> {
  const order = await deps.store.loadPhoneOrder(input.orderId);
  if (!order || getAddress(order.account) !== getAddress(input.account)) throw new PhoneOrderError("NOT_YOURS", PHONE_REFUSALS.notYours, 404);
  // A lapsed price moved nothing: it is refused as lapsed, never shown as money on its way back.
  if (order.state === "failed" && order.ausdTx === null) throw new PhoneOrderError("PRICE_EXPIRED", PHONE_REFUSALS.priceExpired);
  if (order.state !== "priced") return statusOf(order, deps.open);
  let invoice: BitrefillInvoice;
  try {
    invoice = await deps.readInvoice(order.invoiceId);
  } catch (error) {
    throw fromBitrefill(error);
  }
  if (invoice.status !== "unpaid") {
    await deps.store.markAbandoned(order.id);
    throw new PhoneOrderError("PRICE_EXPIRED", PHONE_REFUSALS.priceExpired);
  }
  if (input.authorization.value !== order.ausdUnits) throw new PhoneOrderError("INVALID_AUTHORIZATION", PHONE_REFUSALS.invalidAuthorization, 400);
  if (usdcUnits(invoice.payment.price) !== order.usdcUnits) throw new PhoneOrderError("PRICE_EXPIRED", PHONE_REFUSALS.priceExpired);
  if ((await deps.heldAusd(input.account)) < order.ausdUnits) throw new PhoneOrderError("NOT_ENOUGH", PHONE_REFUSALS.notEnough);
  if (!(await deps.treasuryCovers(order.usdcUnits))) throw new PhoneOrderError("TREASURY_SHORT", PHONE_REFUSALS.treasuryShort, 503);

  let receivedTx: string;
  try {
    receivedTx = (await deps.relayToTreasury({ ...input.authorization, from: getAddress(input.account), to: deps.treasuryAddress() })).hash;
  } catch {
    // A relay that failed may still have moved the money (a finality wait that ran out): the token says which.
    if (!(await deps.authorizationUsed(getAddress(input.account), input.authorization.nonce).catch(() => false))) {
      throw new PhoneOrderError("INVALID_AUTHORIZATION", PHONE_REFUSALS.invalidAuthorization);
    }
    receivedTx = `authorization:${input.authorization.nonce}`;
  }
  // Only the request that moved the order on pays: a second one arriving at the same time stops here.
  const inTreasury = await deps.store.markReceived(order.id, receivedTx);
  if (!inTreasury) return statusOf((await deps.store.loadPhoneOrder(order.id)) ?? order);
  try {
    const paid = await deps.payInvoiceOnBase({ to: invoice.payment.address, usdcUnits: order.usdcUnits });
    await deps.store.markPaid(order.id, paid.hash);
  } catch (error) {
    if (error instanceof TreasuryError && error.code === "PAYMENT_UNCONFIRMED" && error.hash) {
      await deps.store.markPaid(order.id, error.hash);
      return followPhoneTopUp({ account: input.account, orderId: order.id }, deps, 45_000);
    }
    const reason = error instanceof TreasuryError ? error.code : "PAYMENT_FAILED";
    return statusOf(await refund(inTreasury, reason, deps));
  }
  return followPhoneTopUp({ account: input.account, orderId: order.id }, deps, 45_000);
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
    if (Date.now() >= until) break;
    await deps.sleep(3_000);
    order = (await deps.store.loadPhoneOrder(order.id)) ?? order;
  }
  return statusOf(order, deps.open);
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
async function relayToTreasury(input: PersonAuthorization & { from: Hex; to: Hex }): Promise<{ hash: Hex }> {
  const clients = relayerClients();
  await relayerPreflight(clients);
  const args = [input.from, input.to, input.value, input.validAfter, input.validBefore, input.nonce, input.signature] as const;
  await clients.publicClient.simulateContract({ address: AUSD.address, abi: TRANSFER_ABI, functionName: "transferWithAuthorization", args, account: clients.address });
  const estimate = await clients.publicClient.estimateContractGas({ address: AUSD.address, abi: TRANSFER_ABI, functionName: "transferWithAuthorization", args, account: clients.address });
  const hash = await clients.walletClient.writeContract({ address: AUSD.address, abi: TRANSFER_ABI, functionName: "transferWithAuthorization", args, gas: addMonadGasBuffer(estimate), account: clients.walletClient.account!, chain: monadChain });
  const receipt = await waitForFinality(clients.publicClient, hash);
  if (receipt.status !== "success") throw new Error("reverted");
  return { hash };
}

const AUTHORIZATION_STATE_ABI = [
  { type: "function", name: "authorizationState", stateMutability: "view", inputs: [{ name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }], outputs: [{ type: "bool" }] },
] as const satisfies Abi;

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
    authorizationUsed,
    store,
    giftCardById,
    readOrderCode,
    seal: (text) => sealSecret(text),
    open: (sealed) => openSecret(sealed),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/** The currency a country pays in, for the cards of its own currency at the head of the list (the CFA zones first). */
const LOCAL_CURRENCY: Readonly<Record<string, string>> = { SN: "XOF", CI: "XOF", ML: "XOF", BF: "XOF", NE: "XOF", BJ: "XOF", TG: "XOF", GW: "XOF", CM: "XAF", GA: "XAF", CG: "XAF", TD: "XAF", CF: "XAF", GQ: "XAF", MA: "MAD", TN: "TND", FR: "EUR", BE: "EUR" };

export function localCurrencyOf(country: string): string | null {
  return LOCAL_CURRENCY[country] ?? null;
}
