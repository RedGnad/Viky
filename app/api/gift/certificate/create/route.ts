import { NextResponse } from "next/server";
import { getAddress, isAddress, type Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { NO_CONTACT_HASH } from "@/src/contact-hash";
import { isOperator } from "@/src/dev-access";
import { certificateSubject, isValidDetScore, normaliseCertificateName } from "@/src/duolingo-english-test";
import { GiftApiError, NO_STORE } from "@/src/gift-api";
import { giftNameProblem, tidyGiftName } from "@/src/gift-names";
import { makeMilestoneGift } from "@/src/milestone-creation";
import { certificateById } from "@/src/milestone-conditions";
import { milestoneErrorResponse } from "@/src/milestone-api";
import { MILESTONE_MAX_AMOUNT, MILESTONE_MIN_AMOUNT, milestoneFundingNonce, SHAPE_HAVE_OR_NOT, type MilestoneParams } from "@/src/milestone-protocol";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

/**
 * Making a gift on a supervised result (U3, C3).
 *
 * The funder signs one thing this route rebuilds byte for byte: the terms, whose nonce is their authorization's. The
 * subject is the person's name hashed, and it is the whole of the binding, so a certificate in another name pays
 * nothing. There is nothing to read before the money moves, because the page a certificate has exists only once the
 * test has been sat: that is the difference between this shape and a climb (D47).
 *
 * The condition is not live, so only an account that runs Viky may make one, which is how the first real gift on it
 * gets made. Everyone else is refused here and never sees it offered.
 */
export async function POST(request: Request) {
  let account = "";
  try {
    const rate = checkRateLimit("relay", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const auth = readAccountAuthSession(request);
    account = auth.account;
    const body = (await request.json()) as Record<string, unknown>;

    const certificate = certificateById(String(body.conditionId ?? ""));
    if (!certificate) throw new GiftApiError("UNKNOWN_CONDITION", "That is not something a gift can be made for");
    // A condition that is wired and not live is offered to an account that runs Viky, and to nobody else.
    if (!certificate.condition.live && !isOperator(auth.account)) {
      throw new GiftApiError("UNKNOWN_CONDITION", "That is not something a gift can be made for", 404);
    }

    const personName = tidyGiftName(String(body.personName ?? ""));
    if (giftNameProblem(personName) || normaliseCertificateName(personName).split(" ").length < 2) {
      throw new GiftApiError("INVALID_NAME", certificate.words.refusals.nameShape);
    }
    const target = Number(body.target);
    if (!isValidDetScore(target)) throw new GiftApiError("INVALID_TARGET", certificate.words.refusals.targetShape);
    const durationDays = Number(body.durationDays);
    const { min, max } = certificate.duration;
    if (!Number.isSafeInteger(durationDays) || durationDays < min || durationDays > max) {
      throw new GiftApiError("INVALID_DURATION", certificate.words.durationShape(min, max));
    }
    let amount: bigint;
    try {
      amount = BigInt(String(body.amount ?? ""));
    } catch {
      throw new GiftApiError("INVALID_AMOUNT", "The gift must be between $1.00 and $1,000.00");
    }
    if (amount < MILESTONE_MIN_AMOUNT || amount > MILESTONE_MAX_AMOUNT) throw new GiftApiError("INVALID_AMOUNT", "The gift must be between $1.00 and $1,000.00");
    const refundToRaw = body.refundTo ? String(body.refundTo) : auth.account;
    if (!isAddress(refundToRaw)) throw new GiftApiError("INVALID_REFUND", "The return destination is invalid");
    const salt = String(body.salt ?? "");
    if (!HEX32.test(salt)) throw new GiftApiError("INVALID_SALT", "Please try again");
    const a = (body.authorization ?? {}) as Record<string, unknown>;
    if (!HEX32.test(String(a.nonce ?? "")) || !HEX32.test(String(a.r ?? "")) || !HEX32.test(String(a.s ?? "")) || (Number(a.v) !== 27 && Number(a.v) !== 28)) {
      throw new GiftApiError("INVALID_AUTHORIZATION", "The signed authorization is malformed");
    }

    const params: MilestoneParams = {
      funder: getAddress(auth.account),
      refundTo: getAddress(refundToRaw),
      recipientContactHash: NO_CONTACT_HASH,
      goalType: certificate.goalType,
      shape: SHAPE_HAVE_OR_NOT,
      target: BigInt(target),
      maximumStart: 0n,
      subject: certificateSubject(certificate.condition.source, personName),
      durationDays,
      amount,
      salt: salt as Hex,
    };
    if (String(a.nonce).toLowerCase() !== milestoneFundingNonce(params).toLowerCase()) {
      throw new GiftApiError("TERMS_MISMATCH", "The signed terms do not match the gift");
    }

    const nonce = String(a.nonce) as Hex;
    const created = await makeMilestoneGift({
      params,
      nonce,
      authorization: {
        validAfter: BigInt(String(a.validAfter ?? "0")),
        validBefore: BigInt(String(a.validBefore ?? "0")),
        nonce,
        v: Number(a.v),
        r: String(a.r) as Hex,
        s: String(a.s) as Hex,
      },
      // No account on a source to bind: the certificate names its holder, and the name is in the terms already.
      goalUsername: "",
      recipientName: body.recipientName ? tidyGiftName(String(body.recipientName)) : undefined,
      funderName: body.funderName ? tidyGiftName(String(body.funderName)) : undefined,
      facts: { conditionId: certificate.condition.id, mode: "certificate", standingAtOffer: 0, standingReadAt: new Date().toISOString() },
    });

    const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
    return NextResponse.json({ giftId: created.giftId, claimUrl: `${origin}/g/${created.giftId}?t=${created.claimToken}`, funded: true }, { headers: NO_STORE });
  } catch (error) {
    return milestoneErrorResponse(error, isOperator(account));
  }
}
