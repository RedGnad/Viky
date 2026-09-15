/**
 * The one place a measurement becomes a value.
 *
 * Every number here is traced to whoever published it in `docs/design/research.md`, and every colour pair is
 * measured rather than chosen: `test/design-tokens.test.ts` fails if a text colour drops below 4.5:1 on its
 * own background, if a control's outline drops below 3:1, or if `app/globals.css` stops matching this file.
 * The stylesheet is what the browser reads and this is what the tests read, so the test between them is the
 * only thing stopping the two from drifting.
 *
 * The colours are the art direction the funder chose, and they were swapped in without touching a single
 * measurement above them: no spacing, no size, no target and no breakpoint moved. That was the point of
 * building the foundation on neutral colours first, and it is now demonstrated rather than claimed.
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

/**
 * Material's shape scale, the steps we use. The round end of it, because the art direction is round: 16, 28
 * and 48 are all published steps (large, extra large, extra extra large), so the world can be blobby without
 * a single invented radius.
 */
export const RADIUS = { control: 16, card: 28, sheet: 48, full: 9999 } as const;

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
 * The art direction the funder chose: a bright, round, daylit world, and the same world after dark.
 *
 * It is built the way both published systems say a saturated palette stays legible, which is not by toning it
 * down. Apple: apply colour "to the background rather than to symbols or text", and never let colour be the
 * only carrier of meaning. Material: every surface is paired with a foreground colour chosen against it. So
 * the colour lives in the ground and in the shapes, the words sit on a calm surface, and every pair below is
 * measured rather than picked.
 *
 * Three of these were chosen by eye first and failed: the obvious bright red gave white text 3.96:1, the
 * first outline gave 2.74:1 on the yellow ground, and the first green gave 4.36:1 at night. That is what the
 * measurement is for, and it is why a theme can be swapped without anybody having to be careful.
 */
export const COLOURS: Record<Appearance, Record<string, string>> = {
  light: {
    /** The page itself, which is a colour rather than an absence of one. */
    background: "#FFD84D",
    /** What carries words: near white, warm, so the yellow does not sit under a paragraph. */
    surface: "#FFFDF5",
    /** 12.39:1 on the ground, 16.83:1 on a surface. */
    text: "#241A05",
    /** 5.49:1 on the ground, 7.45:1 on a surface. */
    muted: "#5C5340",
    /**
     * The bright fill of the action a screen is asking for, carrying dark words at 6.62:1. Its own contrast
     * against the page is only 1.87:1, which is why the button also has an outline: what identifies a control
     * may not rest on a fill that pale against its ground (WCAG 1.4.11).
     */
    accent: "#FF7A3D",
    onAccent: "#241A05",
    /**
     * The same idea used as words rather than as a fill, which is a different job and needs a different
     * colour: 5.67:1 on the ground and 7.70:1 on a surface. Trying to make one colour do both is how an
     * accent ends up either unreadable as text or drab as a button.
     */
    accentText: "#962D0E",
    /** 3.64:1 on the ground, 4.94:1 on a surface, so a control is identifiable wherever it sits. */
    controlBorder: "#776E5E",
    divider: "#E8DFC4",
  },
  dark: {
    background: "#221A38",
    surface: "#332A50",
    /** 14.73:1 on the ground, 11.81:1 on a surface. */
    text: "#F7EFFF",
    /** 8.03:1 and 6.44:1. */
    muted: "#BCAFD4",
    /** Dark words on it at 9.05:1. */
    accent: "#FFB03A",
    onAccent: "#221A38",
    /** As words: 10.19:1 on the ground, 8.17:1 on a surface. */
    accentText: "#FFC061",
    /** 5.48:1 and 4.39:1. */
    controlBorder: "#9A8FB5",
    divider: "#453A63",
  },
};

/**
 * A surface per state of a day, so the row reads at a glance. Colour is never the only carrier: each state
 * also has a mark of its own and a name a screen reader says (src/day-states.ts). Every one of these carries
 * the appearance's own text colour at 4.5:1 or better, which is what makes a bright row safe.
 */
export const DAY_SURFACES: Record<Appearance, Record<string, string>> = {
  light: { settled: "#7FD46A", catchable: "#7FC4F5", aboutToReturn: "#FFA95C", today: "#FF9BC4", toCome: "#FFFDF5" },
  dark: { settled: "#2F6427", catchable: "#2F6C96", aboutToReturn: "#8A5320", today: "#8C3D60", toCome: "#332A50" },
};

/** Which colours carry text, and must therefore clear 4.5:1 on the ground and on a surface alike. */
export const TEXT_COLOURS = ["text", "muted", "accentText"] as const;
/** Which colours identify a control, and must therefore clear 3:1 on both. */
export const CONTROL_COLOURS = ["controlBorder"] as const;
/** The two things a colour can sit on. Every text colour is measured against both, never just one. */
export const GROUNDS = ["background", "surface"] as const;

/** Where the chosen appearance is kept, so a reload does not flash the other one. */
export const THEME_STORAGE_KEY = "viky.theme";
