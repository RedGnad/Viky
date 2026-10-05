"use client";
import Link from "next/link";
import { Fragment, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { ConditionIcon as Icon } from "@/src/condition-icons";
import { MOTION } from "@/src/design-tokens";
import { MOVES, POSTERS_READY, POSTERS_STILL } from "@/src/moves";
import { CATALOGUE, HOME, LANDING_STORY as W, ME } from "@/src/sentences";
import { BODY, CARD, HELP, HERO, LEAD, PRIMARY_BUTTON, SAY } from "../components/ui";
import { Character, type CharacterState } from "./Character";
import { ConditionIcon } from "./ConditionIcon";
import { Figure } from "./Figure";
import { Install, isStandalone } from "./Install";
import { MarkNotice } from "./MarkNotice";
import { reduced } from "./Motion";
import { CARD_NOTE, goToTheCard } from "./WayToTheCard";

/**
 * What the landing says under the card: four posters, the phone, and one last way to the card (the founder, 5 Oct
 * 2026, validated on a living mockup; it replaces D282's four blocks with a drawing beside each).
 *
 * A poster is a title in the hero's own size, one sentence under it, and nothing drawn beside: the card appears once
 * on the page, at the top, and nothing of it is drawn again here. One of the days' characters is held in each title,
 * tied to the word before it so it never starts a line. The grounds alternate, the page's, the card's paper, the other
 * appearance's ground, the page's again, and a band that changes ground rises over the one before with round
 * shoulders, like a sheet. Under "Checked, not claimed." the chooser's eleven pictograms go by as round stickers, in a
 * band with no first one and no last one.
 *
 * The first image is the starting state (the rule of 23 Sep 2026): where movement is welcome and a script runs, the
 * document says so in its head (`src/moves.ts`) and the stylesheet draws every part of a poster invisible from the
 * first image. Each poster then plays once, when its title reaches four fifths of the screen (`MOTION.poster`).
 * Without a script, or where less movement is asked for, everything is there and nothing moves; and posters whose
 * script does not come are shown, still.
 */
type Key = (typeof W.blocks)[number]["key"];

/** The character each poster holds. The day that was missed is the one that comes back, from the far side. */
const HELD: Readonly<Record<Key, Readonly<{ state: CharacterState; returns?: true }>>> = {
  theirs: { state: "earned" },
  checked: { state: "today" },
  back: { state: "toCome", returns: true },
  face: { state: "diamond" },
};

/** The ground of each poster, and what it rises over. */
const GROUND: Readonly<Record<Key, Readonly<{ band: string; under: string }>>> = {
  theirs: { band: "poster-band-ground", under: "" },
  checked: { band: "on-paper poster-band-rises", under: "" },
  back: { band: "poster-band-other poster-band-rises", under: "poster-under-paper" },
  face: { band: "poster-band-ground poster-band-rises", under: "poster-under-other" },
};

/**
 * The chooser's eleven pictograms as stickers, in the order and with the lean and the tone the mockup gives each: the
 * raised paper, the tonal lavender, and a quarter of the first and of the second character's colour. Never the sun,
 * which is the action's.
 */
export const STICKERS: readonly Readonly<{ icon: Icon; tone: 1 | 2 | 3 | 4; tilt: number }>[] = [
  { icon: "language", tone: 1, tilt: -7 },
  { icon: "pawn", tone: 1, tilt: 5 },
  { icon: "university", tone: 2, tilt: -3 },
  { icon: "flag", tone: 3, tilt: 8 },
  { icon: "cube", tone: 4, tilt: -5 },
  { icon: "rosette", tone: 2, tilt: 4 },
  { icon: "code", tone: 1, tilt: -8 },
  { icon: "watch", tone: 3, tilt: 3 },
  { icon: "test", tone: 2, tilt: -4 },
  { icon: "route", tone: 1, tilt: 6 },
  { icon: "puzzle", tone: 4, tilt: -2 },
];
/** The set laid end to end as many times as it takes to run past both edges of any screen, drift included. */
const SETS = [0, 1, 2, 3, 4, 5];

const never = () => () => {};
const serverFalse = () => false;
const seconds = (ms: number) => ms / 1000;

/** A title as a poster: each word a part that rises by itself, and the character held to the word it stands after. */
function Poster({ title, after, character, firstUnderTheCard = false }: Readonly<{ title: string; after?: string; character?: ReactNode; firstUnderTheCard?: boolean }>) {
  const words = title.split(" ");
  const at = after ? words.indexOf(after) : -1;
  return (
    // The first poster is what the way to the card keeps under the screen where it can (app/kit/WayToTheCard.ts).
    <h2 data-poster="" className={`${HERO} poster-title`} {...(firstUnderTheCard ? { [CARD_NOTE]: "" } : {})}>
      {words.map((word, index) => {
        const said = (
          <span data-w="" className="inline-block">
            {word}
          </span>
        );
        return (
          <Fragment key={index}>
            {index > 0 ? " " : null}
            {index === at && character ? (
              <span className="whitespace-nowrap">
                {said} {character}
              </span>
            ) : (
              said
            )}
          </Fragment>
        );
      })}
    </h2>
  );
}

/** One of the days' characters in a title: no floor under it, a little taller than the letters. */
function Held({ poster }: Readonly<{ poster: Key }>) {
  const { state, returns } = HELD[poster];
  return (
    <span data-ch={returns ? "back" : "lands"} aria-hidden className={`poster-character${state === "diamond" ? " poster-character-wide" : ""}`}>
      <Character state={state} standing={false} className="block h-full w-full" />
    </span>
  );
}

/**
 * The posters' movement, played by gsap and its ScrollTrigger, which this page alone loads, and only where the
 * document said movement is welcome. Every value is `MOTION.poster`'s. Nothing here touches the scroll itself.
 */
function usePosters(root: { readonly current: HTMLElement | null }): void {
  useEffect(() => {
    const story = root.current;
    if (!story || reduced() || !document.documentElement.hasAttribute(MOVES) || story.hasAttribute(POSTERS_STILL)) return;
    const P = MOTION.poster;
    let live = true;
    let played: { revert: () => void } | undefined;
    // Shown as they are, with no movement: the script did not come, or came too late to be waited for.
    const still = () => {
      if (!story.hasAttribute(POSTERS_READY) || story.getAttribute(POSTERS_READY) === "coming") story.setAttribute(POSTERS_STILL, "");
    };
    story.setAttribute(POSTERS_READY, "coming");
    const giveUp = window.setTimeout(still, P.giveUpMs);
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([core, trigger]) => {
      window.clearTimeout(giveUp);
      if (!live || story.hasAttribute(POSTERS_STILL)) return;
      const { gsap } = core;
      const { ScrollTrigger } = trigger;
      gsap.registerPlugin(ScrollTrigger);
      // A phone's address bar coming and going resizes the window: the triggers are not measured again for that.
      ScrollTrigger.config({ ignoreMobileResize: true });
      played = gsap.context(() => {
        for (const band of story.querySelectorAll<HTMLElement>("[data-band]")) {
          const words = band.querySelectorAll("[data-w]");
          const figure = band.querySelector("[data-figure]");
          const lines = band.querySelectorAll("[data-line], [data-offer]");
          const strip = band.querySelector("[data-strip]");
          // Once, when the title's top reaches its share of the screen; clamped, so the last poster of a short page plays at the page's end.
          const play = gsap.timeline({ scrollTrigger: { trigger: band.querySelector("[data-poster]") ?? band, start: `clamp(top ${P.startAt * 100}%)`, once: true } });
          // The last poster's figure rises first, from its feet, and the words wait for it.
          if (figure) play.fromTo(figure, { opacity: 0, y: P.figure.rise, scaleY: P.figure.fromHeight }, { opacity: 1, y: 0, scaleY: 1, duration: seconds(P.figure.ms), ease: P.figure.ease, transformOrigin: "50% 100%" }, 0);
          // Each word rises to its place, one after the other; its opacity never overshoots, its position may.
          play
            .to(words, { opacity: 1, duration: seconds(P.word.fadeMs), stagger: seconds(P.word.staggerMs), ease: P.word.fadeEase }, figure ? seconds(P.figure.wordsAfterMs) : 0)
            .fromTo(words, { y: P.word.from, rotate: P.word.fromTurn }, { y: 0, rotate: 0, duration: seconds(P.word.riseMs), stagger: seconds(P.word.staggerMs), ease: P.word.ease }, "<");
          for (const one of band.querySelectorAll<HTMLElement>("[data-ch]")) {
            if (one.dataset.ch === "back") {
              // The day that was missed comes back from the far side, and settles.
              play.fromTo(one, { opacity: 0, x: P.back.from, rotate: P.back.fromTurn }, { opacity: 1, x: 0, rotate: 0, duration: seconds(P.back.ms), ease: P.back.ease }, `-=${seconds(P.back.beforeEndMs)}`);
            } else {
              // A character lands in its word: out of nothing, then itself, on a spring.
              play
                .set(one, { opacity: 1 }, `-=${seconds(P.character.beforeEndMs)}`)
                .fromTo(one, { scale: 0, rotate: P.character.fromTurn }, { scale: 1, rotate: 0, duration: seconds(P.character.landMs), ease: P.character.ease }, "<");
            }
          }
          if (lines.length) play.fromTo(lines, { opacity: 0, y: P.line.rise }, { opacity: 1, y: 0, duration: seconds(P.line.ms), stagger: seconds(P.line.staggerMs), ease: P.line.ease }, `-=${seconds(P.line.beforeEndMs)}`);
          if (strip) play.fromTo(strip, { opacity: 0, y: P.strip.rise }, { opacity: 1, y: 0, duration: seconds(P.strip.ms), ease: P.strip.ease }, `-=${seconds(P.strip.beforeEndMs)}`);
        }
        // Tied to the scroll and to nothing else: the stickers drift, and a character leans a little as it goes by.
        const stickers = story.querySelector("[data-stickers]");
        if (stickers) gsap.fromTo(stickers, { x: P.drift.px }, { x: -P.drift.px, ease: "none", scrollTrigger: { trigger: stickers.parentElement, start: "top bottom", end: "bottom top", scrub: P.drift.catchUpS } });
        for (const drawn of story.querySelectorAll("[data-ch] svg")) {
          gsap.fromTo(drawn, { rotate: -P.lean.deg }, { rotate: P.lean.deg, ease: "none", transformOrigin: P.lean.origin, scrollTrigger: { trigger: drawn, start: "top bottom", end: "bottom top", scrub: P.lean.catchUpS } });
        }
      }, story);
      story.setAttribute(POSTERS_READY, "playing");
      // The page's own typefaces change where a title stands: the triggers are measured again once they are in.
      void document.fonts?.ready.then(() => live && ScrollTrigger.refresh());
    }, still);
    return () => {
      live = false;
      window.clearTimeout(giveUp);
      played?.revert();
      story.removeAttribute(POSTERS_READY);
    };
  }, [root]);
}

