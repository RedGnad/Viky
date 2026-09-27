import type { CSSProperties, ReactNode } from "react";
import { DIAMOND } from "./Character";

/**
 * The figure: the diamond as a rig rather than as one drawing (D236, the founder's direction B of 25 Sep 2026, glass
 * and jelly). A character becomes iconic through a system, not an image (Hartman, Building character, 2020: a cast
 * built from one or two basic shapes per part, with named states for poses and mouths), so this file is the system: a body, one light, a
 * face in named sets, limbs in named poses, and props as parts of the same material.
 *
 * One light, top left, and everything that shines obeys it: the body's gradient runs from the lit corner, the edge
 * is a gradient of its own colour lit on the same side, the gloss sits where the surface faces halfway between the
 * light and the eye, which for a lens-shaped body is toward the light from the middle. (A rim of light along the
 * edges away from it was tried and taken off, D237: it read as a stray line.) When the figure leans, the light is turned
 * the other way in the drawing's own coordinates, so the reflections stay with the light rather than with the body:
 * that is what makes them reflections. Nothing here is drawn by pose; it is computed from the pose.
 *
 * The colours are the character's own (`--character-*`), the ink, and white for what shines: no fourth colour, and
 * never the sun (test/design-tokens.test.ts). Shapes are round or rounded, as the brief allows; nothing is pointed.
 */

/** Where the light comes from, as a direction in the drawing's plane (x to the right, y down): the top left. */
export const LIGHT: Readonly<{ x: number; y: number }> = { x: -1, y: -1 };

export type Eyes = "open" | "closed" | "half" | "shades";
export type Mouth = "smile" | "grin" | "o" | "flat" | "soft";
export type ArmsPose = "rest" | "crossed" | "hold" | "wave" | "run" | "shoulder" | "read";
export type LegsPose = "rest" | "run" | "apart";
export type Prop = "suit" | "case" | "book" | "cap" | "rook" | "speed";

export type FigureProps = Readonly<{
  eyes?: Eyes;
  mouth?: Mouth;
  arms?: ArmsPose;
  legs?: LegsPose;
  /** Degrees the whole figure leans from its feet, clockwise on the screen. */
  lean?: number;
  /** Where the eyes look, from -1 to 1 on each axis; the pupils move a little, never the eyes. */
  gaze?: Readonly<{ x: number; y: number }>;
  props?: readonly Prop[];
  light?: Readonly<{ x: number; y: number }>;
  /** A prefix for the gradient ids, so two figures on one page keep their own. */
  id?: string;
  /** One more group, turning from the body's middle, for the landing's leap (D219, carried onto the rig by D241). */
  whirl?: boolean;
  /** Arms and legs, or the head alone: the app's icon is the head, where limbs at 64 pixels are noise (D253). */
  limbs?: boolean;
  /** A fine halftone in the body's own deeper colour (D260, the founder's choice of four): the landing's figure only. */
  halftone?: boolean;
}>;

/** The box the figure is drawn in: 64 wide, 53 tall down to the feet (Character's diamond with limbs). */
export const FIGURE_BOX = { width: 64, height: 53 } as const;
/** The head alone, down to the diamond's lowest point and its edge: 40, as `Character`'s diamond without limbs. */
const HEAD_HEIGHT = 40;
const CENTRE = { x: 32, y: 20 };
/** The diamond's four corners, clockwise from the top, and the outward normal of the edge that starts at each. */
const CORNERS: readonly (readonly [number, number])[] = [
  [32, 4],
  [61, 20],
  [32, 36],
  [3, 20],
];
const INK = "var(--character-face)";
const GLOSS = "var(--character-gloss)";
const LIMB = "var(--character-limb)";
const FROM_MIDDLE: CSSProperties = { transformBox: "fill-box", transformOrigin: "50% 50%" };
const FROM_FLOOR: CSSProperties = { transformBox: "fill-box", transformOrigin: "50% 100%" };
const FROM_JOINT: CSSProperties = { transformBox: "fill-box", transformOrigin: "50% 0%" };
/** The case hangs from the top of its handle, the middle of its box's top edge: that is where it swings from (D243). */
const FROM_HANDLE: CSSProperties = { transformBox: "fill-box", transformOrigin: "50% 0%" };

const round = (value: number) => Math.round(value * 100) / 100;
const unit = (v: Readonly<{ x: number; y: number }>) => {
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
};
/** The light as the drawing sees it once the figure leans: turned the other way, so it stays where the light is. */
const turned = (v: Readonly<{ x: number; y: number }>, degrees: number) => {
  const a = (-degrees * Math.PI) / 180;
  return { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) };
};

