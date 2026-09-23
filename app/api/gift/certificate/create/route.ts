import { NextResponse } from "next/server";
import { getAddress, isAddress, type Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { NO_CONTACT_HASH } from "@/src/contact-hash";
import { isOperator } from "@/src/dev-access";
import { GiftApiError, NO_STORE } from "@/src/gift-api";
import { giftNameProblem, tidyGiftName } from "@/src/gift-names";
import { makeMilestoneGift } from "@/src/milestone-creation";
import { certificateById } from "@/src/milestone-conditions";
import { loadPortal } from "@/src/portal-store";
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
 * The door for a condition that is wired and not live is kept and unchanged: only an account that runs Viky may make
 * a gift on one. The supervised result went through it and out the other side on 19 Sep 2026, when its goal was
 * registered on the milestone contract and it opened to everybody (D109); the door stands for whatever comes next.
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
    // A line whose provider is not registered yet takes no gift from anybody (D176): the money would wait until the
    // last day for a proof nothing could produce.
    if (certificate.notOpen) throw new GiftApiError("NOT_CONFIGURED", `${certificate.notOpen} Nothing was taken.`, 503);

    // A shown condition binds the account, not a name: nothing is asked and the subject is the condition's own (D164).
    const personName = certificate.asksName === false ? "" : tidyGiftName(String(body.personName ?? ""));
    if (certificate.asksName !== false) {
      // Each condition says what name its own certificate can carry: the test prints a legal name and asks for two
      // words, a course certificate can carry one, and a real one does (C3).
      if (giftNameProblem(personName) || !certificate.validName(personName)) {
        throw new GiftApiError("INVALID_NAME", certificate.words.refusals.nameShape);
      }
    }
    const target = Number(body.target);
    if (!certificate.validTarget(target)) throw new GiftApiError("INVALID_TARGET", certificate.words.refusals.targetShape);
    // A course certificate binds the course into what the funder signs, because "a certificate" alone would be paid
    // by any of them. A condition that asks for no course must carry none, or the subject would be another gift's.
    const course = certificate.course ? certificate.course.slugOf(String(body.course ?? "")) : undefined;
    if (certificate.course && !course) throw new GiftApiError("INVALID_COURSE", certificate.course.help);
    if (!certificate.course && body.course) throw new GiftApiError("INVALID_COURSE", "That gift takes no course");
    // A university gift is made on a portal Viky has proved with a student, and on no other (D165): a gift on a portal
    // nobody can show would hold the money until its last day for nothing. And the row must hold what the condition
    // reads, its results page for the year or a grade, on a scale the target is on (D174): each refusal by its name.
    if (certificate.portal && course) {
      const portal = await loadPortal(course);
      if (!portal) throw new GiftApiError("NO_SUCH_PORTAL", "Viky has proved no student portal by that name. Choose one from the list. Nothing was taken.", 409);
      const refused = certificate.portal.refuses(portal, target);
      if (refused) throw new GiftApiError(refused.code, `${refused.message} Nothing was taken.`, refused.code === "INVALID_TARGET" ? 400 : 409);
    }
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
      // A grade is typed on its scale and signed in hundredths, the same integer the browser signed (D174).
      target: BigInt(certificate.targetUnits ? certificate.targetUnits(target) : target),
      maximumStart: 0n,
      subject: certificate.subject({ name: personName, course }),
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
      // A university gift remembers its portal (D165), a shown course gift its course (D178): the session that shows
      // the proof reads the provider, or the course to match, from it.
      facts: {
        conditionId: certificate.condition.id,
        mode: "certificate",
        standingAtOffer: 0,
        standingReadAt: new Date().toISOString(),
        ...(certificate.portal && course ? { portal: course } : {}),
        ...(!certificate.portal && certificate.course && course ? { course } : {}),
      },
    });

    const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
    return NextResponse.json({ giftId: created.giftId, claimUrl: `${origin}/g/${created.giftId}?t=${created.claimToken}`, funded: true }, { headers: NO_STORE });
  } catch (error) {
    return milestoneErrorResponse(error, isOperator(account));
  }
}
