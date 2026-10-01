import { NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { readHealth, type Health } from "@/src/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Whether Viky is standing (src/health.ts), for a monitor outside it: 200 when every check holds, 503 when one does
 * not. Public and without a secret, so it answers nothing a stranger should not read: no gift, no account of a person,
 * no reason beyond a fixed word.
 *
 * One answer is kept for half a minute in the instance that made it. A monitor asks once a minute at most; anybody
 * asking faster reads the same answer again and reaches neither the database nor the network.
 */

const KEPT_MS = 30_000;
let kept: { at: number; health: Health } | undefined;

export async function GET() {
  const now = Date.now();
  if (!kept || now - kept.at >= KEPT_MS) kept = { at: now, health: await readHealth() };
  return NextResponse.json(kept.health, { status: kept.health.ok ? 200 : 503, headers: NO_STORE });
}
