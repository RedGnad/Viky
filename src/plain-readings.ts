import { GITHUB_GRAPHQL_URL } from "./github-contributions";

/**
 * The readings Viky makes on its own word (D166): no attestor and no proof, the evidence signer signing what Viky
 * itself read. Listed here so the register can name one and so a reader of the code sees at a glance which readings
 * are not attested. Everything else Viky reads about a person is in src/attested-sources.ts and goes through the
 * reading service; that list is fingerprinted with the service and this one is not, because nothing here is fetched
 * by the worker.
 */
export type PlainReading = Readonly<{
  id: string;
  service: string;
  /** The one address asked, built here and never supplied by a caller. */
  url: string;
  /** Why it is not attested, in one sentence. */
  why: string;
}>;

export const GITHUB_CALENDAR: PlainReading = {
  id: "github-calendar",
  service: "GitHub",
  url: GITHUB_GRAPHQL_URL,
  why: "GitHub's contribution calendar answers only to a token, by POST, which the reading service cannot carry yet.",
};

const ALL: readonly PlainReading[] = [GITHUB_CALENDAR];

export function plainReadingIds(): readonly string[] {
  return ALL.map((reading) => reading.id);
}
