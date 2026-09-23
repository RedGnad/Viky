import { NextResponse } from "next/server";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { dayStartIso, GithubReadError, readGithub } from "@/src/github-contributions";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether a GitHub account goes by this name, asked on the funder's step before any money moves (D166), the way the
 * Duolingo name is. It asks GitHub's API the same question the keeper asks each morning, about today alone, and
 * answers the login as GitHub spells it, so the check screen shows the spelling that will be read. Nothing else of
 * the answer is kept or sent.
 */
export async function GET(request: Request) {
  try {
    const rate = checkRateLimit("status", request);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again in a few minutes.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    }
    const username = new URL(request.url).searchParams.get("username")?.trim() ?? "";
    try {
      const now = Date.now();
      const { user } = await readGithub(username, { from: dayStartIso(now), to: new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z") });
      return NextResponse.json({ username: user.login }, { headers: NO_STORE });
    } catch (error) {
      if (!(error instanceof GithubReadError)) throw error;
      if (error.code === "INVALID_USERNAME") throw new GiftApiError("INVALID_USERNAME", "That does not look like a GitHub name.", 400);
      if (error.code === "NO_SUCH_USER") throw new GiftApiError("NO_SUCH_PROFILE", "No GitHub account goes by that name.", 404);
      throw new GiftApiError("SOURCE_UNAVAILABLE", "GitHub is not answering. Try again in a moment.", 503);
    }
  } catch (error) {
    return giftErrorResponse(error);
  }
}
