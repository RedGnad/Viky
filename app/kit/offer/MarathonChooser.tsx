"use client";
import { useEffect, useState } from "react";
import { listRaces, type ListedRace } from "@/src/client/marathon";
import type { GiftDraft } from "@/src/gift-draft";
import { MARATHON_PROOF as W } from "@/src/sentences";
import { countryInWords } from "@/src/rail-country";
import { HELP } from "../../components/ui";
import { ChoiceList } from "../ChoiceList";

/**
 * "Which race?" then "Which distance?" (D273, the founder of 27 Sep 2026): the register's coming races, asked as a
 * list in the sheet, the motif of "Which university?" (D247), each with its town and its start day; then, when the
 * race has more than one heat a gift can be made on, the distance. What the draft carries is the race and the
 * distance in one id, `marathon-vert-rennes-2026/10k`. A race already run is listed to an operator's account alone.
 */
export function MarathonChooser({ open, draft, named, onChoose }: Readonly<{ open: boolean; draft: GiftDraft; named: (course: string) => string; onChoose: (courseId: string, title: string) => void }>) {
  const [races, setRaces] = useState<readonly ListedRace[] | null | "unreadable">(null);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    listRaces().then(
      (found) => {
        if (live) setRaces(found);
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
  const choose = (one: ListedRace, distance: string) => {
    const heat = one.events.find((each) => each.distance === distance);
    if (heat) onChoose(`${one.raceId}/${distance}`, `${one.name}, ${heat.label.toLowerCase()}`);
  };
  const day = (startsAt: string) => new Date(startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
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
        options={races.map((one) => ({
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
