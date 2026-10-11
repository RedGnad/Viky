/**
 * The path of a university gift (the founder, 11 Oct 2026): two to four stops, drawn once and shown in three places,
 * under the university a payer chose, on the gift's card for the payer and for the student, and on the judges page.
 *
 * The road of every university gift is the large stops: Shown, then Yours. Two small ones happen once for a
 * university, with its first gift: Set up, the two days in which Viky has its page read, and Checked, the day in
 * which a person at Viky reads the first proof. A university already set up shows the road alone. A gift on results
 * starts at Results, since what its people wait for first is the year's results, and its setting up, which passes long
 * before, is not drawn.
 *
 * Which stops a gift has comes from the provider of its university for what the gift asks, as the rows stand:
 * none, one that carries no pin yet, or one that is ready (src/university-ready.ts). A time is written only where
 * somebody waits on us, and "in seconds" only where a proof is paid with nobody reading it and no agent writing its
 * rule on the way: a fixed rule, or a check that is Reclaim's own.
 *
 * A gift keeps the stops it went through. The first gift at a university waits at Set up and is read at Checked, and
 * once both are behind it the university's rows say "ready": drawn from the rows alone, its path would lose the two
 * stops it had just passed. So a gift also says what it waited on itself, and those stops stay on its path, passed.
 */
export type PathProvider = "none" | "unpinned" | "ready" | "seconds";
export type PathStopId = "results" | "setUp" | "shown" | "checked" | "theirs";
export type PathStop = Readonly<{ id: PathStopId; /** Happens once for a university: drawn small. */ once: boolean; /** The time written under it when nobody stands on it. */ time: string | null }>;

export const PATH_TIMES = { setUp: "once, 2 days", checked: "once, 1 day", seconds: "in seconds", results: "end of year" } as const;

/** What a path is drawn from: the provider as the rows stand, and what the gift itself went through, where it is a gift's. */
export type PathOf = Readonly<{
  provider: PathProvider;
  results: boolean;
  /** This gift was made before its university was set up: it waited at Set up, whatever the rows say since. */
  waitedOnSetUp?: boolean;
  /** This gift's own proof was held for a person to read: it has a Checked stop, whatever the rows say since. */
  readByAPerson?: boolean;
}>;

/** The stops of a gift, in order. */
export function stopsOf(input: PathOf): readonly PathStop[] {
  const stops: PathStop[] = [];
  if (input.results) stops.push({ id: "results", once: false, time: PATH_TIMES.results });
  else if (input.provider === "none" || input.waitedOnSetUp) stops.push({ id: "setUp", once: true, time: PATH_TIMES.setUp });
  stops.push({ id: "shown", once: false, time: null });
  const checked = input.provider === "none" || input.provider === "unpinned" || Boolean(input.readByAPerson);
  if (checked) stops.push({ id: "checked", once: true, time: PATH_TIMES.checked });
  // "In seconds" is said of a proof nobody reads: never on a path that has a person's check on it.
  stops.push({ id: "theirs", once: false, time: !checked && input.provider === "seconds" ? PATH_TIMES.seconds : null });
  return stops;
}

/** Where a gift stands on its path, from what its page already knows of it. */
export type PathStanding = Readonly<{
  /** Nobody has opened the gift: the character sleeps over the first stop that is still to come. */
  opened: boolean;
  reached: boolean;
  /** Over without its proof: the character has gone back, and stands on no stop. */
  over: boolean;
  /** What the gift waits on, as the gift's status says it (src/milestone-status.ts). */
  wait: "building" | "pending" | null;
  /** A gift on results whose results are not out yet. */
  resultsToCome: boolean;
}>;

/** The stop the character stands over, or nothing once the gift is over without its proof. */
export function standingOn(stops: readonly PathStop[], standing: PathStanding): PathStopId | null {
  if (standing.over) return null;
  const has = (id: PathStopId) => stops.some((stop) => stop.id === id);
  if (standing.reached) return "theirs";
  if (standing.wait === "pending" && has("checked")) return "checked";
  if (standing.wait === "building" && has("setUp")) return "setUp";
  if (standing.resultsToCome && has("results")) return "results";
  return "shown";
}

/**
 * What is written under the stop the character stands over, in place of that stop's own time: the day the setting up
 * is done by, whose turn it is, how long the check takes. Nothing under the last stop, and nothing for a setting up
 * whose day has passed: the stop keeps its place and the date goes (the founder, 10 Oct 2026).
 */
export function timeAt(stop: PathStopId, input: Readonly<{ yours: boolean; setUpBy: string | null }>): string | null {
  if (stop === "setUp") return input.setUpBy ? `by ${input.setUpBy}` : null;
  if (stop === "shown") return input.yours ? "by you" : "by them";
  if (stop === "checked") return "within a day";
  if (stop === "results") return PATH_TIMES.results;
  return null;
}

/** A stop's label, which is the same word to everybody but the last: the money is "yours" to one reader only. */
export function labelOf(stop: PathStopId, yours: boolean): string {
  return stop === "results" ? "Results" : stop === "setUp" ? "Set up" : stop === "shown" ? "Shown" : stop === "checked" ? "Checked" : yours ? "Yours" : "Theirs";
}

/** Each stop as the drawing needs it: passed, the one stood on, or still to come. */
export function drawnStops(
  stops: readonly PathStop[],
  at: PathStopId | null,
  input: Readonly<{ yours: boolean; setUpBy: string | null }>,
): readonly Readonly<{ id: PathStopId; label: string; once: boolean; state: "done" | "now" | "toCome"; time: string | null; /** The way from this stop to the next is dashed. */ lead: boolean }>[] {
  const here = at === null ? -1 : stops.findIndex((stop) => stop.id === at);
  return stops.map((stop, index) => {
    const state = here < 0 ? "toCome" : index < here ? "done" : index === here ? "now" : "toCome";
    return {
      id: stop.id,
      label: labelOf(stop.id, input.yours),
      once: stop.once,
      state,
      // The stop stood on says its own line; a stop passed says nothing more; a stop to come says its time.
      time: state === "now" ? timeAt(stop.id, input) : state === "done" ? null : stop.time,
      lead: stop.id === "setUp",
    };
  });
}
