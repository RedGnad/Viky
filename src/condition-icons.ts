/**
 * The pictogram a condition's line starts with, on the sheet where it is chosen (the founder, 5 Oct 2026, validated
 * by him on a picture). One per kind of activity, never the logo of the source: the name carries the meaning, the
 * drawing is decoration.
 *
 * Each is drawn on a square of 24, in outline only: no fill, the text's own colour, a stroke of 1.9 with round ends
 * and round corners. A drawing is a list of shapes, so the sheet and whatever photographs the drawings read the same
 * ones. Browser safe.
 */
export type ConditionIcon = "language" | "rosette" | "code" | "pawn" | "puzzle" | "cube" | "university" | "test" | "watch" | "route" | "flag";

export type IconShape =
  | Readonly<{ path: string; /** A finer stroke, for the lines drawn inside a shape. */ fine?: true }>
  | Readonly<{ circle: readonly [cx: number, cy: number, r: number] }>
  | Readonly<{ rect: readonly [x: number, y: number, width: number, height: number, rx: number] }>;

/** The stroke of every drawing, and the finer one of the lines inside the cube. */
export const ICON_STROKE = 1.9;
export const ICON_STROKE_FINE = 1.2;
/** The box a drawing fills on a line, in pixels. */
export const ICON_BOX = 26;

export const CONDITION_ICONS: Readonly<Record<ConditionIcon, readonly IconShape[]>> = {
  // A speech bubble with a letter in it.
  language: [
    { path: "M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-8l-4 3.5v-3.5h-4a1.5 1.5 0 0 1-1.5-1.5v-8a1.5 1.5 0 0 1 1.5-1.5z" },
    { path: "M9.4 13.6l2.6-5.6 2.6 5.6M10.3 11.7h3.4" },
  ],
  // A rosette and its two ribbons.
  rosette: [{ circle: [12, 9, 5.2] }, { circle: [12, 9, 1.7] }, { path: "M9 13.4L7.6 21l4.4-2.6 4.4 2.6-1.4-7.6" }],
  // Two angle brackets.
  code: [{ path: "M8.5 7l-5 5 5 5M15.5 7l5 5-5 5" }],
  // A chess pawn on its base.
  pawn: [{ circle: [12, 6.3, 2.8] }, { path: "M9 10.6h6M10.2 10.6c0 4-2.6 5-3.2 8h10c-.6-3-3.2-4-3.2-8M6 21h12" }],
  // One piece of a jigsaw: a knob on its top and one on its right.
  puzzle: [{ path: "M4 8.5H8.6A2.2 2.2 0 1 1 11.4 8.5H16V11.1A2.2 2.2 0 1 1 16 13.9V20.5H4Z" }],
  // A cube seen from a corner, each face cut in four.
  cube: [
    { path: "M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z" },
    { path: "M3.5 7.25L12 12l8.5-4.75M12 12v9.5" },
    { path: "M7.75 4.88l8.5 4.74M16.25 4.88l-8.5 4.74M3.5 12l8.5 4.75 8.5-4.75M7.75 9.62v9.5M16.25 9.62v9.5", fine: true },
  ],
  // A building with a pediment and four columns.
  university: [{ path: "M3 9.5L12 4l9 5.5z" }, { path: "M5.6 9.5V17M9.9 9.5V17M14.1 9.5V17M18.4 9.5V17M3.5 17h17M2.5 20.2h19" }],
  // A sheet with its corner folded and a tick on it.
  test: [{ path: "M6.5 3.5h8l4 4v13h-12z" }, { path: "M14.5 3.5v4h4M9 14.2l2.2 2.2 4-4.4" }],
  // A watch on its strap, with a pulse across its face.
  watch: [{ rect: [6, 7, 12, 10, 2.4] }, { path: "M9 7l.8-3.5h4.4L15 7M9 17l.8 3.5h4.4L15 17M8.3 12h1.9l1-2 1.6 4 1-2h1.9" }],
  // A winding way between two points.
  route: [{ circle: [5.5, 18.5, 1.9] }, { circle: [18.5, 5.5, 1.9] }, { path: "M7.4 18.5h6.1a3 3 0 0 0 0-6h-3a3 3 0 0 1 0-6h6.1" }],
  // A flag on its pole.
  flag: [{ path: "M5 21V4M5 4.6h13l-2.6 4 2.6 4H5" }],
};

/** The same drawing as markup, for whatever draws it outside the page (the pictures the founder judges them on). */
export function iconMarkup(icon: ConditionIcon): string {
  return CONDITION_ICONS[icon]
    .map((shape) => {
      if ("circle" in shape) return `<circle cx="${shape.circle[0]}" cy="${shape.circle[1]}" r="${shape.circle[2]}"/>`;
      if ("rect" in shape) return `<rect x="${shape.rect[0]}" y="${shape.rect[1]}" width="${shape.rect[2]}" height="${shape.rect[3]}" rx="${shape.rect[4]}"/>`;
      return `<path d="${shape.path}"${shape.fine ? ` stroke-width="${ICON_STROKE_FINE}"` : ""}/>`;
    })
    .join("");
}
