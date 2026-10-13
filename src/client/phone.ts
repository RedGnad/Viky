import { getAddress, type Hex, type LocalAccount } from "viem";
import { transferAuthorizationMessage, transferAuthorizationTypedData } from "../ausd-authorization";
import { AUSD } from "../coins";
import { ApiError, getJson, NoAnswer, postJson, postJsonThatMoves } from "./api";

/** The browser's side of the phone way out (D238): every call to its routes, and the one signature the person makes. */

export type PhoneOperator = Readonly<{
  id: string;
  name: string;
  currency: string;
  packages: ReadonlyArray<Readonly<{ id: string; value: string }>>;
  range: Readonly<{ min: number; max: number; step: number }> | null;
}>;

export { phoneKindOf, type PhoneKind } from "../phone-kind";

export type PhonePrice = Readonly<{ orderId: string; operatorName: string; localAmount: string; localCurrency: string; ausdUnits: bigint; feeUnits: bigint; to: Hex }>;

export type PhoneStatus = Readonly<{
  orderId: string;
  state: "on_its_way" | "delivered" | "refunded" | "refund_pending";
  amount: string;
  /** The same amount in the dollar's own units, which a screen says in the currency its reader reads in. */
  units?: string;
  operatorName: string;
  kind?: "phone" | "gift_card";
  /** A delivered gift card's code, sent to its owner alone (D271). */
  code?: Readonly<{ code?: string; link?: string; pin?: string; instructions?: string; expires?: string }>;
}>;


export async function findPhoneOperators(phone: string): Promise<readonly PhoneOperator[]> {
  return (await postJson<{ operators: PhoneOperator[] }>("/api/phone/operators", { phone })).operators;
}

export async function pricePhone(input: Readonly<{ phone: string; operatorId: string; packageId?: string; value?: number }>): Promise<PhonePrice> {
  const answer = await postJson<Omit<PhonePrice, "ausdUnits" | "feeUnits"> & { ausdUnits: string; feeUnits?: string }>("/api/phone/price", input);
  return { ...answer, ausdUnits: BigInt(answer.ausdUnits), feeUnits: BigInt(answer.feeUnits ?? "0") };
}

/**
 * The person's one signature: their AUSD, the exact amount priced, to the treasury the price named and nowhere else.
 * The server checks both again against the order before anything moves.
 *
 * Once it is signed the request is out, and it moves money (the founder, 13 Oct 2026): no answer of the route (a
 * connection that dropped, a gateway's page), or its plain failure, which cannot vouch that nothing moved, is said as
 * no answer and never as "nothing was taken". A refusal the route wrote comes back with its code and its sentence.
 */
export async function payPhone(input: Readonly<{ account: LocalAccount; price: PhonePrice; nonce: Hex }>): Promise<PhoneStatus> {
  const message = transferAuthorizationMessage({ from: getAddress(input.account.address), to: getAddress(input.price.to), value: input.price.ausdUnits, nonce: input.nonce });
  // A signature refused stops here, before anything is asked of Viky: nothing can have moved.
  const signature = await input.account.signTypedData(transferAuthorizationTypedData(message, AUSD));
  try {
    return await postJsonThatMoves<PhoneStatus>("/api/phone/pay", {
      orderId: input.price.orderId,
      value: message.value.toString(),
      validAfter: message.validAfter.toString(),
      validBefore: message.validBefore.toString(),
      nonce: message.nonce,
      signature,
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === "FAILED") throw new NoAnswer(error.status);
    throw error;
  }
}

export async function followPhone(orderId: string): Promise<PhoneStatus> {
  return getJson<PhoneStatus>(`/api/phone/order?id=${encodeURIComponent(orderId)}`);
}
