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
 * The widest a line of prose may be. Material says 40 to 60 characters, web.dev 45 to 75 with "the
 * 66-character line ... widely regarded as ideal", NN/g 50 to 75.
 *
 * 66 rather than 60, and the trade-off is stated rather than smoothed: it is web.dev's own stated ideal and
 * sits inside NN/g's range, and it is six characters past the ceiling Material publishes. Sixty was the value
 * inside all three, which is the safer claim and the narrower column; 66 is the one two of the three call
 * best. `ch` is what web.dev asks for over a pixel width, because it scales with the reader's own font size.
 */
export const PROSE_MAX_CH = 66;

/**
 * How wide a **journey** gets, at any size. A journey is one thing at a time with a way back, so it stays a
 * narrow column on a large screen rather than stretching: 480 CSS pixels is about 53 characters at a 16 pixel
 * body, comfortably inside every published line-length range.
 *
 * This used to be the width of the whole product, which made Viky mobile only rather than mobile first: a
 * narrow strip floating in the middle of a desktop screen, with the other two thirds of it empty. A line
 * length is a rule about text and about forms. It was never a rule about a container.
 */
export const APP_COLUMN_MAX = 480;

/**
 * How wide a **destination** gets, and where it becomes two panes. A destination is the home and a gift: a
 * person reads them rather than walks through them, and there is more than one thing worth seeing at once.
 *
 * Both breakpoints are chosen from what the content needs, which is what web.dev asks for ("choose your
 * breakpoints based on your content rather than popular device sizes"), and both happen to land on a
 * boundary Material publishes, which is a good sign rather than the reason:
 *
 * - **600**: Material's compact-to-medium boundary, and where our margin grows from 16 to 24. Below it,
 *   giving up 16 more pixels of a 375 pixel screen to margin is a tenth of the line.
 * - **840**: the first width where two panes actually fit. Material's own default for a fixed pane is 360 and
 *   its spacer is 24, so two of them plus two 24 margins is 792. Anything narrower is two cramped columns
 *   pretending to be a layout.
 */
export const DESTINATION_MAX = 680;
export const TWO_PANE_FROM = 840;

/** The smallest width the layout must survive, from WCAG 1.4.10 Reflow: 320 CSS pixels, no sideways scroll. */
export const REFLOW_MIN_WIDTH = 320;

export type Appearance = "light" | "dark";

/**
 * Three colours per appearance, and not one more, each deduced from a role (the product structure of 17 Sep
 * 2026, section 7): the ground the page is, the surface that groups words, the ink they are set in, and the one
 * accent, reserved for the primary button and the active destination of the bar. NN/g: "Limit your palette to
 * three colors" and "Reserve the accent color for what you want to stand out the most". Material: surface "for
 * backgrounds and large, low-emphasis areas", primary "for the most prominent components ... high-emphasis
 * buttons, and active states". Apple: "Refrain from adding color to the background of multiple controls".
 *
 * By day it is direction 1, chosen on 15 Sep: cream ground, plum ink, tomato accent. By night the same three
 * roles, an indigo ground, cream ink, and an accent of the same family as the tomato, chosen by measure: the
 * acid green it replaces was a fourth colour and read as a crypto interface. Every pair is measured by
 * test/design-tokens.test.ts, never picked by eye: words at 4.5:1 on both grounds, a control's edge at 3:1.
 *
 * Retired on 17 Sep as backgrounds, with the audit's four-colour home screen as the reason: the joyful yellow,
 * the four stickers, the five day surfaces. A day says its state in words and by its shape (src/day-states.ts).
 */
