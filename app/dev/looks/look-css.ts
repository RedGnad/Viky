import { contrastRatio, NON_TEXT_CONTRAST_MINIMUM } from "@/src/contrast";
import { LOOKS, MOTION, type Appearance, type Look, type LookId } from "@/src/design-tokens";

/**
 * A look, as the stylesheet the laboratory's frame reads. Every value comes from `LOOKS` and `MOTION` in
 * src/design-tokens.ts, and every rule is scoped to the frame (`.viky-lab`), so nothing here can reach a product
 * screen: app/globals.css still defines the one look the product wears, and this only overrides its variables inside
 * the frame. The kit reads variables, so the same kit wears each look without a class of it changing.
 *
 * Day and night follow the device, as the product will (brief, section 7), unless the frame is told which to show.
 */

export function lookById(id: string): Look | undefined {
  return LOOKS.find((look) => look.id === id);
}

export const LOOK_IDS = LOOKS.map((look) => look.id) as readonly LookId[];

function declarations(look: Look, appearance: Appearance, nightAccent?: string): string {
  const c = appearance === "dark" && nightAccent ? { ...look.colours.dark, accent: nightAccent } : look.colours[appearance];
  const navEdge = contrastRatio(c.accent, c.surface) >= NON_TEXT_CONTRAST_MINIMUM ? "transparent" : c.controlBorder;
  return [
    `--background: ${c.background};`,
    `--surface: ${c.surface};`,
    `--text: ${c.text};`,
    `--muted: ${c.muted};`,
    `--accent: ${c.accent};`,
    `--on-accent: ${c.onAccent};`,
    `--accent-text: ${c.accentText};`,
    `--control-border: ${c.controlBorder};`,
    `--divider: ${c.divider};`,
    // Declared again here because app/globals.css declares it from --divider on :root, where it resolves to the product's.
    `--card-border: ${c.divider};`,
    `--control-relief: ${c.relief ? `0 ${look.reliefDepth}px 0 ${c.relief}` : "none"};`,
    `--lab-relief-colour: ${c.relief ?? "transparent"};`,
    `--character-1: ${c.character1};`,
    `--character-2: ${c.character2};`,
    `--character-3: ${c.character3};`,
    `--character-face: ${c.face};`,
    `--character-shadow: ${c.shadow};`,
    `--character-shadow-opacity: ${c.shadowOpacity};`,
    // Where the accent fill is under 3:1 on a ground, the primary button keeps its ink edge; elsewhere the edge is the fill.
    `--lab-accent-edge: ${look.accentEdge[appearance] === "ink" ? c.controlBorder : c.accent};`,
    // The active destination's pill sits on the surface: an ink edge only where the fill is under 3:1 against it.
    `--lab-nav-edge: ${navEdge};`,
    `color-scheme: ${appearance};`,
  ].join(" ");
}

/**
 * One look's variables: day by default, night when the device is dark or the frame asks for night. `nightAccent` tries
 * another accent after dark, and nothing else: a trial of the night sun (NIGHT_SUN_TRIALS).
 */
export function lookStylesheet(look: Look, nightAccent?: string): string {
  const frame = `.viky-lab[data-lab-look="${look.id}"]`;
  const face = look.type.face === "bricolage" ? "var(--font-bricolage)" : "var(--font-fredoka)";
  const { compact, expanded } = look.type.display;
  return [
    `${frame} { ${declarations(look, "light")} --font-title: ${face}; --font-title-weight: ${look.type.titleWeight}; --type-display: ${compact.size}px; --type-display-leading: ${compact.lineHeight}px; --lab-relief-depth: ${look.reliefDepth}px; }`,
    `@media (min-width: 840px) { ${frame} { --type-display: ${expanded.size}px; --type-display-leading: ${expanded.lineHeight}px; } }`,
    `@media (prefers-color-scheme: dark) { ${frame}:not([data-lab-appearance="day"]) { ${declarations(look, "dark", nightAccent)} } }`,
    `${frame}[data-lab-appearance="night"] { ${declarations(look, "dark", nightAccent)} }`,
  ].join("\n");
}

const PRESSABLE = `:is(a, button)[class*="--control-relief"]`;

/**
 * What every look shares in the frame: the ground, the ink links, the accent's edge, the press, the hover, and the
 * amount that never breaks. The press and the hover are the movements a stylesheet plays, because they answer a finger
 * and a pointer: the relief collapses and the button travels its depth, or sinks a little in a look with no relief; a
 * pointer lifts it (brief, section 6). Under reduced motion the relief still gives way under the finger, but nothing
 * travels.
 */
export function labStylesheet(): string {
  const press = `${MOTION.press.durationMs}ms ${MOTION.press.easing}`;
  return [
    `.viky-lab { background: var(--background); color: var(--text); min-height: 100dvh; }`,
    `.viky-lab [class*="bg-[var(--accent)]"][class*="border-[var(--control-border)]"]:not(:disabled) { border-color: var(--lab-accent-edge); }`,
    `.viky-lab nav [class*="bg-[var(--accent)]"] { box-shadow: inset 0 0 0 2px var(--lab-nav-edge); }`,
    // Links are ink, underlined, in all three looks (brief, section 4).
    `.viky-lab main :is(a, button)[class*="text-[var(--accent-text)]"] { text-decoration-line: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }`,
    `.viky-lab ${PRESSABLE} { transition: transform ${press}, box-shadow ${press}; }`,
    `.viky-lab ${PRESSABLE}:active:not(:disabled) { transform: translateY(var(--lab-relief-depth)); box-shadow: 0 0 0 0 transparent; }`,
    `.viky-lab[data-lab-relief="none"] ${PRESSABLE}:active:not(:disabled) { transform: scale(0.97); }`,
    // A pointer over a button lifts it, and its relief grows by as much. A finger has no hover, so this never says anything.
    `@media (hover: hover) and (pointer: fine) { .viky-lab ${PRESSABLE}:hover:not(:active):not(:disabled) { transform: translateY(-${MOTION.hover.lift}px); box-shadow: 0 calc(var(--lab-relief-depth) + ${MOTION.hover.lift}px) 0 var(--lab-relief-colour); transition-duration: ${MOTION.hover.durationMs}ms; } }`,
    // The amount at display size never breaks: the symbol and the number on one line, and the size gives way first.
    `.viky-lab .lab-amount-box { container-type: inline-size; }`,
    `.viky-lab .lab-amount { white-space: nowrap; font-size: min(var(--type-display), calc(100cqi / (var(--amount-chars) * 0.62))); line-height: 1.1; }`,
    `@media (prefers-reduced-motion: reduce) { .viky-lab ${PRESSABLE} { transition: none; } .viky-lab ${PRESSABLE}:is(:active, :hover):not(:disabled) { transform: none; } }`,
  ].join("\n");
}
