import type { Hex } from "viem";
import { attestedRead, AttestedReadError, reclaimAttestedReadDeps, type AttestedReadDeps } from "./attested-read";
import { headersFor, WCA_PERSON_RESULTS } from "./attested-sources";
import type { ZkFetchProof } from "./duolingo-public";
import { competitionStillOpen, isWcaId, sameCuber, wcaAccount, wcaAccountOf, wcaCourseId, wcaCourseOf, wcaMetricOf, wcaSubject, WCA_EVENTS } from "./wca";

/**
 * Reading a speedcuber's competition on the WCA's public API (the founder, 27 Sep 2026), two ways, on the model of a
 * marathon's (src/marathon-reading.ts). Server only. Before the competition, the public list of competitors (the
 * WCIF, `/competitions/<id>/wcif/public`) says whether the person is registered in the event: that stands in for the
 * bib. After it, the competition's results (`/competitions/<id>/results`) carry the person's rows, one per round,
 * with the best single: the row with the best time is the one read attested, on the person's own list of results,
 * keyed by their WCA id (src/attested-sources.ts). A plain read answers the screen before any money moves; an
 * attested read is the only kind that moves money.
 */

export const WCA_API = "https://www.worldcubeassociation.org/api/v0";

export type WcaReadErrorCode = "INVALID_LINK" | "UNKNOWN_COMPETITION" | "NOT_REGISTERED" | "NO_RESULT" | "NOT_FINISHED" | "PROOF_INVALID" | "PROOF_MISMATCH" | "FETCH_FAILED" | "WORKER_OUT_OF_DATE" | "LIMIT_REACHED" | "NOT_CONFIGURED";

export class WcaReadError extends Error {
  constructor(
    readonly code: WcaReadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "WcaReadError";
  }
}

export type PlainFetch = (url: string, init: RequestInit) => Promise<Response>;

/** A competition as the sheet lists it: the API's own fields, the ones the list and the check need. */
export type WcaCompetition = Readonly<{
  competitionId: string;
  name: string;
  city: string;
  country: string;
  /** The first day, as the API dates it, "2026-10-17": the competitors list closes at its start. */
  startDate: string;
  endDate: string;
  eventIds: readonly string[];
}>;

/** A row of a competition's results as the API prints it, the fields read. */
export type WcaResultRow = Readonly<{ name: string; wcaId: string; eventId: string; round: string; best: number; average: number }>;

export type WcaResult = Readonly<{
  competitionId: string;
  eventId: string;
  wcaId: string;
  round: string;
  /** The person as the API prints them, "Alexandre Schoeffel". */
  name: string;
  /** The best single of the round, as the API prints it (hundredths of a second, or moves, or a score). */
  best: number;
  average: number;
  /** What the contract compares. */
  metric: number;
  /** The person, the competition and the event, hashed as the funder signed them. */
  subject: Hex;
}>;

async function wcaJson<T>(path: string, fetchImpl: PlainFetch): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(`${WCA_API}${path}`, { headers: headersFor(WCA_PERSON_RESULTS), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new WcaReadError("FETCH_FAILED", "The WCA could not be read right now", { cause: error });
  }
  if (response.status === 404) throw new WcaReadError("UNKNOWN_COMPETITION", "The WCA knows no competition by that name");
  if (response.status !== 200) throw new WcaReadError("FETCH_FAILED", `The WCA answered ${response.status}`);
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new WcaReadError("FETCH_FAILED", "The WCA answered something that is not its list", { cause: error });
  }
}

type ApiCompetition = { id: string; name: string; city: string; country_iso2: string; start_date: string; end_date: string; event_ids: string[] };

function competitionOf(one: ApiCompetition): WcaCompetition {
  return { competitionId: one.id, name: one.name, city: one.city, country: one.country_iso2, startDate: one.start_date, endDate: one.end_date, eventIds: one.event_ids.filter((id) => id in WCA_EVENTS) };
}

/** Every competition from a day on, all countries, as the API pages them (a hundred a page, 521 on 26 Sep 2026). */
export async function listWcaCompetitions(fromDay: string, fetchImpl: PlainFetch = fetch): Promise<readonly WcaCompetition[]> {
  const all: WcaCompetition[] = [];
  for (let page = 1; page <= 12; page += 1) {
    const found = await wcaJson<ApiCompetition[]>(`/competitions?start=${fromDay}&sort=start_date&per_page=100&page=${page}`, fetchImpl);
    all.push(...found.map(competitionOf));
    if (found.length < 100) break;
  }
  return all;
}

/** One competition by its id, or a refusal by its name. */
export async function readWcaCompetition(competitionId: string, fetchImpl: PlainFetch = fetch): Promise<WcaCompetition> {
  if (!wcaCourseOf(wcaCourseId(competitionId, "333"))) throw new WcaReadError("INVALID_LINK", "That is not a competition's name");
  return competitionOf(await wcaJson<ApiCompetition>(`/competitions/${competitionId}`, fetchImpl));
}

type WcifPerson = { registrantId: number; name: string; wcaId: string | null; registration: { eventIds: string[]; status: string } | null };

export type WcaRegistration = Readonly<{ registrantId: number; name: string; wcaId: string | null }>;

/**
 * The person on the competitors list, by their WCA id or by their name as they gave it: registered, accepted, in the
 * event. Nothing is attested here; this is the bib (the founder, 27 Sep 2026), checked before the first day.
 */