/** The edges of the diamond, each with its outward normal and its angle, for the light to fall on. */
function edges() {
  return CORNERS.map((from, index) => {
    const to = CORNERS[(index + 1) % CORNERS.length];
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    // Clockwise corners, so the outward normal is the direction turned to the right of travel.
    const normal = { x: dy / length, y: -dx / length };
    return { from, to, normal, angle: (Math.atan2(dy, dx) * 180) / Math.PI, length };
  });
}

/**
 * What the light does to the body: the gradient's two points, the gloss's place and slant, and the dot beside it.
 * All of it from one direction, so a pose never has to be lit by hand.
 */
export function lit(light = LIGHT, lean = 0) {
  const l = turned(unit(light), lean);
  const gradient = { x1: 0.5 + 0.5 * l.x, y1: 0.5 + 0.5 * l.y, x2: 0.5 - 0.5 * l.x, y2: 0.5 - 0.5 * l.y };
  const gloss = { cx: CENTRE.x + l.x * 12.7, cy: CENTRE.y + l.y * 9.9 };
  const dot = { cx: CENTRE.x + l.x * 2, cy: CENTRE.y + l.y * 14.1 };
  const all = edges().map((edge) => ({ ...edge, facing: edge.normal.x * l.x + edge.normal.y * l.y }));
  const litEdge = all.reduce((best, edge) => (edge.facing > best.facing ? edge : best), all[0]);
  return { light: l, gradient, gloss: { ...gloss, angle: round(litEdge.angle) }, dot };
}

/**
 * Each pose of the arms: a path for each arm, its hand, and a turn from the joint; the left arm first. An arm drawn
 * under the body starts inside it (D301, the founder, 28 Sep 2026: at rest and raised aslant, it came out of the edge
 * rather than from behind), at (15.5, 24.8) and (48.5, 24.8), so it always comes out from behind; only an arm that has
 * to cross the body (raised straight up, folded, holding a book) is drawn over it, from the edge.
 */
/**
 * `overlay`: the part of an arm that has to show in front (D304), drawn after the body and what it holds, starting just
 * outside the body's edge on the arm's own curve; the whole arm is drawn under the body as well, so it leaves from
 * behind and passes in front. `handOver`: the hand drawn in front too.
 */
const ARMS: Record<ArmsPose, readonly Readonly<{ d: string; hand: readonly [number, number]; turn?: number; over?: boolean; handOver?: boolean; overlay?: string }>[]> = {
  rest: [
    { d: "M15.5 24.8 Q12 30.7 13 35.4", hand: [13, 37.2] },
    { d: "M48.5 24.8 Q52 30.7 51 35.4", hand: [51, 37.2] },
  ],
  // The two hands at one height (the founder, 25 Sep 2026, D244: 1.4 apart read as a lopsided figure); the forearms
  // still pass at two heights in the middle, so the two lines cross rather than merge into one band.
  // Folded, the arms still leave from behind the body at their base (D304), and cross in front of it.
  crossed: [
    { d: "M15.5 24.8 L13 25.5 C12 29 20 30.2 36.5 30", hand: [37.2, 30], handOver: true, overlay: "M13.16 26.92 C14.59 29.33 22.48 30.17 36.5 30" },
    { d: "M48.5 24.8 L51 25.5 C52 29 44 32 27.5 30", hand: [26.8, 30], handOver: true, overlay: "M50.84 27.03 C49.41 29.79 41.53 31.7 27.5 30" },
  ],
  hold: [
    { d: "M15.5 24.8 Q12 30.7 13 35.4", hand: [13, 37.2] },
    { d: "M48.5 24.8 Q52.4 31 52 36", hand: [52, 37.8] },
  ],
  wave: [
    { d: "M13 26 Q12 30.7 13 35.4", hand: [13, 37.2], turn: 150, over: true },
    { d: "M48.5 24.8 Q52 30.7 51 35.4", hand: [51, 37.2] },
  ],
  run: [
    { d: "M15.5 24.8 Q12 30.7 13 35.4", hand: [13, 37.2], turn: 75 },
    { d: "M48.5 24.8 Q52 30.7 51 35.4", hand: [51, 37.2], turn: -20 },
  ],
  // The arm on the other's shoulder leaves from behind its own body, like any arm raised aslant (D301).
  shoulder: [
    { d: "M15.5 24.8 Q12 30.7 13 35.4", hand: [13, 37.2] },
    { d: "M48.5 25.4 C57 24.5 65 19.5 72 16.5", hand: [72.8, 16.1] },
  ],
  // Holding a book open in front (D268): the arms leave from under the body like the others (D302, the founder, 28 Sep
  // 2026) and pass behind the book; only the hands come over it, closing on its lower corners.
  // In front of the book from where they leave the body (D304: behind it, they vanished under the book).
  read: [
    { d: "M15.5 24.8 Q11.4 31.6 14.6 37.4", hand: [15.4, 38.4], handOver: true, overlay: "M13.7 28.79 Q12.36 33.34 14.6 37.4" },
    { d: "M48.5 24.8 Q52.6 31.6 49.4 37.4", hand: [48.6, 38.4], handOver: true, overlay: "M50.3 28.79 Q51.64 33.34 49.4 37.4" },
  ],
};
const LEGS: Record<LegsPose, readonly Readonly<{ turn: number }>[]> = {
  rest: [{ turn: 0 }, { turn: 0 }],
  run: [{ turn: 35 }, { turn: -15 }],
  apart: [{ turn: 10 }, { turn: -10 }],
};
/**
 * The legs down to the box's floor (53), so the feet stand on whatever the drawing stands on, the card on the landing
 * (D301, the founder, 28 Sep 2026: they floated a unit and a half above it). A foot is the upper half of the old
 * rounded stroke: round on top, flat underneath (the look the link preview gave by cutting them at the card's edge),
 * and a leg ends square on it, so nothing round shows under the foot. 1.3 thick rather than half the stroke's 1.8 (D303,
 * the founder: cut too thin), its top corners rounded.
 */
