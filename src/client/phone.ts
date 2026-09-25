import { getAddress, type Hex, type LocalAccount } from "viem";
import { transferAuthorizationMessage, transferAuthorizationTypedData } from "../ausd-authorization";
import { AUSD } from "../coins";
import { getJson, postJson } from "./api";

/** The browser's side of the phone way out (D238): every call to its routes, and the one signature the person makes. */

export type PhoneOperator = Readonly<{
  id: string;
  name: string;
  currency: string;
  packages: ReadonlyArray<Readonly<{ id: string; value: string; priceUsd: number }>>;
  range: Readonly<{ min: number; max: number; step: number; priceRate: number }> | null;
}>;

export { phoneKindOf, type PhoneKind } from "../phone-kind";

export type PhonePrice = Readonly<{ orderId: string; operatorName: string; localAmount: string; localCurrency: string; ausdUnits: bigint; to: Hex }>;

export type PhoneStatus = Readonly<{
  orderId: string;
  state: "on_its_way" | "delivered" | "refunded" | "refund_pending";
  amount: string;
  operatorName: string;
  kind?: "phone" | "gift_card";
  /** A delivered gift card's code, sent to its owner alone (D271). */
  code?: Readonly<{ code?: string; link?: string; pin?: string; instructions?: string; expires?: string }>;
}>;


export async function findPhoneOperators(phone: string): Promise<readonly PhoneOperator[]> {
  return (await postJson<{ operators: PhoneOperator[] }>("/api/phone/operators", { phone })).operators;
}

export async function pricePhone(input: Readonly<{ phone: string; operatorId: string; packageId?: string; value?: number }>): Promise<PhonePrice> {
  const answer = await postJson<Omit<PhonePrice, "ausdUnits"> & { ausdUnits: string }>("/api/phone/price", input);
  return { ...answer, ausdUnits: BigInt(answer.ausdUnits) };
}

/**
 * The person's one signature: their AUSD, the exact amount priced, to the treasury the price named and nowhere else.
 * The server checks both again against the order before anything moves.
 */
export async function payPhone(input: Readonly<{ account: LocalAccount; price: PhonePrice; nonce: Hex }>): Promise<PhoneStatus> {
  const message = transferAuthorizationMessage({ from: getAddress(input.account.address), to: getAddress(input.price.to), value: input.price.ausdUnits, nonce: input.nonce });
  const signature = await input.account.signTypedData(transferAuthorizationTypedData(message, AUSD));
  return postJson<PhoneStatus>("/api/phone/pay", {
    orderId: input.price.orderId,
    value: message.value.toString(),
    validAfter: message.validAfter.toString(),
    validBefore: message.validBefore.toString(),
    nonce: message.nonce,
    signature,
  });
}

export async function followPhone(orderId: string): Promise<PhoneStatus> {
  return getJson<PhoneStatus>(`/api/phone/order?id=${encodeURIComponent(orderId)}`);
}
