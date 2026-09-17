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

/**
 * The looks laboratory (the art direction brief of 17 Sep 2026, sections 3, 4 and 9): three looks, each a set of tokens
 * laid over the same kit, rendered at /dev/looks on example data so the funder can choose on boards. Nothing here
 * reaches a product screen: `COLOURS` above is still the one look the product wears, and app/globals.css still says
 * only that. A look is drawn only inside the laboratory's own frame (app/dev/looks), which is off unless the design
 * gallery is switched on (src/dev-access.ts, `galleryOpen`).
 *
 * The method is the same for all three (brief, section 3): a neutral ground with little chroma, a surface one tone off
 * it, one ink and its faded tone, one accent reserved for the primary action, the active destination and a moment of
 * success, and up to three secondary colours that live only inside the characters. Links are ink, underlined, in all
 * three, so the accent as words is the ink itself.
 *
 * Every value is the brief's starting value, and every ratio below was measured on 17 Sep 2026 with the WCAG formula
 * (`src/contrast.ts`): they reproduce the brief's own figures to the hundredth, so no value had to move. What the brief
 * left open was chosen by measure and says so: the divider, the relief after dark, and the characters' ranges.
 * `test/looks.test.ts` recomputes every ratio recorded here and fails if one stops being true.
 */

export type LookId = "paper-tomato" | "ink-sun" | "white-violet";

/** The roles a look adds to the nine of `COLOURS`: the relief under a control, and what a character is made of. */
export type LookColours = Readonly<{
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  accentText: string;
  controlBorder: string;
  divider: string;
  /** The relief under a button, or null when the look has none. */
  relief: string | null;
  /** The short range of a look's characters, three and no more (brief, section 5). Never text, never a background. */
  character1: string;
  character2: string;
  character3: string;
  /** The eyes and mouth: the ink by day, the ground by night, dark on every character in both. */
  face: string;
  /** The pill under a character: this colour at `shadowOpacity`, a tint of the ink rather than a grey. */
  shadow: string;
  shadowOpacity: number;
}>;

export type Look = Readonly<{
  id: LookId;
  number: 1 | 2 | 3;
  name: string;
  intention: string;
  colours: Readonly<Record<Appearance, LookColours>>;
  /**
   * What identifies the primary button. "ink" where the accent fill stands under 3:1 against a ground it sits on, so
   * the ink outline does it (WCAG 1.4.11, as Cash App builds its green "to work with black text"); "fill" where the
   * accent alone clears 3:1 on both grounds.
   */
  accentEdge: Readonly<Record<Appearance, "ink" | "fill">>;
  /** How far the relief stands under a button, which is how far a button travels when it is pressed. 0 is no relief. */
  reliefDepth: number;
  /** The title face, the weight it is set in, and the display sizes that face needs to hold one short promise. */
  type: Readonly<{
    face: "bricolage" | "fredoka";
    titleWeight: number;
    display: Readonly<{ compact: Readonly<{ size: number; lineHeight: number }>; expanded: Readonly<{ size: number; lineHeight: number }> }>;
  }>;
  /** Every pair measured, as "foreground/background": ratio, to the hundredth, per appearance. */
  ratios: Readonly<Record<Appearance, Readonly<Record<string, number>>>>;
}>;

/**
 * The three characters' colours are rounder in the evening: the night values are a step less saturated, because "In
 * dark environments, colors appear bright and saturated" (Apple). None of them is grey, none is the accent, and none is
 * yellow, which is the accent of look 2 and the colour most likely to read as a character somebody else owns.
 *
 * The characters are not held to 3:1 against the ground: a day's state is always said in words beside it (rule D of
 * the product structure), so a body never carries meaning alone. Its face is, against the body, and clears 7:1.
 */
