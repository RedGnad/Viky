import { getJson, postJson } from "./api";
import type { PhonePrice } from "./phone";

/** The browser's side of gift cards (D271): the list for a country, a price, and the account's own codes. */

export type GiftCardListed = Readonly<{
  id: string;
  name: string;
  /** Bitrefill's own line on where the card works: "Works in: Senegal". */
  worksIn: string;
  currency: string;
  packages: ReadonlyArray<Readonly<{ id: string; value: string; priceUsd: number }>>;
  range: Readonly<{ min: number; max: number; step: number; priceRate: number }> | null;
}>;

export type GiftCardCode = Readonly<{ code?: string; link?: string; pin?: string; instructions?: string; expires?: string }>;

export type GiftCardKept = Readonly<{ orderId: string; name: string; localAmount: string; localCurrency: string; amount: string; at: string; code?: GiftCardCode }>;

export async function listGiftCards(country: string): Promise<readonly GiftCardListed[]> {
  return (await getJson<{ cards: GiftCardListed[] }>(`/api/giftcards?country=${encodeURIComponent(country)}`)).cards;
}

export async function priceGiftCard(input: Readonly<{ productId: string; packageId?: string; value?: number }>): Promise<PhonePrice> {
  const answer = await postJson<Omit<PhonePrice, "ausdUnits" | "feeUnits"> & { ausdUnits: string; feeUnits?: string }>("/api/giftcards/price", input);
  return { ...answer, ausdUnits: BigInt(answer.ausdUnits), feeUnits: BigInt(answer.feeUnits ?? "0") };
}

export async function giftCardCodes(): Promise<readonly GiftCardKept[]> {
  return (await getJson<{ cards: GiftCardKept[] }>("/api/giftcards/codes")).cards;
}
