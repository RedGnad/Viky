import Link from "next/link";
import { Character } from "@/app/kit/Character";
import { Gaze, Reveal } from "@/app/kit/Motion";
import { Shell } from "@/app/kit/Shell";
import { BODY, DISPLAY, HELP, INLINE_BUTTON, PRIMARY_BUTTON, PROSE, TITLE } from "@/app/components/ui";
import { HOME, ME } from "@/src/sentences";
import { FROM_MAMAN, labHref } from "../example";
import { LAB } from "../words";
import { ExampleGiftCard } from "./parts";

/**
 * The page without an account (brief, section 7): one action in its body, "Offer a gift", and the door, "Sign in or
 * create account", a small outlined button in the header opposite the mark, visible without competing with the action.
 * It shows the product rather than describing it: the gift character, and a real gift card labelled as an example.
 */
export function Welcome({ look }: Readonly<{ look: string }>) {
  return (
    <Shell
      kind="destination"
      active="home"
      action={
        <Link href={labHref(look, "home")} className={INLINE_BUTTON}>
          {LAB.signInOrCreate}
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
          <Link href={labHref(look, "amount")} className={PRIMARY_BUTTON}>
            {HOME.offer}
          </Link>
        </div>
      </section>
      <Reveal>
        <ExampleGiftCard gift={FROM_MAMAN.gift} days={FROM_MAMAN.days} example />
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
