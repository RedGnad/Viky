/**
 * The one place the look of a control is decided, now built on the tokens rather than on repeated Tailwind
 * classes. Every value below is a variable from app/globals.css, so a change happens in one place and the
 * measurements behind it are tested (src/design-tokens.ts, docs/design/research.md).
 *
 * What changed in the design pass, and why:
 * - Controls are 48px tall, not 44. Four sources give four floors and 48 is the only one that satisfies them
 *   all, including WCAG 2.5.5 at level AAA.
 * - A bordered control's outline was at 1.48:1 against its background. WCAG 1.4.11 asks 3:1 for what
 *   identifies a control, and a bordered button is identified by its border. It now clears 3:1 on the page
 *   ground and on a card alike, in both appearances, and a test fails if that stops being true.
 * - Radii, spacing and text sizes come from Material's published scales instead of being picked per screen.
 * - Buttons are fully round and cards take Material's extra large radius, which is the art direction the
 *   funder chose arriving through the tokens: not one measurement above them moved.
 * - The families, the width of a control's outline and the relief under it are variables too, so the look gives one
 *   Fredoka title per destination, DM Sans everywhere else and pressed-key buttons through these classes.
 * - Links are the ink, underlined (the art direction brief of 17 Sep 2026, section 4): the accent stays the one thing
 *   that fills a button, so a link is told apart by its underline rather than by a colour of its own.
 */

const TAP = "min-h-[var(--tap-target)] inline-flex items-center justify-center gap-[var(--space-sm)]";
/**
 * The title face, named once. Five lines wear it and no others: the display title, the mark, the promise at the head
 * of the page without an account, and the two lines of a card, its name and its amount (the rendered mockups of
 * 19 Sep 2026). Composing it rather than repeating it is also what keeps a size from being overridden by the size
 * inside another class.
 */
const TITLE_FACE = "font-[family-name:var(--font-title)] [font-weight:var(--font-title-weight)]";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]";
/** The outline that identifies a control, and the relief under a button, which a press collapses (globals.css). */
const OUTLINE = "border-[length:var(--control-border-width)] border-[var(--control-border)]";
const RELIEF = "control-relief";

/**
 * The action a screen is asking for. One per screen, at most, so it means something. Shut, it gives the accent back:
 * a faded accent is a fourth colour at night (a brown on the indigo ground), so a button that cannot be pressed yet is
 * a surface with muted words and no relief, and it takes the accent the moment it can.
 *
 * Since the rendered mockups of 19 Sep 2026 it is the sun, full width, with three pixels of the sun's own shadow
 * under it, and a press puts it down onto them. Full width was what the brief advised against, and the founder
 * amended the brief on the image (D113). It keeps its ink outline, which the mockup does not draw: the sun on the
 * cream of a card measures 1.47:1, and WCAG 1.4.11 asks 3:1 of whatever identifies a control.
 */
export const PRIMARY_BUTTON = `${TAP} ${FOCUS} w-full rounded-full ${OUTLINE} bg-[var(--accent)] px-[var(--space-lg)] py-[var(--space-md)] text-[length:var(--type-action)] font-bold tracking-[var(--tracking-label)] text-[var(--on-accent)] [box-shadow:0_var(--action-relief-depth)_0_var(--sun-deep)] active:translate-y-[var(--action-relief-depth)] active:[box-shadow:none] disabled:bg-[var(--action-off)] disabled:text-[var(--action-off-ink)] disabled:[box-shadow:0_var(--action-relief-depth)_0_var(--action-off-deep)]`;

/**
 * Everything else a person may do from here: filled with a quiet tone rather than left hollow (K, rule 10, 19 Sep
 * 2026: an outline alone is neither seen nor pressed; Material 3's filled tonal is the published shape for medium
 * emphasis). The ink outline stays, because that is what identifies a control (WCAG 1.4.11), and the accent stays on
 * the one action a screen is asking for.
 */
export const SECONDARY_BUTTON = `${TAP} ${FOCUS} w-full rounded-full ${OUTLINE} ${RELIEF} bg-[var(--tonal)] px-[var(--space-lg)] py-[var(--space-md)] text-[length:var(--type-body)] tracking-[var(--tracking-label)] disabled:border-[var(--card-border)] disabled:bg-[var(--surface)] disabled:text-[var(--muted)] disabled:[box-shadow:none]`;

/**
 * What a control that cannot be pressed looks like, and it is the same answer for all three: it gives its fill back
 * and stands off the ground, which is the only difference a person can see once every button is filled. Under the
 * first version of the tonal button, "Check now" (live) and "Tell me each morning" (dead) were the same capsule at a
 * different opacity, and at a squint they were one pair of identical pills.
 */

/** A secondary action that sits beside others rather than filling the width. */
export const INLINE_BUTTON = `${TAP} ${FOCUS} rounded-full ${OUTLINE} ${RELIEF} bg-[var(--tonal)] px-[var(--space-lg)] py-[var(--space-sm)] text-[length:var(--type-help)] tracking-[var(--tracking-label)] disabled:border-[var(--card-border)] disabled:bg-[var(--surface)] disabled:text-[var(--muted)] disabled:[box-shadow:none]`;

/**
 * The third voice (K, Ramp section 2): the small lines that say where you are and when something happened. The text
 * face at the smallest step, in capitals, spaced so capitals stay readable. No new family, and never a sentence.
 */
export const META = "text-[length:var(--type-meta)] leading-[var(--type-meta-leading)] tracking-[var(--type-meta-tracking)] font-medium uppercase text-[var(--muted)]";