const LEG_PATHS = [
  { d: "M23.5 30 Q21.6 41.5 21.7 53", foot: "M17.6 53 V52.35 A0.65 0.65 0 0 1 18.25 51.7 H21.95 A0.65 0.65 0 0 1 22.6 52.35 V53 Z" },
  { d: "M40.5 30 Q42.4 41.5 42.3 53", foot: "M41.4 53 V52.35 A0.65 0.65 0 0 1 42.05 51.7 H45.75 A0.65 0.65 0 0 1 46.4 52.35 V53 Z" },
] as const;

/**
 * The feet as they were before D301, round all round, kept for the reading pose only (the founder, 28 Sep 2026: with
 * the book held in front, they give the figure the look of sitting, which he likes).
 */
const ROUND_LEG_PATHS = [
  { d: "M23.5 30 Q21.6 40.75 21.7 51.5", foot: "M21.7 51.5 H18.5" },
  { d: "M40.5 30 Q42.4 40.75 42.3 51.5", foot: "M42.3 51.5 H45.5" },
] as const;

const line = { fill: "none", stroke: LIMB, strokeWidth: 1.8, strokeLinecap: "round" as const };
const legLine = { ...line, strokeLinecap: "butt" as const };

function Arm({ pose, arm, hand = true }: Readonly<{ pose: ArmsPose; arm: (typeof ARMS)[ArmsPose][number]; hand?: boolean }>) {
  return (
    <g data-part="arm" data-pose={pose} style={arm.turn ? { ...FROM_JOINT, transform: `rotate(${arm.turn}deg)` } : FROM_JOINT}>
      {/* Measured as one unit long, so an arm can be drawn out along its own curve from the joint (D241). */}
      <path data-part="reach" d={arm.d} pathLength={1} style={line} />
      {hand ? <circle data-part="hand" cx={arm.hand[0]} cy={arm.hand[1]} r={1.9} style={{ fill: LIMB, ...FROM_MIDDLE }} /> : null}
    </g>
  );
}

/**
 * The limbs under the body: the legs, and the arms that hang. The arms that rise or cross come after the body. An
 * arm holding the case ends in its handle, with no hand drawn on it (the founder, 25 Sep 2026, D237).
 */
function Limbs({ arms, legs, holding }: Readonly<{ arms: ArmsPose; legs: LegsPose; holding: boolean }>) {
  return (
    <g data-part="limbs">
      {ARMS[arms].filter((arm) => !arm.over).map((arm, index) => (
        <Arm key={index} pose={arms} arm={arm} hand={!arm.handOver && !(holding && arms === "hold" && index === 1)} />
      ))}
      {LEGS[legs].map((leg, index) => (
        <g key={index} data-part="leg" data-pose={legs} style={leg.turn ? { ...FROM_JOINT, transform: `rotate(${leg.turn}deg)` } : FROM_JOINT}>
          {arms === "read" ? (
            <>
              <path d={ROUND_LEG_PATHS[index].d} style={line} />
              <path d={ROUND_LEG_PATHS[index].foot} style={line} />
            </>
          ) : (
            <>
              <path d={LEG_PATHS[index].d} style={legLine} />
              <path d={LEG_PATHS[index].foot} style={{ fill: LIMB }} />
            </>
          )}
        </g>
      ))}
    </g>
  );
}

