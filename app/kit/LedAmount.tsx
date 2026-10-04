import type { CSSProperties } from "react";
import type { LedAmount } from "@/src/display-currency";
import { LED_AMOUNT as W } from "@/src/sentences";

/**
 * An amount led by the reader's currency (the founder, 29 Sep 2026): "about" small before the figure, because the
 * account holds dollars and a conversion is never exact, and the figure itself at whatever size the screen gives it.
 * At the display size the figure stays the sign and the number (the art direction brief, section 8), so "about" is
 * set at the help size on the same baseline rather than at the figure's size.
 */
export function LedFigure({ amount, className, style }: Readonly<{ amount: LedAmount; className: string; style?: CSSProperties }>) {
  return (
    <p className={className} style={style}>
      {amount.converted ? <span className="mr-[0.3em] align-baseline text-[length:var(--type-help)] font-medium tracking-normal text-[var(--muted)]">{W.about}</span> : null}
      {amount.lead}
    </p>
  );
}
