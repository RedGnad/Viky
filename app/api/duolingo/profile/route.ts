import { NextResponse } from "next/server";
import { DuolingoProfileError, resolvePublicDuolingoProfile } from "@/src/duolingo-profile";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether a public Duolingo profile goes by this name, asked before any money moves (decision 10 of the drawn flows,
 * 17 Sep 2026). The funder types the name on the step that describes what the gift is for, before any account exists,
 * so this needs no sign-in; it reads the same public endpoint the keeper reads every morning, and nothing else.
 * It answers the name as Duolingo spells it, so the check screen shows the spelling that will be read, and the courses
 * that profile carries, so the funder chooses which one a day is counted on (U1).
 */
export async function GET(request: Request) {
  try {
    const rate = checkRateLimit("status", request);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again in a few minutes.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    }
    const username = new URL(request.url).searchParams.get("username")?.trim() ?? "";
    try {
      const profile = await resolvePublicDuolingoProfile(username);
      return NextResponse.json(
        { username: profile.username, courses: profile.courses, currentCourseId: profile.currentCourseId },
        { headers: NO_STORE },
      );
    } catch (error) {
      if (!(error instanceof DuolingoProfileError)) throw error;
      if (error.code === "INVALID_USERNAME") throw new GiftApiError("INVALID_USERNAME", "That does not look like a Duolingo username.", 400);
      if (error.code === "NO_SUCH_PROFILE") throw new GiftApiError("NO_SUCH_PROFILE", "No public Duolingo profile goes by that name.", 404);
      throw new GiftApiError("SOURCE_UNAVAILABLE", "Duolingo is not answering. Try again in a moment.", 503);
    }
  } catch (error) {
    return giftErrorResponse(error);
  }
}
