import { NextResponse } from "next/server";
import { getAddress, isAddress, type Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { readGift } from "@/src/gift-reader";
import { relayWithdraw } from "@/src/gift-relay";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { admitRelay, assertNotTooSmall } from "@/src/relay-admission";
import { assertGiftContractConfigured, escrowOf } from "@/src/relayer";
import { loadGift } from "@/src/gift-store";
import { isOperator } from "@/src/dev-access";
import { canonicalSignature } from "@/src/signature";
import { milestoneErrorResponse } from "@/src/milestone-api";
import { isMilestoneGiftId } from "@/src/milestone-protocol";
import { milestoneWithdraw } from "@/src/milestone-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type WithdrawBody = { giftId?: string; to?: string; amount?: string; nonce?: string; deadline?: string; signature?: string };

/**
 * Sends the recipient what is already theirs, from a `Withdraw` intent they signed with their own
 * account. The relayer only pays the gas: the contract checks the signature against the recipient.
 */
export async function POST(request: Request) {
  let operatorAccount: string | undefined;
  try {
    const auth = readAccountAuthSession(request);
    operatorAccount = auth.account;
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<WithdrawBody>(request, 4 * 1_024);
    const giftId = String(body.giftId ?? "").trim();
    if (!/^\d{1,78}$/.test(giftId)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    const to = String(body.to ?? auth.account);
    if (!isAddress(to)) throw new GiftApiError("INVALID_DESTINATION", "The destination is invalid");
    // Reshaped rather than taken as given: the contract's library refuses a recovery byte outside 27 and 28,
    // and an s in the upper half of the curve, and refuses both with a plain string that reaches the person
    // as "this could not be recorded". Neither reshaping changes who signed (D51).
    let signature: Hex;
    try {
      signature = canonicalSignature(String(body.signature ?? ""));
    } catch {
      throw new GiftApiError("INVALID_SIGNATURE", "Please try again");
    }
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
    await admitRelay(request, auth.account);
    // A milestone gift is taken from its own contract, under its own signing domain (C2).
    if (isMilestoneGiftId(giftId)) {
      return await milestoneWithdraw({ account: auth.account, giftId, to, amount, nonce, deadline, signature }).catch((error: unknown) =>
        milestoneErrorResponse(error, isOperator(operatorAccount)),
      );
    }
    const record = await loadGift(giftId);
    if (!record) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    const escrow = escrowOf(record);
    const gift = await readGift(escrow, giftId);
    if (!gift.recipient || gift.recipient.toLowerCase() !== auth.account.toLowerCase()) {
      throw new GiftApiError("NOT_YOURS", "Only the person the gift is for can take it", 403);
    }
    if (amount <= 0n || amount > gift.earnedBalance) throw new GiftApiError("NOT_ENOUGH_EARNED", "That is more than what is yours so far", 409);
    assertNotTooSmall("takeOut", amount, gift.earnedBalance);

    const result = await relayWithdraw({ giftId, escrow, to: getAddress(to), amount, nonce, deadline, signature });
    return NextResponse.json({ giftId, sent: true, amount: amount.toString(), hash: result.hash }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error, isOperator(operatorAccount));
  }
}
