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
export const PAGE_MARGIN = { compact: 20, medium: 24 } as const;

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
/**
 * One scale, a major third (1.25) on a base of 16: 13, 16, 20, 25, 31, then 39 and 49 in compact and 61 and 76 in
 * expanded (K, rule 6, 19 Sep 2026). Before this, the steps between our four sizes were 1.14, 1.37, 1.45 and 1.5:
 * four different jumps, which is why the hierarchy read as four unrelated decisions rather than one voice.
 *
 * Leading keeps what rule 4 fixed: 1.5 on the body, about 1.3 on a title, about 1.2 on a figure.
 */
export const TYPE = {
  money: { size: 31, lineHeight: 38, weight: 600 },
  title: { size: 20, lineHeight: 26, weight: 600 },
  body: { size: 16, lineHeight: 24, weight: 400 },
  help: { size: 13, lineHeight: 18, weight: 400 },
} as const;

/**
 * The card of a gift's page, as the founder's mockup of 19 Sep 2026 sets it (`gift.html`, D211). Its sizes are the
 * mockup's own and sit off the product's scale (13, 16, 20, 25, 31), on purpose: the founder chose, on 24 Sep 2026,
 * that moving the card to its tokens changes no pixel. So they are named here, carried by the stylesheet as variables,
 * and `test/design-tokens.test.ts` holds the two equal. A size of the card that is on the scale uses the scale's token.
 */
export const GIFT_CARD_TYPE = {
  eyebrow: { lineHeight: 16 },
  what: { size: 15, lineHeight: 22 },
  state: { size: 24, lineHeight: 29 },
  stateClosed: { size: 15, lineHeight: 22 },
  next: { size: 14, lineHeight: 21 },
  back: { size: 23 },
  meta: { lineHeight: 16 },
  fold: { size: 15, lineHeight: 22 },
  flagNumber: { lineHeight: 16 },
} as const;

/**
 * The third voice (K, Ramp section 2): the small lines that say where you are and when something happened, in the
 * text face, at the smallest step, in capitals, letter-spaced so capitals stay readable. No new family: Ramp gets
 * its three voices from three roles, not three fonts.
 */
export const META_TYPE = { size: 13, lineHeight: 18, weight: 500, tracking: 1, transform: "uppercase" } as const;

/**
 * Letter spacing, by role (K, rule 5; Material 3 sets one per role, display tight and label open). Measured in
 * pixels because that is how the rule was written and how a capture can check it. The card's title is the title face
 * at the mark's size, a little tighter (the drawn card of 19 Sep 2026, section 3).
 */
export const TRACKING = { display: { compact: -1, expanded: -2 }, body: 0, label: 0.5, meta: 1, cardTitle: -0.5 } as const;

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
/**
 * One rhyme, the capsule (K, rule 14): a button and a character are capsules, and everything with four corners takes
 * the same single radius instead of the three it had (16, 28, 48). Material's extra large step, 28, is the one kept,
 * because it is the card's own and the one the look was drawn on.
 */
