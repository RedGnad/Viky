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
 */

const TAP = "min-h-[var(--tap-target)] inline-flex items-center justify-center gap-[var(--space-sm)]";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]";

/** The action a screen is asking for. One per screen, at most, so it means something. */
export const PRIMARY_BUTTON = `${TAP} ${FOCUS} w-full rounded-full border border-[var(--control-border)] bg-[var(--accent)] px-[var(--space-lg)] py-[var(--space-md)] text-[length:var(--type-body)] font-medium text-[var(--on-accent)] disabled:opacity-50`;

/** Everything else a person may do from here. */
export const SECONDARY_BUTTON = `${TAP} ${FOCUS} w-full rounded-full border border-[var(--control-border)] px-[var(--space-lg)] py-[var(--space-md)] text-[length:var(--type-body)] disabled:opacity-50`;

/** A secondary action that sits beside others rather than filling the width. */
export const INLINE_BUTTON = `${TAP} ${FOCUS} rounded-full border border-[var(--control-border)] px-[var(--space-lg)] py-[var(--space-sm)] text-[length:var(--type-help)] disabled:opacity-50`;

/** A box that groups one step of a journey. Its edge is a divider, not a control: no ratio is required. */
export const CARD =
  "space-y-[var(--space-md)] rounded-[var(--radius-card)] border border-[var(--divider)] bg-[var(--surface)] p-[var(--space-lg)]";

/**
 * A line the person types into. Its border identifies it, so it carries the control colour, and it sits on a
 * surface rather than on the page ground so a paragraph of yellow never runs under a value being typed.
 */
export const FIELD = `min-h-[var(--tap-target)] ${FOCUS} w-full rounded-[var(--radius-control)] border border-[var(--control-border)] bg-[var(--surface)] px-[var(--space-md)] py-[var(--space-sm)] text-[length:var(--type-body)]`;

/** The four levels of text, and there is no fifth. */
export const MONEY = "text-[length:var(--type-money)] leading-[var(--type-money-leading)] font-semibold tabular-nums";
export const TITLE = "text-[length:var(--type-title)] leading-[var(--type-title-leading)] font-semibold";
export const BODY = "text-[length:var(--type-body)] leading-[var(--type-body-leading)]";
export const HELP = "text-[length:var(--type-help)] leading-[var(--type-help-leading)] text-[var(--muted)]";

/** Prose is capped so a line never runs past what every published range agrees is readable. */
export const PROSE = `${BODY} max-w-[var(--prose-max)]`;

/** Stacked controls, spaced so Apple's bezelled minimum is met without anybody remembering it. */
export const CONTROL_STACK = "flex flex-col gap-[var(--tap-gap)]";
