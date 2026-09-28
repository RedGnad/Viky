import type { CSSProperties } from "react";
import { Character, type CharacterState } from "./Character";

/**
 * The day characters around the top of the landing on a screen wider than the column (the founder, 28 Sep 2026; the
 * reference was Ramp's landing, whose top is dressed at its sides once the window leaves room beside the content).
 *
 * What was chosen, one word at a time: direction A, scattered; "too symmetrical", so each side its own; "still too
 * little random", so irregular gaps, sizes and tilts; no shadow; nothing left facing the card where the way to it
 * stops; no pill, which the card's own row already shows; only colours already on the screen, as Ramp adds none, so
 * the hero's own edge (cream and gold by day, violet by night, direction C); never smaller than their size; and "much
 * more of the screen when it is wide, reorganising as it narrows".
 *
 * Then "a little bigger", and "not squeezed as the window changes: they slide out and leave one by one, rather than
 * pop". So the crowd is a scene wider than any window, held at fixed distances from the column: a wide window shows it
 * all, and as the window narrows its edge moves in over the scene, the farthest characters cut by the edge and then
 * gone, the nearest last. Nothing is resized, pushed together, or faded. They drift a little with the scroll, each at
 * its own depth, where the browser follows a scroll itself; nothing moves on a clock, and nothing under reduced motion.
 */

/** The landing's column on a large screen: the headline on one line (`.home-column`, fit-content from 1024). */
export const LANDING_COLUMN = 903;
/** The least room kept between a character and the column. */
export const CLEAR_OF_COLUMN = 24;
/** From this width of window the crowd's layer exists; under it the column fills the screen. */
export const CROWD_FROM = 1024;

type Spot = Readonly<{
  side: "left" | "right";
  /** Its distance from the column, from the column's edge to the character's near edge, in pixels. */
  away: number;
  /** How far down the band beside the first screen, from 0 (its top) to 1 (its foot, the character's whole size in). */
  height: number;
  size: number;
  tilt: number;
  /** How much it drifts with the scroll, 0 to 1. */
  depth: number;
  state: CharacterState;
  variant: number;
}>;

/**
 * Where the band starts and stops, from the top of the page. It starts under the header; it stops where the way to the
 * card leaves the top of the screen (app/kit/WayToTheCard.ts stops just past the character's hands, which is the first
 * screen's foot less 182 pixels at every height measured, 800, 900 and 1080), so nothing is left in view facing the
 * card.
 */
export const BAND = { top: 96, aboveFoldEnd: 182 } as const;

/**
 * Scattered by hand over a scene up to 830 pixels beside the column, all of which a 2560 window shows: irregular
 * distances, heights, sizes and tilts, no spot the other side's mirror, circles and triangles only.
 */
export const SPOTS: readonly Spot[] = [
  { side: "left", away: 470, height: 0.03, size: 80, tilt: -14, depth: 0.55, state: "earned", variant: 0 },
  { side: "left", away: 700, height: 0.42, size: 96, tilt: -6, depth: 0.8, state: "earned", variant: 2 },
  { side: "left", away: 260, height: 0.61, size: 64, tilt: 22, depth: 0.4, state: "catchable", variant: 3 },
  { side: "left", away: 560, height: 0.97, size: 60, tilt: -18, depth: 0.6, state: "earned", variant: 1 },
  { side: "left", away: 150, height: 0.2, size: 52, tilt: 18, depth: 0.25, state: "today", variant: 1 },
  { side: "left", away: 90, height: 0.86, size: 46, tilt: 8, depth: 0.2, state: "today", variant: 2 },
  { side: "left", away: 40, height: 0.47, size: 54, tilt: -12, depth: 0.3, state: "earned", variant: 3 },
  { side: "left", away: 380, height: 0.3, size: 42, tilt: 10, depth: 0.2, state: "today", variant: 0 },
  { side: "left", away: 60, height: 0.07, size: 70, tilt: 4, depth: 0.5, state: "catchable", variant: 2 },
  { side: "right", away: 200, height: 0, size: 56, tilt: 16, depth: 0.3, state: "catchable", variant: 3 },
  { side: "right", away: 600, height: 0.14, size: 94, tilt: -10, depth: 0.7, state: "earned", variant: 2 },
  { side: "right", away: 420, height: 0.52, size: 108, tilt: 6, depth: 0.85, state: "earned", variant: 1 },
  { side: "right", away: 750, height: 0.81, size: 72, tilt: 14, depth: 0.5, state: "today", variant: 3 },
  { side: "right", away: 70, height: 0.36, size: 46, tilt: -20, depth: 0.2, state: "today", variant: 0 },
  { side: "right", away: 150, height: 0.94, size: 62, tilt: -8, depth: 0.35, state: "catchable", variant: 0 },
  { side: "right", away: 40, height: 0.67, size: 52, tilt: 12, depth: 0.25, state: "earned", variant: 1 },
  { side: "right", away: 320, height: 0.24, size: 44, tilt: -6, depth: 0.2, state: "today", variant: 2 },
  { side: "right", away: 580, height: 0.72, size: 60, tilt: 20, depth: 0.45, state: "catchable", variant: 1 },
];

/** The room beside the column on each side, as the layer (the window's width) reads it. */
const ROOM = `max(0px, (100% - ${LANDING_COLUMN}px) / 2)`;

/** A spot's distance from the window's edge: the room less its distance from the column and its size, negative once the edge has passed it. */
export function offsetOf(spot: Pick<Spot, "away" | "size">): string {
  return `calc(${ROOM} - ${spot.away + spot.size}px)`;
}

/** The same in numbers, for a window of a given size: where the stylesheet draws it, and how much of it is inside. */
export function placedAt(spot: Spot, windowWidth: number, windowHeight: number): Readonly<{ left: number; top: number; size: number; inside: number }> {
  const room = Math.max(0, (windowWidth - LANDING_COLUMN) / 2);
  const offset = room - spot.away - spot.size;
  const left = spot.side === "left" ? offset : windowWidth - offset - spot.size;
  const top = BAND.top + (windowHeight - BAND.aboveFoldEnd - BAND.top - spot.size) * spot.height;
  const inside = Math.max(0, Math.min(spot.size, spot.size + offset)) / spot.size;
  return { left, top, size: spot.size, inside };
}

/** A spot's top: its share of the band left once its own size is in, so its foot never passes the band's end. */
export function topOf(spot: Pick<Spot, "height" | "size">): string {
  return `calc(${BAND.top}px + (100svh - ${BAND.aboveFoldEnd + BAND.top + spot.size}px) * ${spot.height})`;
}

export function SideCrowd() {
  return (
    <div aria-hidden className="side-crowd">
      {SPOTS.map((spot, index) => (
        <div
          key={index}
          data-spot={index}
          style={
            {
              top: topOf(spot),
              width: spot.size,
              [spot.side]: offsetOf(spot),
              "--tilt": `${spot.tilt}deg`,
              "--depth": spot.depth,
            } as CSSProperties
          }
        >
          {/* No floor under it, so no shadow: they float beside the words. */}
          <Character state={spot.state} size="large" variant={spot.variant} standing={false} />
        </div>
      ))}
    </div>
  );
}
