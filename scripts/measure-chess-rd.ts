/**
 * How far a Chess.com rating moves in one game, against the RD the ratings page gives for it (C2).
 *
 * The milestone terms assume about ten points a game (src/milestone-terms.ts: a start margin of 10, a smallest climb of
 * 50). Glicko moves a rating further the higher its RD, and Chess.com publishes no RD above which a rating is still
 * provisional, so the threshold is measured rather than chosen: for each profile and cadence, the RD the stats page
 * gives now, and the size of the rating changes over its most recent rated games, read from the monthly game archives
 * (each game carries the player's rating after it). Read only, public pages, one request at a time.
 *
 * Usage: npx tsx scripts/measure-chess-rd.ts [extra usernames...]
 */

import { CHESS_MODES, type ChessMode } from "../src/chess-com";

const UA = "Viky/1.0 (+https://viky.cash)";
const API = "https://api.chess.com/pub";
/** The names read on 17 Sep 2026: players of every level named in D88, then accounts from Luxembourg's public list. */
const NAMED = ["hikaru", "magnuscarlsen", "danielnaroditsky", "erik", "john", "abc", "bar"];
const SAMPLED_FROM_COUNTRY = "LU";
const SAMPLE_SIZE = 40;
const RECENT_GAMES = 20;

async function get(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { accept: "application/json", "user-agent": UA } });
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      continue;
    }
    if (!response.ok) return null;
    return response.json();
  }
  return null;
}

type Row = { username: string; joined: string; mode: ChessMode; games: number; rd: number; rating: number; lastGame: string; deltas: number; median: number | null; max: number | null };

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function measure(username: string): Promise<Row[]> {
  const profile = (await get(`${API}/player/${username}`)) as { joined?: number } | null;
  const stats = (await get(`${API}/player/${username}/stats`)) as Record<string, { last?: { rating: number; date: number; rd?: number }; record?: { win: number; loss: number; draw: number } }> | null;
  if (!profile || !stats) return [];
  const archives = ((await get(`${API}/player/${username}/games/archives`)) as { archives?: string[] } | null)?.archives ?? [];
  const rows: Row[] = [];
  for (const mode of CHESS_MODES) {
    const block = stats[`chess_${mode}`];
    if (!block?.last || typeof block.last.rd !== "number") continue;
    // The player's rating after each of their most recent rated games in this cadence, oldest first.
    const after: number[] = [];
    for (let index = archives.length - 1; index >= 0 && after.length < RECENT_GAMES + 1; index -= 1) {
      const month = ((await get(archives[index])) as { games?: Array<Record<string, unknown>> } | null)?.games ?? [];
      const mine = month
        .filter((game) => game.time_class === mode && game.rated === true && game.rules === "chess")
        .map((game) => {
          const white = game.white as { username: string; rating: number };
          const black = game.black as { username: string; rating: number };
          return { at: Number(game.end_time), rating: white.username.toLowerCase() === username.toLowerCase() ? white.rating : black.rating };
        })
        .sort((a, b) => a.at - b.at)
        .map((game) => game.rating);
      after.unshift(...mine);
      if (index < archives.length - 6) break;
    }
    const recent = after.slice(-(RECENT_GAMES + 1));
    const deltas = recent.slice(1).map((rating, i) => Math.abs(rating - recent[i]));
    rows.push({
      username,
      joined: profile.joined ? new Date(profile.joined * 1_000).toISOString().slice(0, 10) : "",
      mode,
      games: (block.record?.win ?? 0) + (block.record?.loss ?? 0) + (block.record?.draw ?? 0),
      rd: block.last.rd,
      rating: block.last.rating,
      lastGame: new Date(block.last.date * 1_000).toISOString().slice(0, 10),
      deltas: deltas.length,
      median: median(deltas),
      max: deltas.length ? Math.max(...deltas) : null,
    });
  }
  return rows;
}

async function main() {
  const extra = process.argv.slice(2);
  const country = ((await get(`${API}/country/${SAMPLED_FROM_COUNTRY}/players`)) as { players?: string[] } | null)?.players ?? [];
  // Every n-th name of the list, so the sample is spread over it and the same on every run.
  const step = Math.max(1, Math.floor(country.length / SAMPLE_SIZE));
  const sampled = country.filter((_, index) => index % step === 0).slice(0, SAMPLE_SIZE);
  const names = [...NAMED, ...extra, ...sampled];
  console.log(`measured ${new Date().toISOString()}, ${names.length} profiles (${sampled.length} from ${SAMPLED_FROM_COUNTRY}'s list of ${country.length})`);
  console.log("username\tjoined\tcadence\tgames\trd\trating\tlast game\tdeltas\tmedian |change|\tmax |change|");
  for (const username of names) {
    for (const row of await measure(username)) {
      console.log([row.username, row.joined, row.mode, row.games, row.rd, row.rating, row.lastGame, row.deltas, row.median ?? "", row.max ?? ""].join("\t"));
    }
  }
}

main().catch((error) => {
  console.error("MEASURE_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
