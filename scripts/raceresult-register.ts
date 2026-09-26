import "../src/load-env";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { headersFor, RACE_RESULT_ROW } from "../src/attested-sources";
import { MARATHON_RACES } from "../src/marathon";

/**
 * The race result half of the register, written by this script and by nothing else (the founder, 27 Sep 2026: every
 * coming event whose name says marathon, half or 10 km, Africa first, then the diaspora, then the rest; a race only
 * if its results list reads by bib). It reads race result's own list of coming events, keeps the running ones whose
 * name matches, and for each contest that is a marathon, a half or a 10 km keeps it only when:
 *   - the event publishes a results list declared for that contest (a list declared for all contests, "0", does not
 *     answer the search by bib: measured on 26 Sep 2026, it returns nothing where the per-contest list returns the row);
 *   - that list's first column is the bib, and a name column and a time column can be told from its field names;
 *   - the list answers the search mode without an error.
 * What it writes is `src/race-result-races.ts`. Run it again to refresh; the register is only ever this file.
 *
 *   pnpm exec tsx scripts/raceresult-register.ts
 */

type ApiEvent = { id: number; eventTypeName: string; name: string; dateFrom: string; location: string; countryCode: string; lng: number };

const AFRICA = ["DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CD", "CG", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RE", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW"];
const DIASPORA = ["BE", "CA", "US", "GB", "FR"];
const NAMED = /marat|semi|half|halb|halve|mezza|puoli|media marat|\b10 ?km\b|\b10k\b/i;
const MARATHON = /marat|\b42/i;
const NOT_FULL = /half|semi|halb|halve|mezza|puoli|media|1\/2|1\/4|quarter|viertel|relay|relais|staffel|estafeta|duo|team|kids|junior|walk|nordic|\b21|\b10|\b5 ?k/i;
const HALF = /half|semi|halb|halve|mezza|puoli|media marat|\b21[.,]?1?\s?k?m?\b|\b21 ?km\b|1\/2/i;
const TEN = /\b10 ?km\b|\b10k\b|\b10 000\b|\b10000\b|\b10 ?k\b/i;
const NOT_A_RUNNER_RACE = /relay|relais|staffel|estafeta|duo|team|kids|walk|nordic|wheel|rollstuhl|handbike|silla|inline|skate|bike|virtual|virtuel/i;
const NAME_FIELD = /name|nome|nombre|naam|nom\b|flname|lfname/i;
const NOT_NAME = /contest|agegroup|nation|club|team|city|verein|ort|firstname|lastname|vorname|nachname/i;
const CHIP = /chip|netto|\bnet\b/i;
const TIME_FIELD = /time|zeit|final|finish|arrivo|tiempo|temps|result|ziel|tid|aika|tijd/i;
const NOT_TIME = /gap|pace|speed|lap|split|rank|pl\b|km|diff|rueckstand|behind|tempo|avg|info|eta|penalty/i;
const LIST_GOOD = /result|ergebnis|gesamt|einlauf|\bziel\b|final|résultat|resultat|clasif|uitslag|finisher|zieleinlauf|classifica|tulokset|lista|overall/i;
const LIST_BAD = /award|winner|podium|\btop ?\d|team|mannschaft|start|live|participant|teilnehmer|concurrent|split|\bak\b|age ?group|category|categor|kategor|club|verein|dnf|not finished|relay|staffel|club|school/i;

/**
 * Small recurring laps, not races a gift is made for (the founder, 27 Sep 2026: forty German races were noise):
 * the Hamburg "Special Marathons" series (Teichwiesen, Lost Places, Insel), marathons run as laps on a track or a
 * hill, an advent series, and ultras, which are not a marathon distance.
 */
const SMALL_SERIES = /teichwiesen|lost places|insel marathon|hamburg special marathons|höhenmetersammlung|bahnmarathon|adventsserie|ultramarathon|\b50 ?km\b/i;

function distanceOf(contest: string): "marathon" | "half" | "10k" | undefined {
  if (NOT_A_RUNNER_RACE.test(contest)) return undefined;
  if (HALF.test(contest)) return "half";
  if (MARATHON.test(contest) && !NOT_FULL.test(contest)) return "marathon";
  if (TEN.test(contest) && !/\b10[.,]\d|miles?|meilen/i.test(contest)) return "10k";
  return undefined;
}

function slug(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).replace(/-$/, "");
}

function offsetOf(lng: number): string {
  const hours = Math.max(-12, Math.min(14, Math.round((Number.isFinite(lng) ? lng : 0) / 15)));
  return `${hours < 0 ? "-" : "+"}${String(Math.abs(hours)).padStart(2, "0")}:00`;
}

/**
 * race result answers 429 "too many requests" to a reader that asks faster than about one call every two seconds,
 * and keeps doing so for minutes (measured 26 Sep 2026, and again at one call every three seconds when two runs overlapped on 27 Sep): one call every five seconds, and a minute's wait on a 429.
 */
