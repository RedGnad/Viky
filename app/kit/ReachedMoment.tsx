"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useAccount } from "@/src/account/provider";
import { loadReachedSeen, markReachedSeen, type GiftSummary } from "@/src/client/gift";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { useReaderZone } from "@/src/client/reader-zone";
import { conditionById } from "@/src/conditions";
import { MOTION, SPRING } from "@/src/design-tokens";
import type { MilestoneStatus } from "@/src/milestone-view";
import { dateInWords } from "@/src/moments";
import { springEasing } from "@/src/motion";
import { REACHED_MOMENT as W } from "@/src/sentences";
import { AMOUNT_IN_TITLE, BODY, CARD_LABEL, HERO, PRIMARY_BUTTON, SMALL_BUTTON } from "../components/ui";
import { LedFigure } from "./LedAmount";
import { reduced } from "./Motion";

/**
 * The moment a gift is reached (the founder, 29 Sep 2026): the climax of the product, which the first outside tester
 * reached and did not see. It is played over whatever screen the person arrives on, once for the person it is for and
 * once for the funder, kept on the account rather than on the device (src/reached-seen-store.ts), and only after the
 * page has finished loading, so nothing else moves while it plays. Several reached gifts play one after another.
 *
 * The whole screen, on the page's own ground: the amount turns from "in your name" to "yours", the confetti falls
 * across the screen for about three seconds, and one action stands under it: seeing the gift. For the funder, "They
 * did it" and what that means for the money. Taking the money was the action of the person it is for until 4 Oct
 * 2026: Home counts it in "Yours" and whatever it is used for takes it from the gift first, so the gesture was a
 * second way to do the same thing. A device that asks for less motion gets the same
 * screen, still: the amount already "yours", no confetti. No character and no other movement here until the animated
 * mockup the founder is having made replaces this one (29 Sep 2026).
 *
 * The confetti is the characters' three shapes in the look's colours (decision B), never at payment.
 */

export type ReachedGift = Readonly<{
  giftId: string;
  role: "funder" | "recipient";
  recipientName: string | null;
  funderName: string | null;
  /** The condition, in the register's own words. */
  what: string;
  /** The amount, in the coin's units, as a decimal string. */
  units: string;
  reachedAtMs: number | null;
}>;

/** A reached gift of Home's list, for one of its two people, or nothing. */
export function reachedOfSummary(gift: GiftSummary): ReachedGift | null {
  if (!gift.milestone?.reached || gift.role === "reader") return null;
  return reachedOfStatus(gift.milestone, gift.role, { recipientName: gift.recipientName, funderName: gift.funderName });
}

/** A reached milestone, from its status as the gift's page reads it. */
export function reachedOfStatus(status: MilestoneStatus, role: "funder" | "recipient", names: Readonly<{ recipientName: string | null; funderName: string | null }>): ReachedGift {
  return {
    giftId: status.giftId,
    role,
    recipientName: names.recipientName,
    funderName: names.funderName,
    what: conditionById(status.conditionId)?.name ?? "",
    units: status.amount,
    reachedAtMs: status.reachedAtMs,
  };
}

/** Whether the page has finished loading: its document, and the fonts the moment is set in. */
export function useLoaded(): boolean {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    const settle = () => {
      void document.fonts.ready.then(() => {
        if (live) requestAnimationFrame(() => live && setLoaded(true));
      });
    };
    if (document.readyState === "complete") settle();
    else window.addEventListener("load", settle, { once: true });
    return () => {
      live = false;
      window.removeEventListener("load", settle);
    };
  }, []);
  return loaded;
}

/**
 * The moments this screen owes, played one after another once the page has loaded. Each is written as seen on the
 * account the moment it is shown, so a reload, another tab or another device does not play it again.
 */
export function ReachedMoments({ gifts, here, onOpened }: Readonly<{ gifts: readonly ReachedGift[]; here?: OnItsPage; /** Told each time a moment is fully there over the screen. */ onOpened?: () => void }>) {
  const loaded = useLoaded();
  // Held once owed: the list read again after the first is written seen no longer carries it, and a moment playing
  // must not be taken off the screen by its own write.
  const [queue, setQueue] = useState<readonly ReachedGift[]>([]);
  const [done, setDone] = useState<readonly string[]>([]);
  const fresh = gifts.filter((gift) => !queue.some((held) => held.giftId === gift.giftId));
  if (fresh.length > 0) setQueue([...queue, ...fresh]);
  const now = loaded ? queue.find((gift) => !done.includes(gift.giftId)) : undefined;
  useEffect(() => {
    if (now) void markReachedSeen(now.giftId).catch(() => undefined);
  }, [now]);
  if (!now) return null;
  return <ReachedMoment key={now.giftId} gift={now} here={here} onOpened={onOpened} onClose={() => setDone((was) => [...was, now.giftId])} />;
}