/** The eyes, in their sets; a closed eye is the open one's pill, so one can open into the other (D226). */
function EyesOf({ eyes, gaze, id }: Readonly<{ eyes: Eyes; gaze: Readonly<{ x: number; y: number }>; id: string }>) {
  const at: readonly (readonly [number, number])[] = [
    [26, 18],
    [38, 18],
  ];
  if (eyes === "shades") return <Shades id={id} />;
  return (
    <g data-part="eyes" style={{ transform: `translate(${round(gaze.x * 1.6)}px, ${round(gaze.y * 1.2)}px)` }}>
      <g data-part="gaze">
      {at.map(([x, y]) =>
        eyes === "open" ? (
          // The lid: what a blink closes (D301), around the eye so the eye's own transform stays its expression's.
          <g key={x} data-part="lid" style={FROM_MIDDLE}>
            <circle data-part="eye" cx={x} cy={y} r={2.8} style={{ fill: INK, ...FROM_MIDDLE }} />
          </g>
        ) : eyes === "closed" ? (
          <rect key={x} data-part="eye" x={x - 3.4} y={y - 1.2} width={6.8} height={2.4} rx={3.4} ry={1.2} style={{ fill: INK, ...FROM_MIDDLE }} />
        ) : (
          /* Half: the lower part of the open eye under a lid that droops, a curve falling over it; a straight lid read as a
             frown (the founder, 25 Sep 2026, D237). */
          <path key={x} data-part="eye" d={`M${x - 2.8} ${y - 0.4} a2.8 2.8 0 0 0 5.6 0 a2.8 1.4 0 0 1 -5.6 0 Z`} style={{ fill: INK, ...FROM_MIDDLE }} />
        ),
      )}
      </g>
    </g>
  );
}

/**
 * The mouths: the smile is a real one, an upper lip that curves over a lower one, not a half circle. One ink and no
 * shine inside it (the founder, 25 Sep 2026, D243: the pale arc was noise), and its corners rounded rather than pointed:
 * a thin stroke of the same ink with round joins softens the two points where the lips meet.
 */
const LIPS = { fill: INK, stroke: INK, strokeWidth: 1.1, strokeLinejoin: "round" as const };
function MouthOf({ mouth }: Readonly<{ mouth: Mouth }>) {
  if (mouth === "smile") {
    return (
      <g data-part="mouth" style={FROM_MIDDLE}>
        <path d="M27.3 23.5 C29.2 28.3 35.4 28.3 36.9 23.2 Q32 25.2 27.3 23.5 Z" style={LIPS} />
      </g>
    );
  }
  if (mouth === "grin") {
    return (
      <g data-part="mouth" style={FROM_MIDDLE}>
        <path d="M26.8 23.1 C28.7 29.3 35.3 29.3 37.2 23.1 Q32 25.5 26.8 23.1 Z" style={LIPS} />
      </g>
    );
  }
  // A soft smile, the lips closed (D301, the founder, 28 Sep 2026: the landing's figure smiled wide all the time).
  if (mouth === "soft") {
    return (
      <g data-part="mouth" style={FROM_MIDDLE}>
        <path d="M28.1 23.8 Q32 27.1 35.9 23.8" style={{ fill: "none", stroke: INK, strokeWidth: 1.5, strokeLinecap: "round" }} />
      </g>
    );
  }
  if (mouth === "o") {
    return (
      <g data-part="mouth" style={FROM_MIDDLE}>
        <circle cx={32} cy={25.2} r={2.3} style={{ fill: INK }} />
        <circle cx={31.3} cy={24.4} r={0.55} style={{ fill: "rgba(255, 255, 255, 0.5)" }} />
      </g>
    );
  }
  return <rect data-part="mouth" x={28} y={23.4} width={8} height={2} rx={1} style={{ fill: INK, ...FROM_MIDDLE }} />;
}

