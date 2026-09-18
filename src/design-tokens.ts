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
 * The look is "Ink and sun", chosen by the founder on 17 Sep 2026 from the three built in the laboratory and from
 * two trials made on the product itself: a cool neutral ground, deep indigo ink, and the sun as the one accent.
 * Between day and night the ground and the ink change places and the sun does not move: the founder's rule, and the
 * practice of the references (Wise and Cash App each keep one brand colour in both modes). The night sun is therefore
 * the day's sun, chosen by eye and then measured at 11.71:1 on the night ground, never derived by a formula.
 *
 * Every pair below is measured by test/design-tokens.test.ts, never picked by eye alone: words at 4.5:1 on both
 * grounds, a control's edge at 3:1. A day says its state in words and by its shape (src/day-states.ts), and the
 * colours of the characters are their own roles (CHARACTERS), never a background and never text.
 */
export const COLOURS: Record<Appearance, Record<string, string>> = {
  light: {
    /** The ground: a cool neutral with almost no chroma, calm enough to read an amount on. */
    background: "#F6F4FB",
    /** The surface a card, a field, the bar and the rail sit on. */
    surface: "#FFFFFF",
    /** Indigo ink: 15.81:1 on the ground, 17.24:1 on a surface. */
    text: "#1E1633",
    /** 6.53:1 on the ground, 7.13:1 on a surface. */
    muted: "#5B5470",
    /**
     * The sun, the fill of the one primary action on a screen, carrying ink words at 10.91:1. The fill itself is
     * 1.45:1 against the ground, so what identifies a button is its ink outline (WCAG 1.4.11), as Cash App builds
     * its green "to work with black text".
     */
    accent: "#FFC531",
    onAccent: "#1E1633",
    /** Links are the ink, underlined, in this look: the accent stays the one thing that fills a button. */
    accentText: "#1E1633",
    /** A control's edge is the ink itself: 15.81:1. */
    controlBorder: "#1E1633",
    /** A card's edge and a rule: 1.23:1, a hairline that groups and never identifies a control. */
    divider: "#E0DCEB",
  },
  dark: {
    background: "#151026",
    surface: "#211A38",
    /** The ink and the ground change places: 16.45:1 on the ground, 14.69:1 on a surface. */
    text: "#F3F0FA",
    /** 8.45:1 and 7.55:1. */
    muted: "#B3ABC9",
    /**
     * The same sun as the day, which is the point: the hero hue does not change between the modes, and an accent
     * this light needs no night value of its own. Measured on 17 Sep 2026 against the two candidates the founder
     * compared on the product (#F7B51B, 10.21:1, and #FFD053, 12.70:1): this one reads 11.71:1 on the night ground
     * and 10.46:1 on a night surface, so after dark the fill alone identifies the button.
     */
    accent: "#FFC531",
    onAccent: "#151026",
    accentText: "#F3F0FA",
    /** Light at night: 16.45:1. */
    controlBorder: "#F3F0FA",
    divider: "#352C52",
  },
};

/** Which colours carry text, and must therefore clear 4.5:1 on the ground and on a surface alike. */
export const TEXT_COLOURS = ["text", "muted", "accentText"] as const;
/** Which colours identify a control, and must therefore clear 3:1 on both. */
export const CONTROL_COLOURS = ["controlBorder"] as const;
/**
 * Where the chosen appearance is kept, so a reload does not flash the other one.
 *
 * It came back on 18 Sep 2026 with the appearance control (D97): the product follows the device until somebody
 * says otherwise, and what they say is remembered here, in their own browser and nowhere else.
 */
export const THEME_STORAGE_KEY = "viky.theme";

/** The two things a colour can sit on. Every text colour is measured against both, never just one. */
export const GROUNDS = ["background", "surface"] as const;

/**
 * The characters' own colours (the art direction brief of 17 Sep 2026, section 5): three secondary colours and no
 * more, living only inside a character, never as text and never as a background. Coral for a day earned and the
 * gift's box, sky for today and the ribbon, lilac for what is to come or went back; none of them is the sun, so a
 * character never competes with the one action on a screen. The face is the ink by day and the ground by night, and
 * clears 7:1 on every one of them. The night values are a step less saturated, because "In dark environments, colors
 * appear bright and saturated" (Apple). Never grey (Duolingo: "never use gray").
 *
 * A character is not held to 3:1 against the ground: a day's state is always said in words beside it (rule D of the
 * product structure), so a body never carries meaning alone. Its face is, against the body.
 */
export const CHARACTERS: Record<Appearance, Record<string, string>> = {
  light: { one: "#FF7F8E", two: "#5AB4FF", three: "#B79BFF", face: "#1E1633", shadow: "#1E1633" },
  dark: { one: "#FF8C98", two: "#6DBDFB", three: "#BBA3FA", face: "#151026", shadow: "#08060F" },
};

/** How much of the shadow's colour shows under a character: a tint of the ink by day, a deeper one at night. */
export const CHARACTER_SHADOW_OPACITY: Record<Appearance, number> = { light: 0.12, dark: 0.45 };

/**
 * The relief under a button, which is what a press collapses (brief, section 6). By day it is the ink, the pressed
 * key of the look. At night it is a shade under the ground, 1.09:1, read as depth: the cream slab the founder saw on
 * the capture of 17 Sep was the ink after dark, and it read as a thick white edge (brief, section 8).
 */
export const RELIEF: Record<Appearance, string> = { light: "#1E1633", dark: "#08060F" };