/**
 * Whether the moment is played over the gift's own page. There, a link to the gift is a link to the page one is
 * already on: nothing closed the moment and two presses did nothing (the audit of 1 Oct 2026). So the action is a
 * button that closes the moment. Whatever replaces the animation keeps this: the gesture belongs to the page, not to
 * the drawing.
 */
export type OnItsPage = boolean;

/**
 * On the gift's own page: the moment, when this account arrives here before it has had it (from a notification, a
 * link), and "See it again", which replays it whenever asked and writes nothing.
 *
 * `held` is a gift reached while this page stood (the founder, 10 Oct 2026): its character lands first and the card
 * says it, and the moment opens once the page lets it, unchanged. Under the card the page is still as it was until the
 * moment covers it: `quiet` keeps "See it again" undrawn until then, and `onSettled` tells the page, once, that the
 * moment is fully there over it, or that none is owed to this account, so that nothing is waited for.
 */
export function ReachedOnItsPage({ gift, held = false, quiet = false, onSettled }: Readonly<{ gift: ReachedGift; held?: boolean; quiet?: boolean; onSettled?: () => void }>) {
  const [owed, setOwed] = useState(false);
  const [again, setAgain] = useState(false);
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  });
  useEffect(() => {
    let live = true;
    loadReachedSeen(gift.giftId)
      .then((answer) => {
        if (!live) return;
        if (!answer.seen) setOwed(true);
        else settled.current?.();
      })
      .catch(() => {
        if (live) settled.current?.();
      });
    return () => {
      live = false;
    };
  }, [gift.giftId]);
  return (
    <>
      <ReachedMoments gifts={owed && !held ? [gift] : []} here onOpened={() => settled.current?.()} />
      {quiet ? null : (
        <button type="button" onClick={() => setAgain(true)} className={`${SMALL_BUTTON} self-start`}>
          {W.seeItAgain}
        </button>
      )}
      {again ? <ReachedMoment gift={gift} here onClose={() => setAgain(false)} /> : null}
    </>
  );
}

const SHAPES = ["circle", "square", "triangle"] as const;
const COLOURS = ["var(--character-1)", "var(--character-2)", "var(--character-3)", "var(--accent)"] as const;

