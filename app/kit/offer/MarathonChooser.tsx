"use client";
import { useEffect, useState } from "react";
import { listRaces, type ListedRace } from "@/src/client/marathon";
import type { GiftDraft } from "@/src/gift-draft";
import { MARATHON_PROOF as W } from "@/src/sentences";
import { countryInWords } from "@/src/rail-country";
import { HELP } from "../../components/ui";
import { ChoiceList } from "../ChoiceList";

/**
 * "Which race?" (D273): the register of races, asked as a list in the sheet, the motif of "Which university?" (D247).
 * Each line is the race as the timing company names it, with its town and its start day, since a race already run
 * cannot take a bib.
 */
export function MarathonChooser({ open, draft, named, onChoose }: Readonly<{ open: boolean; draft: GiftDraft; named: (course: string) => string; onChoose: (race: ListedRace) => void }>) {
  const [races, setRaces] = useState<readonly ListedRace[] | null | "unreadable">(null);
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
  const chosen = draft.course && draft.courseTitle ? <p className="font-medium">{named(draft.courseTitle)}</p> : null;
  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      <ChoiceList
        name="race"
        legend={W.whichRace}
        shape="lines"
        value={draft.course ?? null}
        onChange={(value) => {
          const one = races.find((race) => race.raceId === value);
          if (one) onChoose(one);
        }}
        options={races.map((race) => ({
          value: race.raceId,
          label: race.name,
          tag: <span className={HELP}>{W.raceLine(race.town, countryInWords(race.country) ?? race.country, new Date(race.startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}</span>,
        }))}
      />
      {chosen}
    </div>
  );
}
