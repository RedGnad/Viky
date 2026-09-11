import { NextResponse } from "next/server";
import { getAddress, isAddress, type Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { readGift } from "@/src/gift-reader";
import { relayWithdraw } from "@/src/gift-relay";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { assertGiftContractConfigured, escrowOf } from "@/src/relayer";
import { loadGift } from "@/src/gift-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type WithdrawBody = { giftId?: string; to?: string; amount?: string; nonce?: string; deadline?: string; signature?: string };

/**
 * Sends the recipient what is already theirs, from a `Withdraw` intent they signed with their own
 * account. The relayer only pays the gas: the contract checks the signature against the recipient.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<WithdrawBody>(request, 4 * 1_024);
    const giftId = String(body.giftId ?? "").trim();
    if (!/^\d{1,78}$/.test(giftId)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    const to = String(body.to ?? auth.account);
    if (!isAddress(to)) throw new GiftApiError("INVALID_DESTINATION", "The destination is invalid");
    const signature = String(body.signature ?? "");
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new GiftApiError("INVALID_SIGNATURE", "Please try again");
    let amount: bigint;
    let nonce: bigint;
    let deadline: bigint;
    try {
      amount = BigInt(String(body.amount ?? ""));
      nonce = BigInt(String(body.nonce ?? ""));
      deadline = BigInt(String(body.deadline ?? ""));
    } catch {
      throw new GiftApiError("INVALID_REQUEST", "Please try again");
    }

    assertGiftContractConfigured();
    const record = await loadGift(giftId);
    if (!record) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    const escrow = escrowOf(record);
    const gift = await readGift(escrow, giftId);
    if (!gift.recipient || gift.recipient.toLowerCase() !== auth.account.toLowerCase()) {
      throw new GiftApiError("NOT_YOURS", "Only the person the gift is for can take it", 403);
    }
    if (amount <= 0n || amount > gift.earnedBalance) throw new GiftApiError("NOT_ENOUGH_EARNED", "That is more than what is yours so far", 409);

    const result = await relayWithdraw({ giftId, escrow, to: getAddress(to), amount, nonce, deadline, signature: signature as Hex });
    return NextResponse.json({ giftId, sent: true, amount: amount.toString(), hash: result.hash }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
