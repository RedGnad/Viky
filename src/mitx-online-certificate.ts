import { keccak256, stringToHex, type Hex } from "viem";
import { normaliseCertificateName } from "./duolingo-english-test";

/**
 * A certificate from MITx Online, MIT's own course platform (D222), read for the person like an edX one (D212): the
 * person shares the link of a certificate MITx Online issued, and Viky reads the page it publishes for it. MIT's
 * courses left edX for mitxonline.mit.edu, so an MIT course is read here and not there. Browser safe.
 *
 * **Measured on 24 Sep 2026** on two real public program certificates, at
 * `mitxonline.mit.edu/certificate/program/<uuid>/` (their identifiers are not kept here: a certificate names its holder),
 * 200, about 10 KB of server-rendered HTML: the title `MITx Online | Certificate for: <course or program>`, the holder
 * in `certify-name`, "Issued: Nov. 4, 2024", and the certificate's id again after "Valid Certificate ID". A course
 * certificate is served at `/certificate/<uuid>/` by the same template (mitodl/mitxonline, `cms/models.py`,
 * `course_certificate`, and `cms/templates/certificate_page.html`, read the same day); no course certificate was found
 * in the open, so that path is read from the source and not from a live page. A certificate that does not exist, or is
 * revoked, answers 404: the view reads `CourseRunCertificate.objects`, whose manager drops `is_revoked` ones.
 *
 * MITx Online issues a certificate only on the paid track ("certificates are exclusively available to learners who
 * pass a course session on its Verified/Certificate (Paid) Enrollment Track", its help centre), so every certificate
 * it shows is the one this line pays for. The page carries no course code, so the funder names the course or the
 * program by its title, as the certificate prints it.
 */

export const MITX_ONLINE_SOURCE = "MITx Online";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A certificate as this line keys it: its uuid, with `program/` before it for a program's certificate. */
export function isValidMitxOnlineKey(value: string): boolean {
  const key = value.trim().toLowerCase();
  return UUID.test(key.startsWith("program/") ? key.slice("program/".length) : key);
}

export function mitxOnlineCertificateUrl(key: string): string {
  return `https://mitxonline.mit.edu/certificate/${key.trim().toLowerCase()}/`;
}

/** The key inside whatever the person pasted: the certificate's link, or its id alone for a course. */
export function mitxOnlineKeyOf(pasted: string): string | undefined {
  const text = pasted.trim();
  if (!text) return undefined;
  if (UUID.test(text.toLowerCase())) return text.toLowerCase();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return undefined;
  }
  if (url.hostname.toLowerCase() !== "mitxonline.mit.edu") return undefined;
  const parts = url.pathname.split("/").filter(Boolean).map((part) => part.toLowerCase());
  if (parts[0] !== "certificate") return undefined;
  if (parts[1] === "program" && parts.length === 3 && UUID.test(parts[2])) return `program/${parts[2]}`;
  return parts.length === 2 && UUID.test(parts[1]) ? parts[1] : undefined;
}

/** A few characters the page escapes in a name or a title. */
export function mitxOnlineText(value: string): string {
  return value
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** The course or the program as this line compares it: its title, lower case, one space between words. */
export function mitxOnlineCourseOf(typed: string): string | undefined {
  const title = mitxOnlineText(typed).toLowerCase();
  return title.length >= 3 && title.length <= 200 ? title : undefined;
}

/** The person and the course, as the funder signs them (`subject`): the certificate pays only when both match. */
export function mitxOnlineSubject(name: string, course: string): Hex {
  return keccak256(stringToHex(`viky:certificate:v1:${MITX_ONLINE_SOURCE}:${normaliseCertificateName(name)}:${course.trim().toLowerCase()}`));
}

/**
 * The month as Django's `date` filter prints it (the template's `issue_date|date`, "N j, Y"): Associated Press
 * abbreviations, "Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec.".
 */
const MONTHS: Readonly<Record<string, number>> = { "jan.": 0, "feb.": 1, march: 2, april: 3, may: 4, june: 5, july: 6, "aug.": 7, "sept.": 8, "oct.": 9, "nov.": 10, "dec.": 11 };

/** "Nov. 4, 2024", as the page prints the day of issue, to seconds at midnight UTC, or nothing. */
export function mitxOnlineIssuedDaySeconds(issued: string): number | undefined {
  const match = /^([A-Za-z]+\.?) (\d{1,2}), (\d{4})$/.exec(issued.trim());
  if (!match) return undefined;
  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month === undefined || day < 1 || day > 31) return undefined;
  const at = Date.UTC(year, month, day);
  if (new Date(at).getUTCDate() !== day) return undefined;
  return at / 1_000;
}

export const MITX_ONLINE_DURATION_DAYS = Object.freeze({ min: 30, max: 365, suggested: 120 });

/** Goal 29 on `MilestoneGift`, after WAEC's 28. */
export const MITX_ONLINE_GOAL_TYPE = 29;

export function mitxOnlineProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:mitx-online-certificate-zkfetch:v1"));
}

/** Having it or not: the certificate exists, for that course, in that name. */
export const MITX_ONLINE_HAS_IT = 1;
