import { CONDITION_ICONS, ICON_BOX, ICON_STROKE, ICON_STROKE_FINE, type ConditionIcon as Icon } from "@/src/condition-icons";

/**
 * The pictogram a condition's line starts with (the founder, 5 Oct 2026): in outline, the text's own colour, a box of
 * 26 pixels, no fill behind it. Decoration: the name beside it carries the meaning, so it is hidden from a reader.
 */
export function ConditionIcon({ icon }: Readonly<{ icon: Icon }>) {
  return (
    <svg
      aria-hidden
      focusable="false"
      data-condition-icon={icon}
      width={ICON_BOX}
      height={ICON_BOX}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-[var(--text)]"
    >
      {CONDITION_ICONS[icon].map((shape, index) =>
        "circle" in shape ? (
          <circle key={index} cx={shape.circle[0]} cy={shape.circle[1]} r={shape.circle[2]} />
        ) : "rect" in shape ? (
          <rect key={index} x={shape.rect[0]} y={shape.rect[1]} width={shape.rect[2]} height={shape.rect[3]} rx={shape.rect[4]} />
        ) : (
          <path key={index} d={shape.path} strokeWidth={shape.fine ? ICON_STROKE_FINE : undefined} />
        ),
      )}
    </svg>
  );
}
