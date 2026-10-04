"use client";
import { useEffect, useState } from "react";
import { listRaces, type ListedRace } from "@/src/client/marathon";
import type { GiftDraft } from "@/src/gift-draft";
import { byDate, countriesOf, distancesInWords, distancesOf, inCountryOrAll, withDistanceOrAll } from "@/src/marathon-choice";
import { MARATHON_PROOF as W } from "@/src/sentences";
import { countryInWords } from "@/src/rail-country";
import { CHIP, HELP } from "../../components/ui";
import { ChoiceList } from "../ChoiceList";
import { WaitLine } from "../Waiting";

/**
 * "Which race?" then "Which distance?" (D273, the founder of 27 Sep 2026): every coming race of the register, all
 * countries, by date, each with its distances, its town and its start day. A race already run is listed to an
 * operator's account alone. What the draft carries is the race and the distance in one id,
 * `marathon-vert-rennes-2026/10k`, and neither it nor the terms changed on 4 Oct 2026.
 *
 * The distance is seen and chosen (the founder, 4 Oct 2026: he could not find how). The list said none; a race with
 * one event chose it in silence; "Which distance?" opened under the whole list, with the results site's key.
 * - Two filters under the title, of the same behaviour: "Distance · all" and one chip per distance, then "Country ·
 *   all" and one chip per country. Each keeps its races only, and taking it off gives everything back.
 * - Each race's line starts with its distances: "Half marathon, 10 km. Rennes, France. Starts 4 October 2026."
 * - A race with several events asks "Which distance?" right under itself: the distance in words, and under it the
 *   name its organiser gives the event. A distance already filtered is taken without asking.
 */
export function MarathonChooser({ open, draft, named, onChoose }: Readonly<{ open: boolean; draft: GiftDraft; named: (course: string) => string; /** The course, its title, and when the race starts. */ onChoose: (courseId: string, title: string, startsAt: string) => void }>) {
  const [races, setRaces] = useState<readonly ListedRace[] | null | "unreadable">(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    listRaces().then(
      (found) => {
        if (live) setRaces(byDate(found));
      },
      () => {
        if (live) setRaces("unreadable");
      },
    );
    return () => {
      live = false;
    };
  }, [open]);
  if (races === null) return <WaitLine>{W.readingRaces}</WaitLine>;
  if (races === "unreadable") return <p className={HELP}>{W.racesUnreadable}</p>;
  const [chosenRaceId, chosenDistance] = (draft.course ?? "").split("/");
  const raceId = picked ?? (chosenRaceId || null);
  const shown = inCountryOrAll(withDistanceOrAll(races, distance), country);
  const choose = (one: ListedRace, which: string) => {
    const event = one.events.find((each) => each.distance === which);
    // The gift's title says the distance in plain words: "Tout Rennes Court 2026, half marathon".
    if (event) onChoose(`${one.raceId}/${which}`, `${one.name}, ${event.label.toLowerCase()}`, one.startsAt);
  };
  const day = (startsAt: string) => new Date(startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const chip = (pressed: boolean) => `${CHIP} ${pressed ? "bg-[var(--chosen)] font-bold" : ""}`;
  /** The distance a race is run at for this gift without asking: its only one, or the one the filter keeps. */
  const settled = (one: ListedRace): string | null => (one.events.length === 1 ? one.events[0].distance : distance && one.events.some((each) => each.distance === distance) ? distance : null);
  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      {/* The first filter: "Distance · all", pressed while no distance is chosen, then one chip per distance listed. */}
      <div className="flex flex-wrap gap-[var(--space-sm)]" role="group" aria-label={W.distanceFilter} data-distance-filter="">
        <button type="button" aria-pressed={distance === null} onClick={() => setDistance(null)} className={chip(distance === null)}>
          {W.distanceAll}
        </button>
        {distancesOf(races).map((one) => (
          <button
            key={one.distance}
            type="button"
            aria-pressed={distance === one.distance}
            onClick={() => {
              const next = distance === one.distance ? null : one.distance;
              setDistance(next);
              // A race already picked that runs this distance takes it at once, as it would have had the filter stood first.
              const race = races.find((each) => each.raceId === raceId);
              if (next && race?.events.some((each) => each.distance === next)) choose(race, next);
            }}
            className={chip(distance === one.distance)}
          >
            {one.label}
          </button>
        ))}
      </div>
      {/* The second: "Country · all" first, pressed while no country is chosen, then one chip per country listed. */}
      <div className="flex flex-wrap gap-[var(--space-sm)]" role="group" aria-label={W.countryFilter}>
        <button type="button" aria-pressed={country === null} onClick={() => setCountry(null)} className={chip(country === null)}>
          {W.countryAll}
        </button>
        {countriesOf(races).map((one) => (
          <button key={one.code} type="button" aria-pressed={country === one.code} onClick={() => setCountry(country === one.code ? null : one.code)} className={chip(country === one.code)}>
            {one.name}
          </button>
        ))}
      </div>
      <ChoiceList
        name="race"
        legend={W.whichRace}
        shape="lines"
        value={raceId}
        onChange={(value) => {
          const one = races.find((each) => each.raceId === value);
          if (!one) return;
          setPicked(one.raceId);
          // One event only, or the distance already filtered: the race is the whole choice.
          const which = settled(one);
          if (which) choose(one, which);
        }}
        options={shown.map((one) => ({
          value: one.raceId,
          label: one.name,
          tag: <span className={HELP}>{W.raceLine(distancesInWords(one), one.town, countryInWords(one.country) ?? one.country, day(one.startsAt))}</span>,
          // Several events and none settled: the question opens here, under the race just chosen.
          under:
            one.events.length > 1 && !settled(one) ? (
              <ChoiceList
                name="distance"
                legend={W.whichDistance}
                shape="lines"
                value={one.raceId === chosenRaceId ? chosenDistance || null : null}
                onChange={(value) => choose(one, value)}
                options={one.events.map((each) => ({ value: each.distance, label: each.label, tag: <span className={HELP}>{each.named}</span> }))}
              />
            ) : undefined,
        }))}
      />
      {draft.course && draft.courseTitle ? <p className="font-medium">{named(draft.courseTitle)}</p> : null}
    </div>
  );
}
