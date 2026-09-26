import type { MarathonRace } from "./marathon";

/**
 * race result's coming races with a marathon, a half or a 10 km, each one read by bib (the founder, 27 Sep 2026).
 * The register's race result half, written by `scripts/raceresult-register.ts`. Until it can run (race result has
 * throttled this machine's address since 26 Sep 2026), it holds the five races of the first, hand-written pass whose
 * lists are declared for their own contest and so read by bib; the ten whose lists are declared for all contests,
 * which do not answer the search by bib, were taken out. Do not edit by hand once the script has run.
 */
export const RACE_RESULT_RACES: readonly MarathonRace[] = [
  { raceId: "blaufraenkischland-2026", timer: "race-result", ref: "372388", name: "Blaufränkischland Marathon 2026", country: "AT", town: "Deutschkreutz", startsAt: "2026-10-03T00:00:00Z", events: [{ distance: "marathon", label: "Marathon (42 km)", heat: "1" }, { distance: "half", label: "1/2 Marathon (21,3 km)", heat: "2" }], raceResult: { listname: "Ergebnislisten|Zieleinlaufliste", columns: { name: 3, time: 8 }, fields: { name: "AnzeigeName", time: "TIME" } } },
  { raceId: "drei-laender-marathon-2026", timer: "race-result", ref: "367158", name: "3-Länder-Marathon 2026", country: "AT", town: "Bregenz", startsAt: "2026-10-11T00:00:00Z", events: [{ distance: "marathon", label: "Sparkasse Marathon", heat: "1" }], raceResult: { listname: "02_Ergebnislisten online|AA_Ergebnisliste MW", columns: { name: 3, time: 9 }, fields: { name: "AnzeigeName", time: "TIME1" } } },
  { raceId: "wase-2026", timer: "race-result", ref: "378799", name: "Wase Marathon 2026", country: "BE", town: "Sinaai", startsAt: "2026-10-18T00:00:00Z", events: [{ distance: "half", label: "Halve Marathon", heat: "3" }, { distance: "marathon", label: "Marathon", heat: "4" }], raceResult: { listname: "Result Lists|Overall Results", columns: { name: 3, time: 7 }, fields: { name: "FLNAME", time: "TIME" } } },
  { raceId: "reggio-emilia-2026", timer: "race-result", ref: "383024", name: "Maratona di Reggio Emilia 2026", country: "IT", town: "Reggio Emilia", startsAt: "2026-12-13T00:00:00Z", events: [{ distance: "marathon", label: "Maratona 42.195m", heat: "1" }], raceResult: { listname: "Online|Finale", columns: { name: 4, time: 11 }, fields: { name: "UCase([MostraNome])", time: 'If([STATUS]<=1;[Arrivo.CHIP];"")' } } },
  { raceId: "sri-chinmoy-skopje-2027", timer: "race-result", ref: "389323", name: "Sri Chinmoy Marathon Skopje 2027", country: "MK", town: "Skopje", startsAt: "2027-03-14T00:00:00Z", events: [{ distance: "marathon", label: "Marathon", heat: "1" }, { distance: "half", label: "Half-marathon", heat: "2" }], raceResult: { listname: "Result Lists|Result List OverAll  · Генерален пласман", columns: { name: 3, time: 9 }, fields: { name: "FLNAME", time: "TIME" } } },
];