/**
 * The type of the look. Fredoka, round and geometric, a relative of the characters, sets exactly one display title per
 * destination (Gifts, You, the promise without an account) and the mark at the top of every screen, at 600 rather than
 * letting the browser invent a bold. DM Sans sets everything else, section titles, amounts and buttons included, at
 * the four levels above. Duolingo's rule: past ten words, the text face. The display sizes are the ones Fredoka needs
 * to hold the promise without running past three lines on a phone.
 */
export const DISPLAY_TYPE = {
  display: { compact: { size: 48, lineHeight: 52 }, expanded: { size: 88, lineHeight: 92 } },
  mark: { size: 28, lineHeight: 32 },
  titleWeight: 600,
} as const;

/** The controls: a 2 pixel ink outline and a 4 pixel relief underneath, the pressed key of the look. */
export const CONTROL = { borderWidth: 2, reliefDepth: 4 } as const;

/** A card's edge: a hairline divider. A card groups; it is not a control, so it carries no relief and no hard shadow. */
export const CARD = { borderWidth: 1 } as const;

/**
 * The navigation: a bar of three destinations at the bottom below the expanded breakpoint, a rail on the left
 * from it (Material: "Don't use navigation bars for desktop layouts. Instead, use a navigation rail"). The bar is
 * 64 tall, above Material's 48 minimum touch target with the label beneath the icon; the rail is 88 wide, room
 * for an icon and a label of one word.
 */
export const NAV = { barHeight: 64, railWidth: 88, from: TWO_PANE_FROM } as const;

/**
 * The easing curves and springs the motion is built from, as Material publishes them in its own token files, read on
 * 17 Sep 2026: the web tokens (github.com/material-components/material-web, tokens/versions/latest/sass/
 * _md-sys-motion.scss) for the curves, durations and standard springs, and Jetpack Compose's
 * (github.com/androidx/androidx, compose/material3/.../tokens/ExpressiveMotionTokens.kt) for the expressive springs,
 * which the web tokens do not carry. A spring is a damping ratio and a stiffness on a unit mass; src/motion.ts turns
 * one into a curve a browser can play.
 */
export const EASING = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  standardAccelerate: "cubic-bezier(0.3, 0, 1, 1)",
  standardDecelerate: "cubic-bezier(0, 0, 0, 1)",
  emphasizedAccelerate: "cubic-bezier(0.3, 0, 0.8, 0.15)",
  emphasizedDecelerate: "cubic-bezier(0.05, 0.7, 0.1, 1)",
} as const;

export const SPRING = {
  /** Expressive, fast, for position and size: overshoots by about a tenth, then settles in under half a second. */
  expressiveFastSpatial: { damping: 0.6, stiffness: 800 },
  /** Expressive, default, for position and size: a softer arrival. */
  expressiveDefaultSpatial: { damping: 0.8, stiffness: 380 },
  /** For colour and opacity, in both schemes: critically damped, because those must never overshoot. */
  effects: { damping: 1, stiffness: 1600 },
} as const;

/**
 * The motion of the brief (section 6). The founder's rule of 17 Sep: every movement answers a gesture of the person.
 * The product promises no daily gesture, so a day completing live is seen by nobody; nothing plays on a clock and
 * nothing loops. Four triggers, and no other:
 * - the press: the relief collapses; and the gift character, once, when a gesture succeeds (a gift made, money taken);
 * - the arrival on a screen: what changed since the last visit plays once, in order, the days earned, then the days
 *   gone back, then the amount counting, all of it in under two seconds;
 * - the entry into view while scrolling: a short appearance, once, with nothing behind it moving and no parallax;
 * - the hover, with a pointer only: a character looks at the cursor, a button lifts; never information, because a phone
 *   has no hover (WCAG 1.4.13 governs anything that appears on hover, and nothing here appears).
 *
 * Material's expressive scheme for a day earned and the gift, its standard scheme for the rest, overshoot only on
 * position and size. The personality decides the ties, first word first (brief, section 2: Simple. Warm. Fair. Juicy.):
 * when a movement would stand between a person and a sum, the movement yields, which is why the amount counts last.
 * Everything is skipped when the device asks for reduced motion (WCAG 2.3.3).
 */
export const MOTION = {
  /** A button pressed: the relief collapses and the button travels its depth. Between Material's short2 and short3. */
  press: { durationMs: 120, easing: EASING.standard },
  /** A day earned, on arrival: it gathers, jumps once, lands, and its face opens on the landing spring. */
  earned: {
    gatherMs: 80,
    riseMs: 170,
    fallMs: 130,
    riseBy: 0.38,
    landing: SPRING.expressiveFastSpatial,
  },
  /** A day gone back, on arrival: it slides to the left and fades to its resting opacity. Material's medium2. */
  returned: { durationMs: 300, easing: EASING.standard, fromOffset: 0.22 },
  /** The amount, on arrival and last: it counts to its value once, in under a second. Material's extra-long1. */
  count: { durationMs: 700, easing: EASING.standard },
  /** The whole arrival, whatever changed: under two seconds, the days a little apart from each other. */
  arrival: { budgetMs: 2000, staggerMs: 120 },
  /** A gift made or money taken, answering the press that did it: the gift character arrives once, its bow a beat after. */
  gift: { spatial: SPRING.expressiveFastSpatial, effects: SPRING.effects, fromScale: 0.55, bowDelayMs: 120 },
  /** Something scrolled into view for the first time: it appears, rising a few pixels. Material's medium1. */
  reveal: { durationMs: 250, easing: EASING.standard, rise: 8 },
  /** A pointer over a button lifts it; over a character, its face turns towards the pointer. Material's short4. */
  hover: { durationMs: 200, easing: EASING.standard, lift: 2, gaze: 2.5 },
  /** WCAG 2.2.2 Pause, Stop, Hide: nothing that starts by itself may last past five seconds without a way to stop it. */
  ceilingMs: 5000,
} as const;
