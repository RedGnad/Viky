import { getJson, postJson } from "./api";

/** The browser's side of "Set a time at a WCA competition": the competitions, the registration check, the plain read, the proof. */

export type ListedCompetition = Readonly<{ competitionId: string; name: string; city: string; country: string; startsAt: string; endDate: string; events: readonly { id: string; label: string }[] }>;

export type WcaLine = Readonly<{ name: string; wcaId: string; best: number; average: number; round: string; inWords: string }>;

export type WcaOutcome =
  | { kind: "reached"; giftId: string; score: number; line?: { runner: string; bib: string; official: string; finishSeconds: number } }
  | { kind: "refused"; giftId: string; code: string; message: string }
  | { kind: "already"; giftId: string; reason: string };

export async function listCompetitions(): Promise<readonly ListedCompetition[]> {
  return (await getJson<{ competitions: ListedCompetition[] }>("/api/wca/competitions")).competitions;
}

export async function checkRegistration(giftId: string, who: string): Promise<{ name: string; wcaId: string | null }> {
  return postJson<{ name: string; wcaId: string | null }>("/api/wca/registration", { giftId, who });
}

export async function readWcaLine(giftId: string): Promise<WcaLine> {
  return postJson<WcaLine>("/api/wca/result", { giftId });
}

export async function proveWca(giftId: string): Promise<WcaOutcome> {
  return postJson<WcaOutcome>("/api/wca/prove", { giftId });
}
