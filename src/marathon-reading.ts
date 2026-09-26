import type { Hex } from "viem";
import { attestedRead, AttestedReadError, reclaimAttestedReadDeps, type AttestedReadDeps } from "./attested-read";
import { BREIZH_CHRONO_RUNNER, headersFor, MIKA_TIMING_RUNNER, type AttestedSource } from "./attested-sources";
import type { ZkFetchProof } from "./duolingo-public";
import { finishSecondsOf, MARATHON_RACES, marathonAccountOf, marathonCourseId, marathonMetricOf, marathonSubject, mikaAccountOf, mikaRunnerName, type MarathonEvent, type MarathonRace } from "./marathon";
import { mikaDetailAccount, mikaRowsOf, mikaRunnerIdOf, mikaSearchUrl } from "./mika-timing";

/**
 * Reading a runner's result, two ways, on the model of a certificate's (src/edx-reading.ts). Server only. A plain
 * read answers the screen before any money moves; an attested read is the only kind that moves money. Both take the
 * same patterns out of the same page, the ones in `src/attested-sources.ts`. On Breizh Chrono the page is the bib's;
 * on MikaTiming the runner's page is found first from the search by bib (src/mika-timing.ts), and that page is read.
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

function valuesOf(page: string, source: AttestedSource = BREIZH_CHRONO_RUNNER): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of source.matches) {
    const found = new RegExp(match.value).exec(page);
    if (!found?.groups) continue;
    for (const [name, value] of Object.entries(found.groups)) if (value !== undefined) values[name] = value;
  }
  return values;
}

/** The race and the heat the account names, from the register: a reference and a heat nobody pinned read nothing. */
export function raceOfAccount(account: string): { race: MarathonRace; event: MarathonEvent; bib: string } {
  const breizh = marathonAccountOf(account);
  const mika = breizh ? undefined : mikaAccountOf(account);
  if (!breizh && !mika) throw new MarathonReadError("INVALID_LINK", "That is not a race and a bib");
  const ref = breizh ? breizh.ref : `${mika!.host}/${mika!.year}`;
  const heat = breizh ? breizh.heat : mika!.heat;
  const timer = breizh ? "breizh-chrono" : "mika-timing";
  for (const race of MARATHON_RACES) {
    if (race.ref !== ref || race.timer !== timer) continue;
    const event = race.events.find((one) => one.heat === heat);
    if (event) return { race, event, bib: breizh ? breizh.bib : mika!.bib };
  }
  throw new MarathonReadError("UNKNOWN_RACE", "That race is not one Viky reads");
}

export function marathonResultOf(account: string, values: Readonly<Record<string, string>>): MarathonResult {
  const { race, event, bib } = raceOfAccount(account);
  const printed = (values.runner ?? "").replace(/\s+/g, " ").trim();
  const runner = race.timer === "mika-timing" ? mikaRunnerName(printed) : printed;
  if (!runner || !values.bib) throw new MarathonReadError("NO_RESULT", "No runner answers to that bib in that race");
  if (values.bib.toUpperCase() !== bib.toUpperCase()) throw new MarathonReadError("ANOTHER_BIB", "That page is about another bib");
  // A MikaTiming site answers an earlier year's pages until the race's own are published (Frankfurt 2026 answered
  // 2025's on 26 Sep 2026): the page's own year has to be the race's.
  if (race.timer === "mika-timing" && values.year !== race.ref.split("/")[1]) throw new MarathonReadError("NO_RESULT", "The timing company has not published that race's results yet");
  const official = (values.official ?? "").trim();
  const finishSeconds = finishSecondsOf(official);
  if (finishSeconds === undefined) throw new MarathonReadError("NOT_FINISHED", "The timing company has no finish time for that bib");
  return { race, event, bib, runner, finishSeconds, official, metric: marathonMetricOf(finishSeconds), subject: marathonSubject(runner, marathonCourseId(race, event)) };
}

/** A plain read sends what the attested one sends: the source's own headers, the user agent included. */
async function plainPage(url: string, fetchImpl: PlainFetch, source: AttestedSource): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: headersFor(source), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new MarathonReadError("FETCH_FAILED", "The result could not be read right now", { cause: error });
  }
  if (response.status !== 200) throw new MarathonReadError("FETCH_FAILED", `The results page answered ${response.status}`);
  return response.text().catch(() => "");
}

/**
 * The runner's page on a MikaTiming site, found from the search by bib: the account the attested read takes. The
 * search is read plainly and is never part of the proof; what it names is then read on its own page, which carries
 * the bib, the year and the id itself.
 */
export async function mikaRunnerAccount(account: string, fetchImpl: PlainFetch = fetch): Promise<string> {
  const { race, event, bib } = raceOfAccount(account);
  const parts = mikaAccountOf(account);
  if (race.timer !== "mika-timing" || !parts) throw new MarathonReadError("INVALID_LINK", "That is not a MikaTiming race");
  const idp = mikaRunnerIdOf(mikaRowsOf(await plainPage(mikaSearchUrl(parts.host, parts.year, bib), fetchImpl, MIKA_TIMING_RUNNER)), event.heat, bib);
  if (!idp) throw new MarathonReadError("NO_RESULT", "No runner answers to that bib in that race");
  return mikaDetailAccount(parts.host, parts.year, idp, bib);
}

/** The result behind a race and a bib, read plainly. Every refusal is typed, and none of them guesses. */
export async function readMarathonResult(account: string, fetchImpl: PlainFetch = fetch): Promise<MarathonResult> {
  const { race } = raceOfAccount(account);
  if (race.timer === "mika-timing") {
    const page = await plainPage(MIKA_TIMING_RUNNER.url(await mikaRunnerAccount(account, fetchImpl)), fetchImpl, MIKA_TIMING_RUNNER);
    return marathonResultOf(account, valuesOf(page, MIKA_TIMING_RUNNER));
  }
  return marathonResultOf(account, valuesOf(await plainPage(BREIZH_CHRONO_RUNNER.url(account), fetchImpl, BREIZH_CHRONO_RUNNER)));
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
export async function attestMarathonResult(account: string, deps: AttestedReadDeps = reclaimAttestedReadDeps(), fetchImpl: PlainFetch = fetch): Promise<AttestedMarathonReading> {
  const { race } = raceOfAccount(account);
  const mika = race.timer === "mika-timing";
  let reading;
  try {
    reading = mika ? await attestedRead(MIKA_TIMING_RUNNER.id, await mikaRunnerAccount(account, fetchImpl), deps) : await attestedRead(BREIZH_CHRONO_RUNNER.id, account, deps);
  } catch (error) {
    throw marathonError(error);
  }
  return { ...marathonResultOf(account, reading.values), observedAt: reading.observedAt, nullifier: reading.nullifier, proofs: [reading.proof] };
}
