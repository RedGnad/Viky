import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { NO_STORE } from "@/src/gift-api";
import { phoneErrorResponse } from "@/src/phone-api";
import { phoneOperators } from "@/src/phone-order";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The phone companies that serve a number (D238): signed in, rate limited, and the number is neither kept nor logged. */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("verify", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ phone?: unknown }>(request, 1_024);
    const operators = await phoneOperators(String(body.phone ?? ""));
    return NextResponse.json({ operators }, { headers: NO_STORE });
  } catch (error) {
    return phoneErrorResponse(error);
  }
}
