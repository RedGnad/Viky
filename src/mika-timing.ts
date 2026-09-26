import { MIKA_TIMING_RUNNER } from "./attested-sources";

/**
 * MikaTiming's results sites, the second timing company (the founder, 27 Sep 2026), measured at Frankfurt 2025,
 * Chicago 2025, Berlin 2025 and Boston 2026 on 26 Sep 2026. A runner's own page is keyed by an id of the site's,
 * not by the bib, so a reading takes two steps: the search by bib, `?pid=search&search[start_no]=<bib>`, one
 * server-rendered page whose rows carry the event's code (`event-MAR_…`), the bib as printed and the link to the
 * runner's page (`idp=…`); then the runner's page, `?content=detail&idp=<id>`, which is the page the attested read
 * takes (src/attested-sources.ts). The search answers the lettered twin of a bib too ("3166" and "F3166", the women's
 * bibs at Frankfurt): the row taken is the one whose bib is exactly the one bound and whose event is the race's.
 * Server only, nothing fetched here: the fetching sits in src/marathon-reading.ts with the rest.
 */

export type MikaRow = Readonly<{ code: string; bib: string; idp: string }>;

/** The search by bib on one results site: the page the runner's id is read from, never attested. */
export function mikaSearchUrl(host: string, year: string, bib: string): string {
  return `https://${host}/${year}/?pid=search&search%5Bstart_no%5D=${encodeURIComponent(bib)}`;
}

/** The rows of a search page: each row's event code, its bib as printed, and the runner's id in its link. */
export function mikaRowsOf(page: string): readonly MikaRow[] {
  const rows: MikaRow[] = [];
  for (const row of page.matchAll(/<li class="([^"]*)list-group-item row"[^>]*>([\s\S]*?)<\/li>/g)) {
    const code = /event-([A-Za-z0-9_]+)/.exec(row[1])?.[1];
    const bib = /list-label">(?:Bib Number|BIB|Start no\.?)<\/div>\s*([A-Z]{0,2}\d{1,6})\s*<\/div>/.exec(row[2])?.[1];
    const idp = /idp=([A-Z0-9]+)/.exec(row[2])?.[1];
    if (code && bib && idp) rows.push({ code, bib, idp });
  }
  return rows;
}

/** Whether a row's event is the race's heat: the code starts with the heat when the heat ends with "_", and is it otherwise. */
export function mikaEventMatches(code: string, heat: string): boolean {
  return heat.endsWith("_") ? code.startsWith(heat) : code === heat;
}

/** The runner's id for the bib bound, in the race's event, or nothing when no row is that bib in that event. */
export function mikaRunnerIdOf(rows: readonly MikaRow[], heat: string, bib: string): string | undefined {
  return rows.find((row) => row.bib === bib && mikaEventMatches(row.code, heat))?.idp;
}

/** The account the attested read takes: the site and the year, the runner's id, the bib bound. */
export function mikaDetailAccount(host: string, year: string, idp: string, bib: string): string {
  return `${host}/${year}|${idp}|${bib}`;
}

/** What the runner's page says, by the source's own patterns: the name, the bib, the net time, the year and id of the page. */
export function mikaValuesOf(page: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of MIKA_TIMING_RUNNER.matches) {
    const found = new RegExp(match.value).exec(page);
    if (!found?.groups) continue;
    for (const [name, value] of Object.entries(found.groups)) if (value !== undefined) values[name] = value;
  }
  return values;
}