export const RADIUS = { control: 28, card: 28, sheet: 28, full: 9999 } as const;

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
    /**
     * The ground, as the rendered mockup home-light.html draws it: a lavender the cream card stands on at 1.31:1,
     * where the near-white it replaced left the card at 1.09:1 and invisible without a hairline of ink.
     */
    background: "#DDD6EB",
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
    /** A rule: 1.24:1 on the ground, a hairline that groups and never identifies a control. */
    divider: "#C5C2CF",
    /**
     * The fill of a button that is not the one action (K, rule 10: no ghost buttons; Material 3's filled tonal).
     * Measured 19 Sep 2026: 1.15:1 against the ground and 1.26:1 against a surface, so it reads as filled on both,
     * with the ink at 13.73:1 and the muted ink at 5.68:1 on it. What identifies it as a control is still its outline
     * (WCAG 1.4.11), which is why a fill this quiet is allowed to be quiet.
     */
    tonal: "#E8E3F4",
  },
  dark: {
    /**
     * The night ground, back to the first one (D229, the founder on 24 Sep 2026 after two lighter tries: a dark mode
     * is dark, and the first was right). It sits at Material's documented tone for a dark surface, CIELAB L* 6
     * (measured 6.1), tinted with the product's own hue (292 on the OKLCH wheel, nine degrees from the day ground,
     * chroma 0.044): the tint Material's neutral palette carries, never a grey. Everything above it is that same
     * tint at Material's dark-scheme tones: 10 for a surface, 17 for the paper, 22 and 26 for what sits on the paper,
     * 30 for a rule, 80 for the quiet voice.
     */
    background: "#151026",
    /** Tone 10, Material's lowest container, 1.08:1: the surface a field, the bar and the rail sit on. */
    surface: "#1D1732",
    /** The day's cream paper stays the night's ink: 17.22:1 on the ground, 16.00:1 on a surface. */
    text: "#FFF6E2",
    /** Tone 80 of the tint, Material's on-surface-variant: 10.88:1 and 10.11:1. */
    muted: "#C7C4DA",
    /**
     * The same sun as the day, which is the point: the hero hue does not change between the modes, and an accent
     * this light needs no night value of its own. Measured on 17 Sep 2026 against the two candidates the founder
     * compared on the product (#F7B51B, 10.21:1, and #FFD053, 12.70:1): this one reads 11.71:1 on the night ground
     * and 10.88:1 on a night surface, so after dark the fill alone identifies the button.
     */
    accent: "#FFC531",
    onAccent: "#151026",
    accentText: "#FFF6E2",
    /** The cream at night: 17.22:1. */
    controlBorder: "#FFF6E2",
    /** Tone 30, Material's outline variant. */
    divider: "#484360",
    /** Tone 17 after dark: 1.29:1 on the ground, 1.19:1 on a surface, ink 13.39:1, muted ink 8.46:1. */
    tonal: "#2B2642",
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
  dark: { one: "#FF7F8E", two: "#5AB4FF", three: "#B79BFF", face: "#151026", shadow: "#08060F" },
};

/**
 * The juice inside a character (D132, the founder on a sheet of glossy jelly shapes, 20 Sep 2026): the fills stay
 * flat, and each one gains a highlight of two white circles at its upper left and a shade lying at its foot. Kept
 * low on purpose: enough to read as an object under a light, never enough to become a gradient.
 */
export const CHARACTER_JUICE = { gloss: "rgba(255, 255, 255, 0.45)", shade: "rgba(30, 22, 51, 0.12)" } as const;

/** How much of the shadow's colour shows under a character: a tint of the ink by day, a deeper one at night. */
export const CHARACTER_SHADOW_OPACITY: Record<Appearance, number> = { light: 0.12, dark: 0.45 };

/**
 * The relief under a button, which is what a press collapses (brief, section 6). By day it is the ink, the pressed
 * key of the look. At night it was a shade under the ground, 1.09:1, meant to read as depth after the cream slab
 * the founder saw on the capture of 17 Sep, which was the ink after dark and read as a thick white edge (brief,
 * section 8). Measured on production on 20 Sep 2026, that shade could not be seen at all, and a relief nobody sees
 * is no relief: the hover that grows it and the press that collapse it read as nothing, which the founder saw as
 * the night door having no effect. So it is the night's own muted lavender now, the colour of a quiet line on the
 * ground: seen, and not a white edge. On the paper, cream at night too, the stylesheet keeps the ink (`.on-paper`).
 * By day it is the ink, the pressed
 * key of the look. At night it is a shade under the ground, 1.09:1, read as depth: the cream slab the founder saw on
 * the capture of 17 Sep was the ink after dark, and it read as a thick white edge (brief, section 8).
 */
export const RELIEF: Record<Appearance, string> = { light: "#1E1633", dark: "#C7C4DA" };

/**
 * The type of the look. Fredoka, round and geometric, a relative of the characters, sets exactly one display title per
 * destination (Gifts, You, the promise without an account) and the mark at the top of every screen, at 600 rather than
 * letting the browser invent a bold. DM Sans sets everything else, section titles, amounts and buttons included, at
 * the four levels above. Duolingo's rule: past ten words, the text face. The display sizes are the ones Fredoka needs
 * to hold the promise without running past three lines on a phone.
 */
export const DISPLAY_TYPE = {
  // On the scale of rule 6: 49 is its compact display step and 76 its expanded one, where 48 and 88 were off it.
  display: { compact: { size: 49, lineHeight: 54 }, expanded: { size: 76, lineHeight: 80 } },
  mark: { size: 25, lineHeight: 30 },
  titleWeight: 600,
} as const;

/**
 * The scale itself, written once so a test can hold every size in the stylesheet to it (D126, 20 Sep 2026): a text
 * size on any screen is one of these, and nothing between two of them. The rule is Nielsen's fourth heuristic
 * (consistency and standards) applied to type, and it is what Material and Apple both publish as a type scale.
 */