/** Sunglasses: two lenses of the lilac deepening to the ink, and a bridge; no temples, no streak (D237: confusing). */
function Shades({ id }: Readonly<{ id: string }>) {
  return (
    <g data-part="eyes" data-prop="shades" style={FROM_MIDDLE}>
      <defs>
        <linearGradient id={`${id}-lens`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--character-3)" }} />
          <stop offset="1" style={{ stopColor: INK }} />
        </linearGradient>
      </defs>
      {[26, 38].map((x) => (
        <rect key={x} x={x - 5.2} y={14.1} width={10.4} height={7.8} rx={3.2} style={{ fill: `url(#${id}-lens)` }} />
      ))}
      <rect x={30.5} y={16.9} width={3} height={1.6} rx={0.8} style={{ fill: INK }} />
    </g>
  );
}

/** A suit on the lower half: lapels in the ink, a shirt of light, a tie in the character's coral, never the sun. */
function Suit() {
  return (
    <g data-prop="suit" style={FROM_MIDDLE}>
      <path d="M17 26.8 L26.5 29.2 L32 34.6 L37.5 29.2 L47 26.8 L39 32.14 Q32 36 25 32.14 Z" style={{ fill: INK }} />
      <path d="M27.4 29 L32 34.4 L36.6 29 Q32 31 27.4 29 Z" style={{ fill: "rgba(255, 255, 255, 0.85)" }} />
      <path d="M18.4 27.3 L26.4 29.4" style={{ fill: "none", stroke: "rgba(255, 255, 255, 0.45)", strokeWidth: 0.7, strokeLinecap: "round" }} />
      <path d="M30.9 29.2 h2.2 l0.7 3.4 l-1.8 1.5 l-1.8 -1.5 z" style={{ fill: "var(--character-1)" }} />
      <path d="M31.4 29.8 l0.4 2.2" style={{ fill: "none", stroke: "rgba(255, 255, 255, 0.6)", strokeWidth: 0.5, strokeLinecap: "round" }} />
    </g>
  );
}

/** An attaché case hanging from the right hand of the "hold" pose, in the sky colour, lit like the body. */
function Case({ id }: Readonly<{ id: string }>) {
  const [x, y, w, h] = [45, 40, 14, 10];
  return (
    <g data-prop="case" style={FROM_HANDLE}>
      <defs>
        <linearGradient id={`${id}-case`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--character-2)" }} />
          <stop offset="1" style={{ stopColor: "var(--character-2)", stopOpacity: 0.75 }} />
        </linearGradient>
      </defs>
      {/* The handle, in the limbs' ink, rising to where the arm ends: the arm grips it, and no hand is drawn on it. */}
      <path d={`M49 ${y} v-1 a3 3 0 0 1 3 -3 a3 3 0 0 1 3 3 v1`} style={{ fill: "none", stroke: LIMB, strokeWidth: 1.8, strokeLinecap: "round" }} />
      <rect x={x} y={y} width={w} height={h} rx={2.2} style={{ fill: `url(#${id}-case)`, stroke: "rgba(255, 255, 255, 0.4)", strokeWidth: 0.7 }} />
      <rect x={x} y={y + 3.6} width={w} height={2.4} style={{ fill: INK, fillOpacity: 0.35 }} />
      <rect x={x + 1.4} y={y + 0.9} width={4.2} height={1.2} rx={0.6} style={{ fill: "rgba(255, 255, 255, 0.5)" }} />
      <rect x={x + 3} y={y + 4.1} width={1.6} height={1.4} rx={0.4} style={{ fill: "var(--character-3)" }} />
      <rect x={x + w - 4.6} y={y + 4.1} width={1.6} height={1.4} rx={0.4} style={{ fill: "var(--character-3)" }} />
    </g>
  );
}

/**
 * A fine halftone on the body (D260, the founder's choice 4 of four, after a first and coarser one was taken off at
 * D257): a staggered grid 1.2 apart, each dot's radius growing from 0.06 where the light falls to 0.42 on the far side,
 * in the body's own deeper colour (`--character-halftone`, what a multiply of it gave, D263) at 45 %, so it reads as the material of the body
 * rather than a grey screen laid on it. The dots are drawn as round-capped zero-length strokes, one path per size, so a
 * thousand dots are eight elements and a few kilobytes, not a thousand circles.
 */
