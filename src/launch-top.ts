/**
 * The landing opens at its top when the app is launched (D250, the founder, 25 Sep 2026: "au lancer de l'app ça ne
 * devrait jamais arriver", having opened it part way down again after D240).
 *
 * Two ways a launch could still land part way down, both the browser's own memory and neither a bug of the page:
 * - A load of the landing that the browser treats as a return to a page it knew (a reload, a tab or an app window
 *   restored by the system) restores that page's old scroll position (`history.scrollRestoration`, "auto" by default).
 *   The boot script in the document's head sets it to "manual" on the landing before the browser restores anything,
 *   so a load of "/" starts at the top. Every other page keeps the browser's memory.
 * - An installed app brought back from the background is not loaded at all: the window shows where it was. Android's
 *   own rule for an app left a long time is to bring it back on its first screen ("If the user leaves a task for a
 *   long time, the system clears the task of all activities except the root activity", developer.android.com, Tasks
 *   and the back stack, read 25 Sep 2026). It names no duration; thirty minutes is ours. After that long in the
 *   background, the installed app's landing goes back to its top.
 */
export const LAUNCH_TOP_SCRIPT = `try{if(location.pathname==="/"&&!location.hash&&"scrollRestoration" in history){history.scrollRestoration="manual"}}catch(e){}`;

export const LONG_ABSENCE_MS = 30 * 60 * 1000;

/** Whether a return after being hidden since `hiddenAt` is a return after a long absence. */
export function backAfterLongAbsence(hiddenAt: number | null, now: number): boolean {
  return hiddenAt !== null && now - hiddenAt >= LONG_ABSENCE_MS;
}

/** In the installed app, back at the top after a long absence; returns what stops watching. */
export function topAfterLongAbsence(standalone: () => boolean, now: () => number = Date.now): () => void {
  let hiddenAt: number | null = null;
  const changed = () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = now();
      return;
    }
    if (standalone() && backAfterLongAbsence(hiddenAt, now())) window.scrollTo({ top: 0, behavior: "instant" });
    hiddenAt = null;
  };
  document.addEventListener("visibilitychange", changed);
  return () => document.removeEventListener("visibilitychange", changed);
}
