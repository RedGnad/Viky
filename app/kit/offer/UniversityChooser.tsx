"use client";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { listAllUniversities } from "@/src/client/certificate-gift";
import type { GiftDraft } from "@/src/gift-draft";
import { countryInWords } from "@/src/rail-country";
import { UNIVERSITY_CHOICE as W } from "@/src/sentences";
import { indexUniversities, readyFor, searchedCount, senseOfCondition, shownUniversities, type IndexedUniversity, type ListedUniversity } from "@/src/university-choice";
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

/** The mark of a university whose students can show their page today, at the end of its own line (the founder's mockup of 10 Oct 2026). */
const READY_MARK =
  "rounded-full border-[length:var(--control-border-width)] border-[var(--control-border)] bg-[var(--accent)] px-[var(--space-sm)] py-[2px] text-[length:var(--type-help)] leading-[var(--type-help-leading)] font-bold tracking-[var(--tracking-label)] whitespace-nowrap text-[var(--on-accent)]";

/**
 * "Which university?" (D247, D313, and the founder, 29 and 30 Sep 2026: "au lieu d'avoir tout de proposé et de pouvoir
 * filtrer si besoin"). It opens on every country: the person paying is often not in the student's country, a parent in
 * Paris for a student in Dakar, so no country is guessed for them. One field searches the whole list at once, and a
 * chip in the app's button style narrows it to one country. Every line says its country until one is chosen. While the
 * list is read, empty lines hold its place and nothing is written.
 *
 * One list (the founder's mockup of 10 Oct 2026): every university in it can be chosen and paid for now. The field
 * says how many it searches. A university whose students can show their page today, for what this gift asks, comes
 * first and carries a mark on its line; the others carry nothing. Two groups stood here since 8 Oct, the second under
 * "more, added on request within two days", which a payer read as one university that works and a waiting list.
 *
 * All of it is listed: the lines are drawn a hundred at a time as the end comes near, so eleven thousand of them do not
 * weigh on a phone, and nothing is held back. Once a university is chosen the list folds into it, with a way to change
 * it, so what comes after (a grade) is in reach; and under its name one line says when its students can show their
 * page, today or within two days of the gift, the only place the two days are said to a payer. A search that finds
 * nothing, and it alone, leads to the page where a university is asked for (D264): it stood at the foot of every list.
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

  // Read when the sheet opens, and for a university already chosen: the line under its name is said from the list.
  const hasChosen = Boolean(draft.course && draft.courseTitle);
  useEffect(() => {
    if ((!open && !hasChosen) || index !== null) return;
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
  }, [open, hasChosen, index]);

  // What is typed narrows the list a moment later than the field shows it, so typing never waits on eleven thousand lines.
  const typed = useDeferredValue(words.trim());
  const countries = useMemo(() => (Array.isArray(index) ? [...new Set(index.map((entry) => entry.one.country))] : []), [index]);
  // Ready is said of what this gift asks for: enrolment, or a page of results.
  const sense = senseOfCondition(draft.conditionId);
  const shown = useMemo(() => (Array.isArray(index) ? shownUniversities(index, typed, country, sense) : null), [index, typed, country, sense]);
  // One list: the ready first, then every other, each by its own name.
  const listed = useMemo(() => (shown ? [...shown.ready, ...shown.others] : []), [shown]);
  const searched = useMemo(() => (Array.isArray(index) ? searchedCount(index, country) : null), [index, country]);
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
    // Whether its students can show their page today, for what this gift asks: said from the list once it is read,
    // and nothing before, since either line would be a guess.
    const one = Array.isArray(index) ? index.find((entry) => entry.one.pair === draft.course)?.one : undefined;
    return (
      <div
        data-university-chosen=""
        className="flex flex-col gap-[var(--space-sm)] rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--control-border)] bg-[var(--chosen)] p-[var(--space-md)]"
      >
        <div className="flex items-center justify-between gap-[var(--space-md)]">
          <span className="flex min-w-0 flex-col">
            <span className={`${CHOICE} break-words`}>{name}</span>
            {where ? <span className={META}>{where}</span> : null}
          </span>
          <button type="button" className={`${SMALL_BUTTON} shrink-0`} aria-label={`${W.change}: ${name}`} onClick={() => setChanging(true)}>
            {W.change}
          </button>
        </div>
        {one ? (
          <p className={HELP} data-university-when="">
            {readyFor(one, sense) ? W.showToday : W.setUpInTwoDays}
          </p>
        ) : null}
      </div>
    );
  }

  const value = draft.course ?? null;
  const pick = (among: readonly ListedUniversity[]) => (pair: string) => {
    const one = among.find((entry) => entry.pair === pair);
    if (one) choose(one);
  };
  // Every line says its country while several countries are shown, since a name alone no longer tells them apart.
  // And the mark of one whose students can show their page today, which is what set a group of its own apart before.
  const line = (one: ListedUniversity) => ({
    value: one.pair,
    label: one.title,
    tag: country ? undefined : <span className={META}>{countryInWords(one.country) ?? one.issuer}</span>,
    mark: readyFor(one, sense) ? <span className={READY_MARK}>{W.ready}</span> : undefined,
  });

  return (
    <div ref={top} className="flex scroll-mt-[var(--space-md)] flex-col gap-[var(--space-sm)]">
      <Field
        id="university-search"
        label={W.search(searched === null ? undefined : searched.toLocaleString("en-US"))}
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
          {listed.length > 0 ? <ChoiceList name="university" legend={W.list} legendHidden shape="lines" value={value} onChange={pick(listed)} options={listed.slice(0, count).map(line)} /> : null}
          {listed.length > count ? <MoreWhenNear onNear={() => setDrawn({ key: listKey, count: count + PAGE })} /> : null}
          {/* A search that found nothing, and it alone, leads to the page where a university is asked for (D264): its
              first lines say to offer the gift anyway. Nothing about how a university is checked, which the gift's
              page says where the proof is shown. */}
          {listed.length === 0 ? (
            <>
              <p className={HELP}>{W.nothing}</p>
              <Link href="/add-your-university" className={`${SMALL_BUTTON} self-start no-underline`}>
                {W.askForIt}
              </Link>
            </>
          ) : null}
        </>
      )}
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
