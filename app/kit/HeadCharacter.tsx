"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { EASING, MOTION, SPRING } from "@/src/design-tokens";
import { springEasing } from "@/src/motion";
import { Character } from "./Character";
import { Scene, type SceneName } from "./Figure";
import { Expression, reduced } from "./Motion";

/**
 * The character at the head of a screen (D148, the motion roadmap of 21 Sep 2026, step 2).
 *
 * It was on the page without an account and nowhere else. It now stands at the head of a gift's page, of the sheet
 * that pays and of the way out, in the same corner, because it is the one thing on these screens that can answer a
 * gesture: what it does next is the arrival of what changed, the gift made, the money taken. An ornament would not
 * have earned the room.
 *
 * On the three destinations it is the figure in that destination's scene (D237, the founder's modes: a suit and a
 * case on Home, an arm on a second one's shoulder on Gifts, arms crossed behind sunglasses on Me), at 104 wide, and
 * a change of page is a micro-interaction: the figure hops in, its props and its raised arms come out on the
 * springs, once, only when a screen was drawn before in this tab. A cold load shows the final state from the first
 * image (D198), and a device that asks for less movement shows it too. Elsewhere the head keeps the plain diamond,
 * 72 wide, which is 45 tall in its own box.
 */
let aHeadWasDrawn = false;

/** Material 3's duration token medium 3, 350 ms (`@material/web` tokens, `_md-sys-motion.scss`, read 25 Sep 2026). */
const SUIT_MS = 350;

/**
 * The arrival of a scene, in one place (D243). It starts in a layout effect, before the browser paints the new screen:
 * started after the paint, as it was, the first image was the scene complete (the case, the suit, the hands) and the
 * next one its starting state, so every prop appeared, vanished and came back, which is the blink the founder saw on
 * 25 Sep 2026. The first image is the starting state (D198), here as on the landing.
 *
 * The figure itself does not move: the row it stands in already rises and fades with the page (`page-enter`,
 * globals.css), and a second rise and fade on the figure doubled both, starting it at a third of its opacity. What
 * moves is what makes the scene, within about 300 ms: the suit grows onto the body, the sunglasses come down onto the
 * eyes, a raised arm is drawn along its own curve and its hand closes on the end, and the case swings into the hand
 * from its handle, on the expressive spring, whose overshoot is the swing settling.
 */
function arrive(stage: HTMLElement): Animation[] {
  const pop = springEasing(SPRING.effects);
  const swing = springEasing(SPRING.expressiveFastSpatial);
  const draw = { duration: MOTION.reveal.durationMs, easing: EASING.emphasizedDecelerate, fill: "backwards" as const };
  const running: Animation[] = [];
  // The suit grows onto the body a little slower than the effects spring's 234 ms, on the curve Material gives what
  // enters the screen, emphasized decelerate, the one the arms and the sunglasses use (D245, after D244's in and out).
  for (const suit of stage.querySelectorAll<SVGElement>('[data-prop="suit"]')) {
    running.push(suit.animate([{ transform: "scale(0.4)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: SUIT_MS, easing: EASING.emphasizedDecelerate, fill: "backwards" }));
  }
  for (const shades of stage.querySelectorAll<SVGElement>('[data-prop="shades"]')) {
    running.push(shades.animate([{ transform: "translateY(-5px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], draw));
  }
  for (const box of stage.querySelectorAll<SVGElement>('[data-prop="case"]')) {
    running.push(
      box.animate([{ transform: "rotate(-40deg)", opacity: 0, offset: 0 }, { opacity: 1, offset: 0.2 }, { transform: "rotate(0deg)", opacity: 1, offset: 1 }], {
        duration: swing.durationMs,
        easing: swing.easing,
        delay: MOTION.reveal.staggerMs / 2,
        fill: "backwards",
      }),
    );
  }
  // A raised arm is drawn out along its own curve from the joint, then its hand closes on the end (D241). No overshoot:
  // a line drawn past its end would open a gap at the joint; the transform, which holds a pose's turn, is left alone.
  for (const arm of stage.querySelectorAll<SVGElement>('[data-part="arm"]:not([data-pose="rest"])')) {
    const reach = arm.querySelector<SVGElement>('[data-part="reach"]');
    const hand = arm.querySelector<SVGElement>('[data-part="hand"]');
    // The dash starts a tenth of the arm before the joint: ending exactly on it, its round cap left a dot there.
    if (reach) running.push(reach.animate([{ strokeDasharray: "1 2", strokeDashoffset: 1.1 }, { strokeDasharray: "1 2", strokeDashoffset: 0 }], draw));
    if (hand) running.push(hand.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: pop.durationMs, easing: pop.easing, delay: MOTION.reveal.durationMs * 0.6, fill: "backwards" }));
  }
  return running;
}

export function HeadCharacter({ scene }: Readonly<{ scene?: SceneName }> = {}) {
  const root = useRef<HTMLSpanElement>(null);
  // Decided once, at mount: whether a head stood on a screen before this one in this tab.
  const [arrives] = useState(() => aHeadWasDrawn);
  useLayoutEffect(() => {
    aHeadWasDrawn = true;
    const stage = root.current;
    if (!scene || !arrives || !stage || reduced()) return;
    const running = arrive(stage);
    return () => running.forEach((animation) => animation.cancel());
  }, [scene, arrives]);
  return (
    <Expression>
      <span ref={root} className="contents">
        {scene ? <Scene which={scene} className={`h-auto shrink-0 ${scene === "gifts" ? "w-[192px]" : "w-[104px]"}`} /> : <Character state="diamond" tone="sun" standing={false} className="h-auto w-[72px] shrink-0" />}
      </span>
    </Expression>
  );
}
