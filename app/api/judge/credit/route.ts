import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/src/api-guard";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { giveJudgeCredit, isJudgeCredited, judgeCreditOpen } from "@/src/judge-credit";
import { untouchedJudgeCredit } from "@/src/judge-credit-untouched";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { admitJudgeTry } from "@/src/relay-admission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The judge credit (D291): the signed-in account, never one the browser names, and the code the judge typed. The
 * answer is the amount sent and its hash (null when only the token showed it went out), or a typed refusal.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("verify", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = (await request.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.slice(0, 200) : "";
    // Ten tries a day from one connection, whatever the account: a wrong code is counted as a right one is.
    await admitJudgeTry(request);
    return NextResponse.json(await giveJudgeCredit({ account: auth.account, code }), { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}

/**
 * Whether a code can be used now, whether the signed-in account already received its judge credit (D295, D297), and
 * that credit's units while nothing has left the account since (`untouchedJudgeCredit`): the pay sheet draws its line
 * from this and the balance, never from `credited`. Read from the journal, never from the browser; without a session
 * nobody is a judge yet.
 */
export async function GET(request: Request) {
  const open = judgeCreditOpen();
  let account: string;
  try {
    account = readAccountAuthSession(request).account;
  } catch {
    return NextResponse.json({ open, credited: false }, { headers: NO_STORE });
  }
  try {
    const credited = await isJudgeCredited(account);
    const untouched = credited ? await untouchedJudgeCredit(account) : null;
    return NextResponse.json({ open, credited, untouchedCredit: untouched === null ? null : untouched.toString() }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
