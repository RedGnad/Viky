import { NextResponse } from "next/server";
import { getAddress, isAddress, type Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { conditionOfGoal } from "@/src/conditions";
import { isOperator } from "@/src/dev-access";
import { readJsonBody } from "@/src/api-guard";
import { isDuolingoCourseId, isValidDuolingoUsername } from "@/src/duolingo-public-terms";
import { contactHash, NO_CONTACT_HASH } from "@/src/contact-hash";
import { DuolingoProfileError, resolvePublicDuolingoProfile } from "@/src/duolingo-profile";
import { giftNameProblem, tidyGiftName } from "@/src/gift-names";
import { fundingNonce, type GiftParams } from "@/src/gift-attestation";
import { giftSalt } from "@/src/gift-terms";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { makeGift } from "@/src/gift-creation";
import { GOAL_TYPE_DUOLINGO_COURSE_XP } from "@/src/gift-terms";
import { liveCreationDeps } from "@/src/gift-creation-live";
import { MAX_GIFT_UNITS, MIN_GIFT_UNITS } from "@/src/money";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CreateBody = {
  contact?: string;
  duolingoUsername?: string;
  recipientName?: string;
  funderName?: string;
  goalType?: number;
  /** Which course a day is counted on, for a gift made on one course (U1). */
  course?: string;
  /** The random half of the salt, so the terms signed can be rebuilt here (D102). */
  saltSeed?: string;
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
 * account, never a body field; no contact is asked for since D72, though a page loaded before then still sends
 * one and signed its hash into the terms, so that one is hashed here and never stored; the relayer submits and
 * waits for finality before "Funded" is ever said. The answer carries the claim link to hand to the
 * recipient.
 *
 * The two names (src/gift-names.ts) are checked here and stored beside the link, never signed into the terms. A page
 * loaded before they existed sends neither, and its gift is still made. A Duolingo name is read from Duolingo's public
 * profile before anything is relayed, so no money goes behind a name nobody can read (decision 10 of the drawn flows).
 */
function checkedName(value: unknown, which: "their first name" | "your name"): string | undefined {
  if (value === undefined || value === null) return undefined;
  const problem = giftNameProblem(String(value));
  if (problem === "empty") return undefined;
  if (problem === "tooLong") throw new GiftApiError("INVALID_NAME", `Write ${which} in 40 characters or fewer.`);
  if (problem === "notText") throw new GiftApiError("INVALID_NAME", `Write ${which} with letters, spaces, dots, apostrophes or hyphens.`);
  return tidyGiftName(String(value));
}

export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<CreateBody>(request, 8 * 1_024);
    // The account on the source: the field is named for the first source (a data contract with the sheet), and it is
    // checked below by the rule of the condition the gift is made on.
    const duolingoUsername = String(body.duolingoUsername ?? "").trim() || undefined;

    const recipientName = checkedName(body.recipientName, "their first name");
    const funderName = checkedName(body.funderName, "your name");

    const contact = String(body.contact ?? "").trim();
    const goalType = Number(body.goalType);
    const dailyTarget = Number(body.dailyTarget);
    const durationDays = Number(body.durationDays);
    if (!Number.isInteger(goalType) || goalType < 1 || goalType > 255) throw new GiftApiError("GOAL_NOT_OFFERED", "Choose a goal from the menu");
    // The condition that goal stands for, in the register or behind the door (D109): a gift is made on nothing else, a
    // condition that is not live is made only by an account that runs Viky, and the account name is checked by that
    // condition's own rule. Before 23 Sep 2026 any goal type from 1 to 255 was accepted here.
    const condition = conditionOfGoal(goalType);
    if (!condition || condition.kind !== "daily") throw new GiftApiError("GOAL_NOT_OFFERED", "Choose a goal from the menu");
    if (!condition.live && !isOperator(auth.account)) throw new GiftApiError("GOAL_NOT_OFFERED", "Choose a goal from the menu", 404);
    const nameCheck = condition.link.kind === "username" ? condition.link.check : undefined;
    if (duolingoUsername && !(nameCheck ? nameCheck.valid(duolingoUsername) : isValidDuolingoUsername(duolingoUsername))) {
      throw new GiftApiError("INVALID_USERNAME", nameCheck?.refusals.shape ?? "That does not look like a Duolingo username.", 400);
    }
    if (!Number.isInteger(dailyTarget) || dailyTarget < 1) throw new GiftApiError("INVALID_TARGET", "Choose a daily target");
    if (!Number.isInteger(durationDays) || durationDays < 7 || durationDays > 90) throw new GiftApiError("INVALID_DURATION", "Choose between 7 and 90 days");
    let amount: bigint;
    try {
      amount = BigInt(String(body.amount ?? ""));
    } catch {
      throw new GiftApiError("INVALID_AMOUNT", "Enter an amount");
    }
    if (amount < MIN_GIFT_UNITS) throw new GiftApiError("INVALID_AMOUNT", "The gift must be at least $1.00");
    // Until today this route had a floor and no ceiling, so only the contract's one hundred thousand stood above it
    // and the pilot's sentence on the amount step would have been false for a daily gift (mitigation b).
    if (amount > MAX_GIFT_UNITS) throw new GiftApiError("INVALID_AMOUNT", "The gift must be between $1.00 and $1,000.00");
    const refundToRaw = body.refundTo ? String(body.refundTo) : auth.account;
    if (!isAddress(refundToRaw)) throw new GiftApiError("INVALID_REFUND", "The return destination is invalid");
    const salt = String(body.salt ?? "");
    if (!HEX32.test(salt)) throw new GiftApiError("INVALID_SALT", "Please try again");
    const saltSeed = String(body.saltSeed ?? "");
    if (!HEX32.test(saltSeed)) throw new GiftApiError("INVALID_SALT", "Please try again");
    // A gift counted on one course says so in its goal type, and the course is part of what the salt commits to, so
    // it is read before the terms are rebuilt (U1, D102).
    const course = String(body.course ?? "").trim() || undefined;
    if (course && !isDuolingoCourseId(course)) throw new GiftApiError("INVALID_COURSE", "Choose which course counts.", 400);
    if (course && goalType !== GOAL_TYPE_DUOLINGO_COURSE_XP) throw new GiftApiError("TERMS_MISMATCH", "The signed terms do not match the gift");
    if (!course && goalType === GOAL_TYPE_DUOLINGO_COURSE_XP) throw new GiftApiError("INVALID_COURSE", "Choose which course counts.", 400);
    const a = body.authorization ?? {};
    if (!HEX32.test(String(a.nonce ?? "")) || !HEX32.test(String(a.r ?? "")) || !HEX32.test(String(a.s ?? "")) || (a.v !== 27 && a.v !== 28)) {
      throw new GiftApiError("INVALID_AUTHORIZATION", "The signed authorization is malformed");
    }

    const params: GiftParams = {
      funder: getAddress(auth.account),
      refundTo: getAddress(refundToRaw),
      recipientContactHash: contact ? contactHash(contact) : NO_CONTACT_HASH,
      goalType,
      dailyTarget,
      durationDays,
      amount,
      salt: salt as Hex,
    };
    if (String(a.nonce).toLowerCase() !== fundingNonce(params).toLowerCase()) {
      throw new GiftApiError("TERMS_MISMATCH", "The signed terms do not match the gift");
    }
    // The salt is the account and the course (D102): rebuilt here from what this request says they are, and the
    // creation is refused when the two differ, so the signature cannot be for one account and the gift for another.
    if (giftSalt({ account: duolingoUsername, course, seed: saltSeed as Hex }).toLowerCase() !== salt.toLowerCase()) {
      throw new GiftApiError("TERMS_MISMATCH", "The signed terms do not match the gift");
    }

    // The course is read back from the profile before the money moves: a course nobody is learning counts no day.
    let courseTitle: string | undefined;
    if (duolingoUsername) {
      let profile: Awaited<ReturnType<typeof resolvePublicDuolingoProfile>>;
      try {
        profile = await resolvePublicDuolingoProfile(duolingoUsername);
      } catch (error) {
        if (error instanceof DuolingoProfileError && error.code === "NO_SUCH_PROFILE") {
          throw new GiftApiError("NO_SUCH_PROFILE", "No public Duolingo profile goes by that name. Nothing was taken.", 400);
        }
        throw new GiftApiError("SOURCE_UNAVAILABLE", "Duolingo is not answering, so the gift was not made and nothing was taken. Try again in a moment.", 503);
      }
      if (course) {
        const found = profile.courses.find((one) => one.id === course);
        if (!found) throw new GiftApiError("NO_SUCH_COURSE", "That profile is not learning that course any more. Choose again. Nothing was taken.", 409);
        courseTitle = found.title;
      }
    } else if (course) {
      // No name to read: the course is the recipient's to prove, so nothing here can say it exists yet.
      throw new GiftApiError("INVALID_COURSE", "Give their Duolingo name to choose a course.", 400);
    }

    // Recorded before the money moves, relayed, then recorded as a gift (D87): a failure between the relay and the
    // record leaves a pending creation that a retry of these terms, or the keeper's pass, completes.
    const created = await makeGift(
      {
        params,
        nonce: String(a.nonce) as Hex,
        authorization: {
          validAfter: BigInt(String(a.validAfter ?? "0")),
          validBefore: BigInt(String(a.validBefore ?? "0")),
          nonce: String(a.nonce) as Hex,
          v: Number(a.v),
          r: String(a.r) as Hex,
          s: String(a.s) as Hex,
        },
        goalUsername: duolingoUsername,
        goalCourse: course,
        goalCourseTitle: courseTitle,
        recipientName,
        funderName,
      },
      liveCreationDeps(),
    );
    const claimToken = created.claimToken;

    const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
    return NextResponse.json(
      { giftId: created.giftId, claimUrl: `${origin}/g/${created.giftId}?t=${claimToken}`, funded: true },
      { headers: NO_STORE },
    );
  } catch (error) {
    return giftErrorResponse(error);
  }
}
