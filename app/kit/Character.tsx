import type { CSSProperties, ReactNode } from "react";

/**
 * The days of a gift are its characters (the art direction brief of 17 Sep 2026, section 5): they make visible what
 * sets Viky apart, the money that becomes theirs day after day and what comes back by itself. And one more, the gift,
 * a rounded box with its ribbon, for an empty screen, a success and the page without an account.
 *
 * How they are built, from the rules a language-learning app and Headspace publish for their own illustration (both quoted in the brief, section 5):
 * - Three shapes and not one more: the circle, the rounded rectangle, the rounded triangle ("Pointy shapes are
 *   off-brand"). A character is ONE shape, two round eyes ("No ovals!") and a mouth. No arms, no legs.
 * - Flat colour with no outline ("flat colors to fill shapes, with no outlines"), a pill for a shadow, a flat view.
 * - At most three secondary colours in any one image, from the look's short range, never grey (src/design-tokens.ts,
 *   LOOKS). They never speak and carry no text: a day's state is said in words beside it, which is why the picture is
 *   hidden from a screen reader.
 *
 * The state is the shape, the colour and the face: asleep and to come, a low rounded rectangle; today, an upright
 * triangle; still catchable, the same triangle leaning and yawning; earned, a full circle smiling wide; gone back, a
 * faded circle leaving to the left. Two sizes: large, with its shadow, for a gift's page and the moments; small, for
 * the strip on a card. Both keep the face, which the brief had reserved for the large one and the founder amended on
 * the rendered mockups of 19 Sep 2026 (D113): a row of faceless shapes reads as a chart, and the faces are what hold
 * a screen together. Faces vary a little from one character to
 * the next through `variant`, so a row never shows the same face twice in a row (Headspace: "do not repeat the same
 * face multiple times").
 *
 * The colours are the look's variables, so a character wears whatever look it is drawn in. The parts are named with
 * `data-part` so the motion (app/kit/Motion.tsx) can move a body, a face or a bow without knowing how they are drawn.
 */

export type CharacterState = "toCome" | "today" | "catchable" | "earned" | "returned" | "gift" | "diamond";

const ONE = "var(--character-1)";
const TWO = "var(--character-2)";
const THREE = "var(--character-3)";
const FACE = "var(--character-face)";

/** Where a character stands: the bottom of every body sits on this line, and its shadow under it. */
const FLOOR = 55;

/** A triangle whose corners are rounded, which is the only way that language app allows a triangle. */
function roundedTriangle(points: ReadonlyArray<readonly [number, number]>, radius: number): string {
  const count = points.length;
  const commands: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const [x, y] = points[index];
    const [px, py] = points[(index + count - 1) % count];
    const [nx, ny] = points[(index + 1) % count];
    const toPrevious = Math.hypot(px - x, py - y);
    const toNext = Math.hypot(nx - x, ny - y);
    const start = [x + ((px - x) / toPrevious) * radius, y + ((py - y) / toPrevious) * radius];
    const end = [x + ((nx - x) / toNext) * radius, y + ((ny - y) / toNext) * radius];
    commands.push(`${index === 0 ? "M" : "L"}${round(start[0])} ${round(start[1])}`, `Q${x} ${y} ${round(end[0])} ${round(end[1])}`);
  }
  return `${commands.join(" ")} Z`;
}

const round = (value: number) => Math.round(value * 100) / 100;

const TRIANGLE = roundedTriangle(
  [
    [32, 8],
    [56, FLOOR],
    [8, FLOOR],
  ],
  9,
);

/**
 * The diamond, asked for by the founder on 20 Sep 2026 for the head of the page without an account (D131). It is a
 * fourth shape, and it obeys the same rule as the triangle: its corners are rounded, generously, so that nothing on
 * the page is pointed. It carries the gift's own tone, the sun box with the ink face.
 */
const DIAMOND = roundedTriangle(
  [
    [32, 4],
    [61, 20],
    [32, 36],
    [3, 20],
  ],
  8,
);

/** The diamond is wider than it is tall (the founder, 20 Sep 2026), so it is drawn in a box of its own. */
const DIAMOND_BOX = "0 0 64 40";