/**
 * A box that groups: a surface with a hairline edge and no relief, because a card groups words and is not a control
 * (the product structure of 17 Sep 2026, section 7). Every card in the product is this one; the four coloured
 * stickers it replaces were four backgrounds where the three sources allow one.
 *
 * Since the rendered mockups of 19 Sep 2026 it is the light object on the ground: cream by night, with a shadow
 * under it and no edge at all, because 17:1 against the ground needs no help. Day is not drawn yet, so it keeps the
 * white card and the ink hairline that was measured to be needed there (white on that ground is 1.09:1). `on-paper`
 * is what re-points the ink, the quiet voice and the rule for everything inside it.
 */
export const CARD =
  "on-paper space-y-[var(--space-md)] rounded-[var(--radius-card)] border-[length:var(--card-border-width)] border-[var(--card-edge)] p-[var(--space-lg)]";

/**
 * A line the person types into. Its border identifies it, so it carries the control colour, and it sits on a
 * surface rather than on the page ground so a paragraph of yellow never runs under a value being typed.
 */
export const FIELD = `min-h-[var(--tap-target)] ${FOCUS} w-full rounded-[var(--radius-control)] ${OUTLINE} bg-[var(--surface)] px-[var(--space-md)] py-[var(--space-sm)] text-[length:var(--type-body)]`;

/** The four levels of text, and there is no fifth. */
export const MONEY = "text-[length:var(--type-money)] leading-[var(--type-money-leading)] font-semibold tabular-nums";
export const TITLE = "text-[length:var(--type-title)] leading-[var(--type-title-leading)] font-semibold";
export const BODY = "text-[length:var(--type-body)] leading-[var(--type-body-leading)]";
export const HELP = "text-[length:var(--type-help)] leading-[var(--type-help-leading)] text-[var(--muted)]";

/**
 * The single title a destination opens with, in Fredoka: once per destination, never in a task, never on an amount
 * or a button (structure of 17 Sep, section 12, item 7).
 */
export const DISPLAY = `${TITLE_FACE} text-[length:var(--type-display)] leading-[var(--type-display-leading)] tracking-[var(--type-display-tracking)]`;

/**
 * What the screen is doing, while it is doing it: the title face at the size the mockup paying.html draws it,
 * centred over the ring. It is not a destination's title, so it is not the display.
 */
export const SAY = `${TITLE_FACE} text-[length:var(--type-say)] leading-[var(--type-say-leading)] tracking-[var(--type-card-who-tracking)]`;

/** The mark at the top of every screen, the same face at a size that is not a title. */
export const MARK = `${TITLE_FACE} text-[length:var(--type-mark)] leading-[var(--type-mark-leading)]`;

/**
 * The promise at the head of the page without an account, in the title face at the size the rendered mockups of
 * 19 Sep 2026 draw it: smaller than the display, and it sits beside the gift character rather than over the card.
 */
export const HERO = `${TITLE_FACE} text-[length:var(--type-hero)] leading-[var(--type-hero-leading)] tracking-[var(--type-hero-tracking)]`;

/**
 * The three voices of a card, from the rendered mockups of 19 Sep 2026: the name it carries, the amount that is the
 * one star of the screen, and the small capitals of a label. The first two are the title face, which is why they
 * compose MARK rather than naming the face again: the face is still set in exactly two places in this file.
 */
export const CARD_TITLE = `${TITLE_FACE} text-[length:var(--type-card-who)] leading-[var(--type-card-who-leading)] tracking-[var(--type-card-who-tracking)]`;

export const CARD_AMOUNT = `${TITLE_FACE} text-[length:var(--type-card-amount)] leading-[1] tracking-[var(--type-card-amount-tracking)] tabular-nums`;

/** A label on a card: the third voice, at the size the image draws it. */
export const CARD_LABEL =
  "text-[length:var(--type-card-label)] leading-[var(--type-help-leading)] tracking-[var(--type-card-label-tracking)] font-bold uppercase text-[var(--muted)]";

/**
 * An amount inside a title. Amounts are set in the text face wherever they appear, so a title that states one hands
 * the amount back to it, at the title's own size.
 */
export const AMOUNT_IN_TITLE = "font-[family-name:var(--font-text)] font-bold tabular-nums";

/** Prose is capped so a line never runs past what every published range agrees is readable. */
export const PROSE = `${BODY} max-w-[var(--prose-max)]`;

/** Stacked controls, spaced so Apple's bezelled minimum is met without anybody remembering it. */
export const CONTROL_STACK = "flex flex-col gap-[var(--tap-gap)]";

/**
 * One way back, and it looks the same wherever it is. Pulled left by its own padding so the word stays flush
 * with the page margin while the target around it is a full 48 wide.
 */
export const BACK_LINK =
  "-ml-[var(--space-md)] inline-flex min-h-[var(--tap-target)] min-w-[var(--tap-target)] items-center self-start px-[var(--space-md)] text-[length:var(--type-body)] underline underline-offset-[3px] text-[var(--accent-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]";

/**
 * The action a screen is asking for, kept where a thumb is and where the eye ends up, instead of below
 * whatever explaining the screen had to do.
 *
 * Found by using the product rather than by looking at a picture of it: on a 390 pixel phone the Continue
 * button sat under three fields and two cards on every screen of the funder journey, so every step began with
 * a scroll to find out what the step was. The bottom inset is added to the bar's own padding and the bar is
 * not pinned with `position: fixed`, so Chrome still slides its own chin away (developer.chrome.com,
 * edge-to-edge): a sticky element is the pattern its guidance leaves open.
 */
export const ACTION_BAR =
  "sticky bottom-0 -mx-[var(--page-margin)] flex flex-col gap-[var(--tap-gap)] border-t border-[var(--divider)] bg-[var(--background)] px-[var(--page-margin)] pt-[var(--space-md)] pb-[calc(var(--space-md)+env(safe-area-inset-bottom,0px))]";