// Less fine since D261 (the founder: "moins fin les points"): 1.6 apart and 0.08 to 0.56, a third larger than D260's
// 1.2 and 0.06 to 0.42, half way to the coarse screen of D255.
const HALFTONE = { step: 1.6, from: 0.08, to: 0.56, sizes: 8 } as const;
function Halftone() {
  const paths = Array.from({ length: HALFTONE.sizes }, () => [] as string[]);
  for (let row = 0, y = 4; y <= 36; row += 1, y += HALFTONE.step * 0.866) {
    for (let x = 3 + (row % 2) * (HALFTONE.step / 2); x <= 61; x += HALFTONE.step) {
      // Inside the diamond, a dot's centre at most on its edge, and short of its four rounded tips: the edge drawn
      // again over the dots (2.2 wide) covers the half of a dot that passes it, so no clip is needed (D288).
      if (Math.abs(x - CENTRE.x) / 29 + Math.abs(y - CENTRE.y) / 16 > 1 || Math.abs(x - CENTRE.x) > 25.5 || Math.abs(y - CENTRE.y) > 14) continue;
      // 0 where the light falls (top left), 1 on the far side, as the gloss reads the same light.
      const along = Math.min(1, Math.max(0, 0.5 + ((x - CENTRE.x) / 29 + (y - CENTRE.y) / 16) / 4));
      paths[Math.min(HALFTONE.sizes - 1, Math.floor(along * HALFTONE.sizes))].push(`M${round(x)} ${round(y)}h0`);
    }
  }
  return (
    // No blend mode and no group opacity (D263): on a phone, while the figure is animated, it is painted in a layer
    // of its own, and a multiply there blends against a transparent backdrop, which showed the dots over nothing and
    // the layer's rectangle. The colour a multiply gave is computed instead (`--character-halftone`, the body's deeper
    // colour multiplied by itself), laid at 45 % by each dot's own opacity. And no clip (D288): the dots stop at the
    // edge by where they are placed, which leaves a phone nothing to paint apart.
    <g data-part="halftone">
      {paths.map((dots, size) => {
        const radius = HALFTONE.from + ((size + 0.5) / HALFTONE.sizes) * (HALFTONE.to - HALFTONE.from);
        return <path key={size} d={dots.join("")} style={{ fill: "none", stroke: "var(--character-halftone)", strokeOpacity: 0.45, strokeWidth: round(radius * 2), strokeLinecap: "round" }} />;
      })}
    </g>
  );
}

const SHINE = "rgba(255, 255, 255, 0.55)";

/**
 * The four families' things (D268, the founder's choice C of four): each in the figure's own material, the character's
 * colours lit from the top left like the case, their shade the ink laid thin and their light a line of white. The
 * book is held open in front (the "read" pose's hands close on it), the cap sits on the head, the rook stands at the
 * hand of the "hold" pose, and the speed lines trail a runner.
 */
function Book() {
  return (
    <g data-prop="book" style={FROM_MIDDLE}>
      <path d="M9 31 Q20.5 27.5 32 32 Q43.5 27.5 55 31 V42.5 Q43.5 39 32 43.5 Q20.5 39 9 42.5 Z" style={{ fill: "var(--character-2)" }} />
      <path d="M9 40 Q20.5 36.5 32 41 Q43.5 36.5 55 40 V42.5 Q43.5 39 32 43.5 Q20.5 39 9 42.5 Z" style={{ fill: INK, fillOpacity: 0.18 }} />
      <path d="M11 30.5 Q21 26.9 32 30.9 V41.7 Q21 37.9 11 41.1 Z" style={{ fill: "rgba(255, 255, 255, 0.96)" }} />
      <path d="M53 30.5 Q43 26.9 32 30.9 V41.7 Q43 37.9 53 41.1 Z" style={{ fill: "rgba(255, 255, 255, 0.84)" }} />
      <path d="M14 33.1 Q21 30.9 28.5 33.1 M14 35.8 Q21 33.6 28.5 35.8 M14 38.5 Q21 36.3 26 37.9 M35.5 33.1 Q43 30.9 50 33.1 M35.5 35.8 Q43 33.6 50 35.8" style={{ fill: "none", stroke: INK, strokeOpacity: 0.22, strokeWidth: 0.7, strokeLinecap: "round" }} />
      <path d="M32 30.9 V41.7" style={{ stroke: INK, strokeOpacity: 0.35, strokeWidth: 0.8 }} />
      <path d="M12 30.5 Q21 27.3 31 30.8" style={{ fill: "none", stroke: SHINE, strokeWidth: 0.7, strokeLinecap: "round" }} />
    </g>
  );
}