const STEP_MS = 5_000;
/** The list endpoint, on its own shard, throttles sooner than the config (27 Sep 2026): fifteen seconds. */
const LIST_STEP_MS = 15_000;
let throttled = 0;
/**
 * One call. A 404 or a page that keeps failing (500, a timeout, a body that is not JSON) leaves that event out and
 * the run goes on; only race result asking to slow down six times running stops the run, before anything is written.
 */
async function json<T>(url: string, stepMs = STEP_MS): Promise<T | null> {
  let refusals = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await pause(stepMs);
    try {
      const response = await fetch(url, { headers: headersFor(RACE_RESULT_ROW), cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (response.status === 404) {
        // A throttled address gets a 404 whose body is a trap page ("A":{"A":…), never a fact about the event.
        const text = await response.text().catch(() => "");
        if (!text.startsWith('"A":')) return null;
        throttled += 1;
        refusals += 1;
        await pause(60_000);
        continue;
      }
      if (response.status === 200) return (await response.json()) as T;
      if (response.status === 429) {
        throttled += 1;
        refusals += 1;
        await pause(60_000);
        continue;
      }
    } catch {
      // a timeout or a body that is not JSON: tried again below
    }
    if (attempt >= 2) return null;
  }
  if (refusals >= 6) throw new Error(`race result kept asking to slow down at ${url}: nothing written`);
  return null;
}

type Config = { key?: string; server?: string; eventname?: string; contests?: Record<string, string>; TabConfig?: { Lists?: { Name: string; Contest: string | null }[] } };
async function configOf(eventId: string) {
  const raw = await json<Config>(`https://my.raceresult.com/${eventId}/results/config?page=results&noVisitor=1`);
  if (!raw?.key || !/^[0-9a-f]{32}$/.test(raw.key)) return null;
  const server = raw.server && /^my\d?\.raceresult\.com$/.test(raw.server) ? raw.server : "my.raceresult.com";
  return { key: raw.key, server, contests: raw.contests ?? {}, lists: (raw.TabConfig?.Lists ?? []).map((list) => ({ name: list.Name, contest: String(list.Contest ?? "0") })) };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Measured = { kind: "left"; why: string } | { kind: "kept"; heats: { distance: string; label: string; heat: string }[]; list: { listname: string; name: number; time: number; nameField: string; timeField: string } };

/** One event measured against the rule: which of its distances has a results list that reads by bib, and its columns. */
async function measure(event: ApiEvent): Promise<Measured> {
  const config = await configOf(String(event.id));
  if (!config) return { kind: "left", why: "no results page" };
  const heats: { distance: string; label: string; heat: string }[] = [];
  let chosenList: { listname: string; name: number; time: number; nameField: string; timeField: string } | null = null;
  for (const [contestId, contestName] of Object.entries(config.contests)) {
    const distance = distanceOf(contestName);
    if (!distance || heats.some((one) => one.distance === distance)) continue;
    // The list's own name, after its group ("Result Lists|All Award Winners" is an award list, not the results).
    const own = (name: string) => name.split("|").pop() ?? name;
    const lists = config.lists.filter((list) => list.contest === contestId && LIST_GOOD.test(own(list.name)) && !LIST_BAD.test(own(list.name)));
    for (const list of lists) {
      if (chosenList && list.name !== chosenList.listname) continue;
      const answer = await json<{ DataFields?: string[]; data?: unknown; error?: string }>(`https://${config.server}/${event.id}/results/list?key=${config.key}&listname=${encodeURIComponent(list.name)}&page=results&contest=${contestId}&r=search&l=0&openedGroups=%7B%7D&term=0`, LIST_STEP_MS);
      if (!answer || answer.error) continue;
      const fields = answer.DataFields ?? [];
      if (fields[0] !== "BIB") continue;
      const nameIndex = fields.findIndex((field, index) => index > 0 && NAME_FIELD.test(field) && !NOT_NAME.test(field));
      if (nameIndex < 1) continue;
      const after = fields.map((field, index) => ({ field, index })).filter((one) => one.index > nameIndex && TIME_FIELD.test(one.field) && !NOT_TIME.test(one.field));
      const time = after.find((one) => CHIP.test(one.field)) ?? after[0];
      if (!time) continue;
      if (chosenList && (chosenList.name !== nameIndex || chosenList.time !== time.index)) continue;
      chosenList = { listname: list.name, name: nameIndex, time: time.index, nameField: fields[nameIndex], timeField: time.field };
      heats.push({ distance, label: contestName.replace(/\{EN:([^|}]*)[^}]*\}/, "$1").trim(), heat: contestId });
      break;
    }
  }
  if (!chosenList || heats.length === 0) return { kind: "left", why: "no per-contest results list read by bib" };
  return { kind: "kept", heats, list: chosenList };
}

