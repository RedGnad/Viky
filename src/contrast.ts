/**
 * The WCAG contrast ratio, so a colour choice is a measurement rather than an opinion.
 *
 * The formula is (L1 + 0.05) / (L2 + 0.05) on relative luminance, and the criterion is 1.4.3 Contrast
 * (Minimum) at level AA: 4.5:1 for normal text, 3:1 for large-scale text. We hold every size to 4.5:1,
 * because our largest text is money and that is the last thing to make harder to read (docs/design/research.md
 * section 1.5 and 6.1).
 *
 * One detail from the criterion that is easy to get wrong: "computed values should not be rounded (e.g.,
 * 4.499:1 would not meet the 4.5:1 threshold)". So nothing here rounds before comparing.
 */

const CHANNEL = 255;

function channelLuminance(value: number): number {
  const c = value / CHANNEL;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function parseHex(hex: string): { r: number; g: number; b: number } {
  const value = hex.trim().replace(/^#/, "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Not a colour: ${hex}`);
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

/** Relative luminance, as WCAG defines it. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** The ratio between two colours, from 1:1 to 21:1. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const one = relativeLuminance(a);
  const two = relativeLuminance(b);
  const lighter = Math.max(one, two);
  const darker = Math.min(one, two);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 1.4.3 at AA for text of any size, which is the bar we hold ourselves to. */
export const TEXT_CONTRAST_MINIMUM = 4.5;
/** 1.4.11 Non-text Contrast at AA: what it takes to identify a control or its state. */
export const NON_TEXT_CONTRAST_MINIMUM = 3;

export function meetsTextContrast(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= TEXT_CONTRAST_MINIMUM;
}
