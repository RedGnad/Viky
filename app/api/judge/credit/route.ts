import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { giveJudgeCredit, isJudgeCredited } from "@/src/judge-credit";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The judge credit (D291): the signed-in account, never one the browser names, and the code the judge typed. The
 * answer is the amount sent and its hash, or a typed refusal.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("verify", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = (await request.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.slice(0, 200) : "";
    return NextResponse.json(await giveJudgeCredit({ account: auth.account, code }), { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}

/**
 * Whether the signed-in account received its judge credit (D295), for the pay sheet's one line. Read from the journal,
 * never from the browser; an account without a session is not a judge.
 */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    return NextResponse.json({ credited: await isJudgeCredited(auth.account) }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
