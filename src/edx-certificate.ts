import { keccak256, stringToHex, type Hex } from "viem";
import { normaliseCertificateName } from "./duolingo-english-test";

/**
 * An edX verified certificate (D212), read for the person like a Coursera one (C3): the person shares the link of a
 * certificate edX issued, and Viky reads the page edX publishes for it. Browser safe.
 *
 * Set aside on 18 Sep 2026 for identity (D100 chose the Duolingo English Test over it); it comes back on the founder's
 * reasoning of 24 Sep: the issuer attests, as Coursera's page does, and the same name binding applies (D49's gap).
 *
 * **Measured on a real public certificate on 24 Sep 2026**, at `courses.edx.org/certificates/<32 hexadecimal characters>`
 * (its identifier is not kept here: a certificate names its holder),
 * 200, 11 KB of server-rendered HTML: the title `GTx ISYE6501x Certificate | edX` (the organisation and the course
 * number), the track in the rendering's own class (`wrapper-accomplishment-title verified`), the holder in
 * `accomplishment-recipient`, the course's printed name in `accomplishment-course-name`, "Issued August 6, 2018", and
 * the certificate's id again in its own link. A certificate that does not exist, or no longer does, answers 404
 * (another identifier, the same day).
 */

export const EDX_SOURCE = "edX";

/** The certificate's id as edX prints it: 32 lower-case hexadecimal figures. */
const ID = /^[0-9a-f]{32}$/;
/** An organisation and a course number as a certificate's title prints them: `GTx` and `ISYE6501x`. */
const PART = /^[A-Za-z0-9._-]{1,40}$/;

export function isValidEdxCertificateId(value: string): boolean {
  return ID.test(value.trim().toLowerCase());
}

export function edxCertificateUrl(id: string): string {
  return `https://courses.edx.org/certificates/${id.trim().toLowerCase()}`;
}

/** The id inside whatever the person pasted: the certificate's link, or the id alone. */
export function edxCertificateIdOf(pasted: string): string | undefined {
  const text = pasted.trim();
  if (!text) return undefined;
  if (isValidEdxCertificateId(text)) return text.toLowerCase();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return undefined;
  }
  if (!/(^|\.)edx\.org$/i.test(url.hostname)) return undefined;
  const parts = url.pathname.split("/").filter(Boolean);
  const at = parts.findIndex((part) => part.toLowerCase() === "certificates");
  const candidate = at >= 0 ? (parts[at + 1] ?? "") : "";
  return isValidEdxCertificateId(candidate) ? candidate.toLowerCase() : undefined;
}

/** The course's key as this line compares it: organisation and number, `gtx+isye6501x`. */
export function edxCourseKey(org: string, number: string): string | undefined {
  if (!PART.test(org) || !PART.test(number)) return undefined;
  return `${org}+${number}`.toLowerCase();
}

/**
 * The course inside whatever the funder pasted: a course link carrying its key (`course-v1:GTx+ISYE6501x+2T2018`, the
 * form courses.edx.org links carry), or the organisation and the number typed as edX prints them (`GTx ISYE6501x`, or
 * `GTx+ISYE6501x`). An edX catalogue link (`edx.org/learn/…`) carries no key in its address, so it gives nothing, and
 * the screen asks for the code the certificate will print.
 */
export function edxCourseOf(pasted: string): string | undefined {
  const text = decodeURIComponent(pasted.trim());
  if (!text) return undefined;
  const run = /course-v1:([A-Za-z0-9._-]+)\+([A-Za-z0-9._-]+)\+/.exec(text);
  if (run) return edxCourseKey(run[1], run[2]);
  const typed = /^([A-Za-z0-9._-]+)[\s+:]+([A-Za-z0-9._-]+)$/.exec(text);
  return typed ? edxCourseKey(typed[1], typed[2]) : undefined;
}

/** The person and the course, as the funder signs them (`subject`): the certificate pays only when both match. */
export function edxSubject(name: string, courseKey: string): Hex {
  return keccak256(stringToHex(`viky:certificate:v1:${EDX_SOURCE}:${normaliseCertificateName(name)}:${courseKey.trim().toLowerCase()}`));
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "August 6, 2018", as the page prints the day of issue, to seconds at midnight UTC, or nothing. */
export function edxIssuedDaySeconds(issued: string): number | undefined {
  const match = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(issued.trim());
  if (!match) return undefined;
  const month = MONTHS.indexOf(match[1].toLowerCase());
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 0 || day < 1 || day > 31) return undefined;
  const at = Date.UTC(year, month, day);
  if (new Date(at).getUTCDate() !== day) return undefined;
  return at / 1_000;
}

/** The tracks whose certificate is paid and identity-verified: `verified`, and `professional` for professional certificates. */
export function isVerifiedTrack(track: string): boolean {
  return track === "verified" || track === "professional";
}

/** A few characters the page escapes in a name or a course's title. */
export function edxText(value: string): string {
  return value
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export const EDX_DURATION_DAYS = Object.freeze({ min: 30, max: 365, suggested: 120 });

/** Goal 25 on `MilestoneGift`, after PRONOTE's 24. */
export const EDX_GOAL_TYPE = 25;

export function edxProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:edx-certificate-zkfetch:v1"));
}

/** Having it or not: the certificate exists, verified, for that course, in that name. */
export const EDX_HAS_IT = 1;
