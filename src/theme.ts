import { THEME_STORAGE_KEY } from "./design-tokens";

/**
 * Which appearance the person asked for, if they asked at all.
 *
 * Three answers, not two: light, dark, and whatever the phone says. A product that offers only a switch
 * makes somebody who has set their phone to follow the sun pick a side for ever, and Apple's own guidance is
 * to avoid an app-specific appearance setting precisely because two settings that disagree read as a bug.
 * Offering "follow my phone" as the default is how the two settings stop disagreeing.
 */

export type ThemeChoice = "light" | "dark" | "system";

export function readThemeChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    // A browser that refuses storage still gets a working product, just not a remembered choice.
    return "system";
  }
}

/** Applies the choice to the document and remembers it. Removing the attribute hands it back to the phone. */
export function applyThemeChoice(choice: ThemeChoice): void {
  if (typeof document === "undefined") return;
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // The appearance still changed; only the memory of it did not.
  }
  for (const listener of listeners) listener();
}

/**
 * The choice as something React can read without an effect.
 *
 * The obvious version, reading storage inside `useEffect` and calling `setState`, is a cascading render and
 * React now says so out loud. This is the shape React offers instead: a snapshot the browser reads, a
 * different snapshot for the server so the first paint matches the markup, and a subscription so every copy
 * of the control agrees the moment one of them changes it.
 */
const listeners = new Set<() => void>();

export function subscribeToThemeChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The server has no storage and no phone, so it always renders the default and nothing mismatches. */
export function themeChoiceOnServer(): ThemeChoice {
  return "system";
}

/**
 * The script that runs before anything is painted, so a person who chose light on a dark phone never sees a
 * dark screen flash first. It has to be inline and synchronous for that, which is why it is a string: React
 * would run it after the first paint, which is exactly too late.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}`;
