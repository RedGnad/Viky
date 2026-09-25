"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listUniversities } from "@/src/client/certificate-gift";
import type { GiftDraft } from "@/src/gift-draft";
import { MILESTONE_FUND as M, UNIVERSITY_CHOICE as W } from "@/src/sentences";
import { byCountry, choiceMode, inCountry, type ListedUniversity } from "@/src/university-choice";
import { CHIP, HELP } from "../../components/ui";
import { ChoiceList } from "../ChoiceList";
import { Field } from "../Field";

/**
 * "Which university?" as the advisor's brief of 25 Sep 2026 asks it (D247). Up to five universities, radios grouped by
 * country and no search field; beyond five, the country first, as buttons with the corridor's in front, then the search
 * within that country. The names alone, and under the list one invitation to add a university (D264).
 */
export function UniversityChooser({
  open,
  label,
  draft,
  named,
  onChoose,
}: Readonly<{
  open: boolean;
  label: string;
  draft: GiftDraft;
  /** The sentence under the chosen university (`universityNamed`), which carries the unverified warning when it applies. */
  named: (course: string) => string;
  onChoose: (one: ListedUniversity) => void;
}>) {
  const [list, setList] = useState<readonly ListedUniversity[] | null | "unreadable">(null);
  const [country, setCountry] = useState<string | null>(null);
  const [words, setWords] = useState("");

  useEffect(() => {
    if (!open) return;
    let live = true;
    listUniversities()
      .then((found) => {
        if (live) setList(found);
      })
      .catch(() => {
        if (live) setList("unreadable");
      });
    return () => {
      live = false;
    };
  }, [open]);

  const choose = (all: readonly ListedUniversity[]) => (value: string) => {
    const one = all.find((entry) => entry.pair === value);
    if (one) onChoose(one);
  };

  if (list === null) return <p className={HELP}>{W.reading}</p>;
  if (list === "unreadable") return <p className={HELP}>{W.unreadable}</p>;

  const groups = byCountry(list);
  const chosen = draft.course && draft.courseTitle ? <p className="font-medium">{named(draft.courseTitle)}</p> : null;

  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      <p className="font-medium">{label}</p>
      {list.length === 0 ? (
        <p className={HELP}>{W.none}</p>
      ) : choiceMode(list.length) === "radios" ? (
        groups.map((group) => (
          <ChoiceList
            key={group.code}
            name="university"
            legend={group.name}
            shape="lines"
            value={draft.course ?? null}
            onChange={choose(list)}
            options={group.universities.map((one) => ({ value: one.pair, label: one.title }))}
          />
        ))
      ) : (
        <>
          <p className="font-medium">{W.country}</p>
          <div className="flex flex-wrap gap-[var(--space-sm)]">
            {groups.map((group) => (
              <button
                key={group.code}
                type="button"
                aria-pressed={country === group.code}
                onClick={() => {
                  setCountry(group.code);
                  setWords("");
                }}
                className={`${CHIP} ${country === group.code ? "bg-[var(--chosen)] font-bold" : ""}`}
              >
                {group.name}
              </button>
            ))}
          </div>
          {country ? (
            <CountrySearch
              country={groups.find((group) => group.code === country)?.name ?? country}
              found={inCountry(list, country, words)}
              words={words}
              onWords={setWords}
              value={draft.course ?? null}
              onChange={choose(list)}
            />
          ) : null}
        </>
      )}
      {chosen}
      {/* One line under the list (D264): an invitation, and nothing about how a university is checked, which the gift's
          page says where the proof is shown. */}
      <p className={HELP}>
        {W.notListed}{" "}
        <Link href="/add-your-university" className="font-medium text-[var(--on-surface)] underline underline-offset-2">
          {W.addYours}
        </Link>
      </p>
    </div>
  );
}


/** The search within one country, and its list of at most twelve, the way the sheet's other searches say it. */
function CountrySearch({
  country,
  found,
  words,
  onWords,
  value,
  onChange,
}: Readonly<{ country: string; found: readonly ListedUniversity[]; words: string; onWords: (words: string) => void; value: string | null; onChange: (value: string) => void }>) {
  const shown = found.slice(0, 12);
  return (
    <>
      <Field id="university-search" label={W.searchIn(country)} value={words} onChange={onWords} autoComplete="off" spellCheck={false} />
      {shown.length === 0 ? <p className={HELP}>{W.nothingThere}</p> : <p className={HELP}>{M.detail.found(found.length)}</p>}
      {shown.length > 0 ? (
        <ChoiceList name="university" legend={country} legendHidden shape="lines" value={value} onChange={onChange} options={shown.map((one) => ({ value: one.pair, label: one.title }))} />
      ) : null}
    </>
  );
}
