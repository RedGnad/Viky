import { NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { competitionStillOpen, WCA_EVENTS } from "@/src/wca";
import { listWcaCompetitions, type WcaCompetition } from "@/src/wca-reading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The WCA's list, read at most once an hour: six pages of a hundred on 26 Sep 2026. */
let cached: { at: number; competitions: readonly WcaCompetition[] } | null = null;
const CACHE_MS = 60 * 60 * 1_000;

/**
 * The coming competitions a gift can be made on (the founder, 27 Sep 2026): the WCA's own list from today, all
 * countries, the ones not yet started, each with its events. Public, nothing about anybody.
 */
export async function GET() {
  const now = Date.now();
  if (!cached || now - cached.at > CACHE_MS) {
    try {
      cached = { at: now, competitions: await listWcaCompetitions(new Date(now).toISOString().slice(0, 10)) };
    } catch (error) {
      if (!cached) return NextResponse.json({ error: error instanceof Error ? error.message : "The WCA could not be read" }, { status: 503, headers: NO_STORE });
    }
  }
  const competitions = cached.competitions
    .filter((one) => competitionStillOpen(one.startDate, now))
    .map((one) => ({
      competitionId: one.competitionId,
      name: one.name,
      city: one.city,
      country: one.country,
      startsAt: `${one.startDate}T00:00:00Z`,
      endDate: one.endDate,
      events: one.eventIds.map((id) => ({ id, label: WCA_EVENTS[id] })),
    }));
  return NextResponse.json({ competitions }, { headers: NO_STORE });
}
