"use client";
import { useEffect, useState } from "react";
import { loadOutCountries } from "@/src/client/account-country";
import { countryInWords } from "@/src/rail-country";
import { WHERE_YOU_LIVE as WORDS } from "@/src/sentences";
import { FIELD, HELP } from "../components/ui";

/**
 * Where the person lives, chosen from every country where at least one way out works (D274): the same list in Me and
 * under "Use your money", named in the words `Intl` gives and sorted by those names. A native select, so a phone opens
 * its own wheel or list and the keyboard gets it for free.
 */
export function CountryPicker({ id, label, value, onChange }: Readonly<{ id: string; label: string; value: string | null; onChange: (country: string) => void }>) {
  const [countries, setCountries] = useState<readonly { code: string; name: string }[] | null | "unreadable">(null);
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
  return (
    <div className="flex flex-col gap-[var(--space-xs)]">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <select id={id} className={FIELD} value={value ?? ""} disabled={countries === null} onChange={(event) => event.target.value && onChange(event.target.value)}>
        {value ? null : <option value="">{countries === null ? WORDS.reading : WORDS.choose}</option>}
        {(countries ?? []).map((one) => (
          <option key={one.code} value={one.code}>
            {one.name}
          </option>
        ))}
      </select>
    </div>
  );
}