/**
 * The one blend in the product (D132, D134): the head of the page is the only character that is not a flat fill, and
 * its two colours are not the same by day as by night, because the sun goes quiet on the lavender ground and reads
 * on the ink. Everything else the product draws stays flat, which is the rule the niche gave on 20 Sep 2026.
 */
const DIAMOND_BLEND = "viky-diamond-blend";

/**
 * The box a small character is drawn in (D136). Every body stands between y 8 and y 55 of the square, so a strip of
 * them carried fifteen pixels of nothing above each one and six below. Cropped to what is drawn, the same row is
 * shorter and each character is larger inside its own width, which is what the founder asked for twice.
 */
const SMALL_BOX = "0 6 64 52";

/** A mouth smiling wide: the lower half of a circle, which keeps it inside the circle family. */
const smile = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} H${cx + r} A${r} ${r} 0 0 1 ${cx - r} ${cy} Z`;

/** Eyes that look a little one way or the other, so no two neighbours share a face. */
const gazeOf = (variant: number) => [0, 1, -1][((variant % 3) + 3) % 3];

function Eye({ x, y, r = 2.8, fill = FACE }: Readonly<{ x: number; y: number; r?: number; fill?: string }>) {
  return <circle cx={x} cy={y} r={r} style={{ fill }} />;
}

/** A closed eye: a short pill, a rounded rectangle lying down. */
function ClosedEye({ x, y }: Readonly<{ x: number; y: number }>) {
  return <rect x={x - 3.4} y={y - 1.2} width={6.8} height={2.4} rx={1.2} style={{ fill: FACE }} />;
}

/**
 * The juice (the founder, 20 Sep 2026, on a sheet of glossy jelly shapes): the fills stay flat, and each character
 * gains one highlight of two circles at its upper left and one soft shade lying at its foot. No gradient, no outline,
 * no new colour in the range: two tints of white and of the ink, kept as their own variables.
 */
function Gloss({ cx, cy, r, dot }: Readonly<{ cx: number; cy: number; r: number; dot?: Readonly<{ cx: number; cy: number; r: number }> }>) {
  return (
    <g data-part="gloss" style={{ fill: "var(--character-gloss)" }}>
      <circle cx={cx} cy={cy} r={r} />
      {dot ? <circle cx={dot.cx} cy={dot.cy} r={dot.r} /> : null}
    </g>
  );
}

/** The shade a body rests in: a pill, never an oval, because an eye is the only round thing that may be an outline. */
function Shade({ cx, cy, rx, ry }: Readonly<{ cx: number; cy: number; rx: number; ry: number }>) {
  return <rect data-part="shade" x={cx - rx} y={cy - ry} width={rx * 2} height={ry * 2} rx={ry} style={{ fill: "var(--character-shade)" }} />;
}

const bodyFill = (fill: string): CSSProperties => ({ fill });

/** Parts that move are scaled and moved from their own box, from the floor for a body and from the middle for a face. */
const FROM_FLOOR: CSSProperties = { transformBox: "fill-box", transformOrigin: "50% 100%" };
const FROM_MIDDLE: CSSProperties = { transformBox: "fill-box", transformOrigin: "50% 50%" };

function drawing(
  state: CharacterState,
  face: boolean,
  variant: number,
  tone: Readonly<{ box: string; ribbon: string; face: string }>,
): { body: ReactNode; face: ReactNode; lean?: string; bow?: ReactNode; gloss?: ReactNode; shade?: ReactNode; defs?: ReactNode } {
  const gaze = gazeOf(variant);
  switch (state) {
    case "toCome":
      return {
        // Taller than it was, because a day that sleeps is still a day (D134): at a quarter of its box it read as a
        // line rather than as a character, which is what the founder could not see in the card's row.
        body: <rect x={8} y={25} width={48} height={FLOOR - 25} rx={15} style={bodyFill(THREE)} />,
        gloss: <Gloss cx={19} cy={33} r={4.4} dot={{ cx: 27, cy: 30, r: 2.2 }} />,
        shade: <Shade cx={32} cy={51} rx={16} ry={2.4} />,
        face: face ? (
          <>
            <ClosedEye x={24} y={39} />
            <ClosedEye x={40} y={39} />
            <circle cx={32 + gaze} cy={47} r={1.9} style={{ fill: FACE }} />
          </>
        ) : null,
      };
    case "today":
      return {
        body: <path d={TRIANGLE} style={bodyFill(TWO)} />,
        gloss: <Gloss cx={25} cy={27} r={3.4} dot={{ cx: 30, cy: 22, r: 1.7 }} />,
        shade: <Shade cx={32} cy={51} rx={15} ry={2.4} />,
        face: face ? (
          <>
            <Eye x={26 + gaze} y={37} r={3.1} />
            <Eye x={38 + gaze} y={37} r={3.1} />
            <rect x={28.5 + gaze} y={45} width={7} height={2.6} rx={1.3} style={{ fill: FACE }} />
          </>
        ) : null,
      };
    case "catchable":
      return {
        body: <path d={TRIANGLE} style={bodyFill(TWO)} />,
        gloss: <Gloss cx={25} cy={27} r={3.4} dot={{ cx: 30, cy: 22, r: 1.7 }} />,
        shade: <Shade cx={32} cy={51} rx={15} ry={2.4} />,
        lean: "rotate(-9 32 55)",
        face: face ? (
          <>
            <ClosedEye x={26} y={37} />
            <Eye x={38} y={36.5} r={2.9} />
            <circle cx={32} cy={46.5} r={3.4} style={{ fill: FACE }} />
          </>
        ) : null,
      };
    case "earned":
      return {
        body: <circle cx={32} cy={FLOOR - 22} r={22} style={bodyFill(ONE)} />,
        gloss: <Gloss cx={18} cy={24} r={4.4} dot={{ cx: 25, cy: 18, r: 2.2 }} />,
        shade: <Shade cx={32} cy={49} rx={14} ry={2.6} />,
        face: face ? (
          <>
            <Eye x={24 + gaze} y={29} />
            <Eye x={40 + gaze} y={29} />
            <path data-part="mouth" d={smile(32 + gaze, 37, 8.5 - (((variant % 2) + 2) % 2))} style={{ fill: FACE, ...FROM_MIDDLE }} />
          </>
        ) : null,
      };
    case "returned":
      return {
        body: <circle cx={32} cy={FLOOR - 19} r={19} style={bodyFill(THREE)} />,
        gloss: <Gloss cx={26} cy={26} r={3.6} dot={{ cx: 32, cy: 21, r: 1.8 }} />,
        shade: <Shade cx={32} cy={51} rx={12} ry={2.4} />,
        // In profile, facing left: one eye and a small mouth at the leading edge.
        face: face ? (
          <>
            <Eye x={19} y={32} r={2.6} />
            <rect x={14} y={40} width={6} height={2.4} rx={1.2} style={{ fill: FACE }} />
          </>
        ) : null,
      };
    case "diamond":
      return {
        defs: (
          <defs>
            <linearGradient id={DIAMOND_BLEND} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--character-hero-from)" />
              <stop offset="1" stopColor="var(--character-hero-to)" />
            </linearGradient>
          </defs>
        ),
        /* The one outline in the product, asked for by the founder, in the two colours he chose on the image: the
           ink at night, a light yellow by day. The shade that lay at its foot is gone: on a shape this wide it read
           as a beard rather than as a shadow. */
        body: <path d={DIAMOND} style={{ fill: `url(#${DIAMOND_BLEND})`, stroke: "var(--character-hero-edge)", strokeWidth: 2.2, strokeLinejoin: "round" }} />,
        gloss: <Gloss cx={23} cy={13} r={4.4} dot={{ cx: 31, cy: 10, r: 2.2 }} />,
        face: face ? (
          <>
            <Eye x={26} y={18} fill={tone.face} />
            <Eye x={38} y={18} fill={tone.face} />
            <path data-part="mouth" d={smile(32, 24, 4.5)} style={{ fill: tone.face, ...FROM_MIDDLE }} />
          </>
        ) : null,
      };
    case "gift":
      return {
        // A box under a lid, so the face sits on the box and never across a ribbon.
        body: (
          <>
            <rect x={13} y={31} width={38} height={FLOOR - 31} rx={8} style={bodyFill(tone.box)} />
            <rect x={10} y={24} width={44} height={10} rx={5} style={bodyFill(tone.ribbon)} />
          </>
        ),
        gloss: <Gloss cx={17} cy={28} r={3} dot={{ cx: 23, cy: 26, r: 1.6 }} />,
        shade: <Shade cx={32} cy={51} rx={13} ry={2.4} />,
        // A bow tied on the lid: two loops leaning out from a knot, drawn over the lid.
        bow: (
          <g data-part="bow" style={FROM_FLOOR}>
            <path
              d={roundedTriangle(
                [
                  [31, 23],
                  [19, 9],
                  [15, 22],
                ],
                3.5,
              )}
              style={bodyFill(tone.ribbon)}
            />
            <path
              d={roundedTriangle(
                [
                  [33, 23],
                  [49, 22],
                  [45, 9],
                ],
                3.5,
              )}
              style={bodyFill(tone.ribbon)}
            />
            <circle cx={32} cy={22} r={4} style={bodyFill(tone.ribbon)} />
          </g>
        ),
        face: face ? (
          <>
            <Eye x={24} y={41.5} fill={tone.face} />
            <Eye x={40} y={41.5} fill={tone.face} />
            <path data-part="mouth" d={smile(32, 46, 5.5)} style={{ fill: tone.face, ...FROM_MIDDLE }} />
          </>
        ) : null,
      };
  }
}

