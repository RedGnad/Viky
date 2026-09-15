/**
 * Viky's drop: one round creature with a handful of faces.
 *
 * A whole illustrated world is not buildable in the time there is, and a borrowed one is not ours to borrow:
 * the game the funder pointed at belongs to Sony, so what is taken from it is its principles, round shapes
 * and plain joy, and never its characters. A single drop with five expressions does the work an illustration
 * set would, and it is forty lines rather than a commission.
 *
 * It is decoration and says so: `aria-hidden`, because every one of these moments already carries the same
 * meaning in words beside it. Colour is never the only carrier and neither is a face.
 */

export type Mood = "happy" | "cheering" | "waiting" | "sorry" | "resting";

export function Drop({ mood = "happy", size = 72 }: Readonly<{ mood?: Mood; size?: number }>) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={mood === "cheering" ? "viky-bob" : undefined}
    >
      {/* Not a circle: a drop, slightly heavier at the bottom, the way a soft thing sits. */}
      <path
        d="M50 8c20 0 34 16 36 32 2 18-10 34-30 36-3 .3-6 .3-9 0-20-2-32-18-30-36C19 24 30 8 50 8Z"
        fill="var(--accent)"
        stroke="var(--text)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <Face mood={mood} />
    </svg>
  );
}

function Face({ mood }: { mood: Mood }) {
  // The face sits on the accent fill, so it takes the colour measured against that fill. The text colour it used to
  // take is cream at night, on an acid green, where the face all but vanished.
  const eye = "var(--on-accent)";
  if (mood === "resting") {
    return (
      <g stroke={eye} strokeWidth="3.5" strokeLinecap="round" fill="none">
        <path d="M34 47c3-4 8-4 11 0" />
        <path d="M55 47c3-4 8-4 11 0" />
        <path d="M42 62c5 3 11 3 16 0" />
      </g>
    );
  }
  return (
    <g fill={eye}>
      <ellipse cx="39" cy="46" rx="4.5" ry={mood === "sorry" ? 3.5 : 5.5} />
      <ellipse cx="61" cy="46" rx="4.5" ry={mood === "sorry" ? 3.5 : 5.5} />
      <Mouth mood={mood} />
    </g>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  const stroke = "var(--on-accent)";
  switch (mood) {
    case "cheering":
      // Wide open, which is the only one that reads as a shout rather than a smile.
      return <path d="M38 58c0 8 5 13 12 13s12-5 12-13Z" fill={stroke} />;
    case "waiting":
      return <path d="M43 63h14" stroke={stroke} strokeWidth="3.5" strokeLinecap="round" fill="none" />;
    case "sorry":
      return <path d="M42 66c5-5 11-5 16 0" stroke={stroke} strokeWidth="3.5" strokeLinecap="round" fill="none" />;
    default:
      return <path d="M40 60c4 6 16 6 20 0" stroke={stroke} strokeWidth="3.5" strokeLinecap="round" fill="none" />;
  }
}
