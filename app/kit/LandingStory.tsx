"use client";
import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { DUOLINGO_DAILY } from "@/src/conditions";
import { CATALOGUE, HOME, LANDING_STORY as W } from "@/src/sentences";
import { BODY, CARD, PRIMARY_BUTTON, SAY } from "../components/ui";
import { Character, type CharacterState } from "./Character";
import { Figure, Scene } from "./Figure";
import { Install, isStandalone } from "./Install";
import { Reveal } from "./Motion";
import { goToTheCard } from "./WayToTheCard";

/**
 * What the landing says under the card (the founder, 27 Sep 2026, D282: more under it, like the reference page he gave,
 * in the art direction we have). That page's order, transposed: a few promises, each a short title, two lines and a drawing,
 * alternating sides on a large screen and stacked on a phone; then the phone; then one last way to the card. The
 * drawings are the rig's own cast (Figure, Scene, the days' characters), in the halftone every figure wears (D262).
 * Nothing loops: a block rises once as it first scrolls into view (`Reveal`), and not at all with reduced motion.
 */
const DAYS: readonly CharacterState[] = ["earned", "earned", "returned", "earned"];

const ART: Readonly<Record<(typeof W.blocks)[number]["key"], ReactNode>> = {
  // The funder's arm on the recipient's shoulder: the Gifts scene.
  theirs: <Scene which="gifts" className="h-auto w-[220px] [@media(min-width:1024px)]:w-[320px]" />,
  // Reading, the book held open: the drawing of the catalogue's "learn" (D268).
  checked: <Figure id="story-checked" arms="read" props={["book"]} mouth="soft" gaze={{ x: 0, y: 0.7 }} halftone className="h-auto w-[150px] [@media(min-width:1024px)]:w-[210px]" />,
  // Three days kept and one gone back, as a gift's own row draws them.
  back: (
    <span className="flex items-end">
      {DAYS.map((day, index) => (
        <span key={index} className="flex w-[64px] flex-none items-end [@media(min-width:1024px)]:w-[88px]">
          <Character state={day} standing={false} drawn="inline" className="h-auto w-full" />
        </span>
      ))}
    </span>
  ),
  // Behind sunglasses, arms crossed: the Me scene, the account's own.
  face: <Figure id="story-face" eyes="shades" mouth="grin" arms="crossed" halftone className="h-auto w-[150px] [@media(min-width:1024px)]:w-[210px]" />,
};

const never = () => () => {};
const serverFalse = () => false;

function Block({ title, body, art, flip, children }: Readonly<{ title: string; body: string; art: ReactNode; flip: boolean; children?: ReactNode }>) {
  return (
    <Reveal>
      <section className={`flex flex-col items-center gap-[var(--space-lg)] text-center [@media(min-width:1024px)]:flex-row [@media(min-width:1024px)]:gap-[var(--space-xl)] [@media(min-width:1024px)]:text-left ${flip ? "[@media(min-width:1024px)]:flex-row-reverse" : ""}`}>
        <div className="flex max-w-[440px] flex-col gap-[var(--space-sm)] [@media(min-width:1024px)]:flex-1">
          <h2 className={`${SAY} [text-wrap:balance]`}>{title}</h2>
          <p className={`${BODY} text-[var(--muted)]`}>{body}</p>
          {children}
        </div>
        <div aria-hidden className="flex items-end justify-center [@media(min-width:1024px)]:min-h-[140px] [@media(min-width:1024px)]:flex-1">
          {art}
        </div>
      </section>
    </Reveal>
  );
}

export function LandingStory() {
  const standalone = useSyncExternalStore(never, isStandalone, serverFalse);
  return (
    <div data-landing-story className="flex w-full max-w-[880px] flex-col gap-[calc(2*var(--space-xl))] self-center py-[var(--space-xl)]">
      {W.blocks.map((block, index) => (
        <Block key={block.key} title={block.title} body={typeof block.body === "function" ? block.body(DUOLINGO_DAILY.source) : block.body} art={ART[block.key]} flip={index % 2 === 1}>
          {block.key === "checked" ? (
            <Link href="/what-viky-can-check" className={`${BODY} inline-flex min-h-[var(--tap-target)] items-center self-center underline [@media(min-width:1024px)]:self-start`}>
              {CATALOGUE.title}
            </Link>
          ) : null}
        </Block>
      ))}
      {/* The phone, in a card of its own, as the reference page gives its apps a band: only where Viky is not already installed. */}
      {standalone ? null : (
        <Reveal>
          <section className={`${CARD} flex flex-col items-center gap-[var(--space-lg)] text-center [@media(min-width:1024px)]:flex-row [@media(min-width:1024px)]:text-left`}>
            <Figure id="story-phone" arms="wave" mouth="grin" halftone className="h-auto w-[110px] flex-none" />
            <div className="flex w-full flex-col gap-[var(--space-sm)]">
              <h2 className={`${SAY} [text-wrap:balance]`}>{W.phone.title}</h2>
              <p className={`${BODY} text-[var(--muted)]`}>{W.phone.body}</p>
              <Install />
            </div>
          </section>
        </Reveal>
      )}
      {/* One last way to the card, the page's one accent again, under the runner. */}
      <Reveal>
        <section className="flex flex-col items-center gap-[var(--space-lg)] text-center">
          <Figure id="story-last" arms="run" legs="run" lean={-8} mouth="grin" props={["speed"]} halftone className="h-auto w-[130px]" />
          <h2 className={`${SAY} [text-wrap:balance]`}>{W.last.title}</h2>
          <a href="#offer" className={`${PRIMARY_BUTTON} w-auto! px-[var(--space-xl)] text-center no-underline`} onClick={goToTheCard}>
            {HOME.offer}
          </a>
        </section>
      </Reveal>
    </div>
  );
}
