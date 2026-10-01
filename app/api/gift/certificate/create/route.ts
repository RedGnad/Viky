import { NextResponse } from "next/server";
import { isSubjectKey, keyedSubject } from "@/src/subject-key";
import { getAddress, type Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { NO_CONTACT_HASH } from "@/src/contact-hash";
import { isOperator } from "@/src/dev-access";
import { endsBeforeTheEvent, eventToOutlast, outlastsTheEvent } from "@/src/event-length";
import { GiftApiError, NO_STORE, refundDestination } from "@/src/gift-api";
import { giftNameProblem, tidyGiftName } from "@/src/gift-names";
import { makeMilestoneGift } from "@/src/milestone-creation";
import { OFFERED_WHILE_BUILDING } from "@/src/conditions";
import { certificateById } from "@/src/milestone-conditions";
import { loadPortal, markRequestAlerted, requestProvider, resultsExtractOf, type Portal, type PortalSense } from "@/src/portal-store";
import { sendProviderAlert } from "@/src/provider-alert";
import { providerInstruction } from "@/src/provider-instruction";
import { milestoneErrorResponse } from "@/src/milestone-api";
import { MILESTONE_MAX_AMOUNT, MILESTONE_MIN_AMOUNT, milestoneFundingNonce, SHAPE_HAVE_OR_NOT, type MilestoneParams } from "@/src/milestone-protocol";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { readWcaCompetition } from "@/src/wca-reading";
import { admitRelay } from "@/src/relay-admission";

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
 * There is no operator door (the founder's rule of 23 Sep 2026, D184): a condition built is open to everybody, and a
 * condition with a piece missing is made by nobody.
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
    // A condition with a piece missing is made by nobody, operator or not (the founder's rule of 23 Sep 2026, D184). A
    // line listed while it is being built (D311) goes on to the refusal that says what is missing.
    if (!certificate.condition.live && !OFFERED_WHILE_BUILDING.includes(certificate.condition.id)) throw new GiftApiError("UNKNOWN_CONDITION", "That is not something a gift can be made for", 404);
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
    if (certificate.course?.refuses && course) {
      const refused = certificate.course.refuses(course, isOperator(account));
      if (refused) throw new GiftApiError(refused.code, `${refused.message} Nothing was taken.`, 409);
    }
    // A university gift is made on a university of the list, and on no other (D165, D313). Where the results provider
    // already declares its scale, a grade off it is refused by its name (D174); where it does not, the scale is pinned
    // with the first reviewed proof.
    // A university without a provider of the sense the condition reads is chosen all the same (D313): the operator is
    // asked for it before anything moves, with the exact instruction, and builds it within two days.
    let requested: { portal: Portal; sense: PortalSense } | null = null;
    // The scale a grade gift is made on while its university's is not pinned (the founder, 28 Sep 2026).
    let gradeScale: string | undefined;
    if (certificate.portal && course) {
      const portal = await loadPortal(course);
      if (!portal) throw new GiftApiError("NO_SUCH_PORTAL", "Viky lists no university by that name. Choose one from the list. Nothing was taken.", 409);
      const sense = certificate.portal.sense;
      if (!portal[sense]) {
        requested = { portal, sense };
        await requestProvider({ portalId: portal.portalId, sense, instruction: providerInstruction(portal, sense), giftId: null });
      }
      const results = resultsExtractOf(portal.results);
      const chosenScale = typeof body.scale === "string" ? body.scale : undefined;
      const refused = certificate.portal.refuses({ results }, target, chosenScale);
      if (refused) throw new GiftApiError(refused.code, `${refused.message} Nothing was taken.`, refused.code === "INVALID_TARGET" || refused.code === "SCALE_REQUIRED" ? 400 : 409);
      if (certificate.portal.scaled && !results) gradeScale = chosenScale;
    }
    const durationDays = Number(body.durationDays);
    const { min, max } = certificate.duration;
    if (!Number.isSafeInteger(durationDays) || durationDays < min || durationDays > max) {
      throw new GiftApiError("INVALID_DURATION", certificate.words.durationShape(min, max));
    }
    // A gift on a race or a competition must still be running when the result can be read (the audit of 1 Oct 2026):
    // a shorter one could never pay. Refused here, before anything is signed for or relayed.
    const event = await eventToOutlast(certificate.condition.id, course, async (competitionId) => (await readWcaCompetition(competitionId)).endDate).catch(() => {
      throw new GiftApiError("SOURCE_UNREADABLE", "The competition's dates could not be read just now. Try again in a moment. Nothing was taken.", 503);
    });
    if (event && !outlastsTheEvent(durationDays, event.readableAtMs, Date.now())) throw new GiftApiError("INVALID_DURATION", endsBeforeTheEvent(event.what));
    let amount: bigint;
    try {
      amount = BigInt(String(body.amount ?? ""));
    } catch {
      throw new GiftApiError("INVALID_AMOUNT", "The gift must be between $1.00 and $1,000.00");
    }
    if (amount < MILESTONE_MIN_AMOUNT || amount > MILESTONE_MAX_AMOUNT) throw new GiftApiError("INVALID_AMOUNT", "The gift must be between $1.00 and $1,000.00");
    const refundTo = refundDestination(body.refundTo, auth.account);
    const salt = String(body.salt ?? "");
    if (!HEX32.test(salt)) throw new GiftApiError("INVALID_SALT", "Please try again");
    // The key the subject is hashed with (src/subject-key.ts), drawn by the funder's browser: every gift made since 29
    // Sep 2026 carries one. A page open from before sends none and is asked to load again.
    const subjectKey = body.subjectKey;
    if (!isSubjectKey(subjectKey)) throw new GiftApiError("INVALID_SALT", "This page is out of date. Load it again and send the gift from there. Nothing was taken.");
    const a = (body.authorization ?? {}) as Record<string, unknown>;
    if (!HEX32.test(String(a.nonce ?? "")) || !HEX32.test(String(a.r ?? "")) || !HEX32.test(String(a.s ?? "")) || (Number(a.v) !== 27 && Number(a.v) !== 28)) {
      throw new GiftApiError("INVALID_AUTHORIZATION", "The signed authorization is malformed");
    }

    const params: MilestoneParams = {
      funder: getAddress(auth.account),
      refundTo,
      recipientContactHash: NO_CONTACT_HASH,
      goalType: (course && certificate.goalTypeOf?.(course)) || certificate.goalType,
      shape: SHAPE_HAVE_OR_NOT,
      // A grade is typed on its scale and signed in hundredths, the same integer the browser signed (D174).
      target: BigInt(certificate.targetUnits ? certificate.targetUnits(target) : target),
      maximumStart: 0n,
      subject: keyedSubject(certificate.subject({ name: personName, course }), subjectKey),
      durationDays,
      amount,
      salt: salt as Hex,
    };
    if (String(a.nonce).toLowerCase() !== milestoneFundingNonce(params).toLowerCase()) {
      throw new GiftApiError("TERMS_MISMATCH", "The signed terms do not match the gift");
    }

    const nonce = String(a.nonce) as Hex;
    // Counted against the account's and the connection's ceilings before the relayer is asked for anything (D204): a
    // creation declares the most gas of any relayed step, and was the one step that went around the door.
    await admitRelay(request, auth.account);
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
        ...(gradeScale ? { gradeScale } : {}),
        subjectKey,
      },
    });

    // Which gift asked first, for the operator who builds the provider, and the operator's email, once per request (the
    // founder, 28 Sep 2026): best effort both, the request itself is already written and the gift made.
    if (requested) {
      const request = await requestProvider({ portalId: requested.portal.portalId, sense: requested.sense, instruction: providerInstruction(requested.portal, requested.sense), giftId: created.giftId }).catch(() => null);
      if (request && !request.alertedAt && !request.builtAt && (await sendProviderAlert(requested.portal, request)) === "sent") {
        await markRequestAlerted(requested.portal.portalId, requested.sense).catch(() => undefined);
      }
    }
    const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
    return NextResponse.json({ giftId: created.giftId, claimUrl: `${origin}/g/${created.giftId}?t=${created.claimToken}`, funded: true }, { headers: NO_STORE });
  } catch (error) {
    return milestoneErrorResponse(error, isOperator(account));
  }
}
