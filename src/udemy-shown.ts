import { keccak256, stringToHex, type Hex } from "viem";
import type { ResultsVerdict } from "./university-shown";

/**
 * A Udemy course finished, shown from the person's own account (D178): the second nature (D162) on the shelf of
 * courses, beside the Coursera certificate, which is read for the person from a public page. Udemy's terms forbid
 * Viky reading anything by a program ("You may not scrape, spider, use a robot, or use other automated means of any
 * kind to access the Services", Terms of Use, section 7, read 23 Sep 2026), so the certificate page Udemy publishes
 * is not read; what the person shows from their own account, in their own browser, is.
 *
 * The funder names the course by pasting its link, as for Coursera, and the course's slug is bound into the subject
 * they sign: a proof of another course fails the contract's own `identityHash == subject` check. What the proof
 * carries is the course and whether it is finished, read by our own provider from the person's "My learning" page,
 * once registered from a real account (docs/reclaim/udemy-course-shown-provider.md); nothing tonight.
 */

export const UDEMY_SOURCE = "Udemy";
export const UDEMY_GOAL_TYPE = 22;

export function udemyProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:udemy-course-shown:v1"));
}

/** The course, bound into what the funder signs. Two gifts on two courses never share a subject; no name is in it. */
export function udemySubject(slug: string): Hex {
  return keccak256(stringToHex(`viky:subject:udemy-course-shown:v1:${slug.trim().toLowerCase()}`));
}

/** A course slug as Udemy writes it in a course link, `udemy.com/course/<slug>/`: lower case, digits and dashes. */
export function isValidUdemySlug(value: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length <= 120;
}

/** The course inside whatever the funder pasted: the course link, with or without the rest, or the slug alone. */
export function udemySlugOf(pasted: string): string | undefined {
  const text = pasted.trim();
  if (text.length === 0) return undefined;
  if (!text.includes("/") && isValidUdemySlug(text.toLowerCase())) return text.toLowerCase();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return undefined;
  }
  if (!/(^|\.)udemy\.com$/i.test(url.hostname)) return undefined;
  const parts = url.pathname.split("/").filter(Boolean);
  const kind = parts.findIndex((part) => part.toLowerCase() === "course");
  const candidate = (kind >= 0 ? (parts[kind + 1] ?? "") : "").toLowerCase();
  return isValidUdemySlug(candidate) ? candidate : undefined;
}

/** Having it or not: finished is one, and a proof that shows it carries one. */
export const UDEMY_FINISHED = 1;

/** As a course certificate: a course takes weeks, and a year is long. */
export const UDEMY_DURATION_DAYS = Object.freeze({ min: 30, max: 365, suggested: 120 });

/** A provider of ours, pinned once registered from a real account: nothing tonight. */
export type UdemyProvider = Readonly<{ id: string; version: string; requestHash: string }>;
export const UDEMY_PROVIDER: UdemyProvider | null = null;

export const UDEMY_NOT_REGISTERED = "This condition's provider is not registered yet: it is built from a real Udemy account first, and nothing can be shown until then.";

/** Where the person signs in, in their own browser: their own "My learning" page. */
export const UDEMY_LOGIN_URL = "https://www.udemy.com/home/my-courses/learning/";

/**
 * What the person's "My learning" page says of the gift's course, by the fields our provider names (to confirm on a
 * real account): the course's slug and whether it is finished. Another course than the gift's does not pay.
 */
export function readUdemyCourse(fields: Readonly<Record<string, string>>, slug: string): ResultsVerdict {
  const shown = (fields.courseSlug ?? "").trim().toLowerCase();
  if (!shown || shown !== slug.trim().toLowerCase()) return { kind: "refused", code: "OTHER_COURSE", message: "The course shown is not the one this gift is for." };
  const completion = (fields.completed ?? "").trim().toLowerCase();
  if (completion !== "100" && completion !== "true") return { kind: "refused", code: "NOT_FINISHED", message: "The course shown is not finished yet." };
  return { kind: "read", metricValue: UDEMY_FINISHED, inWords: "Finished" };
}
