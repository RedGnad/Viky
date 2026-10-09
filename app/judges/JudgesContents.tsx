"use client";
import { useEffect, useRef } from "react";

/** The sections of the judges page, in the order they stand, by the id of each and the words its link carries. */
export const JUDGES_CONTENTS: ReadonlyArray<Readonly<{ id: string; says: string }>> = [
  { id: "try", says: "How to try it" },
  { id: "who", says: "Who has used Viky" },
  { id: "network", says: "Network and addresses" },
  { id: "verify", says: "Verify a credited day yourself" },
  { id: "conditions", says: "What each condition proves" },
  { id: "reliability", says: "How reliable the readings are" },
  { id: "contracts", says: "The contracts, as the chain answers now" },
  { id: "first-gifts", says: "The first two gifts" },
  { id: "index", says: "The index of the contracts' events" },
  { id: "agora", says: "AUSD, Agora's dollar" },
  { id: "mera", says: "Mera: the path, and two keys" },
  { id: "money-in", says: "How money comes in" },
  { id: "money-out", says: "How money goes out" },
  { id: "reading", says: "How a day is read" },
  { id: "risks", says: "Risks and holes" },
  { id: "milestone", says: "A milestone: a Chess.com rating" },
  { id: "account", says: "Your account on this device" },
];

/** Opens the fold a section is under, so a link that leads to it shows what it holds and not its title alone. */
function openSection(id: string): void {
  const fold = document.getElementById(id)?.querySelector("details");
  if (fold) fold.open = true;
}

/**
 * The contents of the judges page (the audit of 1 Oct 2026, D-11): one link per section, each an anchor. A link is a
 * plain anchor, so it leads to its section without a script; with one, the section it leads to is opened too, here and
 * when the page is opened on an address that already names a section. A section this deployment does not draw (a
 * contract that is not set) has no link.
 *
 * Any other link of the page that names a section opens it as well (the final audit of 9 Oct 2026): the four links of
 * the first block led to a fold that stayed shut, so "who has used Viky" showed a title and nothing under it. The page
 * listens to the address changing, which every such link does.
 */
export function JudgesContents() {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    // A link whose section is not on the page is taken out of the list, on the list itself: nothing here is state.
    for (const item of list.current?.querySelectorAll<HTMLLIElement>("li[data-section]") ?? []) {
      item.hidden = !document.getElementById(item.dataset.section ?? "");
    }
    const named = decodeURIComponent(window.location.hash.slice(1));
    if (named) {
      openSection(named);
      document.getElementById(named)?.scrollIntoView();
    }
    // The browser has already gone to the section: opening its fold is all that is left to do.
    const followed = () => openSection(decodeURIComponent(window.location.hash.slice(1)));
    window.addEventListener("hashchange", followed);
    return () => window.removeEventListener("hashchange", followed);
  }, []);
  return (
    <nav aria-label="On this page" className="space-y-[var(--space-sm)]" id="contents">
      <h2 className="font-medium">On this page</h2>
      <ol ref={list} className="list-decimal space-y-[var(--space-xs)] pl-[var(--space-lg)] text-[length:var(--type-help)]">
        {JUDGES_CONTENTS.map((entry) => (
          <li key={entry.id} data-section={entry.id}>
            <a className="underline" href={`#${entry.id}`} onClick={() => openSection(entry.id)}>
              {entry.says}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
