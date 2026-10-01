import { keccak256, stringToHex, type Hex } from "viem";
import { normaliseCertificateName } from "./duolingo-english-test";

/**
 * A credential issued on Accredible (D213), read for the person like a Credly badge: the person shares the link of
 * their credential, `credential.net/<uuid>`, and Viky reads the public record its page is drawn from. Browser safe.
 *
 * **Measured on a live credential on 24 Sep 2026**, at `credential.net/<uuid>` (its identifier is not kept here: a
 * credential names its holder): the page is
 * a JavaScript application, and its data is `GET https://api.accredible.com/v1/credential-net/credentials/<uuid>` (the
 * path the page's own bundle builds, `credential-net/credentials/${id}`), public JSON, 8.5 KB. It carries the
 * credential's uuid and title, the day of issue, whether it is expired, revoked or private, the recipient's name, and
 * the issuer with its website. An unknown uuid answers 404 `{"error":"NOT_FOUND"}`.
 *
 * Accredible's public course search is not open to a reader (`/course_finder/search_courses` answers "Not found"), so
 * the funder names the credential by its title as the issuer prints it and the issuer's website, one line: "Rearchitecting
 * the Financial System, cfte.education". Both are bound into the subject with the name.
 */

export const ACCREDIBLE_SOURCE = "Accredible";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isValidAccredibleId(value: string): boolean {
  return UUID.test(value.trim().toLowerCase());
}

export function accredibleRecordUrl(id: string): string {
  return `https://api.accredible.com/v1/credential-net/credentials/${id.trim().toLowerCase()}`;
}

/** The uuid inside whatever the person pasted: the credential's link (with or without its `#acc.` tail), or the uuid alone. */
export function accredibleIdOf(pasted: string): string | undefined {
  const text = pasted.trim();
  if (!text) return undefined;
  if (isValidAccredibleId(text)) return text.toLowerCase();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return undefined;
  }
  if (!/(^|\.)credential\.net$/i.test(url.hostname)) return undefined;
  const candidate = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  return isValidAccredibleId(candidate) ? candidate.toLowerCase() : undefined;
}

/** A website's host, as this line compares it: lower case, no `www.`, no path. */
export function issuerDomainOf(value: string): string | undefined {
  const text = value.trim().toLowerCase();
  if (!text) return undefined;
  let host: string;
  try {
    host = new URL(/^https?:\/\//.test(text) ? text : `https://${text}`).hostname;
  } catch {
    return undefined;
  }
  host = host.replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : undefined;
}

/** Whether the issuer's website host is the domain the funder named, or under it. */
export function issuerMatches(issuerHost: string, named: string): boolean {
  return issuerHost === named || issuerHost.endsWith(`.${named}`);
}

/** The credential as the funder names it, one line, "Title, issuer.site": the key this line signs. */
export function accredibleCourseOf(pasted: string): string | undefined {
  const comma = pasted.lastIndexOf(",");
  if (comma <= 0) return undefined;
  const title = normaliseCredentialTitle(pasted.slice(0, comma));
  const domain = issuerDomainOf(pasted.slice(comma + 1));
  return title && domain ? `${title}|${domain}` : undefined;
}

/** A title compared word for word, case and punctuation aside, in its own order. */
export function normaliseCredentialTitle(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function accredibleSubject(name: string, courseKey: string): Hex {
  return keccak256(stringToHex(`viky:certificate:v1:${ACCREDIBLE_SOURCE}:${normaliseCertificateName(name)}:${courseKey}`));
}

/** "2024-06-22" to seconds at midnight UTC, or nothing. */
export function accredibleIssuedDaySeconds(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) ? at / 1_000 : undefined;
}

export const ACCREDIBLE_DURATION_DAYS = Object.freeze({ min: 30, max: 365, suggested: 120 });

/** Goal 26 on `MilestoneGift`, after edX's 25. */
export const ACCREDIBLE_GOAL_TYPE = 26;

export function accredibleProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:accredible-credential-zkfetch:v1"));
}

export const ACCREDIBLE_HAS_IT = 1;
