import { NextResponse } from "next/server";
import { getAddress, isAddress, type Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { isChessClimb } from "@/src/chess-com";
import { ChessReadError, readChessStanding } from "@/src/chess-reading";
import { NO_CONTACT_HASH } from "@/src/contact-hash";
import { isOperator } from "@/src/dev-access";
import { GiftApiError, NO_STORE } from "@/src/gift-api";
import { giftNameProblem, tidyGiftName } from "@/src/gift-names";
import { giftSalt } from "@/src/gift-terms";
import { loadCreation } from "@/src/gift-store";
import { milestoneErrorResponse } from "@/src/milestone-api";
import { cadenceOf, milestoneById } from "@/src/milestone-conditions";
import { makeMilestoneGift } from "@/src/milestone-creation";
import { MILESTONE_MAX_AMOUNT, MILESTONE_MIN_AMOUNT, milestoneFundingNonce, SHAPE_CLIMB, ZERO_SUBJECT, type MilestoneParams } from "@/src/milestone-protocol";
import { checkTarget, MilestoneTermsError, startingCeiling } from "@/src/milestone-terms";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CreateBody = {
  conditionId?: string;
  username?: string;
  cadence?: string;
  target?: number;
  /** Where the person stood on the funder's screen when they chose the target: what the ceiling was built on. */
  standing?: number;
  standingReadAt?: string;
  durationDays?: number;
  amount?: string;
  refundTo?: string;
  salt?: string;
  /** The random half of the salt, so the terms signed can be rebuilt here (D102). */
  saltSeed?: string;
  recipientName?: string;
  funderName?: string;
  authorization?: { validAfter?: string; validBefore?: string; nonce?: string; v?: number; r?: string; s?: string };
};

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

function checkedName(value: unknown, which: "their first name" | "your name"): string | undefined {
  if (value === undefined || value === null) return undefined;
  const problem = giftNameProblem(String(value));
  if (problem === "empty") return undefined;
  if (problem === "tooLong") throw new GiftApiError("INVALID_NAME", `Write ${which} in 40 characters or fewer.`);
  if (problem === "notText") throw new GiftApiError("INVALID_NAME", `Write ${which} with letters, spaces, dots, apostrophes or hyphens.`);
  return tidyGiftName(String(value));
}

/**
 * Creates and funds a milestone gift (C2) with the funder's single EIP-3009 signature, on `MilestoneGift`.
 *
 * The funder signs two numbers: the target, and the highest start they pay a climb from, which their screen built from
 * where the person stood when they chose (D45). Both are rebuilt here from what the screen sends, and the signature must
 * be over exactly those terms. The person is read again before anything is relayed: a name that no longer answers, or a
 * cadence with no rating, makes no gift; and if the rating has already risen past the highest start the funder
 * accepted, the gift could never pay, so it is refused with the number, rather than made and returned in a month.
 *
 * The gift is made in the order D87 set for every gift: its creation recorded before the money moves, then relayed,
 * then recorded. Only a live condition is offered, and only a live condition is made, with one exception: an operator account may make
 * a gift on a condition that is wired but not yet live, which is how its first real gift is made before it is offered.
 */
export async function POST(request: Request) {
  let account: string | undefined;
  try {
    const auth = readAccountAuthSession(request);
    account = auth.account;
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<CreateBody>(request, 8 * 1_024);

    const milestone = milestoneById(String(body.conditionId ?? ""));
    if (!milestone || !(milestone.condition.live || isOperator(auth.account))) throw new GiftApiError("GOAL_NOT_OFFERED", "This goal is not offered yet.");
    const cadence = cadenceOf(milestone, String(body.cadence ?? ""));
    if (!cadence || !isChessClimb(cadence.id)) throw new GiftApiError("INVALID_MODE", milestone.words.refusals.noCadence);
    const username = String(body.username ?? "").trim();
    if (!milestone.validName(username)) throw new GiftApiError("INVALID_USERNAME", milestone.words.refusals.nameShape);

    const recipientName = checkedName(body.recipientName, "their first name");
    const funderName = checkedName(body.funderName, "your name");

    const target = Number(body.target);
    const standing = Number(body.standing);
    const durationDays = Number(body.durationDays);
    try {
      checkTarget(milestone.shape, standing, target);
    } catch (error) {
      if (error instanceof MilestoneTermsError) throw new GiftApiError("INVALID_TARGET", error.message);
      throw error;
    }
    if (!Number.isInteger(durationDays) || durationDays < milestone.duration.min || durationDays > milestone.duration.max) {
      throw new GiftApiError("INVALID_DURATION", milestone.words.durationShape(milestone.duration.min, milestone.duration.max));
    }
    let amount: bigint;
    try {
      amount = BigInt(String(body.amount ?? ""));
    } catch {
      throw new GiftApiError("INVALID_AMOUNT", "Enter an amount");
    }
    if (amount < MILESTONE_MIN_AMOUNT || amount > MILESTONE_MAX_AMOUNT) throw new GiftApiError("INVALID_AMOUNT", "The gift must be between $1.00 and $1,000.00");
    const standingReadAt = new Date(String(body.standingReadAt ?? ""));
    if (Number.isNaN(standingReadAt.getTime()) || standingReadAt.getTime() > Date.now() + 60_000) throw new GiftApiError("INVALID_READING", "Read where they stand again.");
    const refundToRaw = body.refundTo ? String(body.refundTo) : auth.account;
    if (!isAddress(refundToRaw)) throw new GiftApiError("INVALID_REFUND", "The return destination is invalid");
    const salt = String(body.salt ?? "");
    if (!HEX32.test(salt)) throw new GiftApiError("INVALID_SALT", "Please try again");
    const saltSeed = String(body.saltSeed ?? "");
    if (!HEX32.test(saltSeed)) throw new GiftApiError("INVALID_SALT", "Please try again");
    // The salt is the account (D102): rebuilt from the name this request carries, so the signature cannot be for one
    // Chess.com account and the gift for another. The cadence needs none of this: it is the goal type, already signed.
    if (giftSalt({ account: username, seed: saltSeed as Hex }).toLowerCase() !== salt.toLowerCase()) {
      throw new GiftApiError("TERMS_MISMATCH", "The signed terms do not match the gift");
    }
    const a = body.authorization ?? {};
    if (!HEX32.test(String(a.nonce ?? "")) || !HEX32.test(String(a.r ?? "")) || !HEX32.test(String(a.s ?? "")) || (a.v !== 27 && a.v !== 28)) {
      throw new GiftApiError("INVALID_AUTHORIZATION", "The signed authorization is malformed");
    }

    const maximumStart = startingCeiling(milestone.shape, target);
    const params: MilestoneParams = {
      funder: getAddress(auth.account),
      refundTo: getAddress(refundToRaw),
      recipientContactHash: NO_CONTACT_HASH,
      goalType: cadence.goalType,
      shape: SHAPE_CLIMB,
      target: BigInt(target),
      maximumStart: BigInt(maximumStart),
      subject: ZERO_SUBJECT,
      durationDays,
      amount,
      salt: salt as Hex,
    };
    if (String(a.nonce).toLowerCase() !== milestoneFundingNonce(params).toLowerCase()) {
      throw new GiftApiError("TERMS_MISMATCH", "The signed terms do not match the gift");
    }

    // A creation whose money may already have moved (submitted, or complete) passed these reads when it began: its retry
    // only completes it (D87), and a rating that moved since must not stand in the way. Any other attempt reads again.
    const nonce = String(a.nonce) as Hex;
    const existing = await loadCreation(nonce);
    if (!(existing && (existing.status === "complete" || existing.txHash !== null))) {
      // Read again, just before the money moves: the card payment can take an hour, and a rating moves with every game.
      let now: Awaited<ReturnType<typeof readChessStanding>>;
      try {
        now = await readChessStanding(username, cadence.id);
      } catch (error) {
        if (error instanceof ChessReadError && error.code === "PROFILE_NOT_FOUND") throw new GiftApiError("NO_SUCH_PROFILE", `${milestone.words.refusals.notFound} Nothing was taken.`, 400);
        if (error instanceof ChessReadError && error.code === "INVALID_USERNAME") throw new GiftApiError("INVALID_USERNAME", milestone.words.refusals.nameShape, 400);
        if (error instanceof ChessReadError && error.code === "ACCOUNT_CLOSED") throw new GiftApiError("ACCOUNT_CLOSED", `${milestone.words.refusals.closed} Nothing was taken.`, 409);
        throw new GiftApiError("SOURCE_UNAVAILABLE", `${milestone.words.refusals.unavailable} The gift was not made and nothing was taken.`, 503);
      }
      if (now.rating === null) throw new GiftApiError("NO_RATING", `${milestone.words.refusals.noRating(cadence.label)} Nothing was taken.`, 400);
      // A rating that has not settled moves far more than ten points a game, so the climb signed would measure nothing (D90).
      // An account that runs Viky may still make one while the condition is not live, for the rehearsal gift only.
      const rehearsal = !milestone.condition.live && isOperator(auth.account);
      if (!milestone.settled(now.rd) && !rehearsal) throw new GiftApiError("RATING_SETTLING", `${milestone.words.refusals.settling} Nothing was taken.`, 409);
      if (now.rating > maximumStart) {
        throw new GiftApiError(
          "STANDING_MOVED",
          `They are at ${now.rating} now, already at the ${target} this gift is for, so it could never be earned. Nothing was taken. Choose the rating again.`,
          409,
        );
      }
    }

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
      goalUsername: username.toLowerCase(),
      recipientName,
      funderName,
      facts: { conditionId: milestone.condition.id, mode: cadence.id, standingAtOffer: standing, standingReadAt: standingReadAt.toISOString() },
    });
    const claimToken = created.claimToken;

    const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
    return NextResponse.json({ giftId: created.giftId, claimUrl: `${origin}/g/${created.giftId}?t=${claimToken}`, funded: true }, { headers: NO_STORE });
  } catch (error) {
    return milestoneErrorResponse(error, isOperator(account));
  }
}
