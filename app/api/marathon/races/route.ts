import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { isOperator } from "@/src/dev-access";
import { NO_STORE } from "@/src/gift-api";
import { DISTANCE_LABELS, racesOffered } from "@/src/marathon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The races a gift can be made on (D273): the register's coming races, as the sheet lists them, with their distances.
 * A race already run is listed to an operator's account alone (the founder, 27 Sep 2026). Nothing about anybody.
 */
export async function GET(request: Request) {
  let operator = false;
  try {
    operator = isOperator(readAccountAuthSession(request).account);
  } catch {
    operator = false;
  }
  const races = racesOffered(Date.now(), operator).map((race) => ({
    raceId: race.raceId,
    name: race.name,
    town: race.town,
    country: race.country,
    startsAt: race.startsAt,
    timer: race.timer,
    // Each event: its distance, the distance in words, and the name its organiser gives it. The results site's own
    // key for it stays on the server.
    events: race.events.map((one) => ({ distance: one.distance, label: DISTANCE_LABELS[one.distance], named: one.label })),
    ...(race.operatorOnly ? { operatorOnly: true } : {}),
  }));
  return NextResponse.json({ races }, { headers: NO_STORE });
}