export async function readWcaRegistration(courseId: string, who: string, fetchImpl: PlainFetch = fetch): Promise<WcaRegistration> {
  const course = wcaCourseOf(courseId);
  if (!course) throw new WcaReadError("INVALID_LINK", "That is not a competition and an event");
  const wcif = await wcaJson<{ persons?: WcifPerson[] }>(`/competitions/${course.competitionId}/wcif/public`, fetchImpl);
  const byId = isWcaId(who) ? who.trim().toUpperCase() : null;
  const person = (wcif.persons ?? []).find((one) => (byId ? one.wcaId === byId : sameCuber(one.name, who)));
  if (!person?.registration || person.registration.status !== "accepted") throw new WcaReadError("NOT_REGISTERED", "Nobody by that name is on the competitors list yet");
  if (!person.registration.eventIds.includes(course.eventId)) throw new WcaReadError("NOT_REGISTERED", "They are on the competitors list, but not in that event");
  return { registrantId: person.registrantId, name: person.name, wcaId: person.wcaId };
}

type ApiResult = { name: string; wca_id: string; event_id: string; round_type_id: string; best: number; average: number };

export async function readWcaResultRows(competitionId: string, fetchImpl: PlainFetch = fetch): Promise<readonly WcaResultRow[]> {
  const rows = await wcaJson<ApiResult[]>(`/competitions/${competitionId}/results`, fetchImpl);
  return rows.map((row) => ({ name: row.name, wcaId: row.wca_id, eventId: row.event_id, round: row.round_type_id, best: row.best, average: row.average }));
}

/** The person's best row in the event: by WCA id when they gave one, by name otherwise; the fastest single of their rounds. */
export function bestRowOf(rows: readonly WcaResultRow[], eventId: string, who: string): WcaResultRow {
  const byId = isWcaId(who) ? who.trim().toUpperCase() : null;
  const theirs = rows.filter((row) => row.eventId === eventId && (byId ? row.wcaId === byId : sameCuber(row.name, who)));
  if (theirs.length === 0) throw new WcaReadError("NO_RESULT", "No result of theirs in that event at that competition");
  const finished = theirs.filter((row) => row.best > 0).sort((left, right) => left.best - right.best);
  if (finished.length === 0) throw new WcaReadError("NOT_FINISHED", "Every attempt of theirs in that event was a DNF or a DNS");
  return finished[0];
}

export function wcaResultOf(courseId: string, row: Pick<WcaResultRow, "name" | "wcaId" | "round" | "best" | "average">): WcaResult {
  const course = wcaCourseOf(courseId);
  if (!course) throw new WcaReadError("INVALID_LINK", "That is not a competition and an event");
  const metric = wcaMetricOf(row.best, course.eventId);
  if (metric === undefined) throw new WcaReadError("NOT_FINISHED", "That attempt has no result");
  return { competitionId: course.competitionId, eventId: course.eventId, wcaId: row.wcaId, round: row.round, name: row.name, best: row.best, average: row.average, metric, subject: wcaSubject(row.name, courseId) };
}

/** The result behind a competition, an event and a person, read plainly. Every refusal is typed, and none of them guesses. */
export async function readWcaResult(courseId: string, who: string, fetchImpl: PlainFetch = fetch): Promise<WcaResult> {
  const course = wcaCourseOf(courseId);
  if (!course) throw new WcaReadError("INVALID_LINK", "That is not a competition and an event");
  return wcaResultOf(courseId, bestRowOf(await readWcaResultRows(course.competitionId, fetchImpl), course.eventId, who));
}

export type AttestedWcaReading = WcaResult & Readonly<{ observedAt: number; nullifier: Hex; proofs: readonly ZkFetchProof[] }>;

function wcaError(error: unknown): WcaReadError {
  if (!(error instanceof AttestedReadError)) return new WcaReadError("FETCH_FAILED", "The WCA could not be read right now", { cause: error });
  switch (error.code) {
    case "INVALID_ACCOUNT":
      return new WcaReadError("INVALID_LINK", "That is not a person, a competition and an event", { cause: error });
    case "NOT_FOUND":
    case "NO_MATCH":
      return new WcaReadError("NO_RESULT", "No result of theirs in that event at that competition", { cause: error });
    case "REFUSED":
    case "NOT_ACCEPTED":
      return new WcaReadError("FETCH_FAILED", "The WCA would not answer that reading", { cause: error });
    default:
      return new WcaReadError(error.code as WcaReadErrorCode, error.message, { cause: error });
  }
}

/**
 * The reading that can move money: the competition's results say which row is the person's best, and that row is
 * then read attested on the person's own list, where the pattern is built for that id, competition, event and round.
 * The row the proof carries is compared with the one found: the same best, the same name.
 */
export async function attestWcaResult(courseId: string, who: string, deps: AttestedReadDeps = reclaimAttestedReadDeps(), fetchImpl: PlainFetch = fetch): Promise<AttestedWcaReading> {
  const found = await readWcaResult(courseId, who, fetchImpl);
  const account = wcaAccount(found.wcaId, found.competitionId, found.eventId, found.round);
  if (!wcaAccountOf(account)) throw new WcaReadError("INVALID_LINK", "That is not a person, a competition and an event");
  let reading;
  try {
    reading = await attestedRead(WCA_PERSON_RESULTS.id, account, deps);
  } catch (error) {
    throw wcaError(error);
  }
  const best = Number(reading.values.best);
  const average = Number(reading.values.average);
  const name = String(reading.values.name ?? "");
  if (!Number.isFinite(best) || !name) throw new WcaReadError("NO_RESULT", "No result of theirs in that event at that competition");
  if (best !== found.best || !sameCuber(name, found.name)) throw new WcaReadError("PROOF_MISMATCH", "The WCA's list of the person's results says otherwise than the competition's");
  return { ...wcaResultOf(courseId, { name, wcaId: found.wcaId, round: found.round, best, average }), observedAt: reading.observedAt, nullifier: reading.nullifier, proofs: [reading.proof] };
}

export { competitionStillOpen };
