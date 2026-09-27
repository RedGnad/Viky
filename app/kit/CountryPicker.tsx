"use client";
import { useEffect, useState } from "react";
import { loadOutCountries } from "@/src/client/account-country";
import { countryInWords } from "@/src/rail-country";
import { WHERE_YOU_LIVE as WORDS } from "@/src/sentences";
import { FIELD, HELP } from "../components/ui";
import { ChoiceList } from "./ChoiceList";
import { Sheet } from "./Sheet";

/**
 * Where the person lives, chosen from every country where at least one way out works (D274): the same list in Me and
 * under "Use your money", named in the words `Intl` gives and sorted by those names. Chosen in a sheet with Viky's own
 * list, as a currency is (the founder, 28 Sep 2026: the native select was the one list outside the art direction),
 * with a search above it, because there are more than a hundred and fifty countries.
 */
export function CountryPicker({ id, label, hideLabel = false, value, onChange }: Readonly<{ id: string; label: string; hideLabel?: boolean; value: string | null; onChange: (country: string) => void }>) {
  const [countries, setCountries] = useState<readonly { code: string; name: string }[] | null | "unreadable">(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let live = true;
    loadOutCountries().then(
      (answer) => {
        const named = answer.countries.map((code) => ({ code, name: countryInWords(code) ?? code.toUpperCase() }));
        // A country already chosen stays in the list even if a service stopped listing it today.
        if (value && !named.some((one) => one.code === value)) named.push({ code: value, name: countryInWords(value) ?? value.toUpperCase() });
        if (live) setCountries(named.sort((left, right) => left.name.localeCompare(right.name)));
      },
      () => {
        if (live) setCountries("unreadable");
      },
    );
    return () => {
      live = false;
    };
  }, [value]);
  if (countries === "unreadable") return <p className={HELP}>{WORDS.unreadable}</p>;
  const chosen = value ? (countryInWords(value) ?? value.toUpperCase()) : null;
  // Matched from the start of any word of the name, accents and case aside: "ivo" finds Côte d'Ivoire, "rep" every Republic.
  const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const wanted = fold(search.trim());
  const shown = (countries ?? []).filter((one) => !wanted || fold(one.name).split(/[\s'-]+/).some((word) => word.startsWith(wanted)) || fold(one.name).startsWith(wanted));
  const close = () => {
    setOpen(false);
    setSearch("");
  };
  return (
    <div className="flex flex-col gap-[var(--space-xs)]">
      {/* Hidden where a heading above already asks the question: still read aloud, never printed twice. */}
      <span id={`${id}-label`} className={hideLabel ? "sr-only" : "font-medium"}>
        {label}
      </span>
      <button id={id} type="button" aria-labelledby={`${id}-label ${id}`} aria-haspopup="dialog" className={`${FIELD} text-left`} disabled={countries === null} onClick={() => setOpen(true)}>
        {chosen ?? (countries === null ? WORDS.reading : WORDS.choose)}
      </button>
      <Sheet open={open} title={label} onClose={close} tall view={wanted}>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={WORDS.search} aria-label={WORDS.search} className={FIELD} />
        {shown.length === 0 ? <p className={HELP}>{WORDS.noMatch}</p> : null}
        <ChoiceList
          name={`${id}-country`}
          legend={label}
          legendHidden
          shape="lines"
          value={value}
          onChange={(code) => {
            onChange(code);
            close();
          }}
          options={shown.map((one) => ({ value: one.code, label: one.name }))}
        />
      </Sheet>
    </div>
  );
}
