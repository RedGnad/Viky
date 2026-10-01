import { marathonEventById } from "./marathon";
import { wcaCourseOf } from "./wca";

/**
 * How long a gift on an event has to run (the audit of 1 Oct 2026).
 *
 * A gift made for a race or a competition is proved by a result that exists only after the event, and what it is
 * proved by must be granted before the gift's last day. A length that ends before the event is a gift that can never
 * pay: the card offered one whenever the event was further off than the suggested length, and the contract's own
 * ceiling, 365 days, was below the 400 the register offered, so the longest chip was refused after the money had moved
 * into the account. So: the lengths stop at the contract's ceiling, the chip pressed when an event is chosen is the
 * first that outlasts it, and a length that ends before the event is refused before anything is signed for.
 *
 * "Outlasts" leaves the days a result takes to be published: three after a race starts, ten after a competition's
 * last day.
 */
export const RACE_RESULT_DAYS = 3;
export const COMPETITION_RESULT_DAYS = 10;
const DAY_MS = 86_400_000;

/** The moment a gift on a race must still be running: three days after its start. */
export function raceReadableAtMs(startsAt: string): number {
  return new Date(startsAt).getTime() + RACE_RESULT_DAYS * DAY_MS;
}

/** The same for a competition, from its last day as the WCA dates it ("2026-11-08"): the end of that day anywhere, and ten days. */
export function competitionReadableAtMs(endDate: string): number {
  return new Date(`${endDate}T00:00:00Z`).getTime() + (1 + COMPETITION_RESULT_DAYS) * DAY_MS + 12 * 3_600_000;
}

/** Whether a gift of this many days, made now, is still running when its event's result can be read. */
export function outlastsTheEvent(days: number, readableAtMs: number, nowMs: number): boolean {
  return Number.isFinite(readableAtMs) && nowMs + days * DAY_MS >= readableAtMs;
}

/**
 * The length pressed when an event is chosen (D130 keeps its three chips): the suggested one where it outlasts the
 * event, the longest otherwise. The longest is pressed even where it does not reach, so the card shows the nearest
 * there is and the refusal says why.
 */
export function lengthForTheEvent(bounds: Readonly<{ suggested: number; max: number }>, readableAtMs: number, nowMs: number = Date.now()): number {
  return outlastsTheEvent(bounds.suggested, readableAtMs, nowMs) ? bounds.suggested : bounds.max;
}

/** The moment a race of the register can be read, from the course a gift names ("race/distance"); nothing for anything else. */
export function raceReadableAtOf(course: string | undefined): number | undefined {
  const found = course ? marathonEventById(course) : undefined;
  return found ? raceReadableAtMs(found.race.startsAt) : undefined;
}

export type EventToOutlast = Readonly<{ what: "race" | "competition"; readableAtMs: number }>;

/**
 * The event a gift names and when its result can be read, for the route that makes the gift. A race is the
 * register's; a competition is asked of the WCA, and one that cannot be read is an error to refuse on, never a gift
 * made blind.
 */
export async function eventToOutlast(conditionId: string, course: string | undefined, competitionEndDate: (competitionId: string) => Promise<string>): Promise<EventToOutlast | null> {
  if (!course) return null;
  if (conditionId === "marathon-finish") {
    const readableAtMs = raceReadableAtOf(course);
    return readableAtMs === undefined ? null : { what: "race", readableAtMs };
  }
  if (conditionId === "wca-time") {
    const found = wcaCourseOf(course);
    return found ? { what: "competition", readableAtMs: competitionReadableAtMs(await competitionEndDate(found.competitionId)) } : null;
  }
  return null;
}

/** What the route says of a length that ends before the event. */
export function endsBeforeTheEvent(what: EventToOutlast["what"]): string {
  return `This gift would end before the ${what}'s result can be read, so it could never pay. Choose a longer one. Nothing was taken.`;
}