function Cap() {
  return (
    <g data-prop="cap" style={FROM_MIDDLE}>
      <path d="M22 4.5 V9 Q32 13 42 9 V4.5 Z" style={{ fill: "var(--character-3)" }} />
      <path d="M22 4.5 V9 Q32 13 42 9 V4.5 Z" style={{ fill: INK, fillOpacity: 0.3 }} />
      <path d="M32 -3.2 L51 3.4 Q52.4 4 51 4.6 L32 11.2 L13 4.6 Q11.6 4 13 3.4 Z" style={{ fill: "var(--character-3)" }} />
      <path d="M32 4.6 L51 3.4 Q52.4 4 51 4.6 L32 11.2 L13 4.6 Q11.6 4 13 3.4 Z" style={{ fill: INK, fillOpacity: 0.14 }} />
      <path d="M15 3.6 L32 -2.2 L44 1.9" style={{ fill: "none", stroke: SHINE, strokeWidth: 0.7, strokeLinecap: "round" }} />
      <path d="M32 4 Q42 5 46.5 6.5 V14" style={{ fill: "none", stroke: "var(--character-1)", strokeWidth: 1.2, strokeLinecap: "round" }} />
      <path d="M45.2 14 h2.6 l0.6 3.6 q-1.9 1.2 -3.8 0 z" style={{ fill: "var(--character-1)" }} />
      <circle cx={32} cy={4} r={1.3} style={{ fill: "var(--character-1)" }} />
    </g>
  );
}

function Rook() {
  return (
    <g data-prop="rook" transform="translate(47 29)">
      <path d="M0.5 0 h3 v2.6 h2.2 V0 h3 v2.6 h2.2 V0 h3 v5.6 q0 1 -1 1.4 l-1 0.5 v11.5 l2 2 q0.8 0.8 0.8 1.8 v1.4 H-1.2 v-1.4 q0 -1 0.8 -1.8 l2 -2 V7.5 l-1 -0.5 q-1 -0.4 -1 -1.4 Z" style={{ fill: "var(--character-3)" }} />
      <path d="M7.6 7.5 h3.3 v11.5 l2 2 q0.8 0.8 0.8 1.8 v1.4 H7.6 Z M7.6 0 h1.1 v2.6 h2.2 V0 h3 v5.6 q0 1 -1 1.4 l-1 0.5 H7.6 Z" style={{ fill: INK, fillOpacity: 0.25 }} />
      <path d="M2.2 8.4 V18" style={{ stroke: SHINE, strokeWidth: 0.9, strokeLinecap: "round" }} />
      <path d="M-1.2 23.9 h15.8" style={{ stroke: INK, strokeOpacity: 0.2, strokeWidth: 0.7 }} />
    </g>
  );
}

function Speed() {
  const line = { fill: "none", stroke: "var(--character-2)", strokeWidth: 2.2, strokeLinecap: "round" as const };
  return (
    <g data-prop="speed">
      <path d="M-9 12 H4" style={line} />
      <path d="M-12 19.5 H1.5" style={{ ...line, strokeOpacity: 0.8 }} />
      <path d="M-8 27 H3" style={{ ...line, strokeOpacity: 0.6 }} />
      <g style={{ fill: "var(--character-3)", fillOpacity: 0.55 }}>
        <circle cx={11} cy={50.5} r={1.6} />
        <circle cx={6.5} cy={49} r={1.1} />
        <circle cx={3} cy={50.8} r={0.8} />
      </g>
    </g>
  );
}