/** The confetti, falling across the whole screen from above it, each piece set off a little after the last. */
function rain(layer: HTMLElement): Animation[] {
  const { pieces, fallMs, spreadMs } = MOTION.moment;
  const width = layer.clientWidth;
  const height = layer.clientHeight;
  const animations: Animation[] = [];
  for (let index = 0; index < pieces; index += 1) {
    const piece = document.createElement("span");
    piece.className = `confetti-piece confetti-${SHAPES[index % SHAPES.length]}`;
    piece.style.background = COLOURS[index % COLOURS.length];
    // Spread evenly across the width, each a little off its place: no two alike, no clock in the pattern.
    const x = ((index + 0.5) / pieces) * width + (((index * 37) % 23) - 11);
    piece.style.left = `${x}px`;
    piece.style.top = "-16px";
    layer.appendChild(piece);
    const drift = ((index * 53) % 90) - 45;
    const turn = ((index * 71) % 540) - 270;
    const delay = ((index * 29) % pieces) / pieces * spreadMs;
    animations.push(
      piece.animate(
        [
          { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
          { transform: `translate(${drift / 2}px, ${height * 0.55}px) rotate(${turn / 2}deg)`, opacity: 1, offset: 0.6 },
          { transform: `translate(${drift}px, ${height + 32}px) rotate(${turn}deg)`, opacity: 0.2 },
        ],
        { duration: fallMs + ((index * 13) % 400), delay, easing: "cubic-bezier(0.3, 0, 0.8, 0.6)", fill: "backwards" },
      ),
    );
  }
  return animations;
}

export function ReachedMoment({ gift, here, onOpened, onClose }: Readonly<{ gift: ReachedGift; /** Set when the moment plays over the gift's own page. */ here?: OnItsPage; /** Told once the moment is fully there: what is under it can change unseen. */ onOpened?: () => void; onClose: () => void }>) {
  const { address } = useAccount();
  const money = useDisplayCurrency(address);
  const zone = useReaderZone();
  const dialog = useRef<HTMLDialogElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const amount = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  // Still, under reduced motion, the amount is already theirs; moving, it turns at `becomesAfterMs`. This screen is
  // only drawn in the browser, after the page has loaded or on a press, so the question can be asked as it is made.
  const [still] = useState(reduced);
  const opened = useRef(onOpened);
  useEffect(() => {
    opened.current = onOpened;
  });
  const [turned, setTurned] = useState(false);
  const became = still || turned;
  const recipient = gift.role === "recipient";
  const led = money.led(BigInt(gift.units));
  const when = gift.reachedAtMs ? dateInWords(gift.reachedAtMs, zone) : "";

  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    // Opening a modal focuses its first control, the close in the corner, which a ring then drew round: focus goes to
    // what is read first instead.
    title.current?.focus();
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (still) return;
    const { inMs, becomesAfterMs } = MOTION.moment;
    const spring = springEasing(SPRING.expressiveFastSpatial);
    const animations: Animation[] = [element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: inMs, easing: "ease-out" })];
    // Fully there once it has risen in: until then the page shows through it.
    animations[0].finished.then(() => opened.current?.()).catch(() => undefined);
    // The amount turns: it swells once on the expressive spring as its word changes from "in your name" to "yours".
    const turn = amount.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], {
      duration: spring.durationMs * 1.5,
      delay: becomesAfterMs,
      easing: spring.easing,
    });
    if (turn) animations.push(turn);
    // The word changes as the swell starts, on the animations' own clock: an empty one as long as the wait.
    const wait = element.animate([{}, {}], { duration: becomesAfterMs });
    animations.push(wait);
    wait.finished.then(() => setTurned(true)).catch(() => undefined);
    if (layer.current) animations.push(...rain(layer.current));
    const box = layer.current;
    return () => {
      animations.forEach((animation) => animation.cancel());
      box?.replaceChildren();
    };
  }, [still]);

  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      className="reached-moment"
      aria-labelledby="reached-title"
      onClose={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div ref={layer} aria-hidden className="reached-rain" />
      <button type="button" onClick={close} aria-label={W.close} className="reached-close">
        <span aria-hidden="true">&times;</span>
      </button>
      <div className="relative mx-auto flex min-h-full w-full max-w-[440px] flex-col items-center justify-center gap-[var(--space-md)] px-[var(--page-margin)] py-[var(--space-xl)] text-center">
        <p className={CARD_LABEL}>{recipient ? W.fromFunder(gift.funderName) : W.giftOf(gift.recipientName)}</p>
        <h1 ref={title} id="reached-title" tabIndex={-1} className={`${HERO} outline-none`}>
          {recipient ? W.youDidIt : W.theyDidIt}
        </h1>
        <p className={`${BODY} [text-wrap:balance]`}>{recipient ? (when ? W.reached(gift.what, when) : gift.what) : W.theyReached(gift.recipientName, when || "")}</p>
        {recipient ? null : <p className={`${BODY} [text-wrap:balance]`}>{W.theirsNow}</p>}
        <div ref={amount} className="flex flex-col items-center gap-[var(--space-xs)]">
          <LedFigure amount={led} className={`money-display ${AMOUNT_IN_TITLE} tracking-[-0.02em]`} style={{ "--amount-chars": led.lead.length } as CSSProperties} />
          <p className={CARD_LABEL} data-became={became ? "yes" : "no"}>
            {recipient ? (became ? W.yours : W.inYourName) : became ? W.theirs : W.inTheirName}
          </p>
        </div>
        <div className="mt-[var(--space-md)] w-full">
          {here ? (
            <button type="button" className={PRIMARY_BUTTON} onClick={close}>
              {W.seeTheGift}
            </button>
          ) : (
            <Link href={`/g/${gift.giftId}`} className={`${PRIMARY_BUTTON} block text-center no-underline`}>
              {W.seeTheGift}
            </Link>
          )}
        </div>
      </div>
    </dialog>
  );
}
