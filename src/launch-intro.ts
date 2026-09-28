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

export const INTRO_BOOT_SCRIPT = `try{if(location.pathname==="/"&&matchMedia("(display-mode: standalone)").matches&&!matchMedia("(prefers-reduced-motion: reduce)").matches&&!localStorage.getItem("${INTRO_SEEN_KEY}")){document.documentElement.setAttribute("${INTRO_ATTRIBUTE}","")}}catch(e){}`;

/** How long the screen lasts once it starts, the hop and the letters, then the hold before it fades. */
export const INTRO_TIMING = { holdMs: 1_150, fadeMs: 250 } as const;
