"use client";
import { useEffect, useState } from "react";
import { listCompetitions, type ListedCompetition } from "@/src/client/wca";
import type { GiftDraft } from "@/src/gift-draft";
import { byDate, countriesOf, inCountryOrAll } from "@/src/marathon-choice";
import { MARATHON_PROOF as R, WCA_PROOF as W } from "@/src/sentences";
import { countryInWords } from "@/src/rail-country";
import { CHIP, HELP } from "../../components/ui";
import { ChoiceList } from "../ChoiceList";

/**
 * "Which competition?" then "Which event?" (the founder, 27 Sep 2026): the WCA's coming competitions, all countries,
 * by date, each with its city and its first day, under one filter "Country · all" like the races; then the event
 * among the ones the competition holds. What the draft carries is the competition and the event in one id,
 * `GanOpen2026/333`.
 */
export function WcaChooser({ open, draft, named, onChoose }: Readonly<{ open: boolean; draft: GiftDraft; named: (course: string) => string; onChoose: (courseId: string, title: string) => void }>) {
  const [competitions, setCompetitions] = useState<readonly ListedCompetition[] | null | "unreadable">(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    listCompetitions().then(
      (found) => {
        if (live) setCompetitions(byDate(found));
      },
      () => {
        if (live) setCompetitions("unreadable");
      },
    );
    return () => {
      live = false;
    };
  }, [open]);
  if (competitions === null) return <p className={HELP}>{W.readingCompetitions}</p>;
  if (competitions === "unreadable") return <p className={HELP}>{W.competitionsUnreadable}</p>;
  const [chosenId, chosenEvent] = (draft.course ?? "").split("/");
  const competitionId = picked ?? (chosenId || null);
  const competition = competitions.find((one) => one.competitionId === competitionId);
  const shown = inCountryOrAll(competitions, country);
  const choose = (one: ListedCompetition, eventId: string) => {
    const event = one.events.find((each) => each.id === eventId);
    if (event) onChoose(`${one.competitionId}/${eventId}`, `${one.name}, ${event.label}`);
  };
  const day = (startsAt: string) => new Date(startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const chip = (pressed: boolean) => `${CHIP} ${pressed ? "bg-[var(--chosen)] font-bold" : ""}`;
  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      <div className="flex flex-wrap gap-[var(--space-sm)]" role="group" aria-label={R.countryFilter}>
        <button type="button" aria-pressed={country === null} onClick={() => setCountry(null)} className={chip(country === null)}>
          {R.countryAll}
        </button>
        {countriesOf(competitions).map((one) => (
          <button key={one.code} type="button" aria-pressed={country === one.code} onClick={() => setCountry(country === one.code ? null : one.code)} className={chip(country === one.code)}>
            {one.name}
          </button>
        ))}
      </div>
      <ChoiceList
        name="competition"
        legend={W.whichCompetition}
        shape="lines"
        value={competitionId}
        onChange={(value) => {
          const one = competitions.find((each) => each.competitionId === value);
          if (!one) return;
          setPicked(one.competitionId);
          if (one.events.length === 1) choose(one, one.events[0].id);
        }}
        options={shown.map((one) => ({
          value: one.competitionId,
          label: one.name,
          tag: <span className={HELP}>{W.competitionLine(one.city, countryInWords(one.country) ?? one.country, day(one.startsAt))}</span>,
        }))}
      />
      {competition && competition.events.length > 1 ? (
        <ChoiceList
          name="event"
          legend={W.whichEvent}
          shape="lines"
          value={competitionId === chosenId ? chosenEvent || null : null}
          onChange={(value) => choose(competition, value)}
          options={competition.events.map((one) => ({ value: one.id, label: one.label }))}
        />
      ) : null}
      {draft.course && draft.courseTitle ? <p className="font-medium">{named(draft.courseTitle)}</p> : null}
    </div>
  );
}
