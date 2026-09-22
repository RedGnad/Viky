import { CONDITION_NATURE } from "@/src/sentences";
import type { ConditionNature } from "@/src/conditions";
import { META } from "../components/ui";

/**
 * The nature of a condition, said once, in the meta voice (D162, the founder's direction 1 corrected): DM Sans at
 * 13 px, capitals, a pixel of tracking, the muted ink of whatever it stands on and no fill, before the line of help.
 * On the paper `--muted` is the paper's own soft ink (app/globals.css, `.on-paper`), on the ground the ground's, so
 * one colour token does both. Two words exactly, READ FOR YOU or SHOWN BY THEM, and it appears on the chooser's
 * line, on the card under the condition, and on the catalogue page. Nowhere else.
 */
export function Nature({ nature }: Readonly<{ nature: ConditionNature }>) {
  return <span className={`block ${META}`}>{CONDITION_NATURE[nature]}</span>;
}
