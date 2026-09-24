import { THEME_STORAGE_KEY } from "./design-tokens";

/**
 * Which appearance the person asked for, if they asked at all.
 *
 * Three answers, not two: light, dark, and whatever the device says, which is the default and stays the default
 * until somebody picks a side. Apple's guidance is to avoid an app-specific appearance setting, because two
 * settings that disagree read as a bug; offering "as your device" as the default is what keeps them agreeing.
 *
 * The control itself is back for a reason that is not a design one, and it is written down rather than dressed up
 * (D97, 18 Sep 2026): this is a product being shown, and somebody opening it on a device set to light would never
 * see the night side of the work at all. It goes away when the product is really put in front of people.
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

/**
 * The colour the browser paints its own bar with, which is the ground the screen stands on: the day's lavender or
 * the night's ink (D159). The page declares one for each appearance the device may be in, and those two follow the
 * device, never the choice, so somebody reading Viky by day on a phone set to night had a black bar over a lavender
 * page and read it as the app being in the other mode. A chosen appearance writes both, so whichever one the
 * browser picks says the same thing.
 */
const GROUNDS: Record<"light" | "dark", string> = { light: "#DDD6EB", dark: "#151026" };

export function paintTheBrowsersBar(appearance: "light" | "dark"): void {
  if (typeof document === "undefined") return;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", GROUNDS[appearance]);
}

/**
 * Where the server reads the choice: the one thing a browser sends by itself. The page is rendered for the person
 * who asked for it, so the appearance is on the document and the bar's colour is in the head before the first byte
 * reaches the phone, and nothing has to be corrected afterwards. A year, because a choice about how a screen looks
 * does not expire in a week; `Lax` because it is read when the page is asked for and never sent anywhere else.
 */
export const APPEARANCE_COOKIE = "viky.appearance";

function tellTheServer(choice: ThemeChoice): void {
  try {
    const value = choice === "system" ? `${APPEARANCE_COOKIE}=; Path=/; Max-Age=0` : `${APPEARANCE_COOKIE}=${choice}; Path=/; Max-Age=31536000`;
    document.cookie = `${value}; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    // A browser that refuses cookies still has the choice in its own storage, applied before the first paint.
  }
}

/** Applies the choice to the document and remembers it. Removing the attribute hands it back to the phone. */
export function applyThemeChoice(choice: ThemeChoice): void {
  if (typeof document === "undefined") return;
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  if (choice !== "system") paintTheBrowsersBar(choice);
  tellTheServer(choice);
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
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var a=document.documentElement.dataset.theme;if(t==="light"||t==="dark"){a=t;document.documentElement.dataset.theme=t}if(a==="light"||a==="dark"){var c=a==="dark"?"#151026":"#DDD6EB";var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].setAttribute("content",c)}}}catch(e){}`;
