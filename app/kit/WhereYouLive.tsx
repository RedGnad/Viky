"use client";
import { useEffect, useState } from "react";
import { countryOfNumber, lastNumber, loadOutCountries, useAccountCountry } from "@/src/client/account-country";
import { whereTheRailsServe } from "@/src/client/rails";
import { countryInWords } from "@/src/rail-country";
import { WHERE_YOU_LIVE as W } from "@/src/sentences";
import { CARD, HELP, INLINE_BUTTON, SECONDARY_BUTTON } from "../components/ui";
import { CountryPicker } from "./CountryPicker";

/**
 * "Where do you live?" in Me (D274, the founder's decision of 27 Sep 2026): a fact of the account, asked once, from the
 * countries where at least one way out works. Until it is said, the question is proposed with a country already in it:
 * the country of a number this device topped up before, or else the country the connection comes from. Neither is ever
 * kept without the person pressing to keep it. Once said, it is one line with "change".
 */
export function WhereYouLive({ address }: Readonly<{ address: string }>) {
  const { country, save } = useAccountCountry(address);
  const [proposed, setProposed] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [kept, setKept] = useState(false);

  useEffect(() => {
    if (country !== null) return;
    let live = true;
    Promise.all([loadOutCountries().catch(() => null), whereTheRailsServe().catch(() => null)]).then(([list, where]) => {
      if (!live) return;
      const fromNumber = list ? countryOfNumber(lastNumber(), list.prefixes) : null;
      const guess = fromNumber ?? where?.fromConnection ?? where?.country ?? null;
      setProposed(guess && (!list || list.countries.includes(guess)) ? guess : null);
    });
    return () => {
      live = false;
    };
  }, [country]);

  if (country === undefined) return null;

  if (country && !changing) {
    return (
      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-[var(--space-md)]">
          <span className="font-medium">{W.label}</span>
          <span className="flex items-center gap-[var(--space-sm)]">
            <span>{countryInWords(country) ?? country.toUpperCase()}</span>
            <button type="button" onClick={() => setChanging(true)} className={INLINE_BUTTON}>
              {W.change}
            </button>
          </span>
        </div>
        {kept ? (
          <p className={HELP} role="status">
            {W.youLive(countryInWords(country) ?? country.toUpperCase())}
          </p>
        ) : null}
      </section>
    );
  }

  const chosen = changing ? country : proposed;
  return (
    <section className={CARD}>
      <h2 className="font-medium">{W.question}</h2>
      <p className={HELP}>{W.why}</p>
      <CountryPicker
        id="where-you-live"
        label={W.label}
        value={chosen}
        onChange={(next) => {
          if (changing) {
            void save(next).then(() => setKept(true));
            setChanging(false);
          } else setProposed(next);
        }}
      />
      {changing ? null : (
        <button
          type="button"
          disabled={!proposed}
          onClick={() => {
            if (!proposed) return;
            void save(proposed).then(() => setKept(true));
          }}
          className={SECONDARY_BUTTON}
        >
          {W.keep}
        </button>
      )}
    </section>
  );
}