export const COLOURS: Record<Appearance, Record<string, string>> = {
  light: {
    /** The ground: warm cream, calm enough to read an amount on. */
    background: "#FFF3D9",
    /** The surface a card, a field, the bar and the rail sit on. */
    surface: "#FFFDF7",
    /** Plum ink: 15.10:1 on the ground, 16.35:1 on a surface. */
    text: "#3B0A2A",
    /** 6.93:1 on the ground, 7.50:1 on a surface. */
    muted: "#72465E",
    /**
     * The tomato fill of the one primary action on a screen, carrying plum words at 5.36:1. The fill itself is
     * 2.82:1 against the cream, so what identifies a button is its plum outline (WCAG 1.4.11).
     */
    accent: "#FF5A36",
    onAccent: "#3B0A2A",
    /** The accent as words, a darker tomato: 6.82:1 on the ground, 7.39:1 on a surface. */
    accentText: "#9E2A14",
    /** A control's edge is the ink itself: 15.10:1. */
    controlBorder: "#3B0A2A",
    /** A card's edge and a rule: 1.36:1, a hairline that groups and never identifies a control. */
    divider: "#EAD6B0",
  },
  dark: {
    background: "#1C1035",
    surface: "#2A1D4E",
    /** Cream ink: 16.69:1 on the ground, 14.17:1 on a surface. */
    text: "#FFF6E9",
    /** 9.66:1 and 8.20:1. */
    muted: "#C4B8E6",
    /**
     * The tomato after dark, one step lighter so it stands off the indigo: indigo words on it at 6.97:1, and the
     * fill itself 6.97:1 against the ground and 5.92:1 against a surface, so at night the fill alone identifies
     * the button. Measured on 17 Sep 2026 against #FF5A36 (5.76 / 4.89) and #FF8A6E (7.76 / 6.58); this is the
     * closest to the day's tomato that clears every pair with room.
     */
    accent: "#FF7A5C",
    onAccent: "#1C1035",
    /** The accent as words, lighter still: 8.31:1 on the ground, 7.05:1 on a surface. */
    accentText: "#FF9478",
    /** Light at night: 16.69:1. */
    controlBorder: "#FFF6E9",
    divider: "#3A2C66",
  },
};

/** Which colours carry text, and must therefore clear 4.5:1 on the ground and on a surface alike. */
export const TEXT_COLOURS = ["text", "muted", "accentText"] as const;
/** Which colours identify a control, and must therefore clear 3:1 on both. */
export const CONTROL_COLOURS = ["controlBorder"] as const;
/** The two things a colour can sit on. Every text colour is measured against both, never just one. */
export const GROUNDS = ["background", "surface"] as const;

/** Where the chosen appearance is kept, so a reload does not flash the other one. */
export const THEME_STORAGE_KEY = "viky.theme";

/**
 * The type of direction 1. Anton, a single-weight condensed face, sets exactly one display title per destination
 * (Gifts, You, the promise without an account) and the mark at the top of every screen; it asks for 400 rather
 * than let the browser invent a bold. DM Sans sets everything else, section titles, amounts and buttons included,
 * at the four levels above. A section title is DM Sans at 22, semibold: Anton at that size read smaller than the
 * text face beside it, and the structure of 17 Sep keeps Anton out of tasks, amounts and buttons altogether.
 */
export const DISPLAY_TYPE = {
  display: { compact: { size: 60, lineHeight: 56 }, expanded: { size: 104, lineHeight: 96 } },
  mark: { size: 28, lineHeight: 32 },
  titleWeight: 400,
} as const;

/** The controls of direction 1: a 2 pixel ink outline and a 6 pixel relief underneath, the pressed key. */
export const CONTROL = { borderWidth: 2, reliefDepth: 6 } as const;

/** A card's edge: a hairline divider. A card groups; it is not a control, so it carries no relief and no ink edge. */
export const CARD = { borderWidth: 1 } as const;

/**
 * The navigation: a bar of three destinations at the bottom below the expanded breakpoint, a rail on the left
 * from it (Material: "Don't use navigation bars for desktop layouts. Instead, use a navigation rail"). The bar is
 * 64 tall, above Material's 48 minimum touch target with the label beneath the icon; the rail is 88 wide, room
 * for an icon and a label of one word.
 */
export const NAV = { barHeight: 64, railWidth: 88, from: TWO_PANE_FROM } as const;