/**
 * The colours a character is drawn in. "range" is every character on a screen: the look's secondary colours, the face in
 * the ink. "hero" is the gift on the app's icon only, which the brief puts "in the hero colour" (section 7 bis): drawn
 * on a tile of the accent, the box takes the colour that reads on the accent, its face is the accent showing through,
 * and the band keeps a secondary colour.
 */
export type CharacterTone = "range" | "hero" | "sun";

const TONES: Record<CharacterTone, Readonly<{ box: string; ribbon: string; face: string }>> = {
  range: { box: ONE, ribbon: TWO, face: FACE },
  hero: { box: "var(--on-accent)", ribbon: TWO, face: "var(--accent)" },
  /* The gift as the rendered mockups of 19 Sep 2026 draw it at the head of the page: a sun box with a pink ribbon. */
  sun: { box: "var(--accent)", ribbon: ONE, face: FACE },
};

export function Character({
  state,
  size = "large",
  variant = 0,
  tone = "range",
  standing = true,
  className,
}: Readonly<{
  state: CharacterState;
  size?: "large" | "small";
  variant?: number;
  tone?: CharacterTone;
  /**
   * Whether the character stands on its shadow. The row of a gift's page draws them without one (the mockup of
   * 19 Sep 2026): seven shadows in a row read as seven underlines rather than as seven days.
   */
  standing?: boolean;
  className?: string;
}>) {
  const large = size === "large";
  const drawn: CharacterTone = state === "gift" || state === "diamond" ? tone : "range";
  // A face at every size, since the rendered mockups of 19 Sep 2026 (D113): it is what holds the screen together,
  // and a row of small shapes without faces read as a chart rather than as days.
  const parts = drawing(state, true, variant, TONES[drawn]);
  const leaving = state === "returned";
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={state === "diamond" ? DIAMOND_BOX : large ? "0 0 64 64" : SMALL_BOX}
      data-character={state}
      data-size={size}
      className={className}
      style={{ overflow: "visible" }}
    >
      {parts.defs}
      {large && standing && drawn === "range" ? (
        <rect
          data-part="shadow"
          x={leaving ? 12 : 14}
          y={FLOOR + 1}
          width={36}
          height={6}
          rx={3}
          style={{ fill: "var(--character-shadow)", fillOpacity: "var(--character-shadow-opacity)", ...FROM_MIDDLE }}
        />
      ) : null}
      <g data-part="figure" style={{ ...FROM_FLOOR, ...(leaving ? { transform: "translateX(-6px)", opacity: 0.6 } : null) }}>
        <g transform={parts.lean}>
          <g data-part="body">{parts.body}</g>
          {/* The shade lies in the body, the highlight sits on it, and the face stays on top of both (D132). */}
          {parts.shade}
          {parts.gloss}
          {parts.bow}
          {parts.face ? (
            <g data-part="face" style={FROM_MIDDLE}>
              {/* The face turns towards a hovering pointer as one piece (app/kit/Motion.tsx, Gaze). */}
              <g data-part="gaze">{parts.face}</g>
            </g>
          ) : null}
        </g>
      </g>
    </svg>
  );
}
