"use client";
import { useEffect, useRef, useState } from "react";
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

export function HeadCharacter({ scene }: Readonly<{ scene?: SceneName }> = {}) {
  const root = useRef<HTMLSpanElement>(null);
  // Decided once, at mount: whether a head stood on a screen before this one in this tab.
  const [arrives] = useState(() => aHeadWasDrawn);
  useEffect(() => {
    aHeadWasDrawn = true;
    const stage = root.current;
    if (!scene || !arrives || !stage || reduced()) return;
    const settle = springEasing(SPRING.expressiveFastSpatial);
    const pop = springEasing(SPRING.effects);
    const rise = MOTION.reveal.rise;
    const running: Animation[] = [];
    // The figure hops in, as the page's own blocks rise (MOTION.reveal), on the expressive spring.
    for (const figure of stage.querySelectorAll<SVGElement>('[data-part="figure"]')) {
      running.push(figure.animate([{ transform: `translateY(${rise}px)`, opacity: 0.6 }, { transform: "translateY(0)", opacity: 1 }], { duration: settle.durationMs, easing: settle.easing, fill: "backwards" }));
    }
    // Then what makes the scene: the props grow from their middle, the raised arms lengthen from their joints.
    const later = MOTION.reveal.staggerMs;
    for (const prop of stage.querySelectorAll<SVGElement>("[data-prop]")) {
      running.push(prop.animate([{ transform: "scale(0.4)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: pop.durationMs, easing: pop.easing, delay: later, fill: "backwards" }));
    }
    // A raised arm is drawn out along its own curve from the joint, then its hand closes on the end (D241): a stretch
    // on one axis made the arm on the shoulder rise vertically before it lay sideways. No overshoot here, since a line
    // drawn past its end would open a gap at the joint; the transform, which holds a pose's turn, is left alone.
    for (const arm of stage.querySelectorAll<SVGElement>('[data-part="arm"]:not([data-pose="rest"])')) {
      const reach = arm.querySelector<SVGElement>('[data-part="reach"]');
      const hand = arm.querySelector<SVGElement>('[data-part="hand"]');
      if (reach) {
        running.push(reach.animate([{ strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDasharray: "1 1", strokeDashoffset: 0 }], { duration: settle.durationMs, easing: EASING.emphasizedDecelerate, delay: later, fill: "backwards" }));
      }
      if (hand) {
        running.push(hand.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: pop.durationMs, easing: pop.easing, delay: later + settle.durationMs * 0.6, fill: "backwards" }));
      }
    }
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
