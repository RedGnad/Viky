"use client";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { listAllUniversities } from "@/src/client/certificate-gift";
import type { GiftDraft } from "@/src/gift-draft";
import { countryInWords } from "@/src/rail-country";
import { UNIVERSITY_CHOICE as W } from "@/src/sentences";
import { indexUniversities, shownUniversities, type IndexedUniversity, type ListedUniversity } from "@/src/university-choice";
import { CHOICE, HELP, META, SMALL_BUTTON } from "../../components/ui";
import { ChoiceList } from "../ChoiceList";
import { CountryPicker } from "../CountryPicker";
import { Field } from "../Field";

/** Where the country the list was last narrowed to is kept for the tab (a storage key: never renamed). */
const KEPT_COUNTRY = "viky.university-country";

function keptCountry(): string | null {
  try {
    const kept = window.sessionStorage.getItem(KEPT_COUNTRY);
    return kept && /^[A-Z]{2}$/.test(kept) ? kept : null;
  } catch {
    return null;
  }
}

function keepCountry(country: string | null): void {
  try {
    window.sessionStorage.setItem(KEPT_COUNTRY, country ?? "");
  } catch {
    // A private window keeps nothing: the list opens on every country again, which is still right.
  }
}

/** The whole list, read once per visit and shared by every opening of the sheet; read again after a failure. */
let world: Promise<readonly IndexedUniversity[]> | null = null;
function readWorld(): Promise<readonly IndexedUniversity[]> {
  world ??= listAllUniversities()
    .then(indexUniversities)
    .catch((error: unknown) => {
      world = null;
      throw error;
    });
  return world;
}

/** How many lines are drawn at first, and added each time the end of the list comes near. */
const PAGE = 100;

/**
 * "Which university?" (D247, D313, and the founder, 29 and 30 Sep 2026: "au lieu d'avoir tout de proposé et de pouvoir
 * filtrer si besoin"). It opens on every country: the person paying is often not in the student's country, a parent in
 * Paris for a student in Dakar, so no country is guessed for them. One field searches the whole list at once, and a
 * chip in the app's button style narrows it to one country. Every line says its country until one is chosen. While the
 * list is read, empty lines hold its place and nothing is written.
 *
 * All of it is listed: the lines are drawn a hundred at a time as the end comes near, so eleven thousand of them do not
 * weigh on a phone, and nothing is held back. Once a university is chosen the list folds into it, with a way to change
 * it, so what comes after (a grade) is in reach. Under the list one invitation to add a university (D264): a university
 * is chosen whether or not Viky reads its portal yet, and its provider is built within two days.
 */
