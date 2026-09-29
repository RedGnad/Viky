"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/src/client/api";
import type { MilestoneOutcome } from "@/src/client/milestone";
import { GIFT_LIVE } from "@/src/sentences";

/**
 * A climb read live while its page is open (the founder, 29 Sep 2026): the source is read again every minute while the
 * page is in front, one reading at a time, since a source may serve readings in series without limit and refuse them
 * in parallel (the published API notes of the first one). A tab put behind stops; brought back, it reads again at once if a minute has
 * passed, or when the minute is up. The reading is the counting route's own, within its rate limit: a plain look, and a
 * proof only at or past the target.
 *
 * One line says where it stands: "Checking" and the source while a reading runs, "Checked just now", then "Checked 12 s ago"
 * as the seconds pass, and a failure in the same place.
 */

export const LIVE_READING_EVERY_MS = 60_000;

const L = GIFT_LIVE.climbing;

export type LiveState = Readonly<{ phase: "checking" }> | Readonly<{ phase: "checked"; atMs: number }> | Readonly<{ phase: "failed"; text: string }>;

export function useLiveReading(active: boolean, read: () => Promise<MilestoneOutcome>, onOutcome: (outcome: MilestoneOutcome) => void): LiveState {
  const [state, setState] = useState<LiveState>({ phase: "checking" });
  // The latest of both, so the loop is started once per page and never restarted by a render.
  const reader = useRef({ read, onOutcome });
  useEffect(() => {
    reader.current = { read, onOutcome };
  });

  useEffect(() => {
    if (!active) return;
    let live = true;
    let busy = false;
    let lastAtMs = 0;
    let timer: number | undefined;
    const schedule = (waitMs: number) => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), waitMs);
    };
    const tick = async () => {
      timer = undefined;
      if (!live || busy || document.hidden) return;
      busy = true;
      setState({ phase: "checking" });
      try {
        const outcome = await reader.current.read();
        if (!live) return;
        lastAtMs = Date.now();
        setState(outcome.kind === "refused" ? { phase: "failed", text: outcome.message } : { phase: "checked", atMs: lastAtMs });
        reader.current.onOutcome(outcome);
      } catch (error) {
        if (!live) return;
        lastAtMs = Date.now();
        setState({ phase: "failed", text: error instanceof ApiError && error.status === 429 ? L.tooManyChecks : L.checkFailed });
      } finally {
        busy = false;
        if (live && !document.hidden) schedule(LIVE_READING_EVERY_MS);
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timer !== undefined) window.clearTimeout(timer);
        timer = undefined;
      } else if (!busy) schedule(Math.max(0, lastAtMs + LIVE_READING_EVERY_MS - Date.now()));
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule(0);
    return () => {
      live = false;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active]);

  return state;
}

/** "Checked 12 s ago", in words, from how long ago the last reading answered. */
export function checkedAgo(seconds: number): string {
  if (seconds < 5) return L.checkedJustNow;
  if (seconds < 60) return L.checkedSecondsAgo(seconds);
  return L.checkedMinutesAgo(Math.floor(seconds / 60));
}

/** The one line: checking, checked some seconds ago and counting, or what went wrong. */
export function LiveLine({ state, source }: Readonly<{ state: LiveState; source: string }>) {
  const [nowMs, setNowMs] = useState(0);
  const checkedAt = state.phase === "checked" ? state.atMs : null;
  useEffect(() => {
    if (checkedAt === null) return;
    const clock = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(clock);
  }, [checkedAt]);
  if (state.phase === "checking") return <>{L.checking(source)}</>;
  if (state.phase === "failed") return <>{state.text}</>;
  return <>{checkedAgo(Math.max(0, Math.floor(((nowMs || state.atMs) - state.atMs) / 1_000)))}</>;
}
