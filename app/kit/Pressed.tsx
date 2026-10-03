"use client";
import { useEffect } from "react";
import { MOTION } from "@/src/design-tokens";

/**
 * A press that a finger can see (D154).
 *
 * The relief collapses on `:active`, which a mouse holds for as long as the button is down. A finger does not: a tap
 * is over in a few milliseconds, Chrome waits before applying `:active` at all so that a scroll is not mistaken for
 * a press, and the founder found the only way to see the movement on his phone was to hold the button down, which is
 * also the one way to make a press miss. So on a device without a pointer the press is held for its own duration,
 * 120 ms, and then given back: the same movement the stylesheet already plays, on the gesture that was actually made.
 *
 * It listens once, at the document, rather than in every control: a press is the same press everywhere, and a button
 * that had to remember to answer one would be a button that sometimes forgot. Nothing here starts a movement on a
 * clock; the clock only ends one that a finger started.
 */
const PRESSED = "data-pressed";

export function Pressed() {
  useEffect(() => {
    const held = new Map<Element, number>();
    const press = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") return;
      const control = (event.target as Element | null)?.closest(".control-relief, .action-relief, .back-round");
      if (!control) return;
      const running = held.get(control);
      if (running !== undefined) window.clearTimeout(running);
      control.setAttribute(PRESSED, "");
      held.set(
        control,
        window.setTimeout(() => {
          control.removeAttribute(PRESSED);
          held.delete(control);
        }, MOTION.press.durationMs),
      );
    };
    document.addEventListener("pointerdown", press, true);
    return () => {
      document.removeEventListener("pointerdown", press, true);
      for (const [control, timer] of held) {
        window.clearTimeout(timer);
        control.removeAttribute(PRESSED);
      }
    };
  }, []);
  return null;
}
