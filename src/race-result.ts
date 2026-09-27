import { headersFor, RACE_RESULT_ROW } from "./attested-sources";
import type { MarathonEvent, MarathonRace } from "./marathon";

/**
 * race result, the third timing platform (the founder, 27 Sep 2026: coverage first), measured on 26 Sep 2026. An
 * event's results page is configured by `/<event>/results/config?page=results&noVisitor=1`: the list's public key,
 * the shard that serves the lists, the contests by id and the lists by name. A list is read at
 * `/<event>/results/list?key=…&listname=…&contest=…&r=search&term=<bib>`, which answers the rows of that bib, arrays
 * of cells in the order of the list's own `DataFields`. Which column is the name and which the time differs from
 * one event to the next: the register fixes them when the race is written (`pnpm raceresult:inspect`), with the
 * field expressions the list publishes, and every reading checks the list still publishes them there. Server only,
 * the fetching kept here so the plain step and the attested one read the same page.
 */

export type PlainFetch = (url: string, init: RequestInit) => Promise<Response>;

export type RaceResultConfig = Readonly<{ key: string; server: string; eventName: string; contests: Readonly<Record<string, string>>; lists: readonly { name: string; contest: string }[] }>;

export class RaceResultError extends Error {
  constructor(
    readonly code: "FETCH_FAILED" | "UNKNOWN_RACE" | "UNKNOWN_LIST" | "NO_RESULT" | "ANOTHER_BIB",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "RaceResultError";
  }
}

/**
 * race result's other way of asking a reader to slow down (D290, D292): after its 429s, a throttled address is
 * answered 404 with a trap page, a body that starts `"A":`, for hours, whatever the user agent. That 404 says nothing
 * about the event or the runner, so wherever race result is read it counts as a 429. The register generator reads it
 * with this same rule.
 */
export function isRaceResultTrap(body: string): boolean {
  return body.trimStart().startsWith('"A":');
}

const THROTTLED = "race result is being read too often right now. Nothing was counted: try again in half an hour.";

async function raceResultJson<T>(url: string, fetchImpl: PlainFetch): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: headersFor(RACE_RESULT_ROW), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new RaceResultError("FETCH_FAILED", "race result could not be read right now", { cause: error });
  }
  if (response.status === 429) throw new RaceResultError("FETCH_FAILED", THROTTLED);
  if (response.status === 404) {
    if (isRaceResultTrap(await response.text().catch(() => ""))) throw new RaceResultError("FETCH_FAILED", THROTTLED);
    throw new RaceResultError("UNKNOWN_RACE", "race result knows no event by that id");
  }
  if (response.status !== 200) throw new RaceResultError("FETCH_FAILED", `race result answered ${response.status}`);
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new RaceResultError("FETCH_FAILED", "race result answered something that is not a list", { cause: error });
  }
}

/** The event's results configuration: the key every list is read with, the shard, the contests and the lists. */
export async function readRaceResultConfig(eventId: string, fetchImpl: PlainFetch = fetch): Promise<RaceResultConfig> {
  if (!/^\d{4,8}$/.test(eventId)) throw new RaceResultError("UNKNOWN_RACE", "That is not a race result event");
  const raw = await raceResultJson<{ key?: string; server?: string; eventname?: string; contests?: Record<string, string>; TabConfig?: { Lists?: { Name: string; Contest: string | null }[] } }>(`https://my.raceresult.com/${eventId}/results/config?page=results&noVisitor=1`, fetchImpl);
  if (!raw.key || !/^[0-9a-f]{32}$/.test(raw.key)) throw new RaceResultError("UNKNOWN_LIST", "That event publishes no results page");
  const server = raw.server && /^my\d?\.raceresult\.com$/.test(raw.server) ? raw.server : "my.raceresult.com";
  return { key: raw.key, server, eventName: String(raw.eventname ?? ""), contests: raw.contests ?? {}, lists: (raw.TabConfig?.Lists ?? []).map((list) => ({ name: list.Name, contest: String(list.Contest ?? "0") })) };
}

/** The account the attested read takes for this row: everything the URL needs, and the two columns the pattern captures. */
export function raceResultAccount(config: Pick<RaceResultConfig, "key" | "server">, race: MarathonRace, chosen: MarathonEvent, bib: string): string {
  const list = race.raceResult;
  if (!list) throw new RaceResultError("UNKNOWN_LIST", "This race names no list to read");
  return [config.server, race.ref, config.key, encodeURIComponent(list.listname), chosen.heat, bib.trim().toUpperCase(), String(list.columns.name), String(list.columns.time)].join("|");
}

/** The rows of a list answer, flattened out of their groups: arrays of cells; the trailing count is not a row. */
export function raceResultRows(data: unknown): readonly (readonly string[])[] {
  const rows: (readonly string[])[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      if (node.length > 0 && node.every((cell) => typeof cell === "string")) rows.push(node as string[]);
      else for (const child of node) walk(child);
    } else if (node && typeof node === "object") for (const child of Object.values(node as Record<string, unknown>)) walk(child);
  };
  walk(data);
  return rows;
}

export type RaceResultRow = Readonly<{ runner: string; official: string }>;

/**
 * The row of the bib on the race's list, read plainly: the list must still publish the register's fields at the
 * register's columns, and the row must start with that bib. The time cell is empty for a DNF, a DNS or a DSQ.
 */
export async function readRaceResultRow(race: MarathonRace, chosen: MarathonEvent, bib: string, fetchImpl: PlainFetch = fetch): Promise<{ account: string; row: RaceResultRow }> {
  const list = race.raceResult;
  if (!list) throw new RaceResultError("UNKNOWN_LIST", "This race names no list to read");
  const config = await readRaceResultConfig(race.ref, fetchImpl);
  const account = raceResultAccount(config, race, chosen, bib);
  const answer = await raceResultJson<{ DataFields?: string[]; data?: unknown; error?: string }>(RACE_RESULT_ROW.url(account), fetchImpl);
  if (answer.error) throw new RaceResultError("UNKNOWN_LIST", `race result answered "${answer.error}" for that list`);
  const fields = answer.DataFields ?? [];
  if (fields[0] !== "BIB" || fields[list.columns.name] !== list.fields.name || fields[list.columns.time] !== list.fields.time) {
    throw new RaceResultError("UNKNOWN_LIST", "That list no longer has the name and the time where the register says");
  }
  const wanted = bib.trim().toUpperCase();
  const row = raceResultRows(answer.data).find((cells) => cells[0]?.toUpperCase() === wanted);
  if (!row) throw new RaceResultError("NO_RESULT", "No runner answers to that bib in that race");
  return { account, row: { runner: (row[list.columns.name] ?? "").trim(), official: (row[list.columns.time] ?? "").trim() } };
}

/** "2:08:24", "12:29.14", "1:05:32.5": seconds under a day, rounded down to the second; nothing for an empty cell or a status. */
export function raceResultSeconds(printed: string): number | undefined {
  const match = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(printed.trim());
  if (!match) return undefined;
  const hours = match[1] !== undefined ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  // "12:29.14" is minutes, seconds and hundredths; "2:08:24" is hours, minutes and seconds.
  const total = match[1] !== undefined ? hours * 3600 + minutes * 60 + seconds : minutes * 60 + seconds;
  return total > 0 && total < 24 * 3600 ? total : undefined;
}
