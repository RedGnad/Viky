/**
 * The first opening of the installed app (the founder, 28 Sep 2026): the phone's own launch screen hands over to one
 * that starts on its exact image, the character on the lavender, then the character hops up and fades as it goes,
 * "Viky" drops in letter by letter where it was, and the app appears: the last image is the word alone.
 *
 * Once per device, and only where it is honest to spend the second (Apple: a launch screen "isn't a branding
 * opportunity"; Android: an animated launch icon lasts 1,000 ms at most on a phone): the installed app, opened on
 * Home, the first time, with motion allowed. A gift link never shows it, and a tap ends it.
 *
 * The decision is taken by a script that runs before anything is painted, so the app is never seen first and covered
 * after: it marks the document, and the stylesheet shows the screen only on a marked document.
 */
export const INTRO_SEEN_KEY = "viky.intro.seen";
export const INTRO_ATTRIBUTE = "data-intro";
/** Set once the screen itself is on the page, which takes the drawing off the ground so it never shows through the fade. */
export const INTRO_SHOWN_ATTRIBUTE = "data-intro-shown";

/**
 * The device remembers it the moment it decides to play it, before anything is painted, and not when it ends (the
 * founder, 28 Sep 2026: it came back on every opening and every reload on his phone). Whatever happens to the page
 * after that, a reload, a page rebuilt by the browser, an app closed half way, it never plays a second time.
 */
export const INTRO_BOOT_SCRIPT = `try{if(location.pathname==="/"&&matchMedia("(display-mode: standalone)").matches&&!matchMedia("(prefers-reduced-motion: reduce)").matches&&!localStorage.getItem("${INTRO_SEEN_KEY}")){localStorage.setItem("${INTRO_SEEN_KEY}","1");document.documentElement.setAttribute("${INTRO_ATTRIBUTE}","")}}catch(e){}`;

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