export const LOOKS: readonly Look[] = [
  {
    id: "paper-tomato",
    number: 1,
    name: "Paper and tomato",
    intention: "Direction 1 corrected by the method: the same warmth, on a neutral ground.",
    colours: {
      light: {
        background: "#FBF7EF",
        surface: "#FFFFFF",
        text: "#2A0F24",
        muted: "#6A5263",
        accent: "#FF5A36",
        onAccent: "#2A0F24",
        accentText: "#2A0F24",
        controlBorder: "#2A0F24",
        /** Chosen by measure: 1.24:1 on the ground, a hairline that groups and never identifies. */
        divider: "#E8DFCF",
        relief: "#2A0F24",
        /** Marigold for a day earned and the gift's box, sea for today, lavender for what is to come or went back. */
        character1: "#FFA94D",
        character2: "#4EC3C9",
        character3: "#B8A7F2",
        face: "#2A0F24",
        shadow: "#2A0F24",
        shadowOpacity: 0.12,
      },
      dark: {
        background: "#1A1226",
        surface: "#261B36",
        text: "#F6EFE6",
        muted: "#B9ABC4",
        accent: "#FF8562",
        onAccent: "#1A1226",
        accentText: "#F6EFE6",
        controlBorder: "#F6EFE6",
        divider: "#3A2D4B",
        /**
         * The relief after dark is a shadow, not a slab of cream: the capture of 17 Sep read the ink relief as a thick
         * white edge (brief, section 8). A shade under the ground, 1.10:1, which reads as depth and never as a border.
         */
        relief: "#0B0711",
        character1: "#F4A95A",
        character2: "#5DC0C5",
        character3: "#AE9FE8",
        face: "#1A1226",
        shadow: "#0B0711",
        shadowOpacity: 0.45,
      },
    },
    accentEdge: { light: "ink", dark: "fill" },
    reliefDepth: 5,
    type: { face: "bricolage", titleWeight: 700, display: { compact: { size: 48, lineHeight: 50 }, expanded: { size: 88, lineHeight: 88 } } },
    ratios: {
      light: { "text/background": 16.48, "text/surface": 17.61, "muted/background": 6.55, "muted/surface": 7.00, "onAccent/accent": 5.68, "accent/background": 2.90, "accent/surface": 3.10, "controlBorder/background": 16.48, "controlBorder/surface": 17.61, "divider/background": 1.24, "relief/background": 16.48, "face/character1": 9.26, "face/character2": 8.37, "face/character3": 8.26, "character1/background": 1.78, "character2/background": 1.97, "character3/background": 2.00, "character1/surface": 1.90, "character2/surface": 2.11, "character3/surface": 2.13 },
      dark: { "text/background": 15.89, "text/surface": 14.24, "muted/background": 8.36, "muted/surface": 7.49, "onAccent/accent": 7.58, "accent/background": 7.58, "accent/surface": 6.80, "controlBorder/background": 15.89, "controlBorder/surface": 14.24, "divider/background": 1.43, "relief/background": 1.10, "face/character1": 9.21, "face/character2": 8.47, "face/character3": 7.70, "character1/background": 9.21, "character2/background": 8.47, "character3/background": 7.70, "character1/surface": 8.26, "character2/surface": 7.59, "character3/surface": 6.90 },
    },
  },
  {
    id: "ink-sun",
    number: 2,
    name: "Ink and sun",
    intention: "The most like a gift: sun yellow on a cool neutral, opposite hues.",
    colours: {
      light: {
        background: "#F6F4FB",
        surface: "#FFFFFF",
        text: "#1E1633",
        muted: "#5B5470",
        accent: "#FFC531",
        onAccent: "#1E1633",
        accentText: "#1E1633",
        controlBorder: "#1E1633",
        divider: "#E0DCEB",
        relief: "#1E1633",
        /** Coral, sky and lilac: a confetti range, and never the yellow of the accent. */
        character1: "#FF7F8E",
        character2: "#5AB4FF",
        character3: "#B79BFF",
        face: "#1E1633",
        shadow: "#1E1633",
        shadowOpacity: 0.12,
      },
      dark: {
        background: "#151026",
        surface: "#211A38",
        text: "#F3F0FA",
        muted: "#B3ABC9",
        accent: "#FFD053",
        onAccent: "#151026",
        accentText: "#F3F0FA",
        controlBorder: "#F3F0FA",
        divider: "#352C52",
        relief: "#08060F",
        character1: "#FF8C98",
        character2: "#6DBDFB",
        character3: "#BBA3FA",
        face: "#151026",
        shadow: "#08060F",
        shadowOpacity: 0.45,
      },
    },
    accentEdge: { light: "ink", dark: "fill" },
    reliefDepth: 4,
    type: { face: "fredoka", titleWeight: 600, display: { compact: { size: 48, lineHeight: 52 }, expanded: { size: 88, lineHeight: 92 } } },
    ratios: {
      light: { "text/background": 15.81, "text/surface": 17.24, "muted/background": 6.53, "muted/surface": 7.13, "onAccent/accent": 10.91, "accent/background": 1.45, "accent/surface": 1.58, "controlBorder/background": 15.81, "controlBorder/surface": 17.24, "divider/background": 1.23, "relief/background": 15.81, "face/character1": 7.13, "face/character2": 7.72, "face/character3": 7.51, "character1/background": 2.22, "character2/background": 2.05, "character3/background": 2.10, "character1/surface": 2.42, "character2/surface": 2.23, "character3/surface": 2.30 },
      dark: { "text/background": 16.45, "text/surface": 14.69, "muted/background": 8.45, "muted/surface": 7.55, "onAccent/accent": 12.70, "accent/background": 12.70, "accent/surface": 11.34, "controlBorder/background": 16.45, "controlBorder/surface": 14.69, "divider/background": 1.44, "relief/background": 1.09, "face/character1": 8.34, "face/character2": 9.10, "face/character3": 8.58, "character1/background": 8.34, "character2/background": 9.10, "character3/background": 8.58, "character1/surface": 7.45, "character2/surface": 8.13, "character3/surface": 7.67 },
    },
  },
  {
    id: "white-violet",
    number: 3,
    name: "White and violet",
    intention: "The calmest, the most like trust.",
    colours: {
      light: {
        background: "#FAFAFC",
        surface: "#FFFFFF",
        text: "#16131F",
        muted: "#5A5668",
        accent: "#5B3FE0",
        onAccent: "#FFFFFF",
        accentText: "#16131F",
        controlBorder: "#16131F",
        divider: "#E4E3EA",
        /** No relief: the calm look is flat, and a flat button answers a press by sinking a little instead. */
        relief: null,
        /** Peach, powder blue and rose: soft, and far enough from the violet never to be read as a second accent. */
        character1: "#FFB08A",
        character2: "#8DB6F2",
        character3: "#F2A5C4",
        face: "#16131F",
        shadow: "#16131F",
        shadowOpacity: 0.1,
      },
      dark: {
        background: "#121019",
        surface: "#1D1A28",
        text: "#F2F1F6",
        muted: "#ABA7BA",
        accent: "#9C8BFF",
        onAccent: "#121019",
        accentText: "#F2F1F6",
        controlBorder: "#F2F1F6",
        divider: "#302C3D",
        relief: null,
        character1: "#F4AE8E",
        character2: "#92B4EC",
        character3: "#E9A8C3",
        face: "#121019",
        shadow: "#08070B",
        shadowOpacity: 0.45,
      },
    },
    accentEdge: { light: "fill", dark: "fill" },
    reliefDepth: 0,
    type: { face: "bricolage", titleWeight: 600, display: { compact: { size: 44, lineHeight: 48 }, expanded: { size: 76, lineHeight: 80 } } },
    ratios: {
      light: { "text/background": 17.56, "text/surface": 18.31, "muted/background": 6.79, "muted/surface": 7.08, "onAccent/accent": 6.50, "accent/background": 6.23, "accent/surface": 6.50, "controlBorder/background": 17.56, "controlBorder/surface": 18.31, "divider/background": 1.22, "face/character1": 10.31, "face/character2": 8.81, "face/character3": 9.55, "character1/background": 1.70, "character2/background": 1.99, "character3/background": 1.84, "character1/surface": 1.78, "character2/surface": 2.08, "character3/surface": 1.92 },
      dark: { "text/background": 16.78, "text/surface": 15.19, "muted/background": 8.05, "muted/surface": 7.29, "onAccent/accent": 6.78, "accent/background": 6.78, "accent/surface": 6.14, "controlBorder/background": 16.78, "controlBorder/surface": 15.19, "divider/background": 1.39, "face/character1": 10.14, "face/character2": 8.94, "face/character3": 9.74, "character1/background": 10.14, "character2/background": 8.94, "character3/background": 9.74, "character1/surface": 9.18, "character2/surface": 8.09, "character3/surface": 8.82 },
    },
  },
];

