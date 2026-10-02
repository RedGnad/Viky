import { NextResponse } from "next/server";
import { notePayoutState } from "@/src/mobile-money-store";
import { payoutStateOf, signedBySwitch } from "@/src/switch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Switch's word on a payout (docs.onswitch.xyz/webhook, read 2 Oct 2026): a POST on each change of state, signed with
 * `x-switch-signature`, the HMAC-SHA256 of the raw body under the service key. A body that is not signed so is ignored
 * and changes nothing. A signed one updates the payout it names, if it is one of ours; it is acknowledged at once,
 * since Switch tries again up to three times when it is not.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 64 * 1_024 || !signedBySwitch(raw, request.headers.get("x-switch-signature"))) {
    return NextResponse.json({ received: false }, { status: 401 });
  }
  try {
    const body = JSON.parse(raw) as { data?: { reference?: unknown } };
    const reference = typeof body.data?.reference === "string" ? body.data.reference : "";
    if (/^[0-9a-f-]{36}$/i.test(reference)) await notePayoutState(reference, payoutStateOf(body.data));
  } catch (error) {
    // A signed body that could not be read: said in the logs, and acknowledged, since asking again would bring the same.
    console.error(`mobile money webhook not read: ${error instanceof Error ? error.message : String(error)}`);
  }
  return NextResponse.json({ received: true });
}
