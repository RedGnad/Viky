import type { Hex } from "viem";
import { attestedRead, AttestedReadError, reclaimAttestedReadDeps, type AttestedReadDeps } from "./attested-read";
import { BREIZH_CHRONO_RUNNER } from "./attested-sources";
import type { ZkFetchProof } from "./duolingo-public";
import { finishSecondsOf, MARATHON_RACES, marathonAccountOf, marathonCourseId, marathonMetricOf, marathonSubject, type MarathonEvent, type MarathonRace } from "./marathon";

/**
 * Reading a runner's result on Breizh Chrono, two ways, on the model of a certificate's (src/edx-reading.ts). Server
 * only. A plain read answers the screen before any money moves; an attested read is the only kind that moves money.
 * Both take the same two patterns out of the same page, the ones in `src/attested-sources.ts`.
 */

export type MarathonReadErrorCode = "INVALID_LINK" | "UNKNOWN_RACE" | "NO_RESULT" | "ANOTHER_BIB" | "NOT_FINISHED" | "PROOF_INVALID" | "PROOF_MISMATCH" | "FETCH_FAILED" | "WORKER_OUT_OF_DATE" | "NOT_CONFIGURED";

export class MarathonReadError extends Error {
  constructor(
    readonly code: MarathonReadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "MarathonReadError";
  }
}

export type MarathonResult = Readonly<{
  race: MarathonRace;
  event: MarathonEvent;
  bib: string;
  /** The runner as the page prints them, "FALL Mor". */
  runner: string;
  /** The official time in seconds, and as the page prints it. */
  finishSeconds: number;
  official: string;
  /** What the contract compares: seconds under a day. */
  metric: number;
  /** The runner and the race, hashed as the funder signed them. */
  subject: Hex;
}>;

export type PlainFetch = (url: string, init: RequestInit) => Promise<Response>;

function valuesOf(page: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of BREIZH_CHRONO_RUNNER.matches) {
    const found = new RegExp(match.value).exec(page);
    if (!found?.groups) continue;
    for (const [name, value] of Object.entries(found.groups)) if (value !== undefined) values[name] = value;
  }
  return values;
}

/** The race and the heat the account names, from the register: a reference and a heat nobody pinned read nothing. */
export function raceOfAccount(account: string): { race: MarathonRace; event: MarathonEvent; bib: string } {
  const parts = marathonAccountOf(account);
  if (!parts) throw new MarathonReadError("INVALID_LINK", "That is not a race and a bib");
  for (const race of MARATHON_RACES) {
    if (race.ref !== parts.ref) continue;
    const event = race.events.find((one) => one.heat === parts.heat);
    if (event) return { race, event, bib: parts.bib };
  }
  throw new MarathonReadError("UNKNOWN_RACE", "That race is not one Viky reads");
}

export function marathonResultOf(account: string, values: Readonly<Record<string, string>>): MarathonResult {
  const { race, event, bib } = raceOfAccount(account);
  const runner = (values.runner ?? "").replace(/\s+/g, " ").trim();
  if (!runner || !values.bib) throw new MarathonReadError("NO_RESULT", "No runner answers to that bib in that race");
  if (values.bib !== bib) throw new MarathonReadError("ANOTHER_BIB", "That page is about another bib");
  const official = (values.official ?? "").trim();
  const finishSeconds = finishSecondsOf(official);
  if (finishSeconds === undefined) throw new MarathonReadError("NOT_FINISHED", "The timing company has no finish time for that bib");
  return { race, event, bib, runner, finishSeconds, official, metric: marathonMetricOf(finishSeconds), subject: marathonSubject(runner, marathonCourseId(race, event)) };
}

/** The result behind a race and a bib, read plainly. Every refusal is typed, and none of them guesses. */
export async function readMarathonResult(account: string, fetchImpl: PlainFetch = fetch): Promise<MarathonResult> {
  raceOfAccount(account);
  let response: Response;
  try {
    response = await fetchImpl(BREIZH_CHRONO_RUNNER.url(account), { headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (Viky)" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new MarathonReadError("FETCH_FAILED", "The result could not be read right now", { cause: error });
  }
  if (response.status !== 200) throw new MarathonReadError("FETCH_FAILED", `The results page answered ${response.status}`);
  return marathonResultOf(account, valuesOf(await response.text().catch(() => "")));
}

export type AttestedMarathonReading = MarathonResult & Readonly<{ observedAt: number; nullifier: Hex; proofs: readonly ZkFetchProof[] }>;

function marathonError(error: unknown): MarathonReadError {
  if (!(error instanceof AttestedReadError)) return new MarathonReadError("FETCH_FAILED", "The result could not be read right now", { cause: error });
  switch (error.code) {
    case "INVALID_ACCOUNT":
      return new MarathonReadError("INVALID_LINK", "That is not a race and a bib", { cause: error });
    case "NOT_FOUND":
      return new MarathonReadError("NO_RESULT", "No runner answers to that bib in that race", { cause: error });
    case "REFUSED":
    case "NOT_ACCEPTED":
      return new MarathonReadError("FETCH_FAILED", "The timing company would not answer that reading", { cause: error });
    case "NO_MATCH":
      // An empty page, the answer for a bib nobody wore, matches no pattern.
      return new MarathonReadError("NO_RESULT", "No runner answers to that bib in that race", { cause: error });
    default:
      return new MarathonReadError(error.code as MarathonReadErrorCode, error.message, { cause: error });
  }
}

/** The reading that can move money. The page is read again every time: a result the timing company withdraws stops paying. */
export async function attestMarathonResult(account: string, deps: AttestedReadDeps = reclaimAttestedReadDeps()): Promise<AttestedMarathonReading> {
  raceOfAccount(account);
  let reading;
  try {
    reading = await attestedRead(BREIZH_CHRONO_RUNNER.id, account, deps);
  } catch (error) {
    throw marathonError(error);
  }
  return { ...marathonResultOf(account, reading.values), observedAt: reading.observedAt, nullifier: reading.nullifier, proofs: [reading.proof] };
}
