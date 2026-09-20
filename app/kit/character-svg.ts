import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CHARACTERS, CHARACTER_SHADOW_OPACITY, COLOURS, type Appearance } from "@/src/design-tokens";
import { Character, type CharacterState, type CharacterTone } from "./Character";

/**
 * A character as a standalone SVG, with the look's colours written into it rather than read from a stylesheet.
 *
 * The screens draw characters through CSS variables, which is what lets one drawing wear day and night. Two pictures
 * have no stylesheet at all: the image a messaging app shows under a gift's link, drawn on the server, and the app's
 * icon, drawn once into a file. Both come from this, so there is still one drawing of the gift and not three.
 */
export function characterSvg(
  state: CharacterState,
  { tone = "range", appearance = "light" }: { tone?: CharacterTone; appearance?: Appearance } = {},
): string {
  const values: Record<string, string> = {
    "--character-1": CHARACTERS[appearance].one,
    "--character-2": CHARACTERS[appearance].two,
    "--character-3": CHARACTERS[appearance].three,
    "--character-face": CHARACTERS[appearance].face,
    "--character-shadow": CHARACTERS[appearance].shadow,
    "--character-shadow-opacity": String(CHARACTER_SHADOW_OPACITY[appearance]),
    "--accent": COLOURS[appearance].accent,
    "--on-accent": COLOURS[appearance].onAccent,
    // The juice and the head character's own two colours, which live in the stylesheet and not in the palette: a
    // drawing written into a file has no stylesheet to read them from (D135).
    "--character-gloss": "rgba(255, 255, 255, 0.45)",
    "--character-shade": "rgba(30, 22, 51, 0.12)",
    "--character-hero-edge": appearance === "dark" ? "#3B3266" : "#FFE7A8",
    "--character-hero-from": appearance === "dark" ? COLOURS.dark.accent : CHARACTERS.light.one,
    "--character-hero-to": appearance === "dark" ? CHARACTERS.dark.one : CHARACTERS.light.three,
  };
  return renderToStaticMarkup(createElement(Character, { state, tone, size: "large" })).replace(
    /var\((--[a-z0-9-]+)\)/g,
    (_, name: string) => values[name] ?? "transparent",
  );
}

/** The same drawing as a data URI, which is how a picture drawn on the server carries it. */
export function characterDataUri(state: CharacterState, options?: { tone?: CharacterTone; appearance?: Appearance }): string {
  return `data:image/svg+xml;base64,${Buffer.from(characterSvg(state, options)).toString("base64")}`;
}
