"use client";
import { useEffect, useState } from "react";
import { listRaces, type ListedRace } from "@/src/client/marathon";
import type { GiftDraft } from "@/src/gift-draft";
import { byDate, countriesOf, inCountryOrAll } from "@/src/marathon-choice";
import { MARATHON_PROOF as W } from "@/src/sentences";
import { countryInWords } from "@/src/rail-country";
import { CHIP, HELP } from "../../components/ui";
import { ChoiceList } from "../ChoiceList";

/**
 * "Which race?" then "Which distance?" (D273, the founder of 27 Sep 2026): every coming race of the register, all
 * countries, by date, each with its town and its start day, under one filter "Country · all"; choosing a country
 * keeps its races only, and taking it off gives everything back. Then, when the race has more than one heat a gift
 * can be made on, the distance. What the draft carries is the race and the distance in one id,
 * `marathon-vert-rennes-2026/10k`. A race already run is listed to an operator's account alone.
 */
export function MarathonChooser({ open, draft, named, onChoose }: Readonly<{ open: boolean; draft: GiftDraft; named: (course: string) => string; /** The course, its title, and when the race starts. */ onChoose: (courseId: string, title: string, startsAt: string) => void }>) {
  const [races, setRaces] = useState<readonly ListedRace[] | null | "unreadable">(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
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
  if (races === null) return <p className={HELP}>{W.readingRaces}</p>;
  if (races === "unreadable") return <p className={HELP}>{W.racesUnreadable}</p>;
  const [chosenRaceId, chosenDistance] = (draft.course ?? "").split("/");
  const raceId = picked ?? (chosenRaceId || null);
  const race = races.find((one) => one.raceId === raceId);
  const shown = inCountryOrAll(races, country);
  const choose = (one: ListedRace, distance: string) => {
    const heat = one.events.find((each) => each.distance === distance);
    if (heat) onChoose(`${one.raceId}/${distance}`, `${one.name}, ${heat.label.toLowerCase()}`, one.startsAt);
  };
  const day = (startsAt: string) => new Date(startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const chip = (pressed: boolean) => `${CHIP} ${pressed ? "bg-[var(--chosen)] font-bold" : ""}`;
  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      {/* The filter: "Country · all" first, pressed while no country is chosen, then one chip per country listed. */}
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
          // One heat only: the race is the whole choice.
          if (one.events.length === 1) choose(one, one.events[0].distance);
        }}
        options={shown.map((one) => ({
          value: one.raceId,
          label: one.name,
          tag: <span className={HELP}>{W.raceLine(one.town, countryInWords(one.country) ?? one.country, day(one.startsAt))}</span>,
        }))}
      />
      {race && race.events.length > 1 ? (
        <ChoiceList
          name="distance"
          legend={W.whichDistance}
          shape="lines"
          value={raceId === chosenRaceId ? chosenDistance || null : null}
          onChange={(value) => choose(race, value)}
          options={race.events.map((one) => ({ value: one.distance, label: one.label, tag: <span className={HELP}>{one.heat}</span> }))}
        />
      ) : null}
      {draft.course && draft.courseTitle ? <p className="font-medium">{named(draft.courseTitle)}</p> : null}
    </div>
  );
}
