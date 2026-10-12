import { waitsForResults } from "./condition-proof";
import { liveConditions, type Condition } from "./conditions";
import { READ_WITHOUT_A_GIFT } from "./judges-ways";
import { CATALOGUE } from "./sentences";

/**
 * Where each condition stands, in the same words wherever it is said (the founder, 12 Oct 2026): the README's table,
 * the public page "What Viky can check" and the judges page. Four phrases, read from the register and from the count
 * of real proofs:
 *
 * - one real proof or more: paid with real money, with its count where the count is read as the page is served;
 * - read on its real page under attestation with no gift, on the day the register names: said read, with that day;
 * - nothing yet: what the line waits for when it waits for something (a year's results, a device), and otherwise that
 *   nobody has shown, connected or been read on one yet;
 * - offered on request and not opened yet: on request, ready two days after a first gift.
 *
 * A line is said read on its real page only while the register lists it (`READ_WITHOUT_A_GIFT`, the readings that
 * really gave a proof) and it has no real proof of its own: take one out of that list and it says what it said before,
 * and the sentence of four figures follows.
 */
export type Stand =
  | Readonly<{ kind: "paid"; proofs: number }>
  | Readonly<{ kind: "read"; on: string }>
  | Readonly<{ kind: "waiting"; says: string }>
  | Readonly<{ kind: "on-request" }>
  /** The count of real proofs could not be read, and nothing else is known of the line: it is open, and no more is said. */
  | Readonly<{ kind: "unread" }>;

/** What an open line waits for, where it waits for something that is not a person. */
const WAITS_FOR: Readonly<Record<string, string>> = { "fitbit-daily": "Takes a Fitbit tracker or a Pixel Watch." };
export const WAITS_FOR_THE_YEAR = "Waits for the year's results.";
export const READY_ON_REQUEST = "Ready two days after a first gift.";

type Line = Pick<Condition, "id" | "nature" | "state">;

/**
 * Where a line stands. `counts` is the count of real proofs a line, or nothing when it could not be read; `waiting` is
 * the lines on request that the operator has not opened yet (src/on-request.ts).
 */
export function standOf(condition: Line, counts: ReadonlyMap<string, number> | null, waiting: ReadonlySet<string>): Stand {
  if (condition.state === "on-request" && waiting.has(condition.id)) return { kind: "on-request" };
  const proofs = counts?.get(condition.id) ?? 0;
  if (proofs > 0) return { kind: "paid", proofs };
  if (READ_WITHOUT_A_GIFT.conditions.includes(condition.id)) return { kind: "read", on: READ_WITHOUT_A_GIFT.on };
  if (!counts) return { kind: "unread" };
  return { kind: "waiting", says: WAITS_FOR[condition.id] ?? (waitsForResults(condition.id) ? WAITS_FOR_THE_YEAR : CATALOGUE.nobodyYet[condition.nature]) };
}

const proofsInWords = (count: number) => (count === 1 ? "1 real proof" : `${count} real proofs`);

/** On a page: the state's own word, then what the line has. The count is the one read as the page is served. */
export function standOnAPage(stand: Stand): Readonly<{ state: string; says: string }> {
  switch (stand.kind) {
    case "paid":
      return { state: "Open.", says: `Paid on ${proofsInWords(stand.proofs)}.` };
    case "read":
      return { state: "Open.", says: `Read on its real page, ${stand.on}.` };
    case "waiting":
      return { state: "Open.", says: stand.says };
    case "on-request":
      return { state: "On request.", says: READY_ON_REQUEST };
    case "unread":
      return { state: "Open.", says: "" };
  }
}

/** The same on one line, as the judges page ends a condition's row. */
export function standInOneLine(stand: Stand): string {
  const page = standOnAPage(stand);
  return page.says ? `${page.state} ${page.says}` : page.state;
}

/** In the README, whose table carries its own date in its head: no count and no day in a cell. */
export function standInTheReadme(stand: Stand): string {
  switch (stand.kind) {
    case "paid":
      return "Paid with real money";
    case "read":
      return "Read on its real page";
    case "waiting":
      return `Open. ${stand.says}`;
    case "on-request":
      return `On request. ${READY_ON_REQUEST}`;
    case "unread":
      return "Open.";
  }
}

export type StandsCounted = Readonly<{ paid: number; read: number; waiting: number; onRequest: number; total: number }>;

/** The stands of every line offered, counted. Nothing when one of them could not be read: no sentence is then made. */
export function standsCounted(counts: ReadonlyMap<string, number> | null, waiting: ReadonlySet<string>, lines: readonly Line[] = liveConditions()): StandsCounted | null {
  const stands = lines.map((line) => standOf(line, counts, waiting));
  if (stands.some((stand) => stand.kind === "unread")) return null;
  const of = (kind: Stand["kind"]) => stands.filter((stand) => stand.kind === kind).length;
  return { paid: of("paid"), read: of("read"), waiting: of("waiting"), onRequest: of("on-request"), total: stands.length };
}

/** The sentence of four figures: "3 paid with real money, 10 read on their real page, ...". A figure of none is not said. */
export function fourFigures(counted: StandsCounted): string {
  const said = [
    counted.paid > 0 ? `${counted.paid} paid with real money` : null,
    counted.read > 0 ? `${counted.read} read on ${counted.read === 1 ? "its" : "their"} real page` : null,
    counted.waiting > 0 ? `${counted.waiting} open and waiting for ${counted.waiting === 1 ? "its" : "their"} first person` : null,
    counted.onRequest > 0 ? `${counted.onRequest} on request` : null,
  ].filter((one): one is string => one !== null);
  return `${said.join(", ")}.`;
}
