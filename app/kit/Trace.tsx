"use client";
import { useEffect, useState } from "react";

/**
 * The trace of a screen's first moments, on the founder's own phone (D196). The double load he sees on the landing,
 * Home and You with his account could not be reproduced on this machine in Chromium, WebKit, with the service worker,
 * or with his gifts and preferences copied onto a test account; so it is measured where it happens.
 *
 * Opened with `?trace=1` on any page and kept for the tab (closed with `?trace=0` or the ×). It prints, on the screen
 * itself, what a screenshot can carry back: whom the server drew the screen for, when the page came alive, every time
 * the page's `<main>` is replaced afterwards and whom the new one is drawn for, and every block that plays its entrance
 * twice. Nothing leaves the phone: no request is made, nothing is stored but the switch itself.
 */
const SWITCH = "viky.trace";

type Line = Readonly<{ at: number; text: string }>;

function isOn(): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get("trace");
    if (asked === "1") window.sessionStorage.setItem(SWITCH, "1");
    if (asked === "0") window.sessionStorage.removeItem(SWITCH);
    return window.sessionStorage.getItem(SWITCH) === "1";
  } catch {
    return false;
  }
}

const describe = (main: Element | null) => (main ? `drawn for ${main.getAttribute("data-drawn-for") ?? "?"} on ${window.location.pathname}` : "no main");

export function Trace() {
  const [lines, setLines] = useState<Line[] | null>(null);

  useEffect(() => {
    if (!isOn()) return;
    const kept: Line[] = [];
    const note = (text: string) => {
      kept.push({ at: Math.round(performance.now()), text });
      setLines([...kept]);
    };
    let main = document.querySelector("main");
    let path = window.location.pathname;
    note(`alive, ${describe(main)}`);
    const observer = new MutationObserver(() => {
      const now = document.querySelector("main");
      if (now === main) return;
      main = now;
      // A new page brings a new <main>, which is a page change; the same page drawing its <main> again is the double load.
      const samePage = window.location.pathname === path;
      path = window.location.pathname;
      note(`${samePage ? "SAME PAGE drawn again" : "new page"}, ${describe(now)}`);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const entered = new WeakMap<Element, number>();
    const onEnter = (event: AnimationEvent) => {
      if (event.animationName !== "page-enter" || !(event.target instanceof Element)) return;
      const times = (entered.get(event.target) ?? 0) + 1;
      entered.set(event.target, times);
      if (times > 1) note(`entered ${times} times: ${(event.target.textContent ?? "").trim().slice(0, 28)}`);
    };
    document.addEventListener("animationstart", onEnter, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("animationstart", onEnter, true);
    };
  }, []);

  if (!lines) return null;
  return (
    <div
      role="log"
      aria-label="Trace"
      className="fixed left-[var(--space-sm)] top-[var(--space-sm)] z-[1000] max-h-[45vh] max-w-[min(92vw,420px)] overflow-y-auto rounded-[var(--radius-control)] bg-[var(--text)] p-[var(--space-sm)] font-mono text-[11px] leading-[1.35] text-[var(--background)] opacity-90"
    >
      <button
        type="button"
        onClick={() => {
          try {
            window.sessionStorage.removeItem(SWITCH);
          } catch {
            // nothing kept, nothing to forget
          }
          setLines(null);
        }}
        className="float-right px-[var(--space-xs)]"
        aria-label="Close the trace"
      >
        ×
      </button>
      {lines.map((line, index) => (
        <div key={index}>
          {String(line.at).padStart(5, " ")} ms {line.text}
        </div>
      ))}
    </div>
  );
}
