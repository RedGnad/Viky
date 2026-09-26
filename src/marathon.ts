import { keccak256, stringToHex, type Hex } from "viem";
import { normaliseCertificateName } from "./duolingo-english-test";

/**
 * "Finish a marathon" (D273, the founder's decision of 26 Sep 2026): a milestone of the Move family, read for the
 * person from the public results page of the race's timing company, as an examination result is read from its
 * board. One line per timing company, one race and one distance per gift, chosen from the register below (the
 * founder, 27 Sep 2026: a marathon, a half or a 10 km, the distance chosen at creation). Browser safe.
 *
 * Three ties make a result the person's (the founder, 26 Sep 2026): the name the funder writes at creation, hashed
 * into the terms and never published; the bib the person enters on the gift's page before the race starts (the
 * field closes at the start, a bib entered after is not read); and the timing company's own line for that bib,
 * read by the reading service, which has to carry that bib, that name and a finish time. The name is compared as
 * `normaliseCertificateName` compares it: no case, no accents, no order.
 *
 * What is scored: the finish time, as seconds under twenty-four hours, so that "under X hours" is a target the
 * contract compares as it compares every other (higher is better) and "finish" is any time at all.
 *
 * Breizh Chrono, the first timing company (read 26 Sep 2026): `resultats.breizhchrono.com`, run by Klikego. A race
 * is a reference like `1488071608761-442` and a heat like `marathon`. The results list is one page whose rows are
 * embedded, base64 of the bytes XOR "K", decoded by the page's own script (no further call), so it cannot be matched
 * by a pattern; each runner has a page of their own instead, `/bc/resultats/coureur.jsp?ref=<ref>&heat=<heat>&dossard=<bib>`,
 * server-rendered: the name and the bib in its title ("FALL Mor (N°347)"), and "Temps Officiel" with its value. A
 * runner who did not finish (DNF, DNS) has the page with "00:00:00"; a bib nobody wore answers an empty page.
 */

export const MARATHON_SOURCE = "Breizh Chrono";

/** The distances a gift can be made on (the founder, 27 Sep 2026): the name of the line stays "Finish a marathon". */
export type MarathonDistance = "marathon" | "half" | "10k";
export const DISTANCE_LABELS: Readonly<Record<MarathonDistance, string>> = { marathon: "Marathon", half: "Half marathon", "10k": "10 km" };

export type MarathonEvent = Readonly<{
  distance: MarathonDistance;
  /** The heat as the timing company names it on its own pages, "Le 10km Lamotte". */
  label: string;
  /** The heat's key on the results site, derived from the label by `heatSlugOf` (measured on 40 heats, 26 Sep 2026). */
  heat: string;
}>;

export type MarathonRace = Readonly<{
  /** The race in Viky's terms, `marathon-vert-rennes-2026`. */
  raceId: string;
  /** Who times it, which decides the source that reads it. */
  timer: "breizh-chrono";
  /** The timing company's own reference of the event, the tail of its results URL and of its Klikego page. */
  ref: string;
  /** The race as the timing company names it, with the year. */
  name: string;
  /** Where it is run, two letters, and the town. */
  country: string;
  town: string;
  /** When it starts, as the timing company's own page dates it (Klikego's `startDate`): the bib field closes then. */
  startsAt: string;
  /** The heats a gift can be made on, one per distance. */
  events: readonly MarathonEvent[];
  /** A race already run, kept for the operator's test gift (the founder, 27 Sep 2026): listed to nobody else. */
  operatorOnly?: true;
}>;

/**
 * The results site's key for a heat, from the heat's name as Klikego prints it: no accents, no case, apostrophes
 * dropped, each space a dash, anything else dropped. "L'Eau du Bassin Rennais - Poussins" is
 * `leau-du-bassin-rennais---poussins`, "Le S'MI Ouest-France" is `le-smi-ouest-france`, "10 KM" is `10-km`.
 * Measured against the links of eight past events, forty heats, on 26 Sep 2026.
 */
