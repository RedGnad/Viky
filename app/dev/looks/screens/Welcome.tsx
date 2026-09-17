"use client";
import Link from "next/link";
import { Character } from "@/app/kit/Character";
import { useMinute } from "@/app/kit/clock";
import { exampleGift } from "@/app/kit/example-gift";
import { GiftCard } from "@/app/kit/GiftCard";
import { Gaze, Reveal } from "@/app/kit/Motion";
import { Shell } from "@/app/kit/Shell";
import { BODY, DISPLAY, HELP, INLINE_BUTTON, PRIMARY_BUTTON, PROSE, TITLE } from "@/app/components/ui";
import { DOOR, HOME, ME } from "@/src/sentences";
import { labHref } from "../example";

/**
 * The page without an account (brief, section 7): one action in its body, "Offer a gift", and the door, "Sign in or
 * create account", a small outlined button in the header opposite the mark, visible without competing with the action.
 * It shows the product rather than describing it: the gift character, and the product's one example gift card.
 *
 * The door is a link here and the product's own button there (app/kit/SignInDoor.tsx), because a passkey has nothing to
 * open in a laboratory; it carries the product's word for it and looks exactly the same.
 */
export function Welcome() {
  const nowMs = useMinute();
  return (
    <Shell
      kind="destination"
      active="home"
      action={
        <Link href={labHref("home")} className={INLINE_BUTTON}>
          {DOOR.open}
        </Link>
      }
    >
      <section className="flex flex-col gap-[var(--space-lg)]">
        <Gaze>
          <Character state="gift" className="h-auto w-[104px] [@media(min-width:840px)]:w-[136px]" />
        </Gaze>
        <h1 className={DISPLAY}>{HOME.promise}</h1>
        <p className={PROSE}>{HOME.promiseBody}</p>
        <div className="flex w-full max-w-[420px] flex-col pt-[var(--space-sm)]">
          <Link href={labHref("amount")} className={PRIMARY_BUTTON}>
            {HOME.offer}
          </Link>
        </div>
      </section>
      <Reveal>
        <GiftCard gift={exampleGift(nowMs)} example />
      </Reveal>
      <Reveal className="flex flex-col gap-[var(--space-md)]">
        <h2 className={TITLE}>{HOME.howItWorks}</h2>
        <ol className="flex list-decimal flex-col gap-[var(--space-sm)] pl-[var(--space-lg)]">
          {HOME.steps.map((step) => (
            <li key={step} className={BODY}>
              {step}
            </li>
          ))}
        </ol>
      </Reveal>
      <p className={`${HELP} flex flex-wrap gap-x-[var(--space-lg)]`}>
        <Link href="/privacy" className="inline-flex min-h-[var(--tap-target)] min-w-[var(--tap-target)] items-center underline">
          {ME.privacy}
        </Link>
        <Link href="/legal" className="inline-flex min-h-[var(--tap-target)] min-w-[var(--tap-target)] items-center underline">
          {ME.legal}
        </Link>
      </p>
    </Shell>
  );
}
