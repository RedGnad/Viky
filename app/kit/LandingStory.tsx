"use client";
import Link from "next/link";
import { Fragment, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { EASING, MOTION } from "@/src/design-tokens";
import { springEasing } from "@/src/motion";
import { inRows, readByName } from "@/src/landing-read";
import { MOVES, POSTERS_READY, POSTERS_STILL } from "@/src/moves";
import { CATALOGUE, HOME, LANDING_STORY as W, ME } from "@/src/sentences";
import { BODY, CARD, HELP, HERO, PRIMARY_BUTTON, SAY } from "../components/ui";
import { blinkOnce, blinksNowAndThen, noteBlink } from "./blink-clock";
import { Character, type CharacterState } from "./Character";
import { ConditionIcon } from "./ConditionIcon";
import { FAMILY_FIGURES } from "./FamilyArt";
import { FaceIcon, Figure, Scene } from "./Figure";
import { Install, isStandalone } from "./Install";
import { MarkNotice } from "./MarkNotice";
import { reduced } from "./Motion";
import { CARD_NOTE, goToTheCard } from "./WayToTheCard";

/**
 * What the landing says under the card: five posters, the phone, and one last way to the card (the founder, 5 Oct
 * 2026, validated on a living mockup; it replaces D282's four blocks with a drawing beside each. Second pass the same
 * day, on a second mockup).
 *
 * A poster is a title in the hero's own size, short lines under it, and nothing drawn beside: the card appears once
 * on the page, at the top, and nothing of it is drawn again here. A character is held in each title, tied to the word
 * before it so it never starts a line. The grounds alternate, the page's, the card's paper, the other appearance's
 * ground, the paper again, the page's again, and a band that changes ground rises over the one before with round
 * shoulders, like a sheet. Under "Checked, not claimed." what Viky reads goes by, by name, in rows with no first name
 * and no last one.
 *
 * The first image is the starting state (the rule of 23 Sep 2026): where movement is welcome and a script runs, the
 * document says so in its head (`src/moves.ts`) and the stylesheet draws every part of a poster invisible from the
 * first image. Each poster then plays once, when its title reaches four fifths of the screen (`MOTION.poster`), and
 * each character has an act tied to the scroll, played backwards when the page is scrolled back. Without a script, or
 * where less movement is asked for, everything is there and nothing moves; and posters whose script does not come are
 * shown, still.
 */
type Key = (typeof W.blocks)[number]["key"];
/** A character's act, tied to the scroll (`MOTION.poster.acts`). */
type Act = keyof typeof MOTION.poster.acts & ("roll" | "hop" | "back" | "shades");
/** How far the day earned has turned, which the scroll sets and the stylesheet turns it by (app/globals.css). */
const TURN = "--poster-turn";

/**
 * The character each poster holds, and its act (the founder, 9 Oct 2026, on a mockup). Three are days: the one earned,
 * the one missed, which comes back, and today, which hops at the yes. What is checked holds the hero reading its book,
 * the figure of the family that learns, which lands in its word like the others and has no act of the scroll: it
 * reads its book by itself while it is on the screen, and blinks now and then as the hero does (the founder, 10 Oct
 * 2026; `useLandingAlive`). The fifth is the one who wears sunglasses on Me.
 */
const HELD: Readonly<Record<Key, Readonly<{ state: CharacterState | "book" | "shades"; act?: Act }>>> = {
  theirs: { state: "earned", act: "roll" },
  checked: { state: "book" },
  back: { state: "toCome", act: "back" },
  yes: { state: "today", act: "hop" },
  key: { state: "shades", act: "shades" },
};
/** The box a held character takes in its title, where it is not a day's (app/globals.css). */
const BOX: Readonly<Record<string, string>> = { book: " poster-character-book", shades: " poster-character-wide" };

/** The ground of each poster, and what it rises over. */
const GROUND: Readonly<Record<Key, Readonly<{ band: string; under: string }>>> = {
  theirs: { band: "poster-band-ground", under: "" },
  checked: { band: "on-paper poster-band-rises", under: "" },
  back: { band: "poster-band-other poster-band-rises", under: "poster-under-paper" },
  yes: { band: "on-paper poster-band-rises", under: "poster-under-other" },
  key: { band: "poster-band-ground poster-band-rises", under: "poster-under-paper" },
};

/**
 * How the names go by: the tone and the lean of each, in turn. The raised paper, the tonal lavender, and a quarter of
 * the first and of the second character's colour, never the sun, which is the action's; three degrees at most.
 */
export const PILL_TONES: readonly (1 | 2 | 3 | 4)[] = [1, 4, 2, 3, 1, 2, 4, 3, 1, 2, 3];
export const PILL_TILTS: readonly number[] = [-2.5, 2, -1.5, 3, -2, 1.5, -3, 2.5, -1.5, 2, -2.5];
/** Each row laid end to end as many times as it takes to run past both edges of any screen, drift included. */
const SETS = [0, 1, 2, 3];
/** Two rows where the window is wide, three on a phone: the stylesheet shows one of the two. */
const ROWS = [
  { window: "wide", rows: 2 },
  { window: "narrow", rows: 3 },
] as const;

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

/**
 * A character in a title: no floor under it, taller than the letters. The one in sunglasses is the head of Me's
 * figure, and the one with the book is the chooser's, whole. The day that rolls is written into the page, since a
 * part of it turns and a named drawing's parts cannot be reached (D206).
 */
/** A drawing of the landing that blinks now and then, by the one rule (app/kit/blink-clock.ts). */
const BLINKS = "data-blinks";
/** The drawing that reads its book (`reads`, below). */
const READS = "data-reads";
/** The app's icon, and what it wears while it waits under the screen for its card to enter (app/globals.css). */
const ICON = 'svg[data-character="icon"]';
const ARRIVES = "data-arrives";

function Held({ poster }: Readonly<{ poster: Key }>) {
  const { state, act } = HELD[poster];
  return (
    <span data-ch={act === "back" ? "back" : "lands"} {...(act ? { "data-act": act } : {})} {...(state === "book" ? { [BLINKS]: "", [READS]: "" } : {})} aria-hidden className={`poster-character${BOX[state] ?? ""}`}>
      {state === "shades" ? (
        <Figure id="story-key" limbs={false} eyes="shades" mouth="grin" halftone />
      ) : state === "book" ? (
        <Figure id="story-book" halftone {...FAMILY_FIGURES.learn} />
      ) : (
        <Character state={state} standing={false} drawn={act === "roll" ? "inline" : "referenced"} className="block h-full w-full" />
      )}
    </span>
  );
}

/**
 * What Viky reads, by name (`src/landing-read.ts`): the chooser's own lines, each a pill with its pictogram. Drawn
 * twice, in two rows and in three, and the stylesheet shows the one the window has room for. In the one shown, one set
 * of names is read by a screen reader, as a list; the copies that make the rows endless are hidden from it.
 */
function ReadByName() {
  const all = readByName().map((line, index) => ({ ...line, tone: PILL_TONES[index % PILL_TONES.length], tilt: PILL_TILTS[index % PILL_TILTS.length] }));
  return (
    <div data-strip="" className="pill-strip">
      {ROWS.map(({ window, rows }) => (
        <div key={window} className={`pill-rows pill-rows-${window}`} role="list" aria-label={W.read}>
          {inRows(all, rows).map((row, at) => (
            <div key={at} className="pill-row" role="presentation">
              <div data-pills={at % 2 === 0 ? "one-way" : "the-other"} className="pills" role="presentation">
                {SETS.map((set) =>
                  row.map((pill) => (
                    <span
                      key={`${set}-${pill.id}`}
                      {...(set === 0 ? { role: "listitem" } : { "aria-hidden": true })}
                      className={`read-pill read-pill-${pill.tone}`}
                      style={{ transform: `rotate(${pill.tilt}deg)` }}
                    >
                      <ConditionIcon icon={pill.icon} />
                      {pill.name}
                    </span>
                  )),
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
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
          // The last poster's figures rise first, from their feet, and the words wait for them.
          if (figure) play.fromTo(figure, { opacity: 0, y: P.figure.rise, scaleY: P.figure.fromHeight }, { opacity: 1, y: 0, scaleY: 1, duration: seconds(P.figure.ms), ease: P.figure.ease, transformOrigin: P.figure.origin }, 0);
          // Each word rises to its place, one after the other; its opacity never overshoots, its position may.
          play
            .to(words, { opacity: 1, duration: seconds(P.word.fadeMs), stagger: seconds(P.word.staggerMs), ease: P.word.fadeEase }, figure ? seconds(P.figure.wordsAfterMs) : 0)
            .fromTo(words, { y: P.word.from, rotate: P.word.fromTurn }, { y: 0, rotate: 0, duration: seconds(P.word.riseMs), stagger: seconds(P.word.staggerMs), ease: P.word.ease }, "<");
          for (const one of band.querySelectorAll<HTMLElement>("[data-ch]")) {
            if (one.dataset.ch === "back") {
              // The day that was missed does not land: its place is there from the start, and the scroll brings it.
              play.set(one, { opacity: 1 }, 0);
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
        // Tied to the scroll and to nothing else: the rows of names drift, each the other way from the one above it.
        for (const pills of story.querySelectorAll<HTMLElement>("[data-pills]")) {
          const from = pills.dataset.pills === "one-way" ? P.drift.px : -P.drift.px;
          gsap.fromTo(pills, { x: from }, { x: -from, ease: "none", scrollTrigger: { trigger: pills.closest("[data-strip]"), start: "top bottom", end: "bottom top", scrub: P.drift.catchUpS } });
        }
        // Each character's act, tied to the scroll and to nothing else, from the moment its title comes up from the
        // bottom of the screen until it leaves by the top. Scrolling back plays it backwards.
        const A = P.acts;
        const whole = (held: Element) => ({ trigger: held, start: "top bottom", end: "bottom top", scrub: A.catchUpS });
        for (const held of story.querySelectorAll<HTMLElement>("[data-ch][data-act]")) {
          const drawn = held.querySelector("svg");
          if (!drawn) continue;
          const act = held.dataset.act;
          if (act === "roll") {
            // The day earned rolls across its place. The scroll moves the drawing and says how far it has turned; the
            // stylesheet turns its body and its face by that much, and its highlight, drawn outside what turns, only
            // follows the way across: a highlight is where the light is.
            gsap.fromTo(drawn, { x: `-${A.roll.shift}`, [TURN]: `${-A.roll.turn}deg` }, { x: A.roll.shift, [TURN]: `${A.roll.turn}deg`, ease: "none", scrollTrigger: whole(held) });
          } else if (act === "hop") {
            // Today hops, squashing where it lands.
            const hops = gsap.timeline({ scrollTrigger: whole(held), defaults: { transformOrigin: A.hop.origin } });
            for (let hop = 0; hop < A.hop.times; hop += 1) {
              hops
                .to(drawn, { y: A.hop.height, scaleY: A.hop.stretch.y, scaleX: A.hop.stretch.x, rotate: hop % 2 ? A.hop.turn : -A.hop.turn, ease: A.hop.upEase, duration: A.hop.upS })
                .to(drawn, { y: 0, scaleY: A.hop.squash.y, scaleX: A.hop.squash.x, rotate: 0, ease: A.hop.downEase, duration: A.hop.downS })
                .to(drawn, { scaleY: 1, scaleX: 1, ease: A.hop.settleEase, duration: A.hop.settleS });
            }
          } else if (act === "back") {
            // The day that was missed comes back from the far side as the page is scrolled, and is home by mid screen.
            gsap.fromTo(
              drawn,
              { x: A.back.from, rotate: A.back.fromTurn, opacity: 0 },
              { x: 0, rotate: 0, opacity: 1, ease: A.back.ease, transformOrigin: A.back.origin, scrollTrigger: { trigger: held, start: `top ${A.back.startAt * 100}%`, end: `top ${A.back.homeAt * 100}%`, scrub: A.catchUpS } },
            );
          } else if (act === "shades") {
            // The sunglasses come down onto the face as the title reaches mid screen, and the head tilts as it goes by.
            const shades = drawn.querySelector('[data-prop="shades"]');
            if (shades) {
              gsap.fromTo(
                shades,
                // The drawing turns the sunglasses from their own box, and the library writes its turn for the drawing's
                // own corner: for as long as it holds them, their box is the drawing's. Left as it was, they came down
                // from the side, a third of the way (measured 9 Oct 2026).
                { y: A.shades.drop, rotate: A.shades.fromTurn, opacity: 0, transformBox: "view-box" },
                { y: 0, rotate: 0, opacity: 1, ease: A.shades.ease, transformOrigin: A.shades.origin, scrollTrigger: { trigger: held, start: `top ${A.shades.startAt * 100}%`, end: `top ${A.shades.onAt * 100}%`, scrub: A.catchUpS } },
              );
            }
            gsap.fromTo(drawn, { rotate: -A.shades.tilt }, { rotate: A.shades.tilt, ease: "none", transformOrigin: A.shades.tiltOrigin, scrollTrigger: whole(held) });
          }
        }
      }, story);
      story.setAttribute(POSTERS_READY, "playing");
      // The page's own typefaces change where a title stands: the triggers are measured again once they are in. The
      // safe way, which waits for a scroll under way to end: measuring puts the page at its top and back in one go,
      // and done at once it cut a smooth scroll short where it stood (the way to the card, pressed as the page loaded).
      void document.fonts?.ready.then(() => live && ScrollTrigger.refresh(true));
    }, still);
    return () => {
      live = false;
      window.clearTimeout(giveUp);
      played?.revert();
      story.removeAttribute(POSTERS_READY);
    };
  }, [root]);
}

/**
 * The icon lands (the founder's mockup of 10 Oct 2026; `MOTION.icon`): its size on the spring and its opacity without
 * overshoot, the eyes and the mouth a moment after the body, one blink, then a glance at its button, wherever the
 * button stands, below it on a phone and beside it on a computer. Everything is started at once, each part held at
 * its first image until its own moment, so nothing here waits on a clock.
 */
function iconArrives(icon: SVGSVGElement): Animation[] {
  const I = MOTION.icon;
  const pop = springEasing(I.spring);
  // Where its button is, measured before anything moves.
  const button = icon.parentElement?.querySelector("button, a");
  const from = icon.getBoundingClientRect();
  const to = button?.getBoundingClientRect();
  const running: Animation[] = [
    icon.animate([{ transform: `scale(${I.fromScale})` }, { transform: "scale(1)" }], { duration: pop.durationMs, easing: pop.easing, fill: "backwards" }),
    icon.animate([{ opacity: 0 }, { opacity: 1 }], { duration: I.fadeMs, easing: EASING.standard, fill: "backwards" }),
  ];
  // The face has weight: the eyes and the mouth, never the group that holds them, which carries the face's own size.
  for (const name of ["eyes", "mouth"]) {
    const part = icon.querySelector(`[data-part="${name}"]`);
    if (part) running.push(part.animate([{ transform: `translateY(${I.faceDrop}px)` }, { transform: "translateY(0px)" }], { duration: pop.durationMs, delay: I.faceAfterMs, easing: pop.easing, fill: "backwards" }));
  }
  // One blink, the hero's, and none by the common rule sooner than its shortest gap after it.
  noteBlink(performance.now() + I.blinkAtMs);
  blinkOnce(icon, I.blinkAtMs);
  const eyes = icon.querySelector('[data-part="gaze"]');
  if (to && eyes) {
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const far = Math.hypot(dx, dy) || 1;
    const there = `translate(${Math.round((dx / far) * I.glance.by * 100) / 100}px, ${Math.round((dy / far) * I.glance.by * 100) / 100}px)`;
    running.push(
      eyes.animate(
        [
          { transform: "translate(0px, 0px)", easing: EASING.emphasizedDecelerate },
          { transform: there, offset: I.glance.thereAt },
          { transform: there, offset: I.glance.backFrom, easing: EASING.standard },
          { transform: "translate(0px, 0px)" },
        ],
        { duration: I.glance.durationMs, delay: I.glanceAtMs },
      ),
    );
  }
  return running;
}

const twoPlaces = (value: number) => Math.round(value * 100) / 100;

/**
 * The one who reads its book reads it, calmly (the founder, 10 Oct 2026, on the page itself; `MOTION.reading`). Its
 * eyes go down to the book, drift along a line, come back gently a little lower, a few lines so, then go up to whoever
 * reads the landing and stay there before they start again. The mouth follows a little. The book is not touched: its
 * lines stay as they are drawn. The first turn read the left page then the right and darkened each line as the eyes
 * passed: too fast, too wide, and the lines looked cheap.
 *
 * One turn of it is written whole, as the keyframes of two animations that repeat: nothing here waits on a clock. It
 * plays only while the drawing is on the screen and the tab in front, as the blink does.
 */
function reads(held: Element): () => void {
  const drawn = held.querySelector("svg");
  const eyes = drawn?.querySelector('[data-part="gaze"]');
  const mouth = drawn?.querySelector('[data-part="mouth"]');
  if (!eyes) return () => {};
  const R = MOTION.reading;
  const [left, right] = R.across;
  // One turn: where the eyes go, and in how long. Down to the first line, along it, back to the start of the next.
  const steps: Array<Readonly<{ ms: number; to: readonly [number, number] }>> = [];
  for (let line = 0; line < R.lines; line += 1) {
    const down = R.down + line * R.perLine;
    steps.push({ ms: line === 0 ? R.downMs : R.backMs, to: [left, down] }, { ms: R.lineMs, to: [right, down] });
  }
  steps.push({ ms: R.upMs, to: [0, 0] }, { ms: R.heldMs, to: [0, 0] });
  const turnMs = steps.reduce((sum, step) => sum + step.ms, 0);
  const at = (x: number, y: number) => `translate(${twoPlaces(x)}px, ${twoPlaces(y)}px)`;
  const looking: Keyframe[] = [];
  const following: Keyframe[] = [];
  let time = 0;
  let where: readonly [number, number] = [0, 0];
  for (const step of steps) {
    looking.push({ offset: time / turnMs, transform: at(where[0], where[1]), easing: R.easing });
    following.push({ offset: time / turnMs, transform: at(where[0] * R.mouth, where[1] * R.mouth), easing: R.easing });
    time += step.ms;
    where = step.to;
  }
  looking.push({ offset: 1, transform: at(0, 0) });
  following.push({ offset: 1, transform: at(0, 0) });
  const turning = { duration: turnMs, iterations: Number.POSITIVE_INFINITY };

  // The turn exists only in front of somebody. Off the screen there is no animation of it on the page: a page that
  // waits for every movement to end must find none here. It starts again from the eyes going down when the drawing
  // comes back, and is held where it is while the tab is behind another.
  let running: Animation[] = [];
  const begin = () => {
    if (running.length > 0) return;
    running = [eyes.animate(looking, turning), ...(mouth ? [mouth.animate(following, turning)] : [])];
  };
  const end = () => {
    running.forEach((one) => one.cancel());
    running = [];
  };
  let seen = false;
  const follow = () => {
    if (!seen) return end();
    begin();
    running.forEach((one) => (document.hidden ? one.pause() : one.play()));
  };
  const watch = new IntersectionObserver((entries) => {
    seen = entries[entries.length - 1].isIntersecting;
    follow();
  });
  watch.observe(held);
  document.addEventListener("visibilitychange", follow);
  return () => {
    watch.disconnect();
    document.removeEventListener("visibilitychange", follow);
    end();
  };
}

/**
 * What lives on the landing outside the scroll (the founder, 10 Oct 2026). The one who reads its book reads it, and
 * blinks now and then, by the one rule every drawing blinks by. And the app's icon arrives once, when its card enters the screen,
 * tied to no position of the scroll: under the screen when the page is drawn, it waits there at its starting state
 * (the rule of 23 Sep 2026: the first image is the starting state), lands as it comes in, and blinks now and then
 * afterwards. In view when the page is drawn, or under reduced motion, it is simply there.
 */
function useLandingAlive(root: { readonly current: HTMLElement | null }): void {
  // Before the browser paints, so the icon is never seen whole and then gone.
  useLayoutEffect(() => {
    const icon = root.current?.querySelector<SVGSVGElement>(ICON);
    if (!icon || reduced() || icon.getBoundingClientRect().top < window.innerHeight) return;
    icon.setAttribute(ARRIVES, "");
    return () => icon.removeAttribute(ARRIVES);
  }, [root]);
  useEffect(() => {
    const story = root.current;
    if (!story || reduced()) return;
    const stops = [...story.querySelectorAll(`[${BLINKS}]`)].map((drawing) => blinksNowAndThen(drawing));
    for (const drawing of story.querySelectorAll(`[${READS}]`)) stops.push(reads(drawing));
    const icon = story.querySelector<SVGSVGElement>(ICON);
    let running: Animation[] = [];
    let watch: IntersectionObserver | undefined;
    if (icon && !icon.hasAttribute(ARRIVES)) stops.push(blinksNowAndThen(icon));
    else if (icon) {
      watch = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          watch?.disconnect();
          running = iconArrives(icon);
          icon.removeAttribute(ARRIVES);
          stops.push(blinksNowAndThen(icon, MOTION.icon.restMs));
        },
        { threshold: MOTION.icon.inView },
      );
      watch.observe(icon);
    }
    return () => {
      watch?.disconnect();
      running.forEach((animation) => animation.cancel());
      stops.forEach((stop) => stop());
    };
  }, [root]);
}

export function LandingStory() {
  const standalone = useSyncExternalStore(never, isStandalone, serverFalse);
  const story = useRef<HTMLElement>(null);
  usePosters(story);
  useLandingAlive(story);
  return (
    <section ref={story} data-landing-story="" aria-label={W.region} className="w-full">
      {W.blocks.map((block, index) => (
        <div key={block.key} className={`poster-under ${GROUND[block.key].under}`}>
          <section data-band={block.key} className={`poster-band ${GROUND[block.key].band}`}>
            <Poster title={block.title} after={block.characterAfter} character={<Held poster={block.key} />} firstUnderTheCard={index === 0} />
            {/* Short lines, each one fact in a block of its own: a list to scan, never a paragraph. */}
            {block.lines.map((line, at) => (
              <p key={line} data-line="" className={`poster-line${at === 0 ? " poster-line-first" : ""}`}>
                {line}
              </p>
            ))}
            {block.key === "checked" ? <ReadByName /> : null}
          </section>
        </div>
      ))}
      {/* The phone keeps its card and its button, on the page's ground: only where Viky is not already installed. */}
      {standalone ? null : (
        <section className="poster-band poster-band-ground poster-band-follows">
          <div className={`${CARD} mx-auto flex max-w-[720px] flex-col items-center gap-[var(--space-lg)] text-center [@media(min-width:1024px)]:flex-row [@media(min-width:1024px)]:text-left`}>
            {/* The app's icon, as it stands on a home screen, where the figure waved (the founder, 9 Oct 2026). */}
            <FaceIcon id="story-phone" className="face-icon h-auto w-[110px] flex-none" />
            <div className="flex w-full flex-col gap-[var(--space-sm)]">
              <h2 className={`${SAY} [text-wrap:balance]`}>{W.phone.title}</h2>
              <p className={`${BODY} text-[var(--muted)]`}>{W.phone.body}</p>
              <Install />
            </div>
          </div>
        </section>
      )}
      {/* One last way to the card, the page's one accent again, under the two of Gifts, one with an arm on the other's
          shoulder (the founder, 5 Oct 2026: they stand where a runner and its speed lines did). */}
      <section data-band="last" className="poster-band poster-band-ground poster-band-last">
        <div data-figure="" className="mx-auto mb-[var(--space-xl)] w-[240px] [@media(min-width:600px)]:w-[350px]">
          <Scene which="gifts" className="h-auto w-full" />
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
