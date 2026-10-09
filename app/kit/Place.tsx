"use client";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { MOTION } from "@/src/design-tokens";
import { reduced } from "./Motion";

/**
 * A block's place on a screen that has arrived (the founder, 9 Oct 2026, on a living mockup of Home).
 *
 * A screen enters once, block by block, and then it is there. What is read after that used to enter again, each block
 * when its own reading landed: the blocks came in the order of the readings and not in the order of the page, and each
 * one pushed down whatever stood under it. The rule now:
 *
 * - a block the screen expects is at its place from the first image, held from what this device saw last time;
 * - what lands later changes in place, a short fade and nothing else (`.comes-up`, app/globals.css);
 * - where the device's memory was wrong, a place held for nothing or a block with no place, the place closes or opens
 *   by its height, on the entrance's own curve, and the blocks under it slide. Never a jump;
 * - and no block plays the screen's entrance once the screen has been drawn.
 *
 * Where less movement is asked for, everything is there at once and nothing slides.
 */

/** Whether the screen these places stand on has been drawn: what is put on it after that is late. */
const Drawn = createContext(false);

const never = () => () => {};
const inTheBrowser = () => true;
const onTheServer = () => false;

/**
 * Says to the places under it whether their screen has been drawn. On a screen reached by a navigation that is one
 * image after it is built. On the screen a document opens with, the server's image was painted long before the
 * browser built anything: everything the browser adds to it is late, from the moment it has taken the page over.
 */
export function PlacesOf({ children }: Readonly<{ children: ReactNode }>) {
  const takenOver = useSyncExternalStore(never, inTheBrowser, onTheServer);
  const [fromTheServer] = useState(!takenOver);
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPainted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return <Drawn.Provider value={painted || (fromTheServer && takenOver)}>{children}</Drawn.Provider>;
}

/** What is cut off of a place while it slides: what passes its foot, less the relief a control stands on. */
const CUT = "inset(0 -100vmax -8px -100vmax)";

/** The place going from one height to another; opening and closing also take or give back the gap it stands in. */
function slide(box: HTMLElement, from: number, to: number, gap: Readonly<{ from: number; to: number }> = { from: 0, to: 0 }, stays = false): Animation {
  const at = (height: number, margin: number) => ({ height: `${height}px`, marginTop: `${margin}px`, clipPath: CUT });
  return box.animate([at(from, gap.from), at(to, gap.to)], { duration: MOTION.place.heightMs, easing: MOTION.place.easing, fill: stays ? "forwards" : "none" });
}

/** The gap between this place and the block above it, which a closed place must not leave behind. */
const gapAbove = (box: HTMLElement) => parseFloat(getComputedStyle(box.parentElement ?? box).rowGap) || 0;

/**
 * A place. `open` says whether its block belongs on the screen; what it holds is given whether it is open or not, so
 * a place that closes still has something to close over.
 *
 * Open when its screen is built, it is a block like any other and enters with it. Opened after the screen was drawn,
 * it grows from nothing to its height; closed after, it goes back to nothing and is taken away. When what it holds
 * changes height on a drawn screen, a card landing where its place was held a little short, it goes from one height
 * to the other. A place that is not open and not closing is not in the page at all: no room, no gap, and no turn
 * taken in the entrance.
 */
export function Place({ open = true, children }: Readonly<{ open?: boolean; children: ReactNode }>) {
  const drawn = useContext(Drawn);
  const [there, setThere] = useState(open);
  const [late, setLate] = useState(open && drawn);
  // Asked for after it was gone, or for the first time: it is there from this very render, late if the screen is drawn.
  if (open && !there) {
    setThere(true);
    setLate(drawn);
  }
  // Closed before its screen was drawn, or where less movement is asked for: it is simply not there.
  if (!open && there && (!drawn || reduced())) setThere(false);

  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  /** The height this place last stood at, which a change starts from; nothing until it has been laid out. */
  const stood = useRef<number | null>(null);

  // Opening, before the browser paints: the first image of a late place is the place closed.
  useLayoutEffect(() => {
    const box = outer.current;
    const held = inner.current;
    if (!there || !box || !held) {
      stood.current = null;
      return;
    }
    if (stood.current !== null) return;
    const height = held.getBoundingClientRect().height;
    stood.current = height;
    if (!late || reduced()) return;
    slide(box, 0, height, { from: -gapAbove(box), to: 0 });
    box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.place.fadeMs, easing: "ease-out" });
  }, [there, late]);

  // What it holds changes height on a drawn screen: from the height it stood at to the new one.
  useEffect(() => {
    const box = outer.current;
    const held = inner.current;
    if (!there || !open || !box || !held || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => {
      const height = held.getBoundingClientRect().height;
      const from = stood.current;
      if (from === null || Math.abs(height - from) < 0.5) return;
      stood.current = height;
      if (drawn && !reduced()) slide(box, from, height);
    });
    watch.observe(held);
    return () => watch.disconnect();
  }, [there, open, drawn]);

  // Closing: back to nothing, the gap with it, and then it is taken away.
  useLayoutEffect(() => {
    const box = outer.current;
    const held = inner.current;
    if (open || !there || !box) return;
    let over = false;
    const from = box.getBoundingClientRect().height;
    const closing = slide(box, from, 0, { from: 0, to: -gapAbove(box) }, true);
    const fading = box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.place.fadeMs, easing: "ease-out", fill: "forwards" });
    closing.onfinish = () => {
      over = true;
      setThere(false);
    };
    return () => {
      if (over) return;
      // Asked for again before it had closed: it opens again from where it stands.
      const at = box.getBoundingClientRect().height;
      const gap = parseFloat(getComputedStyle(box).marginTop) || 0;
      closing.cancel();
      fading.cancel();
      if (box.isConnected && !reduced()) slide(box, at, held?.getBoundingClientRect().height ?? at, { from: gap, to: 0 });
    };
  }, [open, there]);

  if (!there) return null;
  return (
    <div ref={outer} data-place="" {...(late ? { "data-late": "" } : {})}>
      {/* A column like the page's own, so what stands in it is laid out as it would be on the page itself. */}
      <div ref={inner} className="flex flex-col">
        {children}
      </div>
    </div>
  );
}
