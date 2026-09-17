"use client";
import { HELP } from "../components/ui";

/**
 * Radios, stacked, one question per group (GOV.UK: "Use the radios component when users can only select one
 * option from a list", the question as the legend; Material: "Radio buttons should be vertically listed", five
 * options or fewer). Native inputs, so the keyboard and the screen reader get them for free; each row is a full
 * tap target.
 */
export type Choice<T extends string> = Readonly<{ value: T; label: string; help?: string }>;

export function ChoiceList<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  disabled = false,
  legendHidden = false,
}: Readonly<{
  name: string;
  legend: string;
  options: readonly Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** When the page's title already asks the question, the legend is read aloud and not drawn twice. */
  legendHidden?: boolean;
}>) {
  return (
    <fieldset className="flex flex-col gap-[var(--space-xs)]" disabled={disabled}>
      <legend className={legendHidden ? "sr-only" : "mb-[var(--space-sm)] font-medium"}>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="flex min-h-[var(--tap-target)] cursor-pointer items-start gap-[var(--space-md)] py-[var(--space-xs)]">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            // Drawn rather than left to the browser, whose unchecked radio is a grey disc at night: a ring of ink on the
            // surface, filled with ink and a ring of surface once chosen, in both appearances (structure, section 7).
            className="mt-[3px] h-[22px] w-[22px] shrink-0 cursor-pointer appearance-none rounded-full border-2 border-[var(--control-border)] bg-[var(--surface)] checked:bg-[var(--text)] checked:[box-shadow:inset_0_0_0_4px_var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)] disabled:cursor-default disabled:opacity-50"
          />
          <span className="flex flex-col">
            <span>{option.label}</span>
            {option.help ? <span className={HELP}>{option.help}</span> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