/**
 * Look 2 was chosen by the founder on 17 Sep 2026. One question is left to the eye before it is finished: which sun at
 * night. Three candidates, drawn side by side at /dev/looks/ink-sun/<screen>?sun=<id>. The founder's rule: the hero hue
 * does not change between the modes, so every candidate stays within a few degrees of the day's sun. This departs from
 * the brief's section 3 ("the night accent is lighter"): two of the three are not lighter, and that is the question.
 *
 * Each ratio is measured on 17 Sep 2026 and recomputed by test/looks.test.ts: the fill against the night ground and the
 * night surface, and the words on it, which are the night ground.
 */
export const NIGHT_SUN_TRIALS = [
  {
    id: "same",
    hex: "#FFC531",
    name: "The day's sun",
    ratios: { "accent/background": 11.71, "accent/surface": 10.46, "onAccent/accent": 11.71 },
  },
  {
    id: "amber",
    hex: "#F7B51B",
    name: "More amber",
    ratios: { "accent/background": 10.21, "accent/surface": 9.12, "onAccent/accent": 10.21 },
  },
  {
    id: "lighter",
    hex: "#FFD053",
    name: "Lighter, the current one",
    ratios: { "accent/background": 12.70, "accent/surface": 11.34, "onAccent/accent": 12.70 },
  },
] as const;

export type NightSunTrial = (typeof NIGHT_SUN_TRIALS)[number];

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
