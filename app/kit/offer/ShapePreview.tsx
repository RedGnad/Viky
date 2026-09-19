import type { GiftShape } from "@/src/gift-draft";
import { OFFER as W } from "@/src/sentences";
import { HELP } from "../../components/ui";

/**
 * The shape of the gift, drawn empty as soon as the condition is chosen (the vision of 19 Sep 2026, section 6).
 *
 * Three shapes and no fourth: a row of days for a habit, a climb for a rating, a stamp for something obtained or
 * not. It is the same drawing the gift's own page will fill in, so what a funder sees here is what they will watch
 * afterwards, which is the whole reason the card shows it before anything is paid.
 */
export function ShapePreview({ shape, days }: Readonly<{ shape: GiftShape; days?: number }>) {
  // One mark per day, and the same mark at every width: marks that stretched to fill the card read as a bar at
  // 1440 and as dots at 390, and a row of fourteen under the words "30 days" said two different things.
  const count = days && days > 0 ? days : 7;
  return (
    <div className="space-y-[var(--space-xs)]">
      <div aria-hidden="true" className="flex items-end gap-[var(--space-xs)]">
        {shape === "days" ? (
          <span className="flex flex-wrap gap-[var(--space-xs)]">
            {Array.from({ length: count }, (_, index) => (
              <span key={index} className="h-[var(--space-md)] w-[var(--space-md)] rounded-full border border-[var(--divider)]" />
            ))}
          </span>
        ) : null}
        {shape === "climb" ? (
          <span className="flex h-[var(--space-lg)] w-full items-center rounded-full border border-[var(--divider)]">
            <span className="h-full w-[6%] rounded-full bg-[var(--divider)]" />
          </span>
        ) : null}
        {shape === "stamp" ? (
          <span className="h-[calc(var(--space-lg)*2)] w-[calc(var(--space-lg)*2)] rounded-full border-2 border-dashed border-[var(--divider)]" />
        ) : null}
      </div>
      <p className={HELP}>{shape === "days" ? W.shape.days : shape === "climb" ? W.shape.climb : W.shape.stamp}</p>
    </div>
  );
}
