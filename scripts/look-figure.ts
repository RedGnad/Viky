import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Figure, type FigureProps } from "../app/kit/Figure";

/**
 * The rig drawn with a look's colours written into it, for the pictures that have no stylesheet: the app's icon at
 * night (D253) and the figure of the link previews by day (D265). The colours are read from the stylesheet's own day
 * block and, at night, its night block, a variable naming another followed to its colour, so a picture can never keep
 * a colour the screens have left behind.
 */
export function lookValues(appearance: "light" | "dark"): Record<string, string> {
  const css = readFileSync(resolve("app/globals.css"), "utf8");
  const day = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
  const start = css.indexOf(':root[data-theme="dark"] {');
  const night = css.slice(start, css.indexOf("\n}", start));
  const read = (text: string) => Object.fromEntries([...text.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const values: Record<string, string> = { ...read(day), ...(appearance === "dark" ? read(night) : {}) };
  const resolveOne = (value: string, depth = 0): string => {
    const named = value.match(/^var\((--[a-z0-9-]+)\)$/);
    return named && depth < 8 ? resolveOne(values[named[1]] ?? "transparent", depth + 1) : value;
  };
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, resolveOne(value)]));
}

export function figureInLook(appearance: "light" | "dark", props: FigureProps): string {
  const values = lookValues(appearance);
  const markup = renderToStaticMarkup(createElement(Figure, props));
  return markup.replace(/var\((--[a-z0-9-]+)\)/g, (_, name: string) => values[name] ?? "transparent");
}

/** The figure of the link previews (D265): standing, lit, in the day look, with the halftone every figure wears. */
export const PREVIEW_FIGURE: FigureProps = { id: "preview", halftone: true };

/** The app icon's head (D253, D307): the landing's soft smile and halftone, no limbs. */
export const ICON_FIGURE: FigureProps = { id: "icon", limbs: false, mouth: "soft", halftone: true };

/** The icon's drawing as a module, for the installed app's first opening (src/launch-intro.ts): painted, never fetched. */
export function iconModule(): string {
  return `// Written by \`pnpm make:icon\`: the app icon's drawing in the day look, for the first opening (src/launch-intro.ts).\nexport const FIGURE_ICON_SVG = ${JSON.stringify(figureInLook("light", ICON_FIGURE))};\n`;
}
