import "../src/load-env";
import { readRaceResultConfig, raceResultRows } from "../src/race-result";
import { headersFor, RACE_RESULT_ROW } from "../src/attested-sources";

/**
 * What a race result event publishes, for the operator writing its row in `MARATHON_RACES` (src/marathon.ts): the
 * contests by id, the lists by name with the contest each one is for, and for each list its `DataFields`, the
 * columns a row's cells come in, with a sample row when results exist. The bib is column 0; the row of the register
 * names the list, and the columns and field expressions of the name and the time.
 *
 *   pnpm exec tsx scripts/raceresult-inspect.ts 423560
 */
async function main() {
  const eventId = process.argv[2]?.trim();
  if (!eventId) throw new Error("give the event's id, the figures in its my.raceresult.com URL");
  const config = await readRaceResultConfig(eventId);
  console.log(JSON.stringify({ eventId, eventName: config.eventName, server: config.server, contests: config.contests }, null, 2));
  const seen = new Set<string>();
  for (const list of config.lists) {
    const id = `${list.name}|${list.contest}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const url = `https://${config.server}/${eventId}/results/list?key=${config.key}&listname=${encodeURIComponent(list.name)}&page=results&contest=${list.contest}&r=leaders&l=1&openedGroups=%7B%7D&term=`;
    const response = await fetch(url, { headers: headersFor(RACE_RESULT_ROW), cache: "no-store" });
    const answer = (await response.json().catch(() => ({}))) as { DataFields?: string[]; data?: unknown; error?: string };
    const rows = raceResultRows(answer.data);
    console.log(JSON.stringify({ list: list.name, contest: list.contest, error: answer.error, fields: (answer.DataFields ?? []).map((field, index) => `${index}: ${field}`), sample: rows[0] ?? null }, null, 2));
  }
}

main().catch((error) => {
  console.error("INSPECT_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