export const TYPE_SCALE = [13, 16, 20, 25, 31, 39, 49, 61, 76] as const;

/**
 * The promise on the page without an account (D128, the founder on the advisor's preview of 20 Sep 2026): 39 in the
 * one column under 1024, and from 1024, in the left column beside the card, 76 with a lead sentence of 20 under it.
 * Both sizes are steps of the scale.
 */
export const HERO_TYPE = {
  // 49 on a phone since D131, where 39 left the promise smaller than the amount on the card under it.
  compact: { size: 49, lineHeight: 54, tracking: -1 },
  wide: { size: 76, lineHeight: 1.02, tracking: -2 },
  from: 1024,
  /** Where the promise reaches its wide size: from 1024 it grows with the window, 49 there, 76 here (28 Sep 2026). */
  fullFrom: 1440,
} as const;
export const LEAD_TYPE = { compact: { size: 16, lineHeight: 24 }, wide: { size: 20, lineHeight: 28 } } as const;

/**
 * The gift card's edge (D127, D128, D254): Material's outlined card, 1 px in outline variant, which is our divider:
 * tone 79 by day and 30 at night, where Material's role sits at 80 and 30. It was the controls' own edge, 2 px of ink
 * by day and cream at night, which made the one card in the product read as a key (the founder, 25 Sep 2026: "the
 * only object with an outline, besides the buttons"). No relief and no shadow: the niche allows no blur anywhere.
 */
export const CARD_PLACED = { edgeWidth: 1, edge: { light: "#C5C2CF", dark: "#484360" } } as const;

