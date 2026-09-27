import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { proveCertificate } from "@/src/certificate-reading";
import { NO_STORE } from "@/src/gift-api";
import { loadGift } from "@/src/gift-store";
import { loadMilestoneGift } from "@/src/milestone-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";

/** The goals whose account is built from the gift's record by their own route, and never taken from this one's link. */
const READ_FROM_ITS_OWN_RECORD = new Set(["marathon-finish", "wca-time"]);
export const dynamic = "force-dynamic";

/**
 * The recipient's own certificate, turned into money (U3, C3).
 *
 * Only the person the gift is for may call it: the certificate is theirs to share, and a gift is settled into their
 * account alone. Every answer is the typed outcome of `proveCertificate`, so the page says why in their own words
 * rather than showing a refusal from a contract.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const rate = checkRateLimit("relay", request);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
  const { id } = await context.params;
  if (!/^\d{1,78}$/.test(id)) return NextResponse.json({ error: "UNKNOWN_GIFT" }, { status: 404, headers: NO_STORE });

  let account: string;
  try {
    account = readAccountAuthSession(request).account.toLowerCase();
  } catch {
    return NextResponse.json({ error: "SIGN_IN_REQUIRED" }, { status: 401, headers: NO_STORE });
  }

  let body: { link?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: NO_STORE });
  }
  const link = typeof body.link === "string" && body.link.length <= 512 ? body.link : "";
  if (!link) return NextResponse.json({ kind: "refused", giftId: id, code: "INVALID_LINK", message: "That is not a certificate link" }, { headers: NO_STORE });

  const record = await loadGift(id);
  if (!record) return NextResponse.json({ error: "UNKNOWN_GIFT" }, { status: 404, headers: NO_STORE });
  if (record.recipient?.toLowerCase() !== account) return NextResponse.json({ error: "NOT_YOURS" }, { status: 403, headers: NO_STORE });
  // A marathon or a WCA time is read from the account the gift's own record builds (/api/marathon/prove,
  // /api/wca/prove), never from a link the browser sends: the bib bound before the start is what ties it to the race.
  const milestone = await loadMilestoneGift(id);
  if (milestone && READ_FROM_ITS_OWN_RECORD.has(milestone.conditionId)) {
    return NextResponse.json({ kind: "refused", giftId: id, code: "READ_FROM_ITS_RECORD", message: "This result is read from the race the gift names, not from a link." }, { status: 409, headers: NO_STORE });
  }

  try {
    return NextResponse.json(await proveCertificate({ giftId: id, link }), { headers: NO_STORE });
  } catch (error) {
    // A relay that failed is ours, and it is said as such: nothing about the certificate was wrong.
    console.error(`certificate proof failed for gift ${id}: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ kind: "refused", giftId: id, code: "SOURCE_UNAVAILABLE", message: "That did not go through, and nothing was changed. Try again." }, { status: 502, headers: NO_STORE });
  }
}
