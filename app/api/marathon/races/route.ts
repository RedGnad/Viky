import { NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { MARATHON_RACES } from "@/src/marathon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The races a gift can be made on (D273): the register, as the sheet lists it. Public, nothing about anybody. */
export async function GET() {
  const races = MARATHON_RACES.map((race) => ({ raceId: race.raceId, name: race.name, town: race.town, country: race.country, startsAt: race.startsAt, timer: race.timer }));
  return NextResponse.json({ races }, { headers: NO_STORE });
}
