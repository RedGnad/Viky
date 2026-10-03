import type { ConditionNature } from "./conditions";
import type { Reserve } from "./sentences";

/**
 * Which of the month's two reserves a condition draws on (src/attested-calls.ts). Browser safe.
 *
 * A condition Viky reads by itself, from a public page or with a key the person connected, takes an attested reading.
 * A condition proved by a document the person shows takes one of the proofs of people. When one reserve is used up,
 * the gifts on the other are not touched.
 */
export function reserveOf(nature: ConditionNature): Reserve {
  return nature === "shown" ? "proofs" : "readings";
}

/** What a screen is told of the two reserves: which are used up, and the day they start again ("23 Oct"). */
export type Reserves = Readonly<{ readings: boolean; proofs: boolean; again: string }>;

/** The reserve a condition draws on, when it is used up, or nothing: what makes the condition say so before a gift is paid for. */
export function emptyReserveOf(nature: ConditionNature | undefined, reserves: Reserves | null | undefined): Reserve | null {
  if (!nature || !reserves) return null;
  const reserve = reserveOf(nature);
  return reserves[reserve] ? reserve : null;
}
