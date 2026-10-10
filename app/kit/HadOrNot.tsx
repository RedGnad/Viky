"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { Character, type CharacterState } from "./Character";
import { playChange } from "./Motion";

/**
 * The drawing of a gift that is had or not, a certificate, a badge, an enrolment, a score shown (the founder, 29 Sep
 * 2026, direction A): the gift's character alone, centred, as the rest of the app draws one. Its own state says where
 * the gift stands: asleep until the gift is opened, awake while it waits for its proof, happy once it is reached, gone
 * back when the time ran out without it. The words beside it say the rest, so it is hidden from a screen reader.
 *
 * It replaces the stamp of V4 (document J), a dashed ring beside the character that filled once the proof was taken:
 * no reader understood the empty ring, the founder first among them.
 *
 * It never changes shape without its movement (the founder, 10 Oct 2026). A gift reached while its screen stands makes
 * the jump of a day earned, the triangle becoming the circle in the air; a gift opened while its screen stands wakes,
 * the capsule becoming the triangle, as a day that opens does (app/kit/Motion.tsx). A screen drawn on a gift already
 * there plays nothing, and under reduced motion the new shape is simply there.
 */
export type HadOrNotState = "waiting" | "reached" | "void";

export function HadOrNot({ state, asleep = false }: Readonly<{ state: HadOrNotState; asleep?: boolean }>) {
  // Asleep until somebody opens the gift, as every character of a gift nobody has opened is (the brief, section 5).
  const character: CharacterState = state === "reached" ? "earned" : state === "void" ? "returned" : asleep ? "toCome" : "today";
  /** What is drawn, and what was drawn before it when it changed while this screen stood. */
  const [drawn, setDrawn] = useState<Readonly<{ now: CharacterState; was: CharacterState | null }>>({ now: character, was: null });
  if (drawn.now !== character) setDrawn({ now: character, was: drawn.now });
  const change = drawn.was === "today" && drawn.now === "earned" ? "earned" : drawn.was === "toCome" && drawn.now === "today" ? "woken" : null;
  const root = useRef<HTMLSpanElement>(null);
  // Before the browser paints the new shape, so the one it had is the movement's first image.
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || !change) return;
    const running = playChange(element, change);
    return () => running.forEach((animation) => animation.cancel());
  }, [change]);
  return (
    <span aria-hidden className="had-or-not" data-change={change ?? undefined}>
      <span ref={root} className="had-or-not-character">
        {/* The shape that moves is written into the page with the one it was, since a named drawing's parts cannot be reached (D206). */}
        {change === "earned" ? (
          <Character state="earned" standing={false} drawn="inline" from="today" className="h-auto w-full" />
        ) : change === "woken" ? (
          <Character state="today" standing={false} drawn="inline" wakes className="h-auto w-full" />
        ) : (
          <Character state={drawn.now} standing={false} className="h-auto w-full" />
        )}
      </span>
    </span>
  );
}
