import { NextResponse } from "next/server";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { LICHESS_CADENCES, LichessReadError, readLichessStanding, type LichessCadence } from "@/src/lichess";
import { LICHESS_MILESTONE } from "@/src/milestone-conditions";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where a Lichess player stands today in one cadence, read plainly, before any money moves (D45, D168): the twin of
 * the Chess.com standing route, on the one answer Lichess's API gives about a user. It answers the name as Lichess
 * spells it, the rating in that cadence with its deviation, and whether Lichess itself calls it settled (no question
 * mark). An account Lichess has closed or marked for a violation of its terms is refused here. Lichess publishes no
 * "best ever", so `best` is null, and the screen says nothing of one.
 */
export async function GET(request: Request) {
  try {
    const rate = checkRateLimit("status", request);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again in a few minutes.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    }
    const params = new URL(request.url).searchParams;
    const username = params.get("username")?.trim() ?? "";
    const mode = params.get("mode") ?? "";
    if (!(LICHESS_CADENCES as readonly string[]).includes(mode)) throw new GiftApiError("INVALID_MODE", LICHESS_MILESTONE.words.refusals.noCadence, 400);
    try {
      const standing = await readLichessStanding(username, mode as LichessCadence);
      if (standing.rating === null) throw new GiftApiError("NO_RATING", LICHESS_MILESTONE.words.refusals.noRating(mode), 404);
      return NextResponse.json(
        { username: standing.username, mode, rating: standing.rating, rd: standing.rd, best: null, settled: !standing.provisional, readAt: new Date().toISOString() },
        { headers: NO_STORE },
      );
    } catch (error) {
      if (!(error instanceof LichessReadError)) throw error;
      if (error.code === "INVALID_USERNAME") throw new GiftApiError("INVALID_USERNAME", LICHESS_MILESTONE.words.refusals.nameShape, 400);
      if (error.code === "PROFILE_NOT_FOUND") throw new GiftApiError("NO_SUCH_PROFILE", LICHESS_MILESTONE.words.refusals.notFound, 404);
      if (error.code === "ACCOUNT_CLOSED") throw new GiftApiError("ACCOUNT_CLOSED", LICHESS_MILESTONE.words.refusals.closed, 409);
      throw new GiftApiError("SOURCE_UNAVAILABLE", LICHESS_MILESTONE.words.refusals.unavailable, 503);
    }
  } catch (error) {
    return giftErrorResponse(error);
  }
}
