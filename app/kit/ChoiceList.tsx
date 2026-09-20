"use client";
import { CARD_LABEL, CHOICE, HELP } from "../components/ui";

/**
 * Radios, stacked, one question per group (GOV.UK: "Use the radios component when users can only select one
 * option from a list", the question as the legend; Material: "Radio buttons should be vertically listed", five
 * options or fewer). Native inputs, so the keyboard and the screen reader get them for free; each row is a full
 * tap target.
 *
 * Two shapes, and the list says which it takes.
 *
 * `cards`, the default and what the rendered mockups of 19 Sep 2026 draw: each option is its own box on the paper,
 * the chosen one takes the ink edge and a warmer fill, and every option carries its line of help. It is right for a
 * question of three or four options a person weighs against each other.
 *
 * `lines`, from chooser.html of 20 Sep 2026: one line per option, no box and no help until one is chosen, and then
 * that one alone takes the edge, the fill and its sentence. It exists because the other shape does not scale: six
 * conditions with three lines of explanation each made a list of 720 pixels in a window of 524, so two of the six
 * showed and both edges were cut. A catalogue is read by its titles; the sentence is read about the one being
 * considered.
 */
export type Choice<T extends string> = Readonly<{
  value: T;
  label: string;
  help?: string;
  /** A second line, quieter than the help: what choosing this option actually proves (src/condition-proof.ts). */
  note?: string;
}>;

export function ChoiceList<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  disabled = false,
  legendHidden = false,
  shape = "cards",
}: Readonly<{
  name: string;
  legend: string;
  options: readonly Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** When the page's title already asks the question, the legend is read aloud and not drawn twice. */
  legendHidden?: boolean;
  /** How the options are drawn, and how much each of them says before it is chosen. */
  shape?: "cards" | "lines";
}>) {
  const lines = shape === "lines";
  return (
    // `m-0 border-0 p-0`: a fieldset carries a browser's own padding and border, 38 pixels of width on a phone,
    // which is what was making a title wrap that the image draws on one line.
    <fieldset className={`m-0 flex flex-col border-0 p-0 ${lines ? "gap-[var(--space-xs)]" : "gap-[var(--space-sm)]"}`} disabled={disabled}>
      {/* A family of a catalogue is a heading over its own rows, in the third voice, not a question in the body. */}
      <legend className={legendHidden ? "sr-only" : lines ? `${CARD_LABEL} mb-[var(--space-sm)]` : "mb-[var(--space-sm)] font-medium"}>{legend}</legend>
      {options.map((option) => {
        const chosen = value === option.value;
        const box = chosen
          ? "items-start border-[var(--control-border)] bg-[var(--chosen)]"
          : lines
            ? "items-center border-transparent bg-transparent"
            : "items-start border-[var(--divider)] bg-[var(--surface)]";
        return (
          <label
            key={option.value}
            className={`flex min-h-[var(--tap-target)] cursor-pointer gap-[var(--space-md)] rounded-[var(--radius-control)] border-[length:var(--card-border-width)] ${lines && !chosen ? "px-[var(--space-md)] py-[var(--space-sm)]" : "p-[var(--space-md)]"} ${box}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={chosen}
              onChange={() => onChange(option.value)}
              // Drawn rather than left to the browser, whose unchecked radio is a grey disc at night: a ring of ink on the
              // surface, filled with ink and a ring of surface once chosen, in both appearances (structure, section 7).
              className={`${lines && !chosen ? "" : "mt-[3px]"} h-[22px] w-[22px] shrink-0 cursor-pointer appearance-none rounded-full border-2 border-[var(--control-border)] bg-[var(--surface)] checked:bg-[var(--text)] checked:[box-shadow:inset_0_0_0_4px_var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)] disabled:cursor-default disabled:opacity-50`}
            />
            <span className="flex flex-col">
              <span className={lines ? CHOICE : undefined}>{option.label}</span>
              {option.help && (chosen || !lines) ? <span className={HELP}>{option.help}</span> : null}
              {option.note && (chosen || !lines) ? <span className={HELP}>{option.note}</span> : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
