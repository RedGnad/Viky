/**
 * The opening of the installed app (the founder, 28 Sep 2026): the phone's own launch screen hands over to one that
 * starts on its exact image, the character on the lavender, then the character hops up and fades as it goes, "Viky"
 * drops in letter by letter where it was, and the app appears: the last image is the word alone.
 *
 * At every launch of the app, as Duolingo plays its own (the founder's word, over Apple's advice that a launch screen
 * "isn't a branding opportunity"), and never inside a launch: not on a reload, not on the landing a sign-out goes back
 * to, not on a page reached from another. Only in the installed app, opened on Home, with motion allowed; a gift link
 * never shows it, and a tap ends it.
 *
 * A launch is the first document of a session: the session's own storage, which the browser empties when the app is
 * closed, is written by the first page of it, whichever page that is. The decision is taken by a script that runs
 * before anything is painted, so the app is never seen first and covered after: it marks the document, and the
 * stylesheet shows the screen only on a marked document.
 */
export const INTRO_SESSION_KEY = "viky.launched";
export const INTRO_ATTRIBUTE = "data-intro";
/** Set once the screen itself is on the page, which takes the drawing off the ground so it never shows through the fade. */
export const INTRO_SHOWN_ATTRIBUTE = "data-intro-shown";

/**
 * Every page marks the session the moment it starts, before anything is painted; only the first page of a session,
 * reached by a launch rather than a reload, on Home, in the installed app, plays it. So nothing that happens inside a
 * launch plays it a second time, and the next launch plays it again.
 */
export const INTRO_BOOT_SCRIPT = `try{var f=!sessionStorage.getItem("${INTRO_SESSION_KEY}");sessionStorage.setItem("${INTRO_SESSION_KEY}","1");var n=performance.getEntriesByType("navigation")[0];if(f&&(!n||n.type==="navigate")&&location.pathname==="/"&&matchMedia("(display-mode: standalone)").matches&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.setAttribute("${INTRO_ATTRIBUTE}","")}}catch(e){}`;

/** How long the screen lasts once it starts, the hop and the letters, then the hold before it fades. */
export const INTRO_TIMING = { holdMs: 1_150, fadeMs: 250 } as const;

/**
 * The launch screen's image as the page's own ground, set in the head before anything is painted. The browser may
 * paint the ground before the page's first elements have arrived; without this, that first image would be an empty
 * lavender (or the night's ink) between the phone's launch screen and this one, and the character would blink. The
 * drawing is the same as the screen's, at the same place, so the ground and the screen above it are one image.
 */
export function introGroundStyle(figureSvg: string): string {
  const svg = figureSvg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const ground = `html[${INTRO_ATTRIBUTE}]:not([${INTRO_SHOWN_ATTRIBUTE}])`;
  return `${ground},${ground} body{background:#ddd6eb ${url} no-repeat fixed center/66vw auto}`;
}
