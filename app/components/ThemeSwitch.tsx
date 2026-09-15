"use client";
import { useSyncExternalStore } from "react";
import { applyThemeChoice, readThemeChoice, subscribeToThemeChoice, themeChoiceOnServer, type ThemeChoice } from "@/src/theme";
import { CARD, HELP, INLINE_BUTTON, TITLE } from "./ui";

/**
 * Light, dark, or whatever the phone says.
 *
 * The third option is the default and it is not padding: Apple asks apps to avoid an appearance setting of
 * their own, because two settings that disagree look like a fault. Keeping "follow my phone" as the starting
 * point means the two only ever disagree when somebody has deliberately made them.
 *
 * The chosen option is marked with a word as well as its outline, because colour is never the only carrier.
 */
const CHOICES: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: "light", label: "Day" },
  { value: "dark", label: "Night" },
  { value: "system", label: "Follow my phone" },
];

export function ThemeSwitch() {
  // Read rather than copied into state: the server renders the default, the browser renders what was
  // stored, and neither one has to correct the other after the fact.
  const choice = useSyncExternalStore(subscribeToThemeChoice, readThemeChoice, themeChoiceOnServer);

  return (
    <section className={CARD}>
      <h2 className={TITLE}>How it looks</h2>
      <div className="flex flex-wrap gap-[var(--tap-gap)]" role="group" aria-label="How Viky looks">
        {CHOICES.map((option) => {
          const chosen = option.value === choice;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={chosen}
              onClick={() => applyThemeChoice(option.value)}
              // The chosen outline is twice the width through the same variable the button reads, because a
              // separate width class loses to it and the outline would silently drop back to a hairline.
              className={`${INLINE_BUTTON} ${chosen ? "[--control-border-width:2px] border-[var(--accent-text)] font-medium" : ""}`}
            >
              {option.label}
              {chosen ? <span className="sr-only"> (chosen)</span> : null}
            </button>
          );
        })}
      </div>
      <p className={HELP}>
        {choice === "system"
          ? "Viky follows your phone, so it turns dark when everything else does."
          : "Viky stays this way, whatever your phone is set to."}
      </p>
    </section>
  );
}
