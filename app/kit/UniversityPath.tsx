"use client";
import { useLayoutEffect, useRef } from "react";
import { MOTION } from "@/src/design-tokens";
import { drawnStops, standingOn, stopsOf, type PathOf, type PathStanding } from "@/src/university-path";
import { HELP, META } from "../components/ui";
import { HadOrNot } from "./HadOrNot";
import { reduced } from "./Motion";

/**
 * The path of a university gift (the founder's mockup of 11 Oct 2026, src/university-path.ts): two to four stops in a
 * row, the labels in the card's small capitals, the times in its small type, and the gift's character over the stop
 * the gift is at. It is drawn the same in its three places: under the university a payer chose, where nothing has
 * started and no character stands; on the gift's card, for the payer and for the student, where the character stood
 * alone (HadOrNot); and on the judges page, the long path beside the short one.
 *
 * Passed stops and the way to the one stood on are in ink, the stop stood on carries the sun, the rest is pale. The
 * two stops that happen once for a university are drawn small, and the way out of the first is dashed.
 *
 * No movement of its own (the founder: "none new"). The character is the card's, with its own waking and its own leap
 * into the ball at the last stop; and when a stop is passed while the page stands it makes the hop of a day earned,
 * from the stop it stood on to the next, by that movement's own heights and times.
 */
export function UniversityPath({
  provider,
  results,
  waitedOnSetUp = false,
  readByAPerson = false,
  yours,
  standing = null,
  setUpBy = null,
  label,
}: PathOf &
  Readonly<{
  /** Whether the reader is the person the gift is for: the last stop is "Yours" to them and "Theirs" to anybody else. */
  yours: boolean;
  /** Where the gift stands. Nothing under a chosen university and on the judges page: no character, every stop to come. */
  standing?: PathStanding | null;
  /** The day the setting up is done by, in words, while that day has not passed. */
  setUpBy?: string | null;
  /** What the drawing is, for a reader who does not see it. */
  label: string;
}>) {
  const stops = stopsOf({ provider, results, waitedOnSetUp, readByAPerson });
  const at = standing ? standingOn(stops, standing) : null;
  const drawn = drawnStops(stops, at, { yours, setUpBy });
  const here = drawn.findIndex((stop) => stop.state === "now");
  const seat = useRef<HTMLSpanElement>(null);
  const stoodAt = useRef(here);
  // Before the browser paints the character over its new stop, so the stop it left is the hop's first image.
  useLayoutEffect(() => {
    const element = seat.current;
    const from = stoodAt.current;
    stoodAt.current = here;
    // Only a stop passed while the page stands, and never the last one, which has the leap into the ball for itself.
    if (!element || from < 0 || here <= from || here === drawn.length - 1 || reduced()) return;
    // One stop is one column wide, and the hop rises by the share of the character's height a day earned rises by.
    const step = element.parentElement?.getBoundingClientRect().width ?? 0;
    const back = `${-(here - from) * step}px`;
    const up = `${-MOTION.earned.riseBy * element.getBoundingClientRect().height}px`;
    const running = element.animate(
      [
        { transform: `translate(${back}, 0)`, easing: "ease-out" },
        { transform: `translate(calc(${back} / 2), ${up})`, easing: "ease-in" },
        { transform: "translate(0, 0)" },
      ],
      { duration: MOTION.earned.riseMs + MOTION.earned.fallMs },
    );
    return () => running.cancel();
  }, [here, drawn.length]);
  return (
    <ol className={`university-path${standing ? "" : " university-path-flat"}`} aria-label={label} style={{ gridTemplateColumns: `repeat(${drawn.length}, minmax(0, 1fr))` }}>
      {standing && here >= 0 ? (
        <li aria-hidden className="university-path-seat" style={{ gridColumn: here + 1 }}>
          <span ref={seat} className="university-path-character">
            <HadOrNot state={standing.reached ? "reached" : "waiting"} asleep={!standing.opened} />
          </span>
        </li>
      ) : null}
      {drawn.map((stop, index) => (
        <li key={stop.id} className="university-stop" data-state={stop.state} data-once={stop.once ? "" : undefined} data-lead={stop.lead ? "" : undefined} data-after-lead={drawn[index - 1]?.lead ? "" : undefined} data-first={index === 0 ? "" : undefined} data-last={index === drawn.length - 1 ? "" : undefined} style={{ gridColumn: index + 1 }}>
          <span aria-hidden className="university-dot" />
          <span className={`${META} university-stop-label`}>{stop.label}</span>
          <span className={`${HELP} university-stop-time`}>{stop.time ?? ""}</span>
        </li>
      ))}
    </ol>
  );
}
