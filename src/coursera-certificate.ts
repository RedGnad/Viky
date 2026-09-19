import { keccak256, stringToHex, type Hex } from "viem";
import { normaliseCertificateName } from "./duolingo-english-test";

/**
 * A Coursera certificate, the second supervised result we read (C3). Browser safe.
 *
 * What makes it worth a gift and what it costs are both in D47: Coursera checks identity once per account rather
 * than per piece of work, and no page of theirs ever says "not yet obtained". The page a gift hangs on appears the
 * day the certificate is granted, which is why this is a "having it or not" and never a climb.
 *
 * **Measured on a real public certificate on 19 Sep 2026**, `coursera.org/account/accomplishments/verify/<code>`,
 * 200, 432 KB of HTML. Five things are in it, each exactly once: the holder's first and last name, the course's own
 * id, its slug and its printed name, the certificate code, and the day it was granted in milliseconds. Two findings
 * changed the design:
 *
 * 1. **The course carries a slug**, `introduction-git-github`, beside its opaque id `-qIqP1FsEemNmQ6a3syMJg`. The
 *    slug is what a person reads in a course link, so it is what a funder can name, and it is on the certificate
 *    page too. Nothing has to be resolved between the two.
 * 2. **The last name can be empty.** That certificate carries `"lastName":""`. A reading that required both names
 *    would refuse a real certificate, so the name is whatever the two fields make together, trimmed.
 */

export const COURSERA_SOURCE = "Coursera";

/** The certificate code as Coursera prints it: capitals and figures, twelve on the one measured. */
const CODE = /^[A-Z0-9]{8,20}$/;
/** A course slug as their links carry it: lower case words joined by hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidCourseraCode(value: string): boolean {
  return CODE.test(value.trim().toUpperCase());
}

export function isValidCourseraSlug(value: string): boolean {
  const slug = value.trim().toLowerCase();
  return slug.length >= 3 && slug.length <= 120 && SLUG.test(slug);
}

export function courseraCertificateUrl(code: string): string {
  return `https://www.coursera.org/account/accomplishments/verify/${encodeURIComponent(code.trim().toUpperCase())}`;
}

/**
 * The code inside whatever the person pasted: the verify link, the short `coursera.org/verify/<code>` that redirects
 * to it, or the code alone. Anything else gives nothing, and the screen says so rather than guessing.
 */
export function courseraCodeOf(pasted: string): string | undefined {
  const text = pasted.trim();
  if (text.length === 0) return undefined;
  if (isValidCourseraCode(text)) return text.toUpperCase();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return undefined;
  }
  if (!/(^|\.)coursera\.org$/i.test(url.hostname)) return undefined;
  const parts = url.pathname.split("/").filter(Boolean);
  const candidate = (parts[parts.length - 1] ?? "").toUpperCase();
  return isValidCourseraCode(candidate) ? candidate : undefined;
}

/**
 * The course inside whatever the funder pasted: a course link, a specialization link, or the slug alone. It is the
 * one thing about the course a person ever types, and the certificate page carries the same word.
 */
export function courseraSlugOf(pasted: string): string | undefined {
  const text = pasted.trim();
  if (text.length === 0) return undefined;
  if (!text.includes("/") && isValidCourseraSlug(text)) return text.toLowerCase();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return undefined;
  }
  if (!/(^|\.)coursera\.org$/i.test(url.hostname)) return undefined;
  const parts = url.pathname.split("/").filter(Boolean);
  // learn/<slug>, specializations/<slug>, professional-certificates/<slug>: the word after the kind.
  const kind = parts.findIndex((part) => ["learn", "specializations", "professional-certificates"].includes(part.toLowerCase()));
  const candidate = kind >= 0 ? (parts[kind + 1] ?? "") : "";
  return isValidCourseraSlug(candidate) ? candidate.toLowerCase() : undefined;
}

/**
 * The person and the thing, as the funder signs them into the terms (`subject` on the contract). A certificate pays
 * only when both match: the name printed on it, and the course it is for.
 *
 * The name half carries the gap D49 wrote down and this does not close: Coursera has no field its holder can edit,
 * so two people of the same name who finish the same course inside the same window cannot be told apart by this.
 * The gift still reaches only the account that opened the funder's link.
 */
export function courseraSubject(name: string, slug: string): Hex {
  return keccak256(stringToHex(`viky:certificate:v1:${COURSERA_SOURCE}:${normaliseCertificateName(name)}:${slug.trim().toLowerCase()}`));
}

/** The name a certificate prints, from the two fields, either of which can be empty (measured 19 Sep 2026). */
export function courseraName(firstName: string, lastName: string): string {
  return `${firstName ?? ""} ${lastName ?? ""}`.replace(/\s+/g, " ").trim();
}

/** The day the certificate says it was granted, from the milliseconds the page carries, as seconds at midnight UTC. */
export function courseraGrantedDaySeconds(grantedAtMs: number): number | undefined {
  if (!Number.isSafeInteger(grantedAtMs) || grantedAtMs <= 0) return undefined;
  return Math.floor(grantedAtMs / 86_400_000) * 86_400;
}

/**
 * How long a gift on a Coursera certificate may run. A course is weeks of work rather than one sitting, so the floor
 * is higher than the test's fourteen days, and the contract's own year is the ceiling.
 */
export const COURSERA_DURATION_DAYS = Object.freeze({ min: 30, max: 365, suggested: 120 });

/** The goal type this condition is registered under on `MilestoneGift`, after the four cadences, the test and Lichess. */
export const COURSERA_GOAL_TYPE = 10;

/** What every attestation for this condition must carry, so a reading of one source can never settle another's gift. */
export function courseraProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:coursera-certificate-zkfetch:v1"));
}

/** Having it or not: there is nothing to score, so what a proof carries is that the certificate exists. */
export const COURSERA_HAS_IT = 1;
