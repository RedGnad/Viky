import { keccak256, stringToHex, type Hex } from "viem";
import { normaliseCertificateName } from "./duolingo-english-test";

/**
 * A certification on Credly, the "get certified" family (the founder's lines of 20 Sep 2026). Browser safe.
 *
 * Credly hosts Open Badges v2, so a badge is two public things rather than one page, and both are read:
 *
 * 1. **The assertion**, `credly.com/api/v1/obi/v2/badge_assertions/<badge id>`, JSON. It carries `issuedOn` as an
 *    ISO moment, and a `badge` URL that pins the issuer's id and the badge class's id in one string. It carries no
 *    name at all: the holder is a hashed email, which nothing here matches, receives or keeps.
 * 2. **The public page**, `credly.com/badges/<badge id>/public_url`, HTML. Its `og:title` has one fixed shape,
 *    "<title> was issued by <issuer> to <holder>.", and it is the only place the holder's name is published.
 *
 * **The certification is that pair of ids, never words.** A title can be edited, translated or reused, and four
 * different issuers offer an "Introduction to Cybersecurity" (measured 20 Sep 2026 on Credly's own search); the
 * issuer's id and the badge class's id cannot be reused. So the pair is what the funder's terms carry, and what a
 * proof must show.
 *
 * **How the funder names one: Credly's own search**, found in their application bundle and unauthenticated,
 * `GET credly.com/api/v1/global_search/badge_template?q=<words>`: 50 results in under a second, each with `id`
 * (the badge class), `issuer_id`, `name`, `issuer_name` and `url`. The ids it gives for Cisco's Introduction to
 * Cybersecurity are the ones read by hand from a live badge the same day, so the search and the assertion name a
 * certification the same way. It sends no CORS header, so Viky's own route asks it (app/api/credly/search).
 *
 * Measured on 20 Sep 2026 on three live badges: an unknown badge answers 404 on the assertion while its page
 * answers 200 with no `og` tag at all, so the assertion is what says a badge exists; the page varies on `Accept`
 * and answers 500 to JSON, so it is read as the page it is. Not measured: what either end answers for a badge its
 * holder has made private again.
 */

export const CREDLY_SOURCE = "Credly";

/** A badge id, an issuer id or a badge class id, as Credly writes them everywhere: a lower case UUID. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isValidCredlyBadgeId(value: string): boolean {
  return UUID.test(value.trim().toLowerCase());
}

/**
 * The badge inside whatever the person pasted: the public link Credly gives them, the bare badge link, or the id
 * alone. Both links serve the same page, measured the same day, so either is the same reading.
 */
export function credlyBadgeIdOf(pasted: string): string | undefined {
  const text = pasted.trim();
  if (text.length === 0) return undefined;
  if (isValidCredlyBadgeId(text)) return text.toLowerCase();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return undefined;
  }
  if (!/(^|\.)credly\.com$/i.test(url.hostname)) return undefined;
  const parts = url.pathname.split("/").filter(Boolean);
  const after = parts.indexOf("badges");
  const candidate = after >= 0 ? (parts[after + 1] ?? "") : "";
  return isValidCredlyBadgeId(candidate) ? candidate.toLowerCase() : undefined;
}

export function credlyAssertionUrl(badgeId: string): string {
  return `https://www.credly.com/api/v1/obi/v2/badge_assertions/${encodeURIComponent(badgeId.trim().toLowerCase())}`;
}

export function credlyPublicUrl(badgeId: string): string {
  return `https://www.credly.com/badges/${encodeURIComponent(badgeId.trim().toLowerCase())}/public_url`;
}

/** Credly's own search, which the route asks with the words the funder typed and nothing else. */
export function credlySearchUrl(words: string): string {
  return `https://www.credly.com/api/v1/global_search/badge_template?q=${encodeURIComponent(words.trim())}`;
}

/**
 * One certification, as the terms carry it: the issuer's id and the badge class's id, joined. It is the one word
 * a screen never prints, and the one word the contract judges by.
 */
export type CredlyPair = `${string}/${string}`;

export function credlyPair(issuerId: string, classId: string): CredlyPair | undefined {
  const issuer = issuerId.trim().toLowerCase();
  const badgeClass = classId.trim().toLowerCase();
  return UUID.test(issuer) && UUID.test(badgeClass) ? `${issuer}/${badgeClass}` : undefined;
}

/** The pair inside whatever the terms carry, or nothing: it is checked by shape before anything is signed with it. */
export function credlyPairOf(value: string): CredlyPair | undefined {
  const [issuer, badgeClass, ...rest] = value.trim().toLowerCase().split("/");
  return rest.length === 0 && issuer && badgeClass ? credlyPair(issuer, badgeClass) : undefined;
}

