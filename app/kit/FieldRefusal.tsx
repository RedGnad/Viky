import { LIMIT } from "@/src/sentences";

/**
 * A refusal, under the field in cause (rule F of the specification; GOV.UK: "Show the error message next to the field
 * it relates to"). It carries a mark as well as its weight, never a colour of its own: the product has three colours
 * and none of them is red (structure, section 7). The field points at it with `aria-describedby`.
 */
export function FieldRefusal({ id, children }: Readonly<{ id: string; children: string | undefined | null }>) {
  if (!children) return null;
  // The one exception (the founder, 3 Oct 2026): a monthly limit reached is said short and in the red, wherever a
  // screen prints what it was answered, so it reads the same under a press as on the card.
  if (LIMIT.isSaid(children)) {
    return (
      <p id={id} role="alert" className="limit-said">
        {children}
      </p>
    );
  }
  return (
    <p id={id} role="alert" className="flex items-start gap-[var(--space-sm)] text-[length:var(--type-help)] leading-[var(--type-help-leading)] font-semibold text-[var(--text)]">
      <svg aria-hidden focusable="false" width="18" height="18" viewBox="0 0 18 18" className="mt-[1px] shrink-0">
        <circle cx="9" cy="9" r="8" fill="currentColor" />
        <path d="M9 4.5v5.5" stroke="var(--surface)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="9" cy="13" r="1.2" fill="var(--surface)" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
