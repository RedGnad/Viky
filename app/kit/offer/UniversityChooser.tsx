"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { listUniversitiesIn, listUniversityCountries, searchUniversities } from "@/src/client/certificate-gift";
import type { GiftDraft } from "@/src/gift-draft";
import { countryInWords } from "@/src/rail-country";
import { UNIVERSITY_CHOICE as W } from "@/src/sentences";
import { inGroups, type ListedUniversity } from "@/src/university-choice";
import { CHOICE, HELP, INLINE_BUTTON, META } from "../../components/ui";
import { ChoiceList } from "../ChoiceList";
import { CountryPicker } from "../CountryPicker";
import { Field } from "../Field";

/** Where the country the list was last narrowed to is kept for the tab (a storage key: never renamed). */
const KEPT_COUNTRY = "viky.university-country";

function keptCountry(): string | null {
  try {
    const kept = window.sessionStorage.getItem(KEPT_COUNTRY);
    return kept && /^[A-Z]{2}$/.test(kept) ? kept : null;
  } catch {
    return null;
  }
}

function keepCountry(country: string): void {
  try {
    window.sessionStorage.setItem(KEPT_COUNTRY, country);
  } catch {
    // A private window keeps nothing: the list opens on the person's own country again, which is still right.
  }
}

/**
 * "Which university?" (D247, D313, and the founder, 29 Sep 2026: "au lieu d'avoir tout de proposé et de pouvoir filtrer
 * si besoin"). No step before the list: it opens on the universities of the person's own country, the one the account
 * keeps or the connection's, and one field searches the whole list, that country's first and then the others, with the
 * country on each line. The country is a chip that narrows the list, drawn like the app's other buttons. While the list
 * is read, empty lines hold its place and nothing is written.
 *
 * Once a university is chosen the list folds into it, with a way to change it, so what comes after (a grade) is in
 * reach rather than under two hundred lines. The names alone on every line, and under the list one invitation to add a
 * university (D264): a university is chosen whether or not Viky reads its portal yet, and its provider is built within
 * two days.
 */
