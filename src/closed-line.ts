import type { Condition } from "./conditions";
import { GIFT_PAGE } from "./sentences";

/**
 * A line its source closed (the fourth state of src/conditions.ts, 12 Oct 2026), said to whoever holds a gift on it:
 * the source's name and the register's own reason. Nothing for a line in any other state.
 *
 * A closed line is not offered, since it is not live. This is for the gifts made on it before: nothing is asked of
 * the source for them, neither a connection nor a reading, and each place that would have asked says this instead.
 */
export function closedLineOf(condition: Pick<Condition, "state" | "source" | "beforeItOpens"> | undefined): string | null {
  return condition?.state === "closed" ? GIFT_PAGE.lineClosed(condition.source, condition.beforeItOpens ?? "").trim() : null;
}
