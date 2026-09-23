import { GITHUB_GRAPHQL_URL } from "./github-contributions";
import { lichessUserUrl } from "./lichess";

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

/**
 * A Lichess account, the one answer its API gives about a user (D168): read plainly for the funder's step today. The
 * keeper's attested reading of it is not built: its sources would go into the fingerprinted list and need the
 * reading service redeployed first, and until then no gift can be made on Lichess at all.
 */
export const LICHESS_USER: PlainReading = {
  id: "lichess-user",
  service: "Lichess",
  url: lichessUserUrl("<name>"),
  why: "Read plainly before any money moves; the attested reading waits for the reading service to carry its sources.",
};

const ALL: readonly PlainReading[] = [GITHUB_CALENDAR, LICHESS_USER];

export function plainReadingIds(): readonly string[] {
  return ALL.map((reading) => reading.id);
}
