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
