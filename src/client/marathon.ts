import { getJson, postJson } from "./api";

/** The browser's side of "Finish a marathon" (D273): the races, the bib, the plain read, the proof. */

export type ListedRace = Readonly<{
  raceId: string;
  name: string;
  town: string;
  country: string;
  startsAt: string;
  timer: string;
  /** The distances a gift can be made on, each in words and with the name its organiser gives the event. */
  events: readonly { distance: string; label: string; named: string }[];
  /** Listed to an operator's account only: a race already run, kept for the test gift. */
  operatorOnly?: boolean;
}>;

export type MarathonLine = Readonly<{ runner: string; bib: string; official: string; finishSeconds: number }>;

export type MarathonOutcome =
  | { kind: "reached"; giftId: string; score: number; line?: MarathonLine }
  | { kind: "refused"; giftId: string; code: string; message: string }
  | { kind: "already"; giftId: string; reason: string };

export async function listRaces(): Promise<readonly ListedRace[]> {
  return (await getJson<{ races: ListedRace[] }>("/api/marathon/races")).races;
}

export async function saveBib(giftId: string, bib: string): Promise<{ bib: string }> {
  return postJson<{ bib: string }>("/api/marathon/bib", { giftId, bib });
}

export async function readMarathonLine(giftId: string): Promise<MarathonLine> {
  return postJson<MarathonLine>("/api/marathon/result", { giftId });
}

export async function proveMarathon(giftId: string): Promise<MarathonOutcome> {
  return postJson<MarathonOutcome>("/api/marathon/prove", { giftId });
}
