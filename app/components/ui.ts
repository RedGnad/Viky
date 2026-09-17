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
 * - The families, the width of a control's outline and the relief under it are variables too, so direction 1
 *   gives one Anton title per destination, DM Sans everywhere else and pressed-key buttons through these classes.
 */

const TAP = "min-h-[var(--tap-target)] inline-flex items-center justify-center gap-[var(--space-sm)]";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]";
/** The outline that identifies a control, and the relief under a button. A hairline and nothing in the calm look. */
const OUTLINE = "border-[length:var(--control-border-width)] border-[var(--control-border)]";
const RELIEF = "[box-shadow:var(--control-relief)]";

/**
 * The action a screen is asking for. One per screen, at most, so it means something. Shut, it gives the accent back:
 * a faded accent is a fourth colour at night (a brown on the indigo ground), so a button that cannot be pressed yet is
 * a surface with muted words and no relief, and it takes the accent the moment it can.
 */
export const PRIMARY_BUTTON = `${TAP} ${FOCUS} w-full rounded-full ${OUTLINE} ${RELIEF} bg-[var(--accent)] px-[var(--space-lg)] py-[var(--space-md)] text-[length:var(--type-body)] font-medium text-[var(--on-accent)] disabled:border-[var(--card-border)] disabled:bg-[var(--surface)] disabled:text-[var(--muted)] disabled:[box-shadow:none]`;

/** Everything else a person may do from here. */
export const SECONDARY_BUTTON = `${TAP} ${FOCUS} w-full rounded-full ${OUTLINE} ${RELIEF} px-[var(--space-lg)] py-[var(--space-md)] text-[length:var(--type-body)] disabled:opacity-50`;

/** A secondary action that sits beside others rather than filling the width. */
export const INLINE_BUTTON = `${TAP} ${FOCUS} rounded-full ${OUTLINE} ${RELIEF} px-[var(--space-lg)] py-[var(--space-sm)] text-[length:var(--type-help)] disabled:opacity-50`;

/**
 * A box that groups: a surface with a hairline edge and no relief, because a card groups words and is not a control
 * (the product structure of 17 Sep 2026, section 7). Every card in the product is this one; the four coloured
 * stickers it replaces were four backgrounds where the three sources allow one.
 */
export const CARD =
  "space-y-[var(--space-md)] rounded-[var(--radius-card)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--surface)] p-[var(--space-lg)]";

/**
 * The names the task screens still use for their cards. Every one of them is the surface card now, so a task
 * rebuilt later on its own line already wears the three colours; the names go when the last task is rebuilt.
 */
export const STICKER_CARD = CARD;
export const STICKER = { sun: CARD, pink: CARD, mint: CARD, lilac: CARD } as const;

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
 * The single title a destination opens with, in Anton: once per destination, never in a task, never on an amount
 * or a button (structure of 17 Sep, section 12, item 7).
 */
export const DISPLAY =
  "text-[length:var(--type-display)] leading-[var(--type-display-leading)] font-[family-name:var(--font-title)] [font-weight:var(--font-title-weight)]";

/** The mark at the top of every screen, the same face at a size that is not a title. */
export const MARK =
  "text-[length:var(--type-mark)] leading-[var(--type-mark-leading)] font-[family-name:var(--font-title)] [font-weight:var(--font-title-weight)]";

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
  "-ml-[var(--space-md)] inline-flex min-h-[var(--tap-target)] min-w-[var(--tap-target)] items-center self-start px-[var(--space-md)] text-[length:var(--type-body)] text-[var(--accent-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]";

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
