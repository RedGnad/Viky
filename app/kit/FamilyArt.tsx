import type { ConditionFamily } from "@/src/conditions";
import { Character } from "./Character";

/**
 * A family of the catalogue, drawn (D224, the founder's direction A of 24 Sep 2026): the diamond in that family's
 * situation, so the four tiles of the chooser carry a picture before a word. It reads a book to learn, wears a
 * graduate's board for exams and school, stands by a rook to play, and runs to move, its limbs out in a stride. The
 * props are drawn in the ink on the paper's raised tone, in the shapes the rules allow (round joins and caps, nothing
 * pointed), and the diamond is the one thing in colour, as it is everywhere else.
 *
 * The box is 112 by 104 and the diamond 88 wide in it, so its head's top sits at 30 and its lowest point at 74: the
 * board rests on the top, the book is held under the chin, the rook stands at its right tip, the runner's feet reach
 * the box's foot.
 */
const INK = "var(--on-surface)";
const PAPER = "var(--paper-raised)";
const line = { fill: "none", stroke: INK, strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const filled = { ...line, fill: PAPER };

export function FamilyArt({ family }: Readonly<{ family: ConditionFamily }>) {
  const running = family === "move";
  return (
    <span aria-hidden className="relative block h-[104px] w-[112px]" data-family-art={family}>
      {/* The runner leans into its stride, from its feet, inside its own drawing (D249): a CSS rotation here made a
          layer of its own on Android, painted as a dotted rectangle behind the diamond. */}
      <span className="absolute top-[24px] left-[12px] block w-[88px]">
        <Character state="diamond" tone="sun" standing={false} limbs={running} pose={running ? "running" : undefined} tilt={running ? -8 : undefined} className="block h-auto w-full" />
      </span>
      {family === "learn" ? (
        <svg data-prop="book" aria-hidden focusable="false" viewBox="0 0 56 30" className="absolute top-[62px] left-[28px] w-[56px]">
          <path d="M4 7 Q16 2 28 9 Q40 2 52 7 V25 Q40 20 28 27 Q16 20 4 25 Z" style={filled} />
          <path d="M28 9 V27" style={line} />
        </svg>
      ) : null}
      {family === "exam" ? (
        <svg data-prop="cap" aria-hidden focusable="false" viewBox="0 0 64 36" className="absolute top-[10px] left-[24px] w-[64px]">
          <path d="M32 4 L60 14 L32 24 L4 14 Z" style={{ fill: INK, stroke: INK, strokeWidth: 4, strokeLinejoin: "round" }} />
          <path d="M50 18 V29" style={line} />
          <circle cx={50} cy={31} r={2.5} style={{ fill: INK }} />
        </svg>
      ) : null}
      {family === "play" ? (
        <svg data-prop="rook" aria-hidden focusable="false" viewBox="0 0 28 40" className="absolute top-[50px] left-[84px] w-[28px]">
          <rect x={4} y={3} width={5} height={9} rx={2} style={filled} />
          <rect x={11.5} y={3} width={5} height={9} rx={2} style={filled} />
          <rect x={19} y={3} width={5} height={9} rx={2} style={filled} />
          <rect x={4} y={9} width={20} height={6} rx={3} style={filled} />
          <rect x={7} y={13} width={14} height={21} rx={3} style={filled} />
          <rect x={2} y={32} width={24} height={6} rx={3} style={filled} />
        </svg>
      ) : null}
      {running ? (
        <svg data-prop="dash" aria-hidden focusable="false" viewBox="0 0 24 24" className="absolute top-[42px] left-0 w-[24px]">
          <path d="M3 4 H15 M7 12 H19 M3 20 H13" style={{ ...line, strokeWidth: 3 }} />
        </svg>
      ) : null}
    </span>
  );
}
