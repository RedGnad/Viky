/**
 * The name of a character's drawing in `public/characters.svg` (D206).
 *
 * A character that never moves a part of itself is not written into the page: the page names its drawing, once
 * downloaded and kept for every page after. What makes two drawings different is only what `Character` draws
 * differently: the state, whether it stands on its shadow, the few faces a variant chooses between, and the tone of
 * the gift. Anything else (its size on screen, its box) belongs to the page's own `<svg>`.
 */
import type { CharacterState, CharacterTone } from "./Character";

/** The faces a variant chooses between: the gaze goes three ways, and an earned day's smile has two widths. */
export function faceOf(state: CharacterState, variant: number): number {
  if (state === "earned") return ((variant % 6) + 6) % 6;
  if (state === "toCome" || state === "today" || state === "todayAsleep") return ((variant % 3) + 3) % 3;
  return 0;
}

export function characterKey(state: CharacterState, shadow: boolean, variant: number, tone: CharacterTone): string {
  return `${state}${shadow ? "-standing" : ""}-${faceOf(state, variant)}${state === "gift" && tone !== "range" ? `-${tone}` : ""}`;
}

/** Every drawing the file holds. The diamond is not one: its blend reads the look's colours in its own gradient. */
export const REFERENCED_DRAWINGS: ReadonlyArray<Readonly<{ state: CharacterState; variant: number; tone: CharacterTone }>> = [
  ...[0, 1, 2].flatMap((variant) => [
    { state: "toCome" as const, variant, tone: "range" as const },
    { state: "today" as const, variant, tone: "range" as const },
    { state: "todayAsleep" as const, variant, tone: "range" as const },
  ]),
  ...[0, 1, 2, 3, 4, 5].map((variant) => ({ state: "earned" as const, variant, tone: "range" as const })),
  { state: "catchable", variant: 0, tone: "range" },
  { state: "returned", variant: 0, tone: "range" },
  { state: "gift", variant: 0, tone: "range" },
  { state: "gift", variant: 0, tone: "hero" },
  { state: "gift", variant: 0, tone: "sun" },
];
