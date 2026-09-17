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
}: Readonly<{ name: string; legend: string; options: readonly Choice<T>[]; value: T | null; onChange: (value: T) => void; disabled?: boolean }>) {
  return (
    <fieldset className="flex flex-col gap-[var(--space-xs)]" disabled={disabled}>
      <legend className="mb-[var(--space-sm)] font-medium">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="flex min-h-[var(--tap-target)] cursor-pointer items-start gap-[var(--space-md)] py-[var(--space-xs)]">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="mt-[6px] h-[20px] w-[20px] shrink-0 accent-[var(--text)]"
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
