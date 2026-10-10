import type { ConditionNature } from "@/src/conditions";
import { natureOf } from "@/src/gift-live";
import type { Voice } from "@/src/gift-voice";
import { META } from "../components/ui";

/**
 * The nature of a condition, said once, in the meta voice (D162, the founder's direction 1 corrected): DM Sans at
 * 13 px, capitals, a pixel of tracking, the muted ink of whatever it stands on and no fill, before the line of help.
 * On the paper `--muted` is the paper's own soft ink (app/globals.css, `.on-paper`), on the ground the ground's, so
 * one colour token does both. Two words exactly, READ FOR YOU or SHOWN BY THEM, and it appears on the chooser's
 * line, on the card under the condition, and on the catalogue page. Nowhere else.
 *
 * On a card it speaks to whoever reads the card (the founder, 11 Oct 2026): `to` is that reader, and the person the
 * gift is for reads SHOWN BY YOU. The chooser and the catalogue name no reader: the one who gives reads them.
 */
export function Nature({ nature, to }: Readonly<{ nature: ConditionNature; to?: Voice }>) {
  return <span className={`block ${META}`}>{natureOf(to, nature)}</span>;
}
