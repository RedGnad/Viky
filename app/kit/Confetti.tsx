"use client";
import { useEffect, useRef } from "react";
import { MOTION, SPRING } from "@/src/design-tokens";
import { springEasing } from "@/src/motion";

/**
 * The one confetti of the app (decision B of the founder, 23 Sep 2026): on "Atteint", for the person the gift is for
 * and for the funder, and on nothing else, never at payment. It answers the arrival on the screen that shows the gift
 * reached, the first time this device sees that gift reached, once; a second visit, a reader who is neither of the two
 * people, or a device that asks for reduced motion sees the reached gift as it is, with nothing thrown.
 *
 * The pieces are the characters' own three shapes (a circle, a rounded square, a rounded triangle) in the look's
 * colours, thrown up from the gift's drawing and falling past it, in 900 ms (MOTION.confetti). With them, the stamp of a
 * gift had or not lands: it comes down from a little larger and settles on the expressive spring, overshooting once.
 * Nothing stays on the screen after: the pieces are removed when they have fallen.
 */
const SHAPES = ["circle", "square", "triangle"] as const;
const COLOURS = ["var(--character-1)", "var(--character-2)", "var(--character-3)", "var(--accent)"] as const;

export function Confetti({ giftId, play }: Readonly<{ giftId: string; play: boolean }>) {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!play) return;
    const key = `viky.seen.reached.${giftId}`;
    try {
      if (window.localStorage.getItem(key) !== null) return;
    } catch {
      // A device that keeps nothing would throw every visit: it throws none instead.
      return;
    }
    const box = layer.current;
    // Thrown from the gift's drawing, or from the card while a drawing the browser draws is not there yet (the row of
    // days is drawn once the page runs).
    const drawing = document.querySelector(".gift-shape") ?? document.querySelector(".gift-card-width");
    if (!box || !drawing) return;
    // Seen from now on, whether or not this device moves: reduced motion is shown the reached gift, and nothing more.
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const origin = drawing.getBoundingClientRect();
    const x0 = origin.left + origin.width / 2;
    const y0 = origin.top + origin.height / 2;
    const { durationMs, pieces, burst, fall, stampFrom } = MOTION.confetti;
    const animations: Animation[] = [];
    for (let index = 0; index < pieces; index += 1) {
      const piece = document.createElement("span");
      piece.className = `confetti-piece confetti-${SHAPES[index % SHAPES.length]}`;
      piece.style.background = COLOURS[index % COLOURS.length];
      piece.style.left = `${x0}px`;
      piece.style.top = `${y0}px`;
      box.appendChild(piece);
      // Spread evenly round the half circle above the drawing, each a little further or nearer: no two alike, no clock.
      const angle = Math.PI * (0.08 + (0.84 * index) / (pieces - 1));
      const reach = 90 + ((index * 37) % 70);
      const dx = -Math.cos(angle) * reach;
      const up = -Math.sin(angle) * reach;
      const turn = ((index * 53) % 360) - 180;
      animations.push(
        piece.animate(
          [
            { transform: "translate(-50%, -50%) scale(0.4) rotate(0deg)", opacity: 1, easing: burst },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${up}px)) scale(1) rotate(${turn / 2}deg)`, opacity: 1, offset: 0.4, easing: fall },
            { transform: `translate(calc(-50% + ${dx * 1.2}px), calc(-50% + ${up + 220}px)) scale(1) rotate(${turn}deg)`, opacity: 0 },
          ],
          { duration: durationMs, fill: "forwards" },
        ),
      );
    }
    const stamp = document.querySelector<SVGElement>(".stamp-stamped");
    if (stamp) {
      const spring = springEasing(SPRING.expressiveFastSpatial);
      animations.push(
        stamp.animate([{ transform: `rotate(-20deg) scale(${stampFrom})`, opacity: 0 }, { transform: "rotate(-8deg) scale(1)", opacity: 1 }], {
          duration: spring.durationMs,
          easing: spring.easing,
        }),
      );
    }
    const cleared = Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => box.replaceChildren());
    return () => {
      animations.forEach((animation) => animation.cancel());
      void cleared;
      box.replaceChildren();
    };
  }, [giftId, play]);
  return <div ref={layer} aria-hidden className="confetti-layer" />;
}