export function UniversityChooser({
  open,
  draft,
  onChoose,
}: Readonly<{
  open: boolean;
  draft: GiftDraft;
  onChoose: (one: ListedUniversity) => void;
}>) {
  const [index, setIndex] = useState<readonly IndexedUniversity[] | null | "unreadable">(null);
  // Null is every country, the default; a code narrows the list to that country.
  const [country, setCountry] = useState<string | null>(null);
  const [words, setWords] = useState("");
  const [changing, setChanging] = useState(false);
  const [drawn, setDrawn] = useState<Readonly<{ key: string; count: number }>>({ key: "", count: PAGE });
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || index !== null) return;
    let live = true;
    readWorld().then(
      (read) => {
        if (!live) return;
        setIndex(read);
        setCountry((was) => was ?? keptCountry());
      },
      () => {
        if (live) setIndex("unreadable");
      },
    );
    return () => {
      live = false;
    };
  }, [open, index]);

  // What is typed narrows the list a moment later than the field shows it, so typing never waits on eleven thousand lines.
  const typed = useDeferredValue(words.trim());
  const countries = useMemo(() => (Array.isArray(index) ? [...new Set(index.map((entry) => entry.one.country))] : []), [index]);
  const shown = useMemo(() => (Array.isArray(index) ? shownUniversities(index, typed, country) : null), [index, typed, country]);
  const listKey = `${country ?? ""}|${typed}`;
  const count = drawn.key === listKey ? drawn.count : PAGE;

  const choose = (one: ListedUniversity) => {
    setWords("");
    setChanging(false);
    onChoose(one);
  };

  const chosenTitle = draft.course && draft.courseTitle ? draft.courseTitle : null;
  if (chosenTitle && !changing) {
    // The name, then its country under it, from the sentence the terms carry ("Name, Country"), split at its last comma.
    const cut = chosenTitle.lastIndexOf(", ");
    const [name, where] = cut > 0 ? [chosenTitle.slice(0, cut), chosenTitle.slice(cut + 2)] : [chosenTitle, ""];
    return (
      <div
        data-university-chosen=""
        className="flex items-center justify-between gap-[var(--space-md)] rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--control-border)] bg-[var(--chosen)] p-[var(--space-md)]"
      >
        <span className="flex min-w-0 flex-col">
          <span className={`${CHOICE} break-words`}>{name}</span>
          {where ? <span className={META}>{where}</span> : null}
        </span>
        <button type="button" className={`${SMALL_BUTTON} shrink-0`} aria-label={`${W.change}: ${name}`} onClick={() => setChanging(true)}>
          {W.change}
        </button>
      </div>
    );
  }

  const value = draft.course ?? null;
  const pick = (among: readonly ListedUniversity[]) => (pair: string) => {
    const one = among.find((entry) => entry.pair === pair);
    if (one) choose(one);
  };
  // Every line says its country while several countries are shown, since a name alone no longer tells them apart.
  const line = (one: ListedUniversity) => ({ value: one.pair, label: one.title, tag: country ? undefined : <span className={META}>{countryInWords(one.country) ?? one.issuer}</span> });

  return (
    <div ref={top} className="flex scroll-mt-[var(--space-md)] flex-col gap-[var(--space-sm)]">
      <Field
        id="university-search"
        label={W.search}
        value={words}
        onChange={(next) => {
          // The first letter brings the field to the top of the sheet, so what it finds is under it and not under the
          // keyboard. Never on focus: the list moved under a pointer still pressed, and the university it then stood
          // on was chosen on release (the founder, 30 Sep 2026: the first one of France, chosen by nobody).
          if (!words.trim() && next.trim()) top.current?.scrollIntoView({ block: "start" });
          setWords(next);
        }}
        autoComplete="off"
        spellCheck={false}
      />
      {countries.length > 0 ? (
        <CountryPicker
          id="university-country"
          label={W.country}
          value={country}
          chip={W.inCountry}
          everywhere={W.everywhere}
          onChange={(code) => {
            const next = code || null;
            keepCountry(next);
            setCountry(next);
          }}
          load={async () => countries}
        />
      ) : null}
      {index === null ? (
        <Placeholder />
      ) : index === "unreadable" || !shown ? (
        <p className={HELP}>{W.unreadable}</p>
      ) : (
        <>
          {shown.tested.length > 0 ? <ChoiceList name="university" legend={W.tested} shape="lines" value={value} onChange={pick(shown.tested)} options={shown.tested.map(line)} /> : null}
          {shown.others.length > 0 ? (
            <ChoiceList name="university" legend={W.all} note={W.allLine} shape="lines" value={value} onChange={pick(shown.others)} options={shown.others.slice(0, count).map(line)} />
          ) : null}
          {shown.others.length > count ? <MoreWhenNear onNear={() => setDrawn({ key: listKey, count: count + PAGE })} /> : null}
          {shown.tested.length + shown.others.length === 0 ? <p className={HELP}>{W.nothing}</p> : null}
        </>
      )}
      {/* One line under the list (D264): an invitation, and nothing about how a university is checked, which the gift's
          page says where the proof is shown. */}
      <div className="flex items-center justify-between gap-[var(--space-md)]">
        <p className={HELP}>{W.notListed}</p>
        <Link href="/add-your-university" className={`${SMALL_BUTTON} no-underline`}>
          {W.addYours}
        </Link>
      </div>
    </div>
  );
}

/**
 * The end of the lines drawn so far: when it comes within a screen of the sheet's bottom, the next hundred are drawn,
 * before anybody reaches it. Watched against the sheet's own scrolling part, which is what moves.
 */
function MoreWhenNear({ onNear }: Readonly<{ onNear: () => void }>) {
  const mark = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = mark.current;
    if (!node) return;
    const watch = new IntersectionObserver((seen) => (seen.some((entry) => entry.isIntersecting) ? onNear() : undefined), {
      root: node.closest(".sheet-body"),
      rootMargin: "0px 0px 800px 0px",
    });
    watch.observe(node);
    return () => watch.disconnect();
  }, [onNear]);
  return <div ref={mark} aria-hidden data-more-universities="" className="h-px" />;
}

/**
 * Empty lines where the list will be (the founder, 29 Sep 2026: "on veut éviter les textes quand c'est évitable"): the
 * shape of what comes, the radio and a name of varying length, still for whoever asked for less motion. A screen reader
 * hears that the list is being read.
 */
function Placeholder({ rows = 5 }: Readonly<{ rows?: number }>) {
  const widths = ["72%", "54%", "81%", "63%", "47%"];
  return (
    <div role="status" aria-busy="true" data-placeholder="" className="flex flex-col gap-[var(--space-xs)]">
      <span className="sr-only">{W.reading}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden className="flex min-h-[var(--tap-target)] items-center gap-[var(--space-md)] px-[var(--space-md)] motion-safe:animate-pulse">
          <span className="h-[22px] w-[22px] shrink-0 rounded-full bg-[var(--divider)]" />
          <span className="h-[12px] rounded-full bg-[var(--divider)]" style={{ width: widths[index % widths.length] }} />
        </div>
      ))}
    </div>
  );
}
