"use client";
import { useEffect, useRef } from "react";
import { MOTION } from "@/src/design-tokens";
import { heroCookieText } from "@/src/hero-cookie";
import { springEasing } from "@/src/motion";
import { Character } from "./Character";
import { Expression, Gaze, reduced } from "./Motion";

/**
 * The hero moment of the landing (D214, the founder's direction A of 24 Sep 2026): the character hides behind the
 * card, only its eyes over the card's edge, then rises on the expressive spring, its arms and legs unfold, and it
 * stands there. Once per visit: the first time the landing is drawn in this session. Every load after that draws it
 * standing and still, because a moment that replays on every reload is the same screen going out and coming back
 * (D198).
 *
 * The first image is the starting state, never the final state followed by a restart (the founder's rule of 23 Sep):
 * the server draws `data-hero="peeking"` when the moment has not played, the stylesheet puts the figure down and the
 * limbs folded from that attribute, and the animation starts from exactly there in the same task the attribute goes.
 * Nothing plays on a clock, nothing loops, and a device that asks for less movement is shown the character standing.
 *
 * Trigger: the landing drawn for the first time in the session. Rule: the figure rises from 66 % of its box down to
 * its place on the expressive fast spatial spring (MOTION.gift.spatial, about 500 ms); the limbs unfold on the same
 * spring once the body has landed; the mouth opens with the landing on the effects spring. Reduced motion: standing
 * from the first image. Test: `test/browser/hero.spec.ts`, `test/hero-moment.test.ts`.
 */
export const HERO_PEEK = 0.66;
/** The side of the drawing's box, in its own units (`Character`, the diamond with limbs). */
const CHARACTER_BOX = 64;

export function HeroMoment({ played }: Readonly<{ played: boolean }>) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = root.current;
    if (!stage || played) return;
    // Played, as far as the next load is concerned, whether or not it moves here: the cookie is the session's memory.
    try {
      document.cookie = heroCookieText(window.location.protocol === "https:");
    } catch {
      // A browser that refuses the cookie plays the moment again next time, which is the honest fallback.
    }
    const figure = stage.querySelector<SVGElement>('[data-part="figure"]');
    const limbs = [...stage.querySelectorAll<SVGElement>('[data-part="arm"], [data-part="leg"]')];
    const mouth = stage.querySelector<SVGElement>('[data-part="mouth"]');
    const show = () => stage.removeAttribute("data-hero");
    if (!figure || reduced()) {
      show();
      return;
    }
    const rise = springEasing(MOTION.gift.spatial);
    const open = springEasing(MOTION.gift.effects);
    const running: Animation[] = [
      // In the drawing's own units, as the stylesheet's first image is: a transform on an SVG group is read in them.
      figure.animate([{ transform: `translateY(${Math.round(HERO_PEEK * CHARACTER_BOX)}px)` }, { transform: "translateY(0)" }], { duration: rise.durationMs, easing: rise.easing, fill: "backwards" }),
    ];
    // The limbs unfold once the body has stopped: the spring's settle is where it stands still.
    for (const limb of limbs) running.push(limb.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: rise.durationMs, easing: rise.easing, delay: rise.durationMs, fill: "backwards" }));
    if (mouth) running.push(mouth.animate([{ transform: "scale(0.4)" }, { transform: "scale(1)" }], { duration: open.durationMs, easing: open.easing, delay: rise.durationMs * 0.7, fill: "backwards" }));
    // The starting state came from the stylesheet; from here the animations hold it, in the same task.
    show();
    return () => running.forEach((animation) => animation.cancel());
  }, [played]);
  return (
    <div ref={root} className="hero-stage" data-hero={played ? undefined : "peeking"} aria-hidden>
      {/* It still hears the card's moods and follows the pointer, as the head of the landing did (D148), until D214. */}
      <Expression>
        <Gaze>
          <Character state="diamond" tone="sun" standing={false} limbs className="hero-character" />
        </Gaze>
      </Expression>
    </div>
  );
}
