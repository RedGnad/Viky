import { keccak256, stringToHex, type Hex } from "viem";
import { normaliseCertificateName } from "./duolingo-english-test";

/**
 * A certification on Credly, the "get a certification" family (the founder's line of 20 Sep 2026). Browser safe.
 *
 * Credly hosts Open Badges v2, so a badge is two public things rather than one page, and both are read:
 *
 * 1. **The assertion**, `credly.com/api/v1/obi/v2/badge_assertions/<badge id>`, JSON. It carries `issuedOn` as an
 *    ISO moment, and a `badge` URL that pins the issuer's id and the badge class's id in one string. It carries no
 *    name at all: the holder is a hashed email, which nothing here matches, receives or keeps.
 * 2. **The public page**, `credly.com/badges/<badge id>/public_url`, HTML. Its `og:title` has one fixed shape,
 *    "<title> was issued by <issuer> to <holder>.", and it is the only place the holder's name is published.
 *
 * Measured on 20 Sep 2026 on three live badges. What the shapes give this condition:
 *
 * - **The certification is identified by two ids, not by words.** A title can be edited, translated or reused; the
 *   issuer and badge class ids cannot. So the funder chooses from the short list below, and what a proof must carry
 *   is that pair, which is why a badge of another course by the same issuer pays nothing.
 * - **The day is only in the assertion**, and the name is only in the page, so a reading is two proofs.
 * - **An unknown badge answers 404 on the assertion**, while its page answers 200 with no `og` tag at all (measured
 *   on a badge id nobody has). So the assertion is what says a badge exists.
 * - **Asking the page for JSON answers 500**, and it varies on `Accept`, so it is read as the page it is.
 *
 * What is not measured: what either end answers for a badge its holder has made private again, because no private
 * badge was to hand. A reading that stops carrying what it needs refuses, and says the page could not be read.
 */

export const CREDLY_SOURCE = "Credly";

/** A badge id as Credly writes it everywhere: a lower case UUID. */
const BADGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isValidCredlyBadgeId(value: string): boolean {
  return BADGE_ID.test(value.trim().toLowerCase());
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

/**
 * One certification a gift can be made on: what a person calls it, who issues it, and the two ids a proof is judged
 * by. The list is short and in the repository on purpose. Credly hosts hundreds of thousands of badge classes, and a
 * funder who could name any of them could name one nobody can earn, or one whose ids we have never seen; each entry
 * here was read from Credly's own `badge_classes` endpoint on 20 Sep 2026, with its title in Credly's own words.
 */
export type CredlyCertification = Readonly<{
  /** Credly's own word for it, from the criteria link of its badge class. It is what the funder's terms carry. */
  id: string;
  title: string;
  issuer: string;
  /** The issuer's own id, which every badge of theirs carries. */
  issuerId: string;
  /** The badge class's id: this certification and no other. */
  classId: string;
  /** What it takes, in one line, so a funder chooses knowing what they are asking for. */
  help: string;
}>;

const CISCO = "74381078-44ac-4581-8471-36bd1ce495b7";

export const CREDLY_CERTIFICATIONS: readonly CredlyCertification[] = [
  {
    id: "ai-fundamentals-with-ibm-skillsbuild",
    title: "AI Fundamentals with IBM SkillsBuild",
    issuer: "Cisco",
    issuerId: CISCO,
    classId: "911500fa-32e7-4986-99de-94fb73040a20",
    help: "Six modules on what artificial intelligence is and what it is used for, free, with Cisco and IBM SkillsBuild.",
  },
  {
    id: "introduction-to-cybersecurity",
    title: "Introduction to Cybersecurity",
    issuer: "Cisco",
    issuerId: CISCO,
    classId: "10b1a2de-f36b-4730-b1ca-8505e19f4390",
    help: "What the threats are and why the work exists, free, and the first step of Cisco's own cybersecurity path.",
  },
  {
    id: "python-essentials-1",
    title: "Python Essentials 1",
    issuer: "Cisco",
    issuerId: CISCO,
    classId: "12ca3593-5a50-4e91-b3af-e8a66ed80004",
    help: "The first half of programming in Python, free, with Cisco and the OpenEDG Python Institute.",
  },
];

export function credlyCertification(id: string): CredlyCertification | undefined {
  return CREDLY_CERTIFICATIONS.find((entry) => entry.id === id.trim().toLowerCase());
}

/** The certification a badge belongs to, from the `badge` URL of its assertion, or nothing when it is another one. */
export function credlyCertificationOfBadgeUrl(badgeUrl: string): CredlyCertification | undefined {
  const found = /\/issuers\/(?<issuerId>[0-9a-f-]{36})\/badge_classes\/(?<classId>[0-9a-f-]{36})/.exec(badgeUrl.trim().toLowerCase());
  if (!found?.groups) return undefined;
  return CREDLY_CERTIFICATIONS.find((entry) => entry.issuerId === found.groups!.issuerId && entry.classId === found.groups!.classId);
}

/**
 * The three things the public page's one title says, in the shape Credly writes it. The title and the issuer are
 * read back rather than trusted: what the gift is judged by is the pair of ids in the assertion, and these are for
 * saying whose badge this is. A person's own name is taken last, because a certification's title can carry the word
 * "to" and an issuer's name can carry it too.
 */
export function credlyHolderOfTitle(ogTitle: string): string | undefined {
  const found = /^(?<title>.+) was issued by (?<issuer>.+) to (?<holder>.+)\.$/.exec(ogTitle.trim());
  const holder = found?.groups?.holder?.trim();
  return holder && holder.length > 0 ? holder : undefined;
}

/**
 * The person and the certification, as the funder signs them into the terms. A badge in another name, or for another
 * certification, pays nothing.
 *
 * The same gap D49 wrote down for a course certificate is here: Credly publishes no field a holder can edit, so two
 * people of the same name who earn the same certification inside the same days cannot be told apart by this. The
 * gift still reaches only the account that opened the funder's link.
 */
export function credlySubject(name: string, certificationId: string): Hex {
  return keccak256(stringToHex(`viky:certificate:v1:${CREDLY_SOURCE}:${normaliseCertificateName(name)}:${certificationId.trim().toLowerCase()}`));
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
