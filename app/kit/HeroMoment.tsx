"use client";
import { useEffect, useRef } from "react";
import { EASING, MOTION } from "@/src/design-tokens";
import { heroCookieText } from "@/src/hero-cookie";
import { springEasing } from "@/src/motion";
import { Character } from "./Character";
import { Expression, reduced } from "./Motion";

/**
 * The hero moment of the landing (D214, then D219 for the choreography the founder asked for on 24 Sep 2026): the
 * character hides behind the card, only its eyes over the card's edge, then leaps out whirling, lands on the floor,
 * bounces once, settles, and only then unfolds its arms and legs and stands there. Once per visit: the first time
 * the landing is drawn in this session. Every load after that draws it standing and still, because a moment that
 * replays on every reload is the same screen going out and coming back (D198).
 *
 * The choreography follows the principles every animator works from (Thomas and Johnston, The Illusion of Life):
 * squash and stretch, the body stretching in the air and squashing on the floor; slow in and slow out, the leap
 * decelerating to its top and the fall accelerating to the floor; follow through, the small bounce after the landing
 * and the limbs unfolding after the body has stopped; and arcs, the whirl on the way up. Every number is a token
 * (`MOTION.hero`), every curve one of Material's, and the landing settles on the expressive spatial spring.
 *
 * The first image is the starting state, never the final state followed by a restart (the founder's rule of 23 Sep):
 * the server draws `data-hero="peeking"` when the moment has not played, the stylesheet puts the figure down and the
 * limbs folded from that attribute, and the animations start from exactly there in the same task the attribute goes.
 * Nothing plays on a clock, nothing loops, and a device that asks for less movement is shown the character standing.
 */
export const HERO_PEEK = 0.66;
/** The side of the drawing's box, in its own units (`Character`, the diamond with limbs). */
const CHARACTER_BOX = 64;

/** The moments of the choreography, in milliseconds from the start, computed once from the tokens. */
export function heroTimeline(hero = MOTION.hero) {
  const settle = springEasing(hero.settle);
  const top = hero.leapMs;
  const floor = top + hero.fallMs;
  const hopTop = floor + hero.squashMs + hero.hopMs / 2;
  const floorAgain = hopTop + hero.hopMs / 2;
  const still = floorAgain + settle.durationMs;
  const limbsAt = still - hero.limbsBeforeStillMs;
  return { top, floor, hopTop, floorAgain, still, settle, limbsAt, done: limbsAt + settle.durationMs };
}

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
    const whirl = stage.querySelector<SVGElement>('[data-part="whirl"]');
    const limbs = [...stage.querySelectorAll<SVGElement>('[data-part="arm"], [data-part="leg"]')];
    const mouth = stage.querySelector<SVGElement>('[data-part="mouth"]');
    const show = () => stage.removeAttribute("data-hero");
    if (!figure || reduced()) {
      show();
      return;
    }
    const hero = MOTION.hero;
    const time = heroTimeline(hero);
    const peek = Math.round(HERO_PEEK * CHARACTER_BOX);
    const at = (ms: number) => ms / time.still;
    const body = (y: number, scale: Readonly<{ x: number; y: number }>) => `translateY(${y}px) scale(${scale.x}, ${scale.y})`;
    const running: Animation[] = [
      // The leap, the fall, the squash, the bounce and the settle: one animation of the body, from the floor up.
      figure.animate(
        [
          { offset: 0, transform: body(peek, hero.plain), easing: EASING.emphasizedDecelerate },
          { offset: at(time.top), transform: body(-hero.leapAbove, hero.stretch), easing: EASING.emphasizedAccelerate },
          { offset: at(time.floor), transform: body(0, hero.squash), easing: EASING.emphasizedDecelerate },
          { offset: at(time.hopTop), transform: body(-hero.hopAbove, hero.lift), easing: EASING.emphasizedAccelerate },
          { offset: at(time.floorAgain), transform: body(0, hero.secondSquash), easing: time.settle.easing },
          { offset: 1, transform: body(0, hero.plain) },
        ],
        { duration: time.still, fill: "backwards" },
      ),
    ];
    // The whirl on the way out: one turn, decelerating so it lands upright at the moment it touches the floor.
    if (whirl) running.push(whirl.animate([{ transform: `rotate(${-360 * hero.turns}deg)` }, { transform: "rotate(0deg)" }], { duration: time.floor, easing: EASING.emphasizedDecelerate, fill: "backwards" }));
    // The mouth opens with the landing, on the spring that never overshoots.
    if (mouth) {
      const open = springEasing(hero.effects);
      running.push(mouth.animate([{ transform: "scale(0.4)" }, { transform: "scale(1)" }], { duration: open.durationMs, easing: open.easing, delay: time.floor, fill: "backwards" }));
    }
    // The limbs unfold once the body is almost still, on the same spring, so the pose is taken last.
    for (const limb of limbs) running.push(limb.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: time.settle.durationMs, easing: time.settle.easing, delay: time.limbsAt, fill: "backwards" }));
    // The starting state came from the stylesheet; from here the animations hold it, in the same task.
    show();
    return () => running.forEach((animation) => animation.cancel());
  }, [played]);
  return (
    <div ref={root} className="hero-stage" data-hero={played ? undefined : "peeking"} aria-hidden>
      {/* It hears what the gift's record says, as the head of every screen does (D148); nothing else moves it (D216). */}
      <Expression>
        <Character state="diamond" tone="sun" standing={false} limbs className="hero-character" />
      </Expression>
    </div>
  );
}
