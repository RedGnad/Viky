"use client";
import { useEffect, useState } from "react";
import { listCompetitions, type ListedCompetition } from "@/src/client/wca";
import type { GiftDraft } from "@/src/gift-draft";
import { byDate, countriesOf, inCountryOrAll } from "@/src/marathon-choice";
import { MARATHON_PROOF as R, WCA_PROOF as W } from "@/src/sentences";
import { countryInWords } from "@/src/rail-country";
import { WCA_SEVERAL_COUNTRIES } from "@/src/wca";
import { CHIP, HELP } from "../../components/ui";
import { ChoiceList } from "../ChoiceList";
import { WaitLine } from "../Waiting";

/**
 * "Which competition?" then "Which event?" (the founder, 27 Sep 2026): the WCA's coming competitions, all countries,
 * by date, each with its city and its first day, under one filter "Country · all" like the races; then the event
 * among the ones the competition holds. What the draft carries is the competition and the event in one id,
 * `GanOpen2026/333`.
 */
export function WcaChooser({ open, draft, named, onChoose }: Readonly<{ open: boolean; draft: GiftDraft; named: (course: string) => string; /** The course, its title, and the competition's last day as the WCA dates it. */ onChoose: (courseId: string, title: string, endDate: string) => void }>) {
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
  if (competitions === null) return <WaitLine>{W.readingCompetitions}</WaitLine>;
  if (competitions === "unreadable") return <p className={HELP}>{W.competitionsUnreadable}</p>;
  const [chosenId, chosenEvent] = (draft.course ?? "").split("/");
  const competitionId = picked ?? (chosenId || null);
  /**
   * A place in words: the WCA's own name for a competition held in several countries at once, read first, because a
   * browser asked for the name of a region it does not know answers the code itself; then a country by its name.
   */
  const placeInWords = (code: string) => WCA_SEVERAL_COUNTRIES[code.toUpperCase()] ?? countryInWords(code);
  const shown = inCountryOrAll(competitions, country);
  const choose = (one: ListedCompetition, eventId: string) => {
    const event = one.events.find((each) => each.id === eventId);
    if (event) onChoose(`${one.competitionId}/${eventId}`, `${one.name}, ${event.label}`, one.endDate);
  };
  const day = (startsAt: string) => new Date(startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const chip = (pressed: boolean) => `${CHIP} ${pressed ? "bg-[var(--chosen)] font-bold" : ""}`;
  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      <div className="flex flex-wrap gap-[var(--space-sm)]" role="group" aria-label={R.countryFilter}>
        <button type="button" aria-pressed={country === null} onClick={() => setCountry(null)} className={chip(country === null)}>
          {R.countryAll}
        </button>
        {countriesOf(competitions, placeInWords).map((one) => (
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
          tag: <span className={HELP}>{W.competitionLine(one.city, placeInWords(one.country) ?? one.country, day(one.startsAt))}</span>,
          // Several events: the question opens here, under the competition just chosen, and not under the whole list
          // (the founder, 4 Oct 2026, of a race's distances: the same was true of a competition's events).
          under:
            one.events.length > 1 ? (
              <ChoiceList
                name="event"
                legend={W.whichEvent}
                shape="lines"
                value={one.competitionId === chosenId ? chosenEvent || null : null}
                onChange={(value) => choose(one, value)}
                options={one.events.map((each) => ({ value: each.id, label: each.label }))}
              />
            ) : undefined,
        }))}
      />
      {draft.course && draft.courseTitle ? <p className="font-medium">{named(draft.courseTitle)}</p> : null}
    </div>
  );
}
