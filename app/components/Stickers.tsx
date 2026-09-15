/**
 * The poster look's picture: four stickers stuck on at an angle, each with the look's outline. Every colour is a
 * variable from app/globals.css, so this one drawing is the day one and the night one, and its outlines turn light
 * after dark without the drawing knowing.
 *
 * Decoration, and it says so: `aria-hidden`, because the words beside it already say everything it shows.
 */

/** A star or a starburst as one closed path: outer and inner points in turn around a centre. */
function burst(cx: number, cy: number, outer: number, inner: number, spikes: number): string {
  const points = Array.from({ length: spikes * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI * index) / spikes - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  });
  return `M${points.join(" L")}Z`;
}

const OUTLINE = { stroke: "var(--sticker-outline)", strokeWidth: 3, strokeLinejoin: "round" } as const;

/** Six petals around a centre, computed once so every render draws the same flower. */
const PETALS = [0, 1, 2, 3, 4, 5].map((petal) => ({
  cx: Number((28 * Math.cos((petal * Math.PI) / 3)).toFixed(1)),
  cy: Number((28 * Math.sin((petal * Math.PI) / 3)).toFixed(1)),
}));

export function Stickers() {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 400 380" className="mx-auto w-full max-w-[420px]">
      <g transform="rotate(-10 130 130)">
        <path d={burst(130, 130, 96, 76, 24)} fill="var(--sticker-sun)" {...OUTLINE} />
        <path d="M130 162c-34-22-44-40-34-56 9-14 27-12 34 4 7-16 25-18 34-4 10 16 0 34-34 56Z" fill="var(--accent)" {...OUTLINE} />
      </g>
      <g transform="rotate(9 290 120)">
        <path
          d="M246 78c10-34 70-40 86-6 34 2 44 50 14 66 6 34-40 54-64 30-30 14-68-10-56-44-26-14-14-54 20-46Z"
          fill="var(--sticker-pink)"
          {...OUTLINE}
        />
        <path d={burst(290, 118, 30, 13, 5)} fill="var(--background)" {...OUTLINE} />
      </g>
      <g transform="rotate(-6 260 290)">
        <rect x="150" y="238" width="220" height="104" rx="52" fill="var(--sticker-mint)" {...OUTLINE} />
        <circle cx="206" cy="290" r="30" fill="var(--sticker-pink)" {...OUTLINE} />
        <circle cx="206" cy="290" r="16" fill="none" {...OUTLINE} />
        <circle cx="276" cy="290" r="30" fill="var(--sticker-lilac)" {...OUTLINE} />
        <circle cx="276" cy="290" r="16" fill="none" {...OUTLINE} />
      </g>
      <g transform="translate(70 300)">
        {PETALS.map((petal) => (
          <circle key={`${petal.cx}-${petal.cy}`} cx={petal.cx} cy={petal.cy} r="22" fill="var(--sticker-lilac)" {...OUTLINE} />
        ))}
        <circle r="16" fill="var(--background)" {...OUTLINE} />
      </g>
    </svg>
  );
}