export function heatSlugOf(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/\s/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function event(distance: MarathonDistance, label: string): MarathonEvent {
  return { distance, label, heat: heatSlugOf(label) };
}

/**
 * The races a gift can be made on (the founder, 27 Sep 2026): the coming races of the timing company's calendar with
 * a marathon, a half or a 10 km, each read on Klikego's own page for its date, its town and its heats before it is
 * written here (`calendrier.breizhchrono.com`, then `klikego.com/event/<ref>`, read 26 Sep 2026 for October and
 * November). A race already run is not offered; the Marathon de Dakar 2023 stays for the operator's test gift. The
 * Marathon de Dakar 2026 is added the day its organiser announces it.
 */
export const MARATHON_RACES: readonly MarathonRace[] = [
  {
    raceId: "dakar-2023",
    timer: "breizh-chrono",
    ref: "1488071608761-442",
    name: "Marathon de Dakar 2023",
    country: "SN",
    town: "Dakar",
    // The page's own `startDate`, "2023-11-19T00:00:00+0100" (schema.org, read 26 Sep 2026).
    startsAt: "2023-11-19T00:00:00+01:00",
    events: [event("marathon", "Marathon"), event("half", "Semi-Marathon"), event("10k", "10km")],
    operatorOnly: true,
  },
  { raceId: "trail-du-loup-vert-2026", timer: "breizh-chrono", ref: "1488071608761-963", name: "Trail du Loup Vert 2026", country: "FR", town: "Jumièges", startsAt: "2026-10-03T00:00:00+02:00", events: [event("10k", "10km")] },
  {
    raceId: "tout-rennes-court-2026",
    timer: "breizh-chrono",
    ref: "1732219498024-2",
    name: "Tout Rennes Court 2026",
    country: "FR",
    town: "Rennes",
    startsAt: "2026-10-04T00:00:00+02:00",
    events: [event("half", "Le S'MI Ouest-France"), event("10k", "Le 10km Ville de Rennes")],
  },
  { raceId: "trail-de-la-ria-d-etel-2026", timer: "breizh-chrono", ref: "1471328951374-11", name: "Trail de la Ria d'Etel 2026", country: "FR", town: "Nostang", startsAt: "2026-10-10T00:00:00+02:00", events: [event("10k", "Trail 10 km")] },
  { raceId: "10k-arnag-2026", timer: "breizh-chrono", ref: "1780969009331-1", name: "Le 10K'arnag 2026", country: "FR", town: "Carnac", startsAt: "2026-10-10T00:00:00+02:00", events: [event("10k", "10km de Carnac")] },
  { raceId: "la-chatelaine-2026", timer: "breizh-chrono", ref: "1488071608761-960", name: "La Châtelaine 2026", country: "FR", town: "Rennes", startsAt: "2026-10-11T00:00:00+02:00", events: [event("10k", "LA CHÂTELAINE solo 10km")] },
  { raceId: "voie-royale-2026", timer: "breizh-chrono", ref: "1488071608761-958", name: "Voie Royale 2026", country: "FR", town: "Saint-Denis", startsAt: "2026-10-11T00:00:00+02:00", events: [event("10k", "10km")] },
  {
    raceId: "marathon-vert-rennes-2026",
    timer: "breizh-chrono",
    ref: "1284761384288-44",
    name: "Marathon Vert Rennes 2026",
    country: "FR",
    town: "Rennes",
    startsAt: "2026-10-17T00:00:00+02:00",
    events: [event("marathon", "Le Marathon Vert Rennes Groupe Interaction"), event("10k", "Le 10km Lamotte")],
  },
  { raceId: "trail-du-dom-gueranger-2026", timer: "breizh-chrono", ref: "1488071608761-964", name: "Trail du Dom Guéranger 2026", country: "FR", town: "Sablé-sur-Sarthe", startsAt: "2026-10-24T00:00:00+02:00", events: [event("10k", "10km")] },
  { raceId: "corrida-landivisiau-2026", timer: "breizh-chrono", ref: "1714502924968-2", name: "Corrida Landivisiau 2026", country: "FR", town: "Landivisiau", startsAt: "2026-10-25T00:00:00+02:00", events: [event("10k", "Course 10km")] },
  { raceId: "course-de-l-ours-2026", timer: "breizh-chrono", ref: "1488071608761-966", name: "Course de l'Ours 2026", country: "FR", town: "Ploëzal", startsAt: "2026-11-08T00:00:00+01:00", events: [event("10k", "10km")] },
  { raceId: "foulees-de-la-presse-de-la-manche-2026", timer: "breizh-chrono", ref: "1488071608761-943", name: "Foulées de la Presse de la Manche 2026", country: "FR", town: "Cherbourg", startsAt: "2026-11-11T00:00:00+01:00", events: [event("10k", "10km")] },
  { raceId: "trail-de-plaintel-2026", timer: "breizh-chrono", ref: "1488071608761-956", name: "Trail de Plaintel 2026", country: "FR", town: "Plaintel", startsAt: "2026-11-11T00:00:00+01:00", events: [event("10k", "10km")] },
  {
    raceId: "marathon-deauville-2026",
    timer: "breizh-chrono",
    ref: "1544740583497-10",
    name: "Marathon International de Deauville 2026",
    country: "FR",
    town: "Deauville",
    startsAt: "2026-11-14T00:00:00+01:00",
    events: [event("marathon", "Marathon en individuel"), event("half", "Semi Marathon"), event("10k", "10km")],
  },
  { raceId: "10km-du-maine-libre-2026", timer: "breizh-chrono", ref: "1473113914100-12", name: "10 km du Maine Libre 2026", country: "FR", town: "Allonnes", startsAt: "2026-11-21T00:00:00+01:00", events: [event("10k", "10KM DU MAINE LIBRE")] },
  { raceId: "dsn-by-night-2026", timer: "breizh-chrono", ref: "1488071608761-946", name: "DSN By Night 2026", country: "FR", town: "Dol-de-Bretagne", startsAt: "2026-11-27T00:00:00+01:00", events: [event("10k", "10km")] },
  { raceId: "la-creative-chantepie-2026", timer: "breizh-chrono", ref: "1254897502069-19", name: "La Créative Chantepie 2026", country: "FR", town: "Chantepie", startsAt: "2026-11-29T00:00:00+01:00", events: [event("10k", "LE 10KM CREATIVE CHANTEPIE")] },
  { raceId: "la-grimpette-2026", timer: "breizh-chrono", ref: "1488071608761-947", name: "La Grimpette 2026", country: "FR", town: "Coesmes", startsAt: "2026-11-29T00:00:00+01:00", events: [event("10k", "10km")] },
];

export function marathonRaceById(raceId: string): MarathonRace | undefined {
  return MARATHON_RACES.find((race) => race.raceId === raceId);
}

/** What a gift is made on: one race and one of its heats, `marathon-vert-rennes-2026/10k`. */
export function marathonCourseId(race: MarathonRace, chosen: MarathonEvent): string {
  return `${race.raceId}/${chosen.distance}`;
}

export function marathonEventById(courseId: string): { race: MarathonRace; event: MarathonEvent } | undefined {
  const [raceId, distance] = courseId.trim().split("/");
  const race = marathonRaceById(raceId ?? "");
  const chosen = race?.events.find((one) => one.distance === distance);
  return race && chosen ? { race, event: chosen } : undefined;
}

/** The races offered now: the ones not yet started, and to an operator's account the ones kept for the test gift too. */
export function racesOffered(nowMs: number, operator: boolean): readonly MarathonRace[] {
  return MARATHON_RACES.filter((race) => (race.operatorOnly ? operator : bibStillOpen(race, nowMs)));
}

/** A bib as a timing company prints it: one to six figures. */
export function isValidBib(value: string): boolean {
  return /^\d{1,6}$/.test(value.trim());
}

/** Whether the bib can still be entered: before the race starts, and never after (the founder, 26 Sep 2026). */
export function bibStillOpen(race: MarathonRace, nowMs: number): boolean {
  return nowMs < new Date(race.startsAt).getTime();
}

/** The account the reading service reads: the race's reference and the heat, and the bib, in one string. */
export function marathonAccount(race: Pick<MarathonRace, "ref">, chosen: Pick<MarathonEvent, "heat">, bib: string): string {
  return `${race.ref}|${chosen.heat}|${bib.trim()}`;
}

export function marathonAccountOf(account: string): Readonly<{ ref: string; heat: string; bib: string }> | undefined {
  const match = /^(\d{10,16}-\d{1,6})\|([a-z0-9-]{1,40})\|(\d{1,6})$/.exec(account);
  return match ? { ref: match[1], heat: match[2], bib: match[3] } : undefined;
}

/** The person, the race and its heat, as the funder signs them (`subject`): the result pays only when all match. */
export function marathonSubject(name: string, courseId: string): Hex {
  return keccak256(stringToHex(`viky:marathon:v1:${normaliseCertificateName(name)}:${courseId.trim().toLowerCase()}`));
}

/** Whether the name the page prints is the name the funder wrote: no case, no accents, no order (the founder). */
export function sameRunner(printed: string, written: string): boolean {
  const a = normaliseCertificateName(printed);
  const b = normaliseCertificateName(written);
  return a.length > 0 && a === b;
}

export const DAY_SECONDS = 24 * 60 * 60;

/** "02:30:05", as the page prints an official time, in seconds; nothing for "00:00:00", a runner who did not finish. */
export function finishSecondsOf(printed: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(printed.trim());
  if (!match) return undefined;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return seconds > 0 && seconds < DAY_SECONDS ? seconds : undefined;
}

/** What the contract compares: seconds under twenty-four hours, so a faster time is a higher number. */
export function marathonMetricOf(finishSeconds: number): number {
  return DAY_SECONDS - finishSeconds;
}

/** The target for "under X hours": the metric of exactly X hours; "finish" is 1, any time under a day. */
export const MARATHON_FINISH = 1;
export function marathonTargetUnderHours(hours: number): number {
  return DAY_SECONDS - Math.round(hours * 3600);
}

/** The hours a target stands for, for the words: "finish" for 1, "under 4 h 30" for a time. */
export function marathonTargetInWords(target: number): string {
  if (target <= MARATHON_FINISH) return "finish the race";
  const seconds = DAY_SECONDS - target;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `finish in under ${hours} h${minutes > 0 ? ` ${String(minutes).padStart(2, "0")}` : ""}`;
}

export function finishInWords(finishSeconds: number): string {
  const h = Math.floor(finishSeconds / 3600);
  const m = Math.floor((finishSeconds % 3600) / 60);
  const s = finishSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const MARATHON_DURATION_DAYS = Object.freeze({ min: 7, max: 400, suggested: 120 });

/** Goal 30 on `MilestoneGift`, after MITx Online's 29. */
export const MARATHON_GOAL_TYPE = 30;

export function marathonProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:breizh-chrono-zkfetch:v1"));
}