async function main() {
  // Never from the address that reads in production (the founder, 27 Sep 2026): a run that got it throttled would
  // stop every real reading. Railway sets these in every service it runs.
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_PROJECT_ID) {
    throw new Error("the register is never built from Railway, the address that reads in production: run it from a developer's machine or a throwaway address");
  }
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const listed = await json<{ Events: ApiEvent[] }[]>(`https://my.raceresult.com/RREvents/list?group=0&user=0&userID=0&geoLocation=IP&lang=en&modes=upcoming&dateFrom=${tomorrow}&dateTo=2027-03-31&limit=5000`);
  const events = (listed?.[0]?.Events ?? []).filter((one) => one.eventTypeName === "Running" && one.dateFrom >= tomorrow && /^[A-Z]{2}$/.test(one.countryCode) && NAMED.test(one.name));
  const rank = (code: string) => (AFRICA.includes(code) ? 0 : DIASPORA.includes(code) ? 1 : 2);
  events.sort((a, b) => rank(a.countryCode) - rank(b.countryCode) || a.dateFrom.localeCompare(b.dateFrom));
  console.error(`${events.length} coming running events named marathon, half or 10 km`);
  // An empty list is race result refusing to answer (it answers 404 to an address it throttles), never a fact: the
  // register is kept as it is.
  if (events.length === 0) throw new Error("race result listed no coming event: nothing written");
  const rows: string[] = [];
  const kept: { country: string; name: string }[] = [];
  const left: { name: string; why: string }[] = [];
  const ids = new Set<string>();
  // What each event measured, kept between runs outside the repository, so a run stopped by race result's pace
  // resumes where it stopped instead of asking everything again (27 Sep 2026: a whole run is two hundred calls).
  const cachePath = process.env.RACE_RESULT_CACHE ?? join(tmpdir(), "viky-raceresult-register.json");
  const cache: Record<string, Measured> = existsSync(cachePath) ? (JSON.parse(readFileSync(cachePath, "utf8")) as Record<string, Measured>) : {};
  const save = () => writeFileSync(cachePath, JSON.stringify(cache));
  console.error(`${Object.keys(cache).length} events already measured in ${cachePath}`);
  // A race another timing company already reads is not listed twice (Frankfurt is MikaTiming's): same town, same month.
  const readElsewhere = new Set(MARATHON_RACES.filter((race) => race.timer !== "race-result").map((race) => `${race.town.toLowerCase()}|${race.startsAt.slice(0, 7)}`));
  for (const event of events) {
    if (SMALL_SERIES.test(event.name)) {
      left.push({ name: event.name, why: "a small recurring lap" });
      continue;
    }
    if (readElsewhere.has(`${event.location.trim().toLowerCase()}|${event.dateFrom.slice(0, 7)}`)) {
      left.push({ name: event.name, why: "read by another timing company" });
      continue;
    }
    let measured = cache[String(event.id)];
    if (!measured) {
      try {
        measured = await measure(event);
      } catch (error) {
        save();
        throw error;
      }
      cache[String(event.id)] = measured;
      save();
    }
    if (measured.kind === "left") {
      left.push({ name: event.name, why: measured.why });
      continue;
    }
    const heats = measured.heats;
    const chosenList = measured.list;
    const name = event.name.replace(/\{EN:([^|}]*)[^}]*\}/, "$1").replace(/\s+/g, " ").trim();
    let raceId = `${slug(name)}-${event.id}`;
    while (ids.has(raceId)) raceId += "x";
    ids.add(raceId);
    kept.push({ country: event.countryCode, name });
    rows.push(
      `  { raceId: ${JSON.stringify(raceId)}, timer: "race-result", ref: ${JSON.stringify(String(event.id))}, name: ${JSON.stringify(name)}, country: ${JSON.stringify(event.countryCode)}, town: ${JSON.stringify((event.location || name).trim())}, startsAt: ${JSON.stringify(`${event.dateFrom}T00:00:00${offsetOf(event.lng)}`)}, events: ${JSON.stringify(heats)}, raceResult: { listname: ${JSON.stringify(chosenList.listname)}, columns: { name: ${chosenList.name}, time: ${chosenList.time} }, fields: { name: ${JSON.stringify(chosenList.nameField)}, time: ${JSON.stringify(chosenList.timeField)} } } },`,
    );
  }
  const header = `import type { MarathonRace } from "./marathon";

/**
 * race result's coming races with a marathon, a half or a 10 km, each one read by bib (the founder, 27 Sep 2026).
 * Written by \`scripts/raceresult-register.ts\` on ${new Date().toISOString().slice(0, 10)} from race result's own list of coming events: ${events.length}
 * named so, ${rows.length} kept, the others left out because their results list does not read by bib. Africa first, then
 * the diaspora's countries, then the rest; a distance is a contest with its own results list; midnight at the
 * event's longitude closes the bib. Do not edit by hand: run the script again.
 */
export const RACE_RESULT_RACES: readonly MarathonRace[] = [
`;
  writeFileSync("src/race-result-races.ts", `${header}${rows.join("\n")}\n];\n`);
  const byCountry: Record<string, number> = {};
  for (const one of kept) byCountry[one.country] = (byCountry[one.country] ?? 0) + 1;
  console.log(JSON.stringify({ throttled, named: events.length, kept: rows.length, left: left.length, byCountry, leftReasons: left.reduce<Record<string, number>>((acc, one) => ((acc[one.why] = (acc[one.why] ?? 0) + 1), acc), {}) }, null, 2));
}

main().catch((error) => {
  console.error("REGISTER_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
