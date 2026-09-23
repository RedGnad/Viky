import { keccak256, stringToHex } from "viem";

/**
 * What an attested read is, in one number, so the app and the worker can tell whether they agree (incident of
 * 18 Sep 2026, 23:00 Paris).
 *
 * The worker is a service of its own with no repository attached, so a push to main does not redeploy it. That night
 * it was still running an image built on 17 Sep at 16:38 UTC, while the app had shipped `chessStatusPattern()` in the
 * shared sources at 00:37. The worker fetched the page it knew, the app read the proof against patterns the worker
 * had never heard of, and the reading died as `PROOF_MISMATCH`. The screen said "try again in a minute", which was
 * false: a minute, or a year, would have changed nothing.
 *
 * Two files decide what is fetched and what has to match, and they are the two hashed here. The worker reads them
 * from its own image and publishes the number on `/health`; the app carries the number of its own build and refuses
 * to read at all when the two differ. No key, no clock, no network: two builds of the same commit agree by
 * construction, and any drift is caught before a person is told anything.
 */

/** The two files an attested read is made of: what to fetch, and what the answer must contain. */
export const READING_FILES = ["src/attested-sources.ts", "src/chess-com.ts"] as const;

/** The number, from the files' own bytes. Each file is named in what is hashed, so a swap of the two is a change. */
export function fingerprintOfContents(contents: readonly string[]): string {
  if (contents.length !== READING_FILES.length) throw new Error(`A fingerprint takes ${READING_FILES.length} files, and ${contents.length} were given`);
  const parts = READING_FILES.map((name, index) => `${name}=${keccak256(stringToHex(contents[index]))}`);
  return keccak256(stringToHex(parts.join("\n")));
}

/**
 * What this build of the app reads with. `test/reading-fingerprint.test.ts` works it out from the two files and
 * fails if this line is not it, so the number cannot quietly fall behind the code: a commit that touches either file
 * has to change this line, which is the moment to redeploy the worker (docs/OPERATIONS.md).
 */
export const READING_FINGERPRINT = "0xdb46aebcc79bb4e3cab27fcb8b7cb0dca6b8119eacb7981cd32ee141f4fcbc32";
