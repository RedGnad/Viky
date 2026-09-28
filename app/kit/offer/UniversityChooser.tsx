"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listUniversitiesIn, listUniversityCountries } from "@/src/client/certificate-gift";
import type { GiftDraft } from "@/src/gift-draft";
import { MILESTONE_FUND as M, UNIVERSITY_CHOICE as W } from "@/src/sentences";
import { matching, type ListedUniversity } from "@/src/university-choice";
import { HELP } from "../../components/ui";
import { ChoiceList } from "../ChoiceList";
import { CountryPicker } from "../CountryPicker";
import { Field } from "../Field";

/**
 * "Which university?" (D247, D313). The world's list is thousands long, so the country comes first, in the same sheet
 * with a search as "Where you live", then that country's universities, read on their own and searched within. The
 * names alone, and under the list one invitation to add a university (D264). A university is chosen whether or not
 * Viky reads its portal yet: the provider is asked for when the gift is made, and built within two days.
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
  /** The sentence under the chosen university (`universityNamed`). */
  named: (course: string) => string;
  onChoose: (one: ListedUniversity) => void;
}>) {
  const [country, setCountry] = useState<string | null>(null);
  const [list, setList] = useState<readonly ListedUniversity[] | null | "unreadable">(null);
  const [words, setWords] = useState("");

  useEffect(() => {
    if (!open || !country) return;
    let live = true;
    listUniversitiesIn(country)
      .then((found) => {
        if (live) setList(found);
      })
      .catch(() => {
        if (live) setList("unreadable");
      });
    return () => {
      live = false;
    };
  }, [open, country]);

  const chosen = draft.course && draft.courseTitle ? <p className="font-medium">{named(draft.courseTitle)}</p> : null;

  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      <p className="font-medium">{label}</p>
      <CountryPicker
        id="university-country"
        label={W.country}
        value={country}
        onChange={(code) => {
          // The list of the country chosen before is not shown while this one is read.
          setList(null);
          setCountry(code);
          setWords("");
        }}
        load={async () => (await listUniversityCountries()).map((one) => one.code)}
      />
      {country ? (
        list === null ? (
          <p className={HELP}>{W.reading}</p>
        ) : list === "unreadable" ? (
          <p className={HELP}>{W.unreadable}</p>
        ) : (
          <CountrySearch
            country={list[0]?.issuer ?? country}
            found={matching(list, words)}
            words={words}
            onWords={setWords}
            value={draft.course ?? null}
            onChange={(value) => {
              const one = list.find((entry) => entry.pair === value);
              if (one) onChoose(one);
            }}
          />
        )
      ) : null}
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
