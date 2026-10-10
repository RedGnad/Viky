import { NextResponse } from "next/server";
import { dailyPass, passStopped, SETTLING_PASS } from "@/src/daily-pass";
import { NO_STORE } from "@/src/gift-api";
import { payoutsNotFinishedAlert } from "@/src/mobile-money";
import { payoutsNotFinished } from "@/src/mobile-money-store";
import { followUnsettledOrders, ordersToTell } from "@/src/phone-order";
import { sendAlert } from "@/src/provider-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The settling pass (D35): drain, finalise, and send back what a missed day freed, run after the six-hour
 * reading grace of D30, which is the first moment a missed day may be settled. It never counts, so it can
 * never race the morning reading.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401, headers: NO_STORE });
  }
  try {
    const report = await dailyPass(SETTLING_PASS);
    // The phone and gift card orders whose money came in and did not end, moved on with nobody's screen open: a failure
    // after the money arrived is sent back here at the latest. Its own failure never stops the gifts' pass.
    const phoneOrders = await followUnsettledOrders().catch((error: unknown) => [{ orderId: "all", state: `not followed: ${error instanceof Error ? error.message : String(error)}` }]);
    // What waits for somebody is told, not only answered (the final audit of 9 Oct 2026): an order for an operator, not
    // followed or still owing its money back, and a mobile money payout that has not arrived an hour after its dollars
    // left. One email each, at most, a morning. Neither stops the answer.
    const waiting = ordersToTell(phoneOrders);
    if (waiting) await sendAlert(waiting);
    const unfinished = await payoutsNotFinished()
      .then((payouts) => payoutsNotFinishedAlert(payouts, Date.now()))
      .catch((error: unknown) => {
        console.error(`mobile money payouts not read by the settling pass: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      });
    if (unfinished) await sendAlert(unfinished);
    return NextResponse.json({ ...report, phoneOrders }, { headers: NO_STORE });
  } catch (error) {
    // A pass that stops is told, not only answered: nobody reads the scheduler's answers (the final audit of 9 Oct 2026).
    await passStopped("settling", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The settling pass failed" }, { status: 500, headers: NO_STORE });
  }
}
