"use client";
import { useLayoutEffect, useState } from "react";
import { INTRO_ATTRIBUTE, INTRO_SEEN_KEY, INTRO_TIMING } from "@/src/launch-intro";
import { FIGURE_ICON_SVG } from "./figure-icon";

/**
 * The screen of the installed app's first opening (src/launch-intro.ts). It is always in the page and hidden; the
 * boot script marks the document when it should play, and this starts it, remembers it, and takes it away.
 *
 * The character is the icon's own drawing, the picture the phone's launch screen was showing, at the size and place
 * the founder's phone draws it (two thirds of the width, in the middle), on the same lavender, so the first frame is
 * the launch screen's own.
 */
export function LaunchIntro() {
  const [leaving, setLeaving] = useState(false);
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute(INTRO_ATTRIBUTE)) return;
    try {
      window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      // A device that cannot remember sees it again next time, which is harmless.
    }
    const end = () => {
      setLeaving(true);
      window.setTimeout(() => root.removeAttribute(INTRO_ATTRIBUTE), INTRO_TIMING.fadeMs);
    };
    const timer = window.setTimeout(end, INTRO_TIMING.holdMs);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className={`launch-intro${leaving ? " launch-intro-leaving" : ""}`}
      aria-hidden="true"
      onPointerDown={() => {
        setLeaving(true);
        window.setTimeout(() => document.documentElement.removeAttribute(INTRO_ATTRIBUTE), INTRO_TIMING.fadeMs);
      }}
    >
      {/* The icon's own drawing, written in (pnpm make:icon), so it is in the first image rather than fetched after. */}
      <div className="launch-intro-figure" dangerouslySetInnerHTML={{ __html: FIGURE_ICON_SVG }} />
      <p className="launch-intro-word">
        {[..."Viky"].map((letter, index) => (
          <span key={index} style={{ ["--i" as string]: index }}>
            {letter}
          </span>
        ))}
      </p>
    </div>
  );
}
