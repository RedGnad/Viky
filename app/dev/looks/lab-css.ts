import { CHARACTER_SHADOW_OPACITY, CHARACTERS, COLOURS, RELIEF, type Appearance } from "@/src/design-tokens";

/**
 * The only stylesheet the laboratory still carries. The look itself is the product's, from app/globals.css, and it
 * follows the device: there is one look and nothing here may redefine it. What a laboratory needs on top of that is a
 * way to be shown the other appearance without a second device, so a board can hold the day and the night of a screen
 * side by side.
 *
 * So exactly two rules, both scoped to the frame (`.viky-lab`), both built from src/design-tokens.ts under the names
 * app/globals.css gives them: a frame told to wear the day, and a frame told to wear the night. Each one paints its own
 * ground, because the document's ground is still whichever one the device asked for.
 */

/** What a frame is told to wear, and which appearance of the tokens that is. */
const FORCED: Record<"day" | "night", Appearance> = { day: "light", night: "dark" };

function declarations(appearance: Appearance): string {
  const colour = COLOURS[appearance];
  const character = CHARACTERS[appearance];
  return [
    `--background: ${colour.background};`,
    `--surface: ${colour.surface};`,
    `--text: ${colour.text};`,
    `--muted: ${colour.muted};`,
    `--accent: ${colour.accent};`,
    `--on-accent: ${colour.onAccent};`,
    `--accent-text: ${colour.accentText};`,
    `--control-border: ${colour.controlBorder};`,
    `--divider: ${colour.divider};`,
    // Declared again because globals.css declares it from the divider on :root, where it resolves to the device's.
    `--card-border: ${colour.divider};`,
    `--character-1: ${character.one};`,
    `--character-2: ${character.two};`,
    `--character-3: ${character.three};`,
    `--character-face: ${character.face};`,
    `--character-shadow: ${character.shadow};`,
    `--character-shadow-opacity: ${CHARACTER_SHADOW_OPACITY[appearance]};`,
    `--control-relief-colour: ${RELIEF[appearance]};`,
    `color-scheme: ${appearance};`,
    // The document paints the appearance the device asked for, so a frame told otherwise paints its own ground.
    `background: var(--background);`,
    `color: var(--text);`,
    `min-height: 100dvh;`,
  ].join(" ");
}

/** The two rules a frame reads when it is told which appearance to wear. Nothing else: the look is globals.css. */
export function appearanceStylesheet(): string {
  return (Object.keys(FORCED) as Array<keyof typeof FORCED>)
    .map((forced) => `.viky-lab[data-lab-appearance="${forced}"] { ${declarations(FORCED[forced])} }`)
    .join("\n");
}
