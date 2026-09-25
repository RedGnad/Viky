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
export type Mouth = "smile" | "grin" | "o" | "flat";
export type ArmsPose = "rest" | "crossed" | "hold" | "wave" | "run" | "shoulder";
export type LegsPose = "rest" | "run" | "apart";
export type Prop = "suit" | "case";

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
 * Each pose of the arms: a path for each arm, its hand, and a turn from the joint; the left arm first. An arm that
 * hangs is drawn under the body, so its joint is hidden; one that rises or crosses is drawn over it, or it would be.
 */
const ARMS: Record<ArmsPose, readonly Readonly<{ d: string; hand: readonly [number, number]; turn?: number; over?: boolean }>[]> = {
  rest: [
    { d: "M13 26 Q12 30.7 13 35.4", hand: [13, 37.2] },
    { d: "M51 26 Q52 30.7 51 35.4", hand: [51, 37.2] },
  ],
  // The two hands at one height (the founder, 25 Sep 2026, D244: 1.4 apart read as a lopsided figure); the forearms
  // still pass at two heights in the middle, so the two lines cross rather than merge into one band.
  crossed: [
    { d: "M13 25.5 C12 29 20 30.2 36.5 30", hand: [37.2, 30], over: true },
    { d: "M51 25.5 C52 29 44 32 27.5 30", hand: [26.8, 30], over: true },
  ],
  hold: [
    { d: "M13 26 Q12 30.7 13 35.4", hand: [13, 37.2] },
    { d: "M51 26 Q52.4 31 52 36", hand: [52, 37.8] },
  ],
  wave: [
    { d: "M13 26 Q12 30.7 13 35.4", hand: [13, 37.2], turn: 150, over: true },
    { d: "M51 26 Q52 30.7 51 35.4", hand: [51, 37.2] },
  ],
  run: [
    { d: "M13 26 Q12 30.7 13 35.4", hand: [13, 37.2], turn: 75 },
    { d: "M51 26 Q52 30.7 51 35.4", hand: [51, 37.2], turn: -20 },
  ],
  shoulder: [
    { d: "M13 26 Q12 30.7 13 35.4", hand: [13, 37.2] },
    { d: "M51 26 C57 24.5 65 19.5 72 16.5", hand: [72.8, 16.1], over: true },
  ],
};
const LEGS: Record<LegsPose, readonly Readonly<{ turn: number }>[]> = {
  rest: [{ turn: 0 }, { turn: 0 }],
  run: [{ turn: 35 }, { turn: -15 }],
  apart: [{ turn: 10 }, { turn: -10 }],
};
const LEG_PATHS = [
  { d: "M23.5 30 Q21.6 40.75 21.7 51.5", foot: "M21.7 51.5 H18.5" },
  { d: "M40.5 30 Q42.4 40.75 42.3 51.5", foot: "M42.3 51.5 H45.5" },
] as const;

const line = { fill: "none", stroke: LIMB, strokeWidth: 1.8, strokeLinecap: "round" as const };

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
        <Arm key={index} pose={arms} arm={arm} hand={!(holding && arms === "hold" && index === 1)} />
      ))}
      {LEGS[legs].map((leg, index) => (
        <g key={index} data-part="leg" data-pose={legs} style={leg.turn ? { ...FROM_JOINT, transform: `rotate(${leg.turn}deg)` } : FROM_JOINT}>
          <path d={LEG_PATHS[index].d} style={line} />
          <path d={LEG_PATHS[index].foot} style={line} />
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
          <circle key={x} data-part="eye" cx={x} cy={y} r={2.8} style={{ fill: INK, ...FROM_MIDDLE }} />
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
 * in the body's own deeper colour (`--character-hero-to`) multiplied at 45 %, so it reads as the material of the body
 * rather than a grey screen laid on it. The dots are drawn as round-capped zero-length strokes, one path per size, so a
 * thousand dots are eight elements and a few kilobytes, not a thousand circles.
 */
const HALFTONE = { step: 1.2, from: 0.06, to: 0.42, sizes: 8 } as const;
function Halftone({ id }: Readonly<{ id: string }>) {
  const paths = Array.from({ length: HALFTONE.sizes }, () => [] as string[]);
  for (let row = 0, y = 4; y <= 36; row += 1, y += HALFTONE.step * 0.866) {
    for (let x = 3 + (row % 2) * (HALFTONE.step / 2); x <= 61; x += HALFTONE.step) {
      // Inside the diamond, with a dot's width to spare for the clip to finish.
      if (Math.abs(x - CENTRE.x) / 29 + Math.abs(y - CENTRE.y) / 16 > 1.05) continue;
      // 0 where the light falls (top left), 1 on the far side, as the gloss reads the same light.
      const along = Math.min(1, Math.max(0, 0.5 + ((x - CENTRE.x) / 29 + (y - CENTRE.y) / 16) / 4));
      paths[Math.min(HALFTONE.sizes - 1, Math.floor(along * HALFTONE.sizes))].push(`M${round(x)} ${round(y)}h0`);
    }
  }
  return (
    <g data-part="halftone" clipPath={`url(#${id}-screen)`} style={{ opacity: 0.45, mixBlendMode: "multiply" }}>
      <defs>
        <clipPath id={`${id}-screen`}>
          <path d={DIAMOND} />
        </clipPath>
      </defs>
      {paths.map((dots, size) => {
        const radius = HALFTONE.from + ((size + 0.5) / HALFTONE.sizes) * (HALFTONE.to - HALFTONE.from);
        return <path key={size} d={dots.join("")} style={{ fill: "none", stroke: "var(--character-hero-to)", strokeWidth: round(radius * 2), strokeLinecap: "round" }} />;
      })}
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
            <Halftone id={id} />
            {/* The edge again over the dots, so the screen stops at its inner side. */}
            <path d={DIAMOND} style={{ fill: "none", stroke: `url(#${id}-edge)`, strokeWidth: 2.2, strokeLinejoin: "round" }} />
          </>
        ) : null}
      </g>
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
      </g>
    </g>
  );
}

/** The figure in its own box. */
export function Figure({ className, ...figure }: FigureProps & Readonly<{ className?: string }>) {
  return (
    <svg aria-hidden focusable="false" viewBox={`0 0 ${FIGURE_BOX.width} ${figure.limbs === false ? HEAD_HEIGHT : FIGURE_BOX.height}`} data-character="diamond" className={className} style={{ overflow: "visible" }}>
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
          <FigureGroup id="gifts-two" mouth="smile" gaze={{ x: -0.6, y: -0.3 }} />
        </g>
        <FigureGroup id="gifts-one" arms="shoulder" mouth="grin" gaze={{ x: 0.6, y: 0 }} />
        {children}
      </svg>
    );
  }
  if (which === "home") return <Figure className={className} id="home" arms="hold" props={["suit", "case"]} />;
  return <Figure className={className} id="me" eyes="shades" mouth="grin" arms="crossed" />;
}
