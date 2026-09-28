import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDomain, getHostname, getPublicSuffix } from "tldts";

/**
 * The world's university list (the founder, 28 Sep 2026): every university of Reclaim's directory whose student portal
 * answers, wherever it is, written to data/university-register.json for `pnpm portal:directory`.
 *
 * 1. The directory, whole: `devapi.reclaimprotocol.org/api/providers/explore/paginated` with an empty `searchQuery`
 *    answers every active provider, a hundred a page; the providers tagged "university" are kept.
 * 2. Each one's configuration (`api.reclaimprotocol.org/api/providers/<id>/configs`): its sign-in address.
 * 3. One line per university: the providers that sign in on the same host under the same name are one university.
 * 4. Its country: the world universities list (github.com/Hipo/university-domains-list) by domain, then the country
 *    code of the domain itself; a university whose country neither says is counted and not listed.
 * 5. Whether its portal answers: one GET of the sign-in address, over https, naming Viky in its user agent. It answers
 *    when the last response is under 500 and is not "not found", on https, and not a parked domain.
 *
 * Run from a machine, never from Railway (the founder's rule for bulk reads), one request at a time to Reclaim and a
 * few at a time to the portals. Everything read is kept in .cache/university-register/, so a run that stops resumes.
 *
 *   pnpm universities:register
 */

const CACHE = join(process.cwd(), ".cache", "university-register");
const OUT = join(process.cwd(), "data", "university-register.json");
const AGENT = "Mozilla/5.0 (compatible; Viky/1.0; +https://viky.cash)";
const DIRECTORY = "https://devapi.reclaimprotocol.org/api/providers/explore/paginated";
const CONFIGS = "https://api.reclaimprotocol.org/api/providers";
const HIPO = "https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json";
/** Country-code domains used as generic names the world over: their code says nothing of where a university is. */
const GENERIC_CODES = new Set(["io", "ai", "co", "me", "tv", "cc", "ws", "fm", "ly", "to", "gg", "sh", "so", "app", "dev", "eu", "asia", "la", "nu", "su", "ac"]);
/** Hosts a parked or expired domain sends to. */
const PARKED = /(^|\.)(ww\d+\.|sedoparking|parkingcrew|hugedomains|dan\.com|afternic|bodis|above\.com|domainmarket|namebright|parklogic)/i;

/** More institutions than this on one sign-in page: an identity federation (Uganda's RENU serves 181), not a portal. */
const FEDERATION = 20;
/** Named like higher education, in the languages the directory's names come in. */
const HIGHER_EDUCATION = /univer|college|colleg|facult|institut|polytechn|politecn|hochschule|academ|school of|business school|école|ecole|escuela|escola|scuola|universidad|universidade|universit|uniwersytet|egyetem|yliopisto|högskola|høgskole|hogeschool|conservato|seminar|kolej|politeknik|akademi|sekolah tinggi|campus|大学|學院|学院|대학|大學|جامعة|كلية|معهد|университет|институт|академи/i;
/** Named like a school below higher education. */
const SCHOOL = /secondary school|high school|primary school|basic school|junior school|senior school|nursery|kindergarten|elementary|lycée|lycee|\bcollège\b/i;

/**
 * A provider's name less the marks its author left on it: "[test] Deakin University", "BRAC University (Copy)",
 * "PES university testing" are the university's own line once cleaned, and a name left with nothing is dropped.
 */
