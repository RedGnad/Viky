import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { wcaResultInWords } from "@/src/wca";
import { wcaCourseOfGift } from "@/src/wca-gift";
import { readWcaResult, WcaReadError } from "@/src/wca-reading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The person's result in the WCA's results, read plainly, so the screen can say why before any money moves. */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("verify", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ giftId?: unknown }>(request, 1_024);
    const { courseId, eventId, who } = await wcaCourseOfGift(String(body.giftId ?? ""), auth.account);
    try {
      const result = await readWcaResult(courseId, who);
      return NextResponse.json({ name: result.name, wcaId: result.wcaId, best: result.best, average: result.average, round: result.round, inWords: wcaResultInWords(result.best, eventId) }, { headers: NO_STORE });
    } catch (error) {
      if (error instanceof WcaReadError) {
        const status = error.code === "FETCH_FAILED" ? 502 : error.code === "NOT_FINISHED" ? 409 : 404;
        return NextResponse.json({ code: error.code, error: error.message }, { status, headers: NO_STORE });
      }
      throw new GiftApiError("SOURCE_UNAVAILABLE", "The result could not be read right now", 503);
    }
  } catch (error) {
    return giftErrorResponse(error);
  }
}