/** The card's three voices, each one step from the image of 19 Sep 2026 and on the scale (D126). */
export const CARD_TYPE = { who: { size: 25, lineHeight: 30 }, amount: { size: 39 }, label: { size: 13 } } as const;

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
  /**
   * The landing's figure once it stands (D301, the founder, 28 Sep 2026): it blinks now and then, a lid closing and
   * opening in Material's short3, at a random moment between two gaps so it never beats like a clock; and when the page
   * is scrolled past the top it folds its arms and legs into its body on medium2, and lengthens them out again at the
   * top. Neither plays under reduced motion, nor while the figure cannot be seen.
   */
  // A blink as the light changes lasts a little longer, Material's medium1, so it is seen over the change (D308).
  blink: { durationMs: 150, themeDurationMs: 250, easing: EASING.standard, closedTo: 0.1, fromMs: 2800, toMs: 6500 },
  tuck: { durationMs: 420, afterPx: 32 },
  /**
   * The sentence under the landing's card going through what a gift can wait for (D285): each item held long enough to
   * read, then it leaves upward on Material's short4 and emphasized accelerate while the next rises on medium2 and
   * emphasized decelerate. The one movement on a clock outside the working ring, named, and still under reduced motion.
   */
  rotate: { holdMs: 2800, outMs: 200, inMs: 300, outEasing: EASING.emphasizedAccelerate, inEasing: EASING.emphasizedDecelerate, rise: "0.45em" },
  /** A day earned, on arrival: it gathers, jumps once, lands, and its face opens on the landing spring. */
  earned: {
    gatherMs: 80,
    riseMs: 170,
    fallMs: 130,
    riseBy: 0.38,
    landing: SPRING.expressiveFastSpatial,
  },
  /**
   * The days wake when a gift is opened (the founder, 3 Oct 2026; the motion roadmap, section 6): their eyes open one
   * by one from the left, on the spring a day earned lands on, 40 ms apart, and the whole row has woken in 600 ms
   * whatever its length, so the days past the first few open together. Material's long4 for the budget.
   */
  wake: { staggerMs: 40, budgetMs: 600, eyes: SPRING.expressiveFastSpatial },
  /** A day gone back, on arrival: it slides to the left and fades to its resting opacity. Material's medium2. */
  returned: { durationMs: 300, easing: EASING.standard, fromOffset: 0.22 },
  /** The amount, on arrival and last: it counts to its value once, in under a second. Material's extra-long1. */
  count: { durationMs: 700, easing: EASING.standard },
  /** The whole arrival, whatever changed: under two seconds, the days a little apart from each other. */
  arrival: { budgetMs: 2000, staggerMs: 120 },
  /**
   * The moment a gift is reached (the founder, 29 Sep 2026: the climax of the product, and a first tester did not see
   * it). Played once the page has loaded, over the whole screen: the moment rises in, the amount turns "yours"
   * `becomesAfterMs` in, and the confetti falls across the screen for long enough to be seen, each piece
   * `fallMs` long, set off over `spreadMs`, so the rain lasts about three seconds and then is gone.
   */
  moment: { inMs: 450, becomesAfterMs: 900, pieces: 64, fallMs: 2200, spreadMs: 1100 },
  /** A gift made or money taken, answering the press that did it: the gift character arrives once, its bow a beat after. */
  gift: { spatial: SPRING.expressiveFastSpatial, effects: SPRING.effects, fromScale: 0.55, bowDelayMs: 120 },
  /**
   * The hero moment of the landing (D219): the character leaps out from behind the card whirling, lands, bounces once,
   * settles, and only then unfolds its limbs. Squash and stretch, slow in and slow out, follow through, an arc
   * (Thomas and Johnston). The leap is Material's medium4, the fall short2, the squash short1, the bounce medium1; the
   * settle and the limbs are the expressive fast spatial spring; the mouth the effects spring. Distances are units of
   * the drawing's box (64), scales are of the body from its floor. Under two seconds in all.
   */
  hero: {
    leapMs: 400,
    fallMs: 100,
    squashMs: 50,
    hopMs: 250,
    /**
     * The limbs come out during the jump, not after it (the founder, 25 Sep 2026, D234): the arms open as the body
     * slows to the top of the leap, the gesture of a jumper at the apex, on the expressive spring; the legs unfold
     * during the fall, on the spring that never overshoots, so the feet arrive as the body touches the floor and the
     * squash of the landing compresses them with it. Within a pair, the left then the right, 40 ms apart.
     */
    armsBeforeTopMs: 100,
    legsBeforeFloorMs: 100,
    limbPairStaggerMs: 40,
    /**
     * How a limb comes out of the body (D302, the founder, 28 Sep 2026: not only stretched along its axis): it leaves
     * at a wider angle, arms more than legs, lengthening on Material's short4 and emphasized decelerate, then swings to
     * where it rests on its spring. Folding is the same, backwards: it swings out, then shortens into the body.
     */
    spread: { armsDeg: 38, legsDeg: 24, outMs: 200 },
    settle: SPRING.expressiveFastSpatial,
    effects: SPRING.effects,
    turns: 1,
    leapAbove: 5,
    hopAbove: 2.5,
    plain: { x: 1, y: 1 },
    stretch: { x: 0.94, y: 1.08 },
    squash: { x: 1.14, y: 0.84 },
    lift: { x: 0.98, y: 1.03 },
    secondSquash: { x: 1.06, y: 0.93 },
  },
  /**
   * Something appearing for the first time, whether a screen has opened or a block has scrolled into view: it
   * appears, rising a few pixels. Material's medium1. A screen that carries several blocks brings them one after
   * another, 80 ms apart (the founder, 23 Sep 2026, D171: at 50 they read as simultaneous; 80 sits between Material's
   * short1 and short2, and short2 is the next step if 80 still reads as one), and none waits longer than
   * `mostStaggeredMs`, three turns, so four blocks have arrived inside the half second NN/g calls the ceiling. A
   * list's turns stop at the same ceiling, `lastTurnMs`: the fourth card and every one after it arrive together.
   */
  /**
   * `fromOpacity`: a block of a screen that enters starts at 60 % and not from nothing (D196, the founder's default
   * to confirm, 23 Sep 2026): from 0, the first image after a press was almost empty, 5 % visible on the catalogue,
   * and on a phone the entrance read as a blink. The rise alone carries the movement.
   */
  reveal: { durationMs: 250, easing: EASING.standard, rise: 8, staggerMs: 80, mostStaggeredMs: 240, lastTurnMs: 240, fromOpacity: 0.6 },
  /**
   * A pointer over a button lifts it; over a character, its face turns towards the pointer. Material's short4.
   * A screen with no pointer has no hover: an expression plays once when something is chosen, and `heldMs` is how
   * long it stays before it comes back, so the whole round trip is 700 ms, Material's extra-long1.
   */
  hover: { durationMs: 200, easing: EASING.standard, lift: 2, gaze: 2.5, heldMs: 300 },
  /** WCAG 2.2.2 Pause, Stop, Hide: nothing that starts by itself may last past five seconds without a way to stop it. */
  ceilingMs: 5000,
} as const;
