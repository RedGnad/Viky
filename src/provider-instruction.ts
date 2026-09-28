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

export function providerInstruction(portal: Readonly<{ portalId: string; university: string; country: string; loginUrl: string }>, sense: PortalSense): string {
  const domain = defaultProviderDomain(portal.loginUrl) ?? "the university's own site";
  const where = `${portal.university} (${countryInWords(portal.country)})`;
  const read =
    sense === "enrolment"
      ? `After the student signs in, open the page of their own account that states their registration for the current academic year (a registration certificate, the student card, or the header of the academic record). Extract exactly one field named \`${ENROLMENT_FIELD}\`: the words that state the registration and the academic year, as printed (for example "Inscrit 2026-2027" or "Registered, Fall 2026"). Read it from a page on ${domain}. Extract nothing else: no name, no student number, no date of birth, no photo, no grades.`
      : `After the student signs in, open the page of their own account that shows the results of their latest academic year or semester. Extract exactly three fields: \`${RESULTS_FIELDS.decision}\`, the year's or semester's decision as printed (for example "Admis", "Validé", "Passed"); \`${RESULTS_FIELDS.average}\`, the overall average of that year or semester as printed; \`${RESULTS_FIELDS.year}\`, the academic year the page is for, as printed. Read them from a page on ${domain}. Extract nothing else: no name, no student number, no individual course grades.`;
  return [
    `Provider for ${where}, ${sense}.`,
    `In Viky's shared Reclaim account, create an AI provider named "${portal.university}, ${sense}", sign-in page ${portal.loginUrl}, with this instruction:`,
    read,
    `Then register it: pnpm provider:add ${portal.portalId} ${sense} <the provider's id> --domain ${domain}`,
  ].join("\n");
}
