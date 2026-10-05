import { MOTION } from "./design-tokens";

/**
 * The first image is the starting state (the founder's rule of 23 Sep 2026). What starts invisible and plays when it
 * is scrolled to has to be drawn invisible from the first image, and only where it will then be played: where
 * movement is welcome, and where a script runs to play it.
 *
 * So the document says it itself, in its head, before anything is drawn: `data-moves` on the root, which the
 * stylesheet reads to draw the landing's posters at their starting state (app/globals.css). Without a script the
 * attribute is never written and every poster is simply there; a device that asks for less movement is not given it.
 *
 * A script that starts and never comes back must not leave a page empty: when the posters' own script has not taken
 * them over after a few seconds, they are shown, still (`data-still`, which that script then respects).
 */
export const MOVES = "data-moves";
/** On the posters: their script has taken them over, and plays them. */
export const POSTERS_READY = "data-posters";
/** On the posters: shown as they are, with no movement, because their script did not come. */
export const POSTERS_STILL = "data-still";
/** What holds the posters. */
export const POSTERS = "data-landing-story";

export const MOVES_BOOT_SCRIPT = `try{var d=document.documentElement;if(!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)){d.setAttribute("${MOVES}","");setTimeout(function(){var s=document.querySelector("[${POSTERS}]");if(s&&!s.hasAttribute("${POSTERS_READY}"))s.setAttribute("${POSTERS_STILL}","")},${MOTION.poster.giveUpMs})}}catch(e){}`;