export function UniversityChooser({
  open,
  draft,
  onChoose,
}: Readonly<{
  open: boolean;
  draft: GiftDraft;
  onChoose: (one: ListedUniversity) => void;
}>) {
  const [countries, setCountries] = useState<readonly string[] | null>(null);
  // Undefined until the country the list opens on is known; null when there is none to open on.
  const [country, setCountry] = useState<string | null | undefined>(undefined);
  const [list, setList] = useState<readonly ListedUniversity[] | null | "unreadable">(null);
  const [words, setWords] = useState("");
  const [world, setWorld] = useState<Readonly<{ key: string; found: readonly ListedUniversity[]; more: boolean }> | null>(null);
  const [changing, setChanging] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || countries !== null) return;
    let live = true;
    listUniversityCountries()
      .then((answer) => {
        if (!live) return;
        setCountries(answer.countries.map((one) => one.code));
        setCountry((was) => (was !== undefined ? was : (keptCountry() ?? answer.here)));
      })
      .catch(() => {
        if (!live) return;
        setCountries([]);
        setCountry((was) => (was !== undefined ? was : keptCountry()));
      });
    return () => {
      live = false;
    };
  }, [open, countries]);

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

  // The whole list, a moment after the last keystroke, leaving out the country already listed whole.
  const typed = words.trim();
  const searchKey = typed.length >= 2 ? `${typed.toLowerCase()}|${country ?? ""}` : "";
  useEffect(() => {
    if (!open || !searchKey || country === undefined) return;
    let live = true;
    const timer = window.setTimeout(() => {
      searchUniversities(typed, country ?? null)
        .then((answer) => {
          if (live) setWorld({ key: searchKey, ...answer });
        })
        .catch(() => {
          if (live) setWorld({ key: searchKey, found: [], more: false });
        });
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // `typed` is read inside the key, which is what the search is keyed on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, searchKey, country]);

  const choose = (one: ListedUniversity) => {
    keepCountry(one.country);
    if (one.country !== country) {
      setList(null);
      setCountry(one.country);
    }
    setWords("");
    setChanging(false);
    onChoose(one);
  };

  const chosenTitle = draft.course && draft.courseTitle ? draft.courseTitle : null;
  if (chosenTitle && !changing) {
    // The name, then its country under it, from the sentence the terms carry ("Name, Country"), split at its last comma.
    const cut = chosenTitle.lastIndexOf(", ");
    const [name, where] = cut > 0 ? [chosenTitle.slice(0, cut), chosenTitle.slice(cut + 2)] : [chosenTitle, ""];
    return (
      <div
        data-university-chosen=""
        className="flex items-center justify-between gap-[var(--space-md)] rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--control-border)] bg-[var(--chosen)] p-[var(--space-md)]"
      >
        <span className="flex min-w-0 flex-col">
          <span className={`${CHOICE} break-words`}>{name}</span>
          {where ? <span className={META}>{where}</span> : null}
        </span>
        <button type="button" className={`${INLINE_BUTTON} shrink-0`} aria-label={`${W.change}: ${name}`} onClick={() => setChanging(true)}>
          {W.change}
        </button>
      </div>
    );
  }

  const value = draft.course ?? null;
  const pick = (among: readonly ListedUniversity[]) => (pair: string) => {
    const one = among.find((entry) => entry.pair === pair);
    if (one) choose(one);
  };
  const searching = typed.length >= 2;
  const here = Array.isArray(list) ? inGroups(list, searching ? typed : "") : null;
  const waiting = country === undefined || (country !== null && list === null);
  const elsewhere = searching && world?.key === searchKey ? world : null;
  const found = (here ? here.tested.length + here.others.length : 0) + (elsewhere?.found.length ?? 0);

  return (
    <div ref={top} className="flex scroll-mt-[var(--space-md)] flex-col gap-[var(--space-sm)]">
      <Field
        id="university-search"
        label={W.search}
        value={words}
        onChange={(typed) => {
          // The first letter brings the field to the top of the sheet, so what it finds is under it and not under the
          // keyboard. Never on focus: the list moved under a pointer still pressed, and the university it then stood
          // on was chosen on release (the founder, 30 Sep 2026: the first one of France, chosen by nobody).
          if (!words.trim() && typed.trim()) top.current?.scrollIntoView({ block: "start" });
          setWords(typed);
        }}
        autoComplete="off"
        spellCheck={false}
      />
      {countries && countries.length > 0 ? (
        <CountryPicker
          id="university-country"
          label={W.country}
          value={country ?? null}
          chip={W.inCountry}
          onChange={(code) => {
            keepCountry(code);
            // The list of the country chosen before is not shown while this one is read.
            setList(null);
            setCountry(code);
          }}
          load={async () => countries}
        />
      ) : null}
      {waiting ? (
        <Placeholder />
      ) : (
        <>
          {list === "unreadable" ? <p className={HELP}>{W.unreadable}</p> : null}
          {here && here.tested.length > 0 ? (
            <ChoiceList name="university" legend={W.tested} shape="lines" value={value} onChange={pick(here.tested)} options={here.tested.map((one) => ({ value: one.pair, label: one.title }))} />
          ) : null}
          {here && here.others.length > 0 ? (
            <ChoiceList
              name="university"
              legend={W.all}
              note={W.allLine}
              shape="lines"
              value={value}
              onChange={pick(here.others)}
              options={here.others.map((one) => ({ value: one.pair, label: one.title }))}
            />
          ) : null}
          {searching && !elsewhere ? <Placeholder rows={2} /> : null}
          {elsewhere && elsewhere.found.length > 0 ? (
            <ChoiceList
              name="university"
              legend={W.elsewhere}
              shape="lines"
              value={value}
              onChange={pick(elsewhere.found)}
              /* The country on every line, since the names alone no longer tell two countries apart. */
              options={elsewhere.found.map((one) => ({ value: one.pair, label: one.title, tag: <span className={META}>{countryInWords(one.country) ?? one.issuer}</span> }))}
            />
          ) : null}
          {elsewhere && found === 0 ? <p className={HELP}>{W.nothing}</p> : null}
          {elsewhere?.more ? <p className={HELP}>{W.more}</p> : null}
        </>
      )}
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

/**
 * Empty lines where the list will be (the founder, 29 Sep 2026: "on veut éviter les textes quand c'est évitable"): the
 * shape of what comes, the radio and a name of varying length, still for whoever asked for less motion. A screen reader
 * hears that the list is being read.
 */
function Placeholder({ rows = 5 }: Readonly<{ rows?: number }>) {
  const widths = ["72%", "54%", "81%", "63%", "47%"];
  return (
    <div role="status" aria-busy="true" data-placeholder="" className="flex flex-col gap-[var(--space-xs)]">
      <span className="sr-only">{W.reading}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden className="flex min-h-[var(--tap-target)] items-center gap-[var(--space-md)] px-[var(--space-md)] motion-safe:animate-pulse">
          <span className="h-[22px] w-[22px] shrink-0 rounded-full bg-[var(--divider)]" />
          <span className="h-[12px] rounded-full bg-[var(--divider)]" style={{ width: widths[index % widths.length] }} />
        </div>
      ))}
    </div>
  );
}