function cleanName(name: string): string {
  return name
    .replace(/\[\s*test\s*\]/gi, " ")
    .replace(/\((copy|test|testing|demo)\)/gi, " ")
    .replace(/\b(test|testing|demo|sandbox|dummy|staging)\b/gi, " ")
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\b/gi, " ")
    .replace(/\s+[-,]\s*$/g, "")
    .replace(/^\s*[-,]\s+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** A campus named after its university and a dash ("Strayer University, dash, Strayer University-Alexandria Campus") is its university's line. */
function campusOf(name: string): string {
  const [head, tail] = name.split(/\s+[\u2013\u2014-]\s+/, 2);
  return tail && head && tail.toLowerCase().startsWith(head.toLowerCase()) ? head.trim() : name.trim();
}

/** How much a sign-in address looks like a student's own space: answering, and named like a student portal or a login. */
function score(one: { status: number; url: string; host: string }): number {
  const path = one.url.toLowerCase();
  return (one.status === 200 ? 4 : 0) + (/student|etudiant|étudiant|estudiante|aluno|alumno|sinhvien|sinh-vien|ent\.|\bmy|portal|portail|intranet|campus/.test(path) ? 2 : 0) + (/login|connexion|signin|sign-in|auth|cas\b|sso/.test(path) ? 1 : 0);
}

type Listed = { providerId: string; name: string; tags: string[]; isVerified: boolean; usedInCount: number; description: string };
type Config = { loginUrl: string | null; verificationType: string | null };
type Probe = { status: number; finalUrl: string; error?: string };
export type RegisterRow = {
  portalId: string;
  university: string;
  country: string;
  loginUrl: string;
  host: string;
  domain: string;
  /** Every directory provider merged into the line, the most used first. */
  sourceProviderIds: string[];
  answered: number;
};

function cached<T>(name: string): T | undefined {
  const file = join(CACHE, name);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : undefined;
}

function keep(name: string, value: unknown): void {
  const file = join(CACHE, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function json(url: string, tries = 4): Promise<unknown> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(40_000) });
      if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt >= tries) throw error;
      await pause(2_000 * attempt);
    }
  }
}

/**
 * The directory, whole. `pageKey` is an offset in providers, not a page number (read on 28 Sep 2026: `pageKey=1`
 * answers the first page less one), so the pages go a hundred apart, up to the count the first answer gives.
 */
async function directory(): Promise<Listed[]> {
  const found = new Map<string, Listed>();
  let count = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < count; offset += 100) {
    const name = `directory-offsets/${offset}.json`;
    let page = cached<{ count: number; providers: Listed[] }>(name);
    if (!page) {
      const answer = (await json(`${DIRECTORY}?searchQuery=&pageSize=100&pageKey=${offset}`)) as { count?: number; providers?: Record<string, unknown>[] };
      page = {
        count: Number(answer.count ?? 0),
        providers: (answer.providers ?? []).map((one) => ({
          providerId: String(one.providerId ?? ""),
          name: String(one.name ?? "").trim(),
          tags: Array.isArray(one.tags) ? one.tags.map(String) : [],
          isVerified: one.isVerified === true,
          usedInCount: Number(one.usedInCount ?? 0),
          description: String(one.description ?? ""),
        })),
      };
      keep(name, page);
      await pause(500);
    }
    count = Math.min(count, page.count || 0);
    for (const one of page.providers) if (one.providerId) found.set(one.providerId, one);
    if (offset % 2_500 === 0) console.log(JSON.stringify({ step: "directory", offset, count, providers: found.size }));
    if (page.providers.length === 0) break;
  }
  return [...found.values()];
}

async function configOf(providerId: string): Promise<Config> {
  const name = `configs/${providerId}.json`;
  const hit = cached<Config>(name);
  if (hit) return hit;
  let config: Config = { loginUrl: null, verificationType: null };
  try {
    const answer = (await json(`${CONFIGS}/${providerId}/configs`)) as { providers?: { loginUrl?: string; verificationType?: string }[] };
    const first = answer.providers?.[0];
    config = { loginUrl: first?.loginUrl ? String(first.loginUrl).trim() : null, verificationType: first?.verificationType ?? null };
  } catch {
    return config;
  }
  keep(name, config);
  return config;
}

