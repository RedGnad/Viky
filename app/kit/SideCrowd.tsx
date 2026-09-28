import type { CSSProperties } from "react";
import { Character, type CharacterState } from "./Character";

/**
 * The day characters around the top of the landing on a screen wider than the column (the founder, 28 Sep 2026,
 * direction A, then "the positions are too symmetrical"; the reference was Ramp's landing, whose top is dressed at
 * its sides once the window leaves room beside the content).
 *
 * Each character is placed from the window's edge by a share of the room beside the column, so a wider window spreads
 * them further out and a narrower one draws them in; one appears only once its side has room for it whole, a little
 * away from the column, so nothing ever touches the words or the card. The two sides are not mirrors: each has its own
 * heights, sizes, shares and tilts. They drift a little with the scroll, each at its own depth, where the browser
 * follows a scroll itself; nothing moves on a clock, and nothing moves under reduced motion.
 */

/** The landing's column on a large screen: the headline on one line (`.home-column`, fit-content from 1024). */
export const LANDING_COLUMN = 903;
/** The least room kept between a character and the column. */
const CLEAR_OF_COLUMN = 24;

type Spot = Readonly<{
  /** Which side, and how far from the window's edge, as a share of the room beside the column. */
  side: "left" | "right";
  share: number;
  /** From the top of the page, in pixels: the first screen only. */
  top: number;
  size: number;
  tilt: number;
  /** How much it drifts with the scroll, 0 to 1. */
  depth: number;
  state: CharacterState;
  variant: number;
}>;

export const SPOTS: readonly Spot[] = [
  { side: "left", share: 0.24, top: 168, size: 74, tilt: -8, depth: 0.6, state: "earned", variant: 0 },
  { side: "left", share: 0.62, top: 318, size: 50, tilt: 7, depth: 0.3, state: "today", variant: 1 },
  { side: "left", share: 0.3, top: 486, size: 90, tilt: -4, depth: 0.8, state: "toCome", variant: 2 },
  { side: "left", share: 0.7, top: 640, size: 46, tilt: 12, depth: 0.25, state: "catchable", variant: 3 },
  { side: "left", share: 0.1, top: 742, size: 58, tilt: 5, depth: 0.5, state: "earned", variant: 1 },
  { side: "right", share: 0.46, top: 124, size: 56, tilt: 10, depth: 0.35, state: "today", variant: 2 },
  { side: "right", share: 0.14, top: 262, size: 86, tilt: -6, depth: 0.75, state: "earned", variant: 3 },
  { side: "right", share: 0.66, top: 438, size: 44, tilt: -12, depth: 0.2, state: "catchable", variant: 0 },
  { side: "right", share: 0.26, top: 590, size: 68, tilt: 3, depth: 0.55, state: "toCome", variant: 1 },
  { side: "right", share: 0.52, top: 716, size: 52, tilt: -3, depth: 0.4, state: "earned", variant: 2 },
];

/** The narrowest window where a spot has its whole size, and the room it keeps from the column, on its side. */
export function shownFrom(spot: Pick<Spot, "share" | "size">): number {
  // room * share + size + clear <= room, with room = (window - column) / 2.
  return Math.ceil(LANDING_COLUMN + (2 * (spot.size + CLEAR_OF_COLUMN)) / (1 - spot.share));
}

export function SideCrowd() {
  const rules = SPOTS.map((spot, index) => `@media (min-width: ${shownFrom(spot)}px){.side-crowd>[data-spot="${index}"]{display:block}}`).join("");
  return (
    <div aria-hidden className="side-crowd">
      <style>{rules}</style>
      {SPOTS.map((spot, index) => (
        <div
          key={index}
          data-spot={index}
          style={
            {
              top: spot.top,
              width: spot.size,
              [spot.side]: `calc(max(0px, (100% - ${LANDING_COLUMN}px) / 2) * ${spot.share})`,
              "--tilt": `${spot.tilt}deg`,
              "--depth": spot.depth,
            } as CSSProperties
          }
        >
          <Character state={spot.state} size="large" variant={spot.variant} />
        </div>
      ))}
    </div>
  );
}
