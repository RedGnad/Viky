import { NextResponse } from "next/server";
import { CODEFORCES_CLIMB } from "@/src/climbs";
import { CodeforcesReadError, readCodeforcesStanding } from "@/src/codeforces-reading";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where a Codeforces user stands today, read plainly, before any money moves (the chess standing's twin, D45): the
 * handle as Codeforces spells it, the rating, the best ever, and when it was read. A handle nobody has is refused
 * with the site's own answer; an account with no rated round yet has no rating to build a gift on.
 */
export async function GET(request: Request) {
  try {
    const rate = checkRateLimit("status", request);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again in a few minutes.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    }
    const params = new URL(request.url).searchParams;
    const username = params.get("username")?.trim() ?? "";
    const mode = params.get("mode") ?? CODEFORCES_CLIMB;
    if (mode !== CODEFORCES_CLIMB) throw new GiftApiError("INVALID_MODE", "Choose which rating.", 400);
    try {
      const standing = await readCodeforcesStanding(username);
      if (standing.rating === null) throw new GiftApiError("NO_RATING", "No rating yet.", 404);
      return NextResponse.json(
        { username: standing.username, mode, rating: standing.rating, rd: null, best: standing.best, settled: true, readAt: new Date().toISOString() },
        { headers: NO_STORE },
      );
    } catch (error) {
      if (error instanceof CodeforcesReadError && error.code === "PROFILE_NOT_FOUND") throw new GiftApiError("NO_SUCH_PROFILE", "No Codeforces user goes by that handle.", 404);
      if (error instanceof CodeforcesReadError && error.code === "INVALID_USERNAME") throw new GiftApiError("INVALID_USERNAME", "That is not a Codeforces handle.", 400);
      if (error instanceof CodeforcesReadError) throw new GiftApiError("SOURCE_UNAVAILABLE", "Codeforces is not answering. Try again in a moment.", 503);
      throw error;
    }
  } catch (error) {
    return giftErrorResponse(error);
  }
}
