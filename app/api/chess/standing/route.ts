import { NextResponse } from "next/server";
import { isChessMode } from "@/src/chess-com";
import { ChessReadError, readChessStanding } from "@/src/chess-reading";
import { CHESS_MILESTONE } from "@/src/milestone-conditions";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where a Chess.com player stands today in one cadence, read plainly, before any money moves (D45). The funder types
 * the name on the step that describes the gift, before any account exists, so this needs no sign-in, and it reads the
 * same public pages the keeper reads. It answers the name as Chess.com spells it, the player's rating in that cadence,
 * and when it was read: that reading is what the funder's ceiling is built on and what the screen shows them. It also
 * answers the rating's RD and whether that has settled (D89): the screen refuses a cadence that has not, and the create
 * route refuses it again before anything is relayed.
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
    if (!isChessMode(mode)) throw new GiftApiError("INVALID_MODE", "Choose which rating.", 400);
    try {
      const standing = await readChessStanding(username, mode);
      if (standing.rating === null) throw new GiftApiError("NO_RATING", "No rating in that cadence yet.", 404);
      return NextResponse.json(
        { username: standing.username, mode, rating: standing.rating, rd: standing.rd, settled: CHESS_MILESTONE.settled(standing.rd), readAt: new Date().toISOString() },
        { headers: NO_STORE },
      );
    } catch (error) {
      if (!(error instanceof ChessReadError)) throw error;
      if (error.code === "INVALID_USERNAME") throw new GiftApiError("INVALID_USERNAME", "That does not look like a Chess.com name.", 400);
      if (error.code === "PROFILE_NOT_FOUND") throw new GiftApiError("NO_SUCH_PROFILE", "No Chess.com player goes by that name.", 404);
      throw new GiftApiError("SOURCE_UNAVAILABLE", "Chess.com is not answering. Try again in a moment.", 503);
    }
  } catch (error) {
    return giftErrorResponse(error);
  }
}