export function LandingStory() {
  const standalone = useSyncExternalStore(never, isStandalone, serverFalse);
  const story = useRef<HTMLElement>(null);
  usePosters(story);
  return (
    <section ref={story} data-landing-story="" aria-label={W.region} className="w-full">
      {W.blocks.map((block, index) => (
        <div key={block.key} className={`poster-under ${GROUND[block.key].under}`}>
          <section data-band={block.key} className={`poster-band ${GROUND[block.key].band}`}>
            <Poster title={block.title} after={block.characterAfter} character={<Held poster={block.key} />} firstUnderTheCard={index === 0} />
            <p data-line="" className={`${LEAD} poster-line`}>
              {block.body}
            </p>
            {block.key === "checked" ? (
              // What Viky reads, as stickers. Decoration: the chooser names each one, and the sentence above says it.
              <div data-strip="" aria-hidden className="sticker-strip">
                <div data-stickers="" className="stickers">
                  {SETS.map((set) =>
                    STICKERS.map((sticker) => (
                      <span key={`${set}-${sticker.icon}`} className={`sticker sticker-${sticker.tone}`} style={{ transform: `rotate(${sticker.tilt}deg)` }}>
                        <ConditionIcon icon={sticker.icon} />
                      </span>
                    )),
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ))}
      {/* The phone keeps its card and its button, on the page's ground: only where Viky is not already installed. */}
      {standalone ? null : (
        <section className="poster-band poster-band-ground poster-band-follows">
          <div className={`${CARD} mx-auto flex max-w-[720px] flex-col items-center gap-[var(--space-lg)] text-center [@media(min-width:1024px)]:flex-row [@media(min-width:1024px)]:text-left`}>
            {/* A soft smile, this one in particular (D303, the founder, 28 Sep 2026). */}
            <Figure id="story-phone" arms="wave" mouth="soft" halftone className="h-auto w-[110px] flex-none" />
            <div className="flex w-full flex-col gap-[var(--space-sm)]">
              <h2 className={`${SAY} [text-wrap:balance]`}>{W.phone.title}</h2>
              <p className={`${BODY} text-[var(--muted)]`}>{W.phone.body}</p>
              <Install />
            </div>
          </div>
        </section>
      )}
      {/* One last way to the card, the page's one accent again, under the runner: the two figures at the foot stay
          two different ones, as they were before the posters (the founder, 5 Oct 2026). */}
      <section data-band="last" className="poster-band poster-band-ground poster-band-last">
        <div data-figure="" className="mx-auto mb-[var(--space-xl)] w-[130px] [@media(min-width:600px)]:w-[190px]">
          <Figure id="story-last" arms="run" legs="run" lean={-8} mouth="grin" props={["speed"]} halftone className="h-auto w-full" />
        </div>
        <Poster title={W.last.title} />
        <a data-offer="" href="#offer" className={`${PRIMARY_BUTTON} mt-[calc(var(--space-xl)+var(--space-lg))] w-auto! px-[var(--space-xl)] text-center no-underline`} onClick={goToTheCard}>
          {HOME.offer}
        </a>
      </section>
    </section>
  );
}

/**
 * The foot of the landing: the three ways on, then, small and readable, who Viky is not affiliated with and what ETS
 * asks at the bottom of a page that names the TOEFL (the founder, 5 Oct 2026).
 */
export function LandingFoot() {
  const way = "inline-flex min-h-[var(--tap-target)] min-w-[var(--tap-target)] items-center underline";
  return (
    <footer className="flex w-full flex-col items-center gap-[var(--space-sm)] px-[var(--page-margin)] pt-[var(--space-xl)] pb-[calc(2*var(--space-xl))] text-center">
      <p className={`${HELP} flex flex-wrap justify-center gap-x-[var(--space-lg)]`}>
        <Link href="/what-viky-can-check" className={way}>
          {CATALOGUE.title}
        </Link>
        <Link href="/privacy" className={way}>
          {ME.privacy}
        </Link>
        <Link href="/legal" className={way}>
          {ME.legal}
        </Link>
      </p>
      <p data-not-affiliated="" className={`${HELP} max-w-[44em]`}>
        {W.notAffiliated}
      </p>
      <MarkNotice className="max-w-[44em]" />
    </footer>
  );
}