/** The pair a badge belongs to, from the `badge` URL of its assertion, or nothing when the URL is not one. */
export function credlyPairOfBadgeUrl(badgeUrl: string): CredlyPair | undefined {
  const found = /\/issuers\/(?<issuerId>[0-9a-f-]{36})\/badge_classes\/(?<classId>[0-9a-f-]{36})/.exec(badgeUrl.trim().toLowerCase());
  return found?.groups ? credlyPair(found.groups.issuerId, found.groups.classId) : undefined;
}

/**
 * What one line of the search says to the funder: the certification, and who awards it, which is what tells four
 * "Introduction to Cybersecurity" apart. The path is Credly's own page about the badge, for a funder who wants to
 * read before choosing.
 */
export type CredlyCertification = Readonly<{
  pair: CredlyPair;
  title: string;
  issuer: string;
  /** Credly's page about the badge, relative to credly.com, as the search gives it. */
  path: string;
}>;

/** The certifications inside one answer of Credly's search, and nothing that is not one. */
export function credlyCertificationsOf(answer: unknown, limit = 12): readonly CredlyCertification[] {
  const data = answer && typeof answer === "object" ? (answer as { data?: unknown }).data : undefined;
  const results = data && typeof data === "object" ? (data as { results?: unknown }).results : undefined;
  if (!Array.isArray(results)) return [];
  const out: CredlyCertification[] = [];
  for (const entry of results) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const pair = typeof record.issuer_id === "string" && typeof record.id === "string" ? credlyPair(record.issuer_id, record.id) : undefined;
    if (!pair || typeof record.name !== "string" || typeof record.issuer_name !== "string") continue;
    const title = record.name.trim();
    const issuer = record.issuer_name.trim();
    if (title.length === 0 || issuer.length === 0) continue;
    out.push({ pair, title, issuer, path: typeof record.url === "string" && record.url.startsWith("/") ? record.url : "" });
    if (out.length >= limit) break;
  }
  return out;
}

/** What is asked of the words a funder types before Credly is asked anything: something, and not a paragraph. */
export function isValidCredlySearch(words: string): boolean {
  const text = words.trim();
  return text.length >= 2 && text.length <= 80;
}

/**
 * The three things the public page's one title says, in the shape Credly writes it. The holder is taken last,
 * because a certification's title can carry the word "to" and an issuer's name can carry it too; the title and the
 * issuer are read back for a screen to show, never to judge by.
 */
export function credlyTitleParts(ogTitle: string): Readonly<{ title: string; issuer: string; holder: string }> | undefined {
  const found = /^(?<title>.+) was issued by (?<issuer>.+) to (?<holder>.+)\.$/.exec(ogTitle.trim());
  if (!found?.groups) return undefined;
  const title = found.groups.title.trim();
  const issuer = found.groups.issuer.trim();
  const holder = found.groups.holder.trim();
  return title && issuer && holder ? { title, issuer, holder } : undefined;
}

export function credlyHolderOfTitle(ogTitle: string): string | undefined {
  return credlyTitleParts(ogTitle)?.holder;
}

/**
 * The person and the certification, as the funder signs them into the terms. A badge in another name, or for
 * another certification, pays nothing.
 *
 * The same gap D49 wrote down for a course certificate is here: Credly publishes no field a holder can edit, so two
 * people of the same name who earn the same certification inside the same days cannot be told apart by this. The
 * gift still reaches only the account that opened the funder's link.
 */
export function credlySubject(name: string, pair: string): Hex {
  return keccak256(stringToHex(`viky:certificate:v1:${CREDLY_SOURCE}:${normaliseCertificateName(name)}:${pair.trim().toLowerCase()}`));
}

/** The day the assertion says the badge was issued, seconds at midnight UTC: the day the contract judges. */
export function credlyIssuedDaySeconds(issuedOn: string): number | undefined {
  const day = /^(?<day>\d{4}-\d{2}-\d{2})/.exec(issuedOn.trim())?.groups?.day;
  if (!day) return undefined;
  const at = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(at) && at > 0 ? Math.floor(at / 1_000) : undefined;
}

/**
 * How long a gift on a certification may run. These are courses of some weeks rather than one sitting, so it is the
 * course certificate's window: nothing here is measured about Credly, and the number is said to be theirs.
 */
export const CREDLY_DURATION_DAYS = Object.freeze({ min: 30, max: 365, suggested: 120 });

/** The goal type on the milestone contract, after the four Chess.com cadences, the test, Lichess and Coursera. */
export const CREDLY_GOAL_TYPE = 11;

export function credlyProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:credly-badge-zkfetch:v1"));
}

/** Having it or not: there is nothing to score, so what a proof carries is that the badge exists. */
export const CREDLY_HAS_IT = 1;
