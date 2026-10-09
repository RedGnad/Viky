import type { ConditionFamily } from "@/src/conditions";
import { Figure, type FigureProps } from "./Figure";

/**
 * A family of the catalogue, drawn (D224, redrawn on the rig by D268, the founder's choice C of four): the figure doing
 * what the family is about, with its thing in the figure's own material. It reads a book held open in its hands to
 * learn, waves under a graduate's cap for exams and school, stands with a rook at its hand to play, and runs to move.
 * The same light, gloss and halftone as the figures of the three destinations, so the chooser is one cast with them.
 *
 * The box is 112 by 104 and the figure 100 wide in it, its legs included; the cap rises above its head and the speed lines trail behind
 * it, both inside the tile's own padding.
 */
export const FAMILY_FIGURES: Readonly<Record<ConditionFamily, FigureProps>> = {
  learn: { arms: "read", props: ["book"], mouth: "soft", gaze: { x: 0, y: 0.7 } },
  exam: { arms: "wave", mouth: "grin", props: ["cap"] },
  play: { arms: "hold", props: ["rook"], mouth: "soft", gaze: { x: 0.7, y: 0.3 } },
  move: { arms: "run", legs: "run", lean: -8, mouth: "grin", props: ["speed"] },
};

export function FamilyArt({ family }: Readonly<{ family: ConditionFamily }>) {
  return (
    <span aria-hidden="true" className="relative block h-[104px] w-[112px]" data-family-art={family}>
      <span className="absolute top-[14px] left-[6px] block w-[100px]">
        <Figure id={`family-${family}`} halftone className="block h-auto w-full" {...FAMILY_FIGURES[family]} />
      </span>
    </span>
  );
}
