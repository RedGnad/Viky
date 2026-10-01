import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { proveCertificate } from "@/src/certificate-reading";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { tellReached } from "@/src/morning-send-live";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { wcaCourseOfGift } from "@/src/wca-gift";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The person's result, turned into money: what the service reads is built from the gift's own competition and event
 * and the person as they checked themselves, never from anything the browser sends; the outcome is `proveCertificate`'s.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ giftId?: unknown }>(request, 1_024);
    const { giftId, courseId, who } = await wcaCourseOfGift(String(body.giftId ?? ""), auth.account);
    try {
      const outcome = await proveCertificate({ giftId, link: `${courseId}|${who}` });
      if (outcome.kind === "reached") await tellReached(giftId);
      return NextResponse.json(outcome, { headers: NO_STORE });
    } catch (error) {
      console.error(`wca proof failed for gift ${giftId}: ${error instanceof Error ? error.message : String(error)}`);
      return NextResponse.json({ kind: "refused", giftId, code: "SOURCE_UNAVAILABLE", message: "That did not go through, and nothing was changed. Try again." }, { status: 502, headers: NO_STORE });
    }
  } catch (error) {
    return giftErrorResponse(error);
  }
}
