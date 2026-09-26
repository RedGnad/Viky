import { conditionById } from "./conditions";

/**
 * The schools named at the foot of the landing (D225). Each one has a page on a platform Viky reads a certificate
 * from, checked on 24 Sep 2026 and again by `pnpm check:universities`, and the sentence that names them is true of
 * the code because the edX and Coursera lines are live (`liveConditions`) and read the certificate's own public page,
 * whatever the course. Text only: no crest, no colour, no typeface of theirs, and no word like "partner" or
 * "trusted", which is what the universities' own trademark rules allow. MIT is not here: its courses are on MITx
 * Online, a line being wired (D222) and not live; it joins the list the day that line does.
 */
export type University = Readonly<{ name: string; platform: "edx" | "coursera"; page: string }>;

export const UNIVERSITIES: readonly University[] = [
  { name: "Harvard", platform: "edx", page: "https://www.edx.org/school/harvardx" },
  { name: "Cambridge", platform: "edx", page: "https://www.edx.org/school/universityofcambridge" },
  { name: "Oxford", platform: "edx", page: "https://www.edx.org/school/oxfordx" },
  { name: "Stanford", platform: "edx", page: "https://www.edx.org/school/stanfordonline" },
  { name: "Yale", platform: "coursera", page: "https://www.coursera.org/partners/yale" },
  { name: "Princeton", platform: "edx", page: "https://www.edx.org/school/princetonx" },
  { name: "Imperial", platform: "edx", page: "https://www.edx.org/school/imperialx" },
  { name: "Columbia", platform: "edx", page: "https://www.edx.org/school/columbiax" },
  { name: "Berkeley", platform: "edx", page: "https://www.edx.org/school/uc-berkeleyx" },
  { name: "Sorbonne", platform: "edx", page: "https://www.edx.org/school/sorbonnex" },
  { name: "EPFL", platform: "edx", page: "https://www.edx.org/school/epflx" },
  { name: "ETH Zürich", platform: "edx", page: "https://www.edx.org/school/ethx" },
];

/** The line that reads a certificate from each platform: the sentence stands only while both are live. */
export const CERTIFICATE_LINES: Readonly<Record<University["platform"], string>> = { edx: "edx-certificate", coursera: "coursera-certificate" };

/** Whether the sentence may be printed at all: every platform named has its line live today. */
export const certificateLinesLive = (): boolean => Object.values(CERTIFICATE_LINES).every((id) => conditionById(id)?.live === true);

/** "edX or Coursera": the platforms' names as the register writes them, since no screen names a source itself. */
export const certificatePlatforms = (): string =>
  Object.values(CERTIFICATE_LINES)
    .map((id) => conditionById(id)?.source)
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .join(" or ");

/**
 * The schools, distinct, in the order they were drawn, by the random the caller gives: the server's, once per request,
 * so the first image and the page the browser takes over agree (D160). Since D285 the landing names them one at a
 * time in the sentence that goes by (`landingGoals`), all of them, rather than four standing still (D225).
 */
export function pickUniversities(random: () => number = Math.random, count = UNIVERSITIES.length): readonly string[] {
  if (!certificateLinesLive()) return [];
  const left = [...UNIVERSITIES];
  const picked: string[] = [];
  while (picked.length < count && left.length > 0) picked.push(left.splice(Math.floor(random() * left.length), 1)[0].name);
  return picked;
}
