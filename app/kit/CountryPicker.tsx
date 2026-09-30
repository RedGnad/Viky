"use client";
import { useEffect, useState } from "react";
import { loadOutCountries } from "@/src/client/account-country";
import { countryInWords } from "@/src/rail-country";
import { WHERE_YOU_LIVE as WORDS } from "@/src/sentences";
import { CHIP, FIELD, HELP } from "../components/ui";
import { ChoiceList } from "./ChoiceList";
import { Sheet } from "./Sheet";

/**
 * Where the person lives, chosen from every country where at least one way out works (D274): the same list in Me and
 * under "Spend or withdraw", named in the words `Intl` gives and sorted by those names. Chosen in a sheet with Viky's own
 * list, as a currency is (the founder, 28 Sep 2026: the native select was the one list outside the art direction),
 * with a search above it, because there are more than a hundred and fifty countries.
 *
 * Two triggers. The field, where the country is the answer asked for. The chip, where it only narrows a list already
 * shown (the founder, 29 Sep 2026: "Which university?" opens on the person's own country, and the country is a filter
 * drawn like the app's other buttons, not a step before the list).
 */
export function CountryPicker({
  id,
  label,
  hideLabel = false,
  value,
  onChange,
  load = async () => (await loadOutCountries()).countries,
  chip,
}: Readonly<{
  id: string;
  label: string;
  hideLabel?: boolean;
  value: string | null;
  onChange: (country: string) => void;
  /** The countries to choose from: by default where a way out works; the universities' own list for "Which university?" (D313). */
  load?: () => Promise<readonly string[]>;
  /** Drawn as a chip whose words say the chosen country ("In France"), the label read aloud only. */
  chip?: (country: string) => string;
}>) {
  const [countries, setCountries] = useState<readonly { code: string; name: string }[] | null | "unreadable">(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let live = true;
    load().then(
      (codes) => {
        const named = codes.map((code) => ({ code, name: countryInWords(code) ?? code.toUpperCase() }));
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
    // The loader is the caller's constant: read again when the chosen country changes, as before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <span id={`${id}-label`} className={hideLabel || chip ? "sr-only" : "font-medium"}>
        {label}
      </span>
      {chip ? (
        <button
          id={id}
          type="button"
          aria-labelledby={`${id}-label ${id}`}
          aria-haspopup="dialog"
          className={`${CHIP} inline-flex items-center gap-[var(--space-xs)] self-start`}
          disabled={countries === null}
          onClick={() => setOpen(true)}
        >
          {chosen ? chip(chosen) : WORDS.choose}
          <svg aria-hidden focusable="false" width="16" height="16" viewBox="0 0 24 24">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <button id={id} type="button" aria-labelledby={`${id}-label ${id}`} aria-haspopup="dialog" className={`${FIELD} text-left`} disabled={countries === null} onClick={() => setOpen(true)}>
          {chosen ?? (countries === null ? WORDS.reading : WORDS.choose)}
        </button>
      )}
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
