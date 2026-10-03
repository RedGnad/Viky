"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/src/client/api";
import { countNow, lookNow, type PublicOutcome } from "@/src/client/gift";
import { GIFT_LIVE } from "@/src/sentences";
import { LIVE_READING_EVERY_MS } from "./LiveReading";

/**
 * A habit read as its page opens (the founder's mockup of 3 Oct 2026, the day on the third daily contract). Opening
 * the page is the gesture: there is no button.
 *
 * The page looks as it opens, and once a minute while it stays in front, one look at a time. A look costs nothing and
 * shows nothing: most of them find no lesson, and a wheel turning every minute would say something is happening when
 * nothing is. One look may show itself (the founder, 3 Oct 2026): the one taken as the page comes to the front, opened
 * or brought back, which is when a person has just done their lesson and is waiting to see it. It stays silent for a
 * second; past it, the wheel turns beside the state, without a word. The card is drawn before any look is asked and
 * nothing on it waits for one.
 *
 * When a look sees a lesson, the attested reading starts by itself, about ten seconds, and the card says what it is
 * doing; only that reading takes one of the month's proofs. Counted, the page is refreshed and the day plays its own
 * movement. A tab put behind stops looking; brought back, it looks again at once if a minute has passed.
 *
 * What it never does: take a proof without a lesson seen. A look that fails is said, and the page looks again. An
 * answer about the account itself, a profile the source no longer has, is said in the answer's own words.
 */

const L = GIFT_LIVE.climbing;

/** How long the look taken as the page comes to the front stays silent, before the wheel says it is still looking. */
export const LOOK_SILENT_MS = 1_000;

export type DayReadingState =
  /** Looking, or looked and found nothing new: nothing to say. */
  | Readonly<{ phase: "quiet" }>
  /** The look taken as the page came to the front has lasted more than a second: the wheel, and no word. */
  | Readonly<{ phase: "looking" }>
  /** A lesson is in, and the attested reading is under way. */
  | Readonly<{ phase: "certifying" }>
  /**
   * The last look or reading did not go through. `text` is the answer's own sentence when it is about the gift (a
   * refusal of the contract, say), and nothing when the source or the reading service failed, which the page says in
   * its own words: the answer's were written for a press, and nothing is pressed here.
   */
  | Readonly<{ phase: "failed"; text: string | null; tooOften?: boolean }>;

/** The refusals of a look that are not a failure of ours: the lesson is not in, or nothing is open to pay. */
const NOTHING_NEW: ReadonlySet<string> = new Set(["NOT_ENOUGH_PROGRESS", "NOTHING_TO_CREDIT", "NOT_STARTED", "PROGRESS_WENT_BACKWARDS", "NO_AGREEMENT"]);
/** The failures that are ours: the source or the reading service did not answer as it should (src/daily-pass.ts). */
const OURS: ReadonlySet<string> = new Set(["FETCH_FAILED", "PROOF_INVALID", "PROOF_MISMATCH", "NOT_CONFIGURED", "WORKER_OUT_OF_DATE", "READING_FAILED"]);
/** Said in its own place on the card, in the red, once the gift is read again (app/components/GiftPage.tsx). */
const SAID_ELSEWHERE: ReadonlySet<string> = new Set(["LIMIT_REACHED"]);

export function useDayReading(active: boolean, giftId: string, onCounted: () => void): DayReadingState {
  const [state, setState] = useState<DayReadingState>({ phase: "quiet" });
  // The latest of it, so the loop is started once per page and never restarted by a render.
  const counted = useRef(onCounted);
  useEffect(() => {
    counted.current = onCounted;
  });

  useEffect(() => {
    if (!active) return;
    let live = true;
    let busy = false;
    let lastAtMs = 0;
    let timer: number | undefined;
    // The next look is the one of a page that has just come to the front: the only one that may show its wheel.
    let cameToFront = true;
    let slow: number | undefined;
    const stopWaitingToSay = () => {
      if (slow !== undefined) window.clearTimeout(slow);
      slow = undefined;
    };
    const schedule = (waitMs: number) => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), waitMs);
    };
    const said = (outcome: PublicOutcome): DayReadingState => {
      if (outcome.kind !== "refused" || NOTHING_NEW.has(outcome.code) || SAID_ELSEWHERE.has(outcome.code)) return { phase: "quiet" };
      return { phase: "failed", text: OURS.has(outcome.code) ? null : outcome.message };
    };
    const tick = async () => {
      timer = undefined;
      if (!live || busy || document.hidden) return;
      busy = true;
      if (cameToFront) {
        // Silent for a second, then the wheel, and only over a card that was saying nothing: a failure stays said.
        slow = window.setTimeout(() => {
          if (live) setState((before) => (before.phase === "quiet" ? { phase: "looking" } : before));
        }, LOOK_SILENT_MS);
        cameToFront = false;
      }
      try {
        const looked = await lookNow(giftId);
        stopWaitingToSay();
        if (!live) return;
        if (looked.kind !== "seen") {
          setState(said(looked));
          return;
        }
        // A lesson is in: the attested reading, in the open. Whatever it answers, the gift is read again after it.
        setState({ phase: "certifying" });
        const outcome = await countNow(giftId);
        if (!live) return;
        setState(said(outcome));
        counted.current();
      } catch (error) {
        stopWaitingToSay();
        if (!live) return;
        setState({ phase: "failed", text: null, tooOften: error instanceof ApiError && error.status === 429 });
      } finally {
        busy = false;
        lastAtMs = Date.now();
        if (live && !document.hidden) schedule(LIVE_READING_EVERY_MS);
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timer !== undefined) window.clearTimeout(timer);
        timer = undefined;
      } else if (!busy) {
        cameToFront = true;
        schedule(Math.max(0, lastAtMs + LIVE_READING_EVERY_MS - Date.now()));
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule(0);
    return () => {
      live = false;
      if (timer !== undefined) window.clearTimeout(timer);
      stopWaitingToSay();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, giftId]);

  return active ? state : { phase: "quiet" };
}

/** What a failed look or reading says under the figure: the answer's own sentence, or that the source was not read. */
export function dayReadingFailure(state: DayReadingState, source: string): string | null {
  if (state.phase !== "failed") return null;
  if (state.tooOften) return L.tooManyChecks;
  return state.text ?? GIFT_LIVE.asItGoes.notReadNow(source);
}
