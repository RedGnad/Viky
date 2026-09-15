/**
 * The one place a measurement becomes a value.
 *
 * Every number here is traced to whoever published it in `docs/design/research.md`, and every colour pair is
 * measured rather than chosen: `test/design-tokens.test.ts` fails if a text colour drops below 4.5:1 on its
 * own background, if a control's outline drops below 3:1, or if `app/globals.css` stops matching this file.
 * The stylesheet is what the browser reads and this is what the tests read, so the test between them is the
 * only thing stopping the two from drifting.
 *
 * The colours are neutral on purpose. The art direction is the funder's to choose and has not been chosen;
 * it will replace this palette without touching a single measurement below it, because nothing about the
 * layout depends on a hue.
 */

/** Material 3 breakpoints, in CSS pixels (m3.material.io/foundations/layout/breakpoints). */
export const BREAKPOINTS = { compact: 0, medium: 600, expanded: 840, large: 1200, extraLarge: 1600 } as const;

/**
 * The page margin. Material publishes 16 on compact and 24 from medium upward; Apple deleted its own margin
 * tables on 9 Sep 2026 and now refers to a download, so this cites Material alone.
 */
export const PAGE_MARGIN = { compact: 16, medium: 24 } as const;

/**
 * Material's 8dp spacing scale, the steps we actually use. `space100 = 8`. The 4 is Material's 0.5x nested
 * unit and the 12 its 1.5x. Material marks these tokens unavailable for web, so what we take is the
 * published scale, not a token contract it does not offer us.
 */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/**
 * Four levels, no more, because NN/g measured that more than three sizes stops carrying hierarchy and that
 * at most two elements on a screen should be large. The fourth is money, which is the one thing a person
 * opens Viky to read.
 *
 * Sizes are in CSS pixels at the default text size and every one of them exists in a published scale: 32 is
 * NN/g's header ceiling and Material's Headline Large; 22 is Material's Title Large and Apple's Title 2; 16
 * is Material's Body Large, the browser default, and inside NN/g's 14 to 16 body range; 14 is Material's Body
 * Medium and NN/g's floor, well above Apple's 11 and above the 12 the removed Lighthouse audit worried about.
 *
 * Line heights follow Material's guidance: about 1.2x for display and title, about 1.5x for body and label.
 * Body at 1.5 also means the layout already holds what WCAG 1.4.12 asks it to survive.
 */
export const TYPE = {
  money: { size: 32, lineHeight: 40, weight: 600 },
  title: { size: 22, lineHeight: 28, weight: 600 },
  body: { size: 16, lineHeight: 24, weight: 400 },
  help: { size: 14, lineHeight: 20, weight: 400 },
} as const;

/**
 * 48, which is the only number every source agrees on: web.dev and Material both say 48, Apple's Buttons
 * page says at least 44, WCAG 2.5.5 at AAA says 44 and 2.5.8 at AA says 24. The largest satisfies all of
 * them, and it clears the AAA criterion rather than the AA one.
 */
export const TAP_TARGET = 48;

/**
 * Between two stacked controls. web.dev and Material both say 8; Apple says about 12 around an element that
 * has a bezel, which ours do, so 12 is what satisfies all three.
 */
export const TAP_GAP = 12;

/** Material's shape scale, the steps we use (m3.material.io/styles/shape). */
export const RADIUS = { control: 12, card: 16, sheet: 28, full: 9999 } as const;

/**
 * The widest a line of prose may be. Material says 40 to 60 characters, web.dev 45 to 75 with 66 ideal, NN/g
 * 50 to 75. 60 is the widest value inside all three ranges, and `ch` is what web.dev asks for over a pixel
 * width because it scales with the reader's font size.
 */
export const PROSE_MAX_CH = 60;

/**
 * How wide the single column gets on a large screen. No source publishes a number for this, so it is derived
 * rather than cited: 30rem is 480 CSS pixels, which at a 16 pixel body is about 53 characters, inside every
 * line-length range above. So prose can never be too wide, whatever a screen does.
 */
export const APP_COLUMN_MAX = 480;

/** The smallest width the layout must survive, from WCAG 1.4.10 Reflow: 320 CSS pixels, no sideways scroll. */
export const REFLOW_MIN_WIDTH = 320;

export type Appearance = "light" | "dark";

/**
 * Neutral, and measured. `text` and `muted` are held to 4.5:1 on `background`; `controlBorder` is held to
 * 3:1, because WCAG 1.4.11 covers the visual information required to identify a control and a bordered
 * button is identified by its border. `divider` is decorative and has no requirement, which is stated here
 * so nobody later mistakes it for one that failed.
 *
 * What this replaced: a border at 1.48:1. Every secondary button in Viky was failing 1.4.11 and nothing had
 * ever measured it.
 */
export const COLOURS: Record<Appearance, Record<string, string>> = {
  light: {
    background: "#ffffff",
    text: "#171717",
    muted: "#595f6a",
    accent: "#1d4ed8",
    onAccent: "#ffffff",
    controlBorder: "#8a8a93",
    divider: "#e4e4e7",
  },
  dark: {
    background: "#0b0b0c",
    text: "#ededed",
    muted: "#a1a8b3",
    accent: "#60a5fa",
    onAccent: "#0b0b0c",
    controlBorder: "#75757f",
    divider: "#27272a",
  },
};

/** Which colours carry text, and must therefore clear 4.5:1 on the background. */
export const TEXT_COLOURS = ["text", "muted", "accent"] as const;
/** Which colours identify a control, and must therefore clear 3:1. */
export const CONTROL_COLOURS = ["controlBorder"] as const;
