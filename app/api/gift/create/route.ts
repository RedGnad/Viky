import { NextResponse } from "next/server";
import { getAddress, isAddress, type Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { isValidDuolingoUsername } from "@/src/duolingo-public-terms";
import { contactHash } from "@/src/contact-hash";
import { fundingNonce, type GiftParams } from "@/src/gift-attestation";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { relayCreateGift } from "@/src/gift-relay";
import { newClaimToken, saveGift } from "@/src/gift-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CreateBody = {
  contact?: string;
  duolingoUsername?: string;
  goalType?: number;
  dailyTarget?: number;
  durationDays?: number;
  amount?: string;
  refundTo?: string;
  salt?: string;
  authorization?: { validAfter?: string; validBefore?: string; nonce?: string; v?: number; r?: string; s?: string };
};

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

/**
 * Creates and funds a gift with the funder's single EIP-3009 signature. The funder is the signed-in
 * account, never a body field; the contact is hashed here and never stored; the relayer submits and
 * waits for finality before "Funded" is ever said. The answer carries the claim link to hand to the
 * recipient.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<CreateBody>(request, 8 * 1_024);
    const duolingoUsername = String(body.duolingoUsername ?? "").trim() || undefined;
    if (duolingoUsername && !isValidDuolingoUsername(duolingoUsername)) {
      throw new GiftApiError("INVALID_USERNAME", "That does not look like a Duolingo username.", 400);
    }

    const contact = String(body.contact ?? "");
    const goalType = Number(body.goalType);
    const dailyTarget = Number(body.dailyTarget);
    const durationDays = Number(body.durationDays);
    if (!Number.isInteger(goalType) || goalType < 1 || goalType > 255) throw new GiftApiError("GOAL_NOT_OFFERED", "Choose a goal from the menu");
    if (!Number.isInteger(dailyTarget) || dailyTarget < 1) throw new GiftApiError("INVALID_TARGET", "Choose a daily target");
    if (!Number.isInteger(durationDays) || durationDays < 7 || durationDays > 90) throw new GiftApiError("INVALID_DURATION", "Choose between 7 and 90 days");
    let amount: bigint;
    try {
      amount = BigInt(String(body.amount ?? ""));
    } catch {
      throw new GiftApiError("INVALID_AMOUNT", "Enter an amount");
    }
    if (amount < 1_000_000n) throw new GiftApiError("INVALID_AMOUNT", "The gift must be at least $1.00");
    const refundToRaw = body.refundTo ? String(body.refundTo) : auth.account;
    if (!isAddress(refundToRaw)) throw new GiftApiError("INVALID_REFUND", "The return destination is invalid");
    const salt = String(body.salt ?? "");
    if (!HEX32.test(salt)) throw new GiftApiError("INVALID_SALT", "Please try again");
    const a = body.authorization ?? {};
    if (!HEX32.test(String(a.nonce ?? "")) || !HEX32.test(String(a.r ?? "")) || !HEX32.test(String(a.s ?? "")) || (a.v !== 27 && a.v !== 28)) {
      throw new GiftApiError("INVALID_AUTHORIZATION", "The signed authorization is malformed");
    }

    const params: GiftParams = {
      funder: getAddress(auth.account),
      refundTo: getAddress(refundToRaw),
      recipientContactHash: contactHash(contact),
      goalType,
      dailyTarget,
      durationDays,
      amount,
      salt: salt as Hex,
    };
    if (String(a.nonce).toLowerCase() !== fundingNonce(params).toLowerCase()) {
      throw new GiftApiError("TERMS_MISMATCH", "The signed terms do not match the gift");
    }

    const created = await relayCreateGift(params, {
      validAfter: BigInt(String(a.validAfter ?? "0")),
      validBefore: BigInt(String(a.validBefore ?? "0")),
      nonce: String(a.nonce) as Hex,
      v: Number(a.v),
      r: String(a.r) as Hex,
      s: String(a.s) as Hex,
    });

    const claimToken = newClaimToken();
    await saveGift({
      giftId: created.giftId,
      funder: params.funder,
      contactHash: params.recipientContactHash,
      claimToken,
      goalType,
      dailyTarget,
      durationDays,
      amount,
      createdTx: created.hash,
      escrow: created.escrow,
      goalUsername: duolingoUsername,
    });

    const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
    return NextResponse.json(
      { giftId: created.giftId, claimUrl: `${origin}/g/${created.giftId}?t=${claimToken}`, funded: true },
      { headers: NO_STORE },
    );
  } catch (error) {
    return giftErrorResponse(error);
  }
}