/** The figure as a group, for a scene that composes several in one drawing. */
export function FigureGroup({ eyes = "open", mouth = "smile", arms = "rest", legs = "rest", lean = 0, gaze = { x: 0, y: 0 }, props = [], light = LIGHT, id = "figure", whirl = false, limbs = true, halftone = false }: FigureProps) {
  const shine = lit(light, lean);
  return (
    <g data-part="figure" style={lean ? { ...FROM_FLOOR, transform: `rotate(${lean}deg)` } : FROM_FLOOR}>
      <g {...(whirl ? { "data-part": "whirl", style: FROM_MIDDLE } : {})}>
      <defs>
        <linearGradient id={`${id}-body`} x1={round(shine.gradient.x1)} y1={round(shine.gradient.y1)} x2={round(shine.gradient.x2)} y2={round(shine.gradient.y2)}>
          <stop offset="0" style={{ stopColor: "var(--character-hero-from)" }} />
          <stop offset="1" style={{ stopColor: "var(--character-hero-to)" }} />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1={round(shine.gradient.x1)} y1={round(shine.gradient.y1)} x2={round(shine.gradient.x2)} y2={round(shine.gradient.y2)}>
          <stop offset="0" style={{ stopColor: "var(--character-hero-edge-light)" }} />
          <stop offset="1" style={{ stopColor: "var(--character-hero-edge-deep)" }} />
        </linearGradient>
      </defs>
      {limbs ? <Limbs arms={arms} legs={legs} holding={props.includes("case")} /> : null}
      <g data-part="body">
        <path d={DIAMOND} style={{ fill: `url(#${id}-body)`, stroke: `url(#${id}-edge)`, strokeWidth: 2.2, strokeLinejoin: "round" }} />
        {halftone ? (
          <>
            <Halftone />
            {/* The edge again over the dots, so the screen stops at its inner side. */}
            <path d={DIAMOND} style={{ fill: "none", stroke: `url(#${id}-edge)`, strokeWidth: 2.2, strokeLinejoin: "round" }} />
          </>
        ) : null}
      </g>
      {/* The book is held in front of the body and under the hands that close on it (D268). */}
      {props.includes("book") ? <Book /> : null}
      {/* The front part of arms that leave from behind the body (D304), then the hands in front (D302). */}
      {(limbs ? ARMS[arms] : []).filter((arm) => arm.overlay).map((arm, index) => (
        <g key={`front-${index}`} data-part="arm" data-pose={arms}>
          <path data-part="reach" d={arm.overlay} pathLength={1} style={line} />
        </g>
      ))}
      {(limbs ? ARMS[arms] : []).filter((arm) => arm.handOver).map((arm, index) => (
        <circle key={`hand-${index}`} data-part="hand" cx={arm.hand[0]} cy={arm.hand[1]} r={1.9} style={{ fill: LIMB, ...FROM_MIDDLE }} />
      ))}
      {(limbs ? ARMS[arms] : []).filter((arm) => arm.over).map((arm, index) => (
        <Arm key={index} pose={arms} arm={arm} />
      ))}
      {/* The gloss: where the surface faces halfway between the light and the eye, slanted along the lit edge, and one dot
          beside it. A third, smaller spot inside the gloss read as a second, lighter circle and was taken off (D243). */}
      <g data-part="gloss">
        <ellipse cx={round(shine.gloss.cx)} cy={round(shine.gloss.cy)} rx={5.2} ry={3.2} transform={`rotate(${shine.gloss.angle} ${round(shine.gloss.cx)} ${round(shine.gloss.cy)})`} style={{ fill: GLOSS }} />
        <circle cx={round(shine.dot.cx)} cy={round(shine.dot.cy)} r={1.9} style={{ fill: GLOSS }} />
      </g>
      {props.includes("suit") ? <Suit /> : null}
      <g data-part="face">
        <EyesOf eyes={eyes} gaze={gaze} id={id} />
        <MouthOf mouth={mouth} />
      </g>
      {props.includes("case") ? <Case id={id} /> : null}
      {props.includes("cap") ? <Cap /> : null}
      {props.includes("rook") ? <Rook /> : null}
      </g>
    </g>
  );
}

/** The figure in its own box. */
export function Figure({ className, ...figure }: FigureProps & Readonly<{ className?: string }>) {
  return (
    <svg aria-hidden focusable="false" viewBox={`0 0 ${FIGURE_BOX.width} ${figure.limbs === false ? HEAD_HEIGHT : FIGURE_BOX.height}`} data-character="diamond" className={className} style={{ overflow: "visible" }}>
      {/* The speed lines trail the runner on the ground's own level: outside the group that leans (D268). */}
      {figure.props?.includes("speed") ? <Speed /> : null}
      <FigureGroup {...figure} />
    </svg>
  );
}

export type SceneName = "home" | "gifts" | "me";

/**
 * The three destinations' scenes (the founder, 25 Sep 2026): Home, the figure in a suit with its case; Gifts, the
 * figure with an arm on a second one's shoulder; Me, arms crossed behind sunglasses.
 */
export function Scene({ which, className, children }: Readonly<{ which: SceneName; className?: string; children?: ReactNode }>) {
  if (which === "gifts") {
    return (
      <svg aria-hidden focusable="false" viewBox="0 0 118 53" data-character="diamond" className={className} style={{ overflow: "visible" }}>
        {/* The second first, a little smaller and on the same floor, so the first's arm lies over its shoulder. */}
        <g transform="translate(58 5.3) scale(0.9)">
          <FigureGroup id="gifts-two" mouth="soft" gaze={{ x: -0.6, y: -0.3 }} halftone />
        </g>
        <FigureGroup id="gifts-one" arms="shoulder" mouth="grin" gaze={{ x: 0.6, y: 0 }} halftone />
        {children}
      </svg>
    );
  }
  // Every figure of the rig wears the landing's halftone (D262): one material, whatever the scene.
  if (which === "home") return <Figure className={className} id="home" arms="hold" mouth="soft" props={["suit", "case"]} halftone />;
  return <Figure className={className} id="me" eyes="shades" mouth="grin" arms="crossed" halftone />;
}
