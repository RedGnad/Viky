import { getDomain, getHostname } from "tldts";
import type { PortalSense } from "./portal-store";
import { countryInWords } from "./university-shown";

/**
 * The exact instruction the operator gives Reclaim's agent when building a university's provider of one sense (D313):
 * written with the request, so the provider is built the same way whoever builds it. An AI provider names no request
 * of its own; the agent follows these words at the first real run, and the first proof is then read and pinned
 * (`pnpm portal:pin`). The fields are named here once, so every university's pin reads the same names.
 */

export const ENROLMENT_FIELD = "enrolment";
export const RESULTS_FIELDS = { decision: "decision", average: "average", year: "year" } as const;

/**
 * Platforms that host several universities under one domain: a provider on one of them reads its university's own host,
 * never the platform's domain, or any tenant of the platform could stand in for another. Read in the corridor's list and
 * in the world's (data/university-register.json keeps the host for every domain several universities share).
 */
const SHARED_PLATFORMS = new Set(["optsolution.net", "campusniger.com", "instructure.com", "moodlecloud.com", "blackboard.com", "brightspace.com", "d2l.com", "microsoftonline.com", "okta.com", "google.com", "azurewebsites.net", "sharepoint.com", "my.site.com", "force.com", "ovh.net", "amazonaws.com", "herokuapp.com"]);

/** The domain a provider's proofs must read, by default: the sign-in host's registrable domain, "ucad.sn", or the host itself on a shared platform. */
export function defaultProviderDomain(loginUrl: string): string | null {
  const host = getHostname(loginUrl);
  if (!host) return null;
  const domain = getDomain(host) ?? host;
  return SHARED_PLATFORMS.has(domain) ? host : domain;
}

/** A university as an instruction reads it: its sign-in page, and the providers it already has, each with the domains it reads. */
type InstructedPortal = Readonly<{
  portalId: string;
  university: string;
  country: string;
  loginUrl: string;
  enrolment?: Readonly<{ domain?: string | null }> | null;
  results?: Readonly<{ domain?: string | null }> | null;
}>;

/**
 * The domains a new provider of this university reads. A university that already has a provider keeps that
 * provider's domains: what was learnt with a first proof, that a student signs in on one domain and has their record
 * on another, is not learnt again by a refused proof. Toulouse signs in on utoulouse.fr and keeps the record on
 * mondossierweb.univ-tlse3.fr; proposed from the sign-in page alone, its results provider would have refused its
 * first proof as read on another site (found before any such proof, 9 Oct 2026). Without one, the sign-in page's own.
 */
export function providerDomains(portal: InstructedPortal): string | null {
  const kept = [portal.enrolment?.domain, portal.results?.domain].map((domain) => domain?.trim().toLowerCase()).find((domain) => domain);
  return kept || defaultProviderDomain(portal.loginUrl);
}

/** Several domains as a sentence names them: "utoulouse.fr or univ-tlse3.fr". */
const inWords = (domains: string) => domains.split(",").map((domain) => domain.trim()).filter(Boolean).join(" or ");

export function providerInstruction(portal: InstructedPortal, sense: PortalSense): string {
  const domains = providerDomains(portal);
  const domain = domains ? inWords(domains) : "the university's own site";
  const where = `${portal.university} (${countryInWords(portal.country)})`;
  const read =
    sense === "enrolment"
      ? `After the student signs in, open the page of their own account that states their registration for the current academic year (a registration certificate, the student card, or the header of the academic record). Extract exactly one field named \`${ENROLMENT_FIELD}\`: the words that state the registration and the academic year, as printed (for example "Inscrit 2026-2027" or "Registered, Fall 2026"). Read it from a page on ${domain}. Extract nothing else: no name, no student number, no date of birth, no photo, no grades.`
      : // The page of results often lists every year, the one under way with no result yet, and writes a result as its
        // code: both said, or the agent reads the year that has nothing, or looks for a word the page does not print.
        `After the student signs in, open the page of their own account that shows their results by academic year (often named "Notes et résultats", "Results" or "Transcript"). The page may list several years, and the year under way with no result yet: read the most recent academic year that carries a result, never a year that has none. Extract exactly three fields: \`${RESULTS_FIELDS.decision}\`, that year's result as printed, which is often a short code and not a word (for example "ADM", "AJ", "Admis", "Validé", "Passed"): keep it exactly as written; \`${RESULTS_FIELDS.average}\`, the overall grade of that same year as printed; \`${RESULTS_FIELDS.year}\`, the academic year those two are for, as printed (for example "2025/2026"). Read them from a page on ${domain}. Extract nothing else: no name, no student number, no individual course grades.`;
  return [
    `Provider for ${where}, ${sense}.`,
    `In Viky's shared Reclaim account, create an AI provider named "${portal.university}, ${sense}", sign-in page ${portal.loginUrl}, with this instruction:`,
    read,
    `Then register it: pnpm provider:add ${portal.portalId} ${sense} <the provider's id> --domain ${domains ?? "<the domain its pages are on>"}`,
  ].join("\n");
}