async function probe(url: string): Promise<Probe> {
  const name = `probes/${Buffer.from(url).toString("base64url").slice(0, 180)}.json`;
  const hit = cached<Probe>(name);
  if (hit) return hit;
  let result: Probe;
  try {
    const response = await fetch(url, { redirect: "follow", headers: { "User-Agent": AGENT, Accept: "text/html" }, signal: AbortSignal.timeout(20_000) });
    result = { status: response.status, finalUrl: response.url };
    await response.body?.cancel().catch(() => undefined);
  } catch (error) {
    result = { status: 0, finalUrl: url, error: error instanceof Error ? String(error.cause ?? error.message).slice(0, 160) : "failed" };
  }
  keep(name, result);
  return result;
}

/** Runs `work` over `items`, `width` at a time. */
async function pool<T, R>(items: readonly T[], width: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index], index);
      }
    }),
  );
  return results;
}

function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A sign-in address as a proof reads it: https, or nothing. */
function httpsOf(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.protocol = "https:";
    return url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

async function main() {
  const listed = (await directory()).filter((one) => one.tags.includes("university") && one.providerId && one.name);
  console.log(JSON.stringify({ step: "universities in the directory", count: listed.length }));

  let done = 0;
  const configs = await pool(listed, 6, async (one) => {
    const config = await configOf(one.providerId);
    done += 1;
    if (done % 500 === 0) console.log(JSON.stringify({ step: "configurations", done }));
    return config;
  });

  // One line per university: the same name signing in on the same host.
  type Group = { name: string; url: string; host: string; providers: Listed[] };
  const groups = new Map<string, Group>();
  let noAddress = 0;
  listed.forEach((one, index) => {
    const url = httpsOf(configs[index].loginUrl);
    const host = url ? getHostname(url) : null;
    if (!url || !host) {
      noAddress += 1;
      return;
    }
    const key = `${host}|${slug(one.name)}`;
    const group = groups.get(key) ?? { name: one.name, url, host, providers: [] };
    group.providers.push(one);
    groups.set(key, group);
  });

  // The world universities list, by domain.
  let hipo = cached<{ name: string; domains: string[]; alpha_two_code: string }[]>("hipo.json");
  if (!hipo) {
    hipo = (await json(HIPO)) as { name: string; domains: string[]; alpha_two_code: string }[];
    keep("hipo.json", hipo);
  }
  const countryByDomain = new Map<string, string>();
  for (const one of hipo) for (const domain of one.domains) countryByDomain.set(domain.toLowerCase(), one.alpha_two_code.toUpperCase());
  const inWorldList = (host: string): boolean => {
    const parts = host.toLowerCase().split(".");
    for (let at = 0; at < parts.length - 1; at += 1) if (countryByDomain.has(parts.slice(at).join("."))) return true;
    return false;
  };
  const countryOf = (host: string): string | null => {
    const parts = host.toLowerCase().split(".");
    for (let at = 0; at < parts.length - 1; at += 1) {
      const hit = countryByDomain.get(parts.slice(at).join("."));
      if (hit) return hit;
    }
    const suffix = (getPublicSuffix(host) ?? "").split(".").pop() ?? "";
    if (suffix === "edu") return "US";
    if (suffix === "uk") return "GB";
    return suffix.length === 2 && !GENERIC_CODES.has(suffix) ? suffix.toUpperCase() : null;
  };

  const all = [...groups.values()];
  done = 0;
  const probes = await pool(all, 16, async (group) => {
    const result = await probe(group.url);
    done += 1;
    if (done % 500 === 0) console.log(JSON.stringify({ step: "portals", done, of: all.length }));
    return result;
  });

  // Each portal that answered, with its country: the rest is counted and left out.
  type Candidate = { name: string; country: string; url: string; host: string; status: number; providers: Listed[]; listed: boolean };
  const counted = { noAddress, unanswered: 0, parked: 0, notHttps: 0, noCountry: 0, federation: 0, notHigherEducation: 0, merged: 0 };
  const candidates: Candidate[] = [];
  all.forEach((group, index) => {
    const answered = probes[index];
    const final = (() => {
      try {
        return new URL(answered.finalUrl);
      } catch {
        return null;
      }
    })();
    if (answered.status === 0 || answered.status >= 500 || answered.status === 404 || answered.status === 410) return void (counted.unanswered += 1);
    if (!final || PARKED.test(final.hostname)) return void (counted.parked += 1);
    if (final.protocol !== "https:") return void (counted.notHttps += 1);
    const country = countryOf(group.host);
    if (!country) return void (counted.noCountry += 1);
    // A dash left inside a name once its campus is folded ("Higher Colleges of Technology, dash, Ruwais Campus") is read
    // as a comma: no dash on a screen.
    const name = campusOf(cleanName(group.name)).replace(/\s*[\u2013\u2014]\s*/g, ", ");
    if (name.length < 3) return void (counted.notHigherEducation += 1);
    candidates.push({ name, country, url: group.url, host: group.host, status: answered.status, providers: group.providers, listed: inWorldList(group.host) });
  });

  // A sign-in page that more than twenty institutions share is an identity federation, not a student portal.
  const namesOnHost = new Map<string, Set<string>>();
  for (const one of candidates) namesOnHost.set(one.host, (namesOnHost.get(one.host) ?? new Set()).add(slug(one.name)));
  const own = candidates.filter((one) => {
    if ((namesOnHost.get(one.host)?.size ?? 0) > FEDERATION) return void (counted.federation += 1), false;
    // Higher education only: in the world universities list, or named like it and not like a school.
    if (!one.listed && (!HIGHER_EDUCATION.test(one.name) || SCHOOL.test(one.name))) return void (counted.notHigherEducation += 1), false;
    return true;
  });

  // One line per university and country: of its sign-in addresses, the one most like a student's own space.
  const byUniversity = new Map<string, Candidate[]>();
  for (const one of own) byUniversity.set(`${slug(one.name)}|${one.country}`, [...(byUniversity.get(`${slug(one.name)}|${one.country}`) ?? []), one]);
  const chosen = [...byUniversity.values()].map((same) => {
    counted.merged += same.length - 1;
    const best = [...same].sort((left, right) => score(right) - score(left))[0];
    return { best, providers: same.flatMap((one) => one.providers) };
  });

  // A registrable domain several universities share (a sign-in service, a hosting platform) names none of them.
  const domainUse = new Map<string, number>();
  for (const { best } of chosen) {
    const domain = getDomain(best.host) ?? best.host;
    domainUse.set(domain, (domainUse.get(domain) ?? 0) + 1);
  }
  const rows: RegisterRow[] = [];
  const ids = new Set<string>();
  for (const { best, providers } of chosen) {
    const registrable = getDomain(best.host) ?? best.host;
    const shared = (domainUse.get(registrable) ?? 0) > 1;
    const sources = [...providers].sort((left, right) => Number(right.isVerified) - Number(left.isVerified) || right.usedInCount - left.usedInCount).map((one) => one.providerId);
    // A name in a script the slug keeps nothing of is named by its host instead.
    let portalId = (shared ? `${slug(best.name) || slug(best.host)}-${best.country.toLowerCase()}` : slug(registrable)).slice(0, 60).replace(/-+$/, "");
    const base = portalId;
    for (let suffix = 2; ids.has(portalId); suffix += 1) portalId = `${base.slice(0, 57).replace(/-+$/, "")}-${suffix}`;
    ids.add(portalId);
    rows.push({ portalId, university: best.name, country: best.country, loginUrl: best.url, host: best.host, domain: shared ? best.host : registrable, sourceProviderIds: [...new Set(sources)], answered: best.status });
  }

  rows.sort((left, right) => left.country.localeCompare(right.country) || left.university.localeCompare(right.university));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({ read: new Date().toISOString().slice(0, 10), rows }, null, 0).replace(/\},\{/g, "},\n{")}\n`);
  const byCountry = new Map<string, number>();
  for (const row of rows) byCountry.set(row.country, (byCountry.get(row.country) ?? 0) + 1);
  console.log(JSON.stringify({ step: "written", universities: rows.length, groups: all.length, left: counted, countries: byCountry.size }));
}

main().catch((error) => {
  console.error("UNIVERSITY_REGISTER_FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
