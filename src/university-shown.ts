import { keccak256, stringToHex, type Hex } from "viem";

/**
 * Staying enrolled at a university, shown from the person's own student portal (D165): the second nature's second
 * condition, and the corridor's own case, a family abroad paying the year.
 *
 * One goal on the milestone contract for the whole family of portals, and the portal pinned in each gift: the
 * subject the funder signs is the hash of the portal's id, so a proof shown from another portal fails the
 * contract's own `identityHash == subject` check, exactly as a certificate in another name does. A goal per portal
 * would give nothing the subject does not already give, and would cost an owner signature through the Safe every
 * time a university is added; the subject costs nothing and is signed by the funder, who is the one choosing the
 * university.
 */

export const UNIVERSITY_SOURCE = "their university";
export const UNIVERSITY_GOAL_TYPE = 14;

/** What every attestation for this family carries, whatever the portal: the goal's provider id on the contract. */
export function universityShownProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:university-enrollment-shown:v1"));
}

/** The portal, bound into what the funder signs. Two gifts on two portals never share a subject. */
export function universitySubject(portalId: string): Hex {
  return keccak256(stringToHex(`viky:subject:university-enrollment-shown:v1:${portalId.trim().toLowerCase()}`));
}

/** Having it or not: enrolled is one, and a proof that shows it carries one. */
export const UNIVERSITY_ENROLLED = 1;

/** As a course certificate: a year is long, and a semester is not thirty days. */
export const UNIVERSITY_DURATION_DAYS = Object.freeze({ min: 30, max: 365, suggested: 180 });

/** The country a portal's row names by two letters, in words for the chooser's line: "SN" reads "Senegal". */
export function countryInWords(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** A portal id as our own table names it: lower case, letters, digits and dashes, like `ucad-sn` or `sorbonne-fr`. */
export function isPortalId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length <= 64;
}

/** What a portal's page must show for the person to be enrolled, as the portal's own row says it (src/portal-store.ts). */
export type PortalExtract = Readonly<{
  /** The field the Reclaim provider extracts, by the name the provider gives it. */
  field: string;
  /** A pattern the field's value must match to mean enrolled: a status, or the current academic year. */
  matches: string;
  /** What Viky keeps of it, in words, printed to the person before they show anything. */
  keeps: string;
}>;

/** Whether the fields a proof carried say enrolled, by the portal's own rule. Nothing else about the person is read. */
export function enrolledBy(extract: PortalExtract, fields: Readonly<Record<string, string>>): boolean {
  const value = fields[extract.field];
  if (typeof value !== "string") return false;
  let pattern: RegExp;
  try {
    pattern = new RegExp(extract.matches, "i");
  } catch {
    return false;
  }
  return pattern.test(value);
}
