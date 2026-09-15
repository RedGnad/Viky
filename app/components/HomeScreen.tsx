"use client";
import Link from "next/link";
import { useAccount } from "@/src/account/provider";
import { Drop } from "./Drop";
import { Footer } from "./Footer";
import { MyGifts } from "./MyGifts";
import { Screen } from "./Screen";
import { YourMoney } from "./YourMoney";
import { CARD, HELP, MONEY, PRIMARY_BUTTON, PROSE, SECONDARY_BUTTON, TITLE } from "./ui";

/**
 * The one destination, in the shape that suits whoever is reading it and the screen they are on.
 *
 * Two rules from the research pull in opposite directions and both are right about a different person.
 * Somebody who already has gifts opens Viky to read a number, and 57 % of the time spent on a page is above
 * the fold with more than 42 % of it in the top fifth, so their money goes first. Somebody on a first visit
 * has no number to read: for them the top of the page was a passkey prompt for a product nobody had
 * described, which is what GOV.UK's start page pattern exists to prevent.
 *
 * And a first visit on a desktop is a landing page, not a phone screen stretched: the promise and the drop on
 * one side, the one action on the other, then how it works in three steps underneath.
 */
const STEPS = [
  { n: "1", what: "You choose who it is for, how much, and for how long." },
  { n: "2", what: "They connect Duolingo. Each day they reach the goal, that day's share becomes theirs." },
  { n: "3", what: "Each day they miss comes back to you, by itself. Nobody profits from anyone failing." },
] as const;

export function HomeScreen() {
  const { address } = useAccount();

  if (!address) {
    return (
      <Screen layout="destination">
        <div className="grid items-center gap-[var(--space-xl)] [@media(min-width:840px)]:grid-cols-[1.1fr_1fr]">
          <section className="flex flex-col gap-[var(--space-md)]">
            <h1 className="text-[length:var(--type-money)] leading-[var(--type-money-leading)] font-semibold">
              The money is already in their name
            </h1>
            <p className={PROSE}>
              Put money behind someone&apos;s goal. It becomes theirs as they make verified progress, and
              whatever they do not earn comes back to you. Nobody profits from anyone failing.
            </p>
          </section>

          <section className="flex flex-col items-center gap-[var(--space-lg)] rounded-[var(--radius-sheet)] bg-[var(--joy)] p-[var(--space-xl)]">
            <Drop mood="happy" size={96} />
            <Link href="/fund" className={PRIMARY_BUTTON}>
              Offer a gift
            </Link>
            <Link href="/account" className={SECONDARY_BUTTON}>
              I already have an account
            </Link>
          </section>
        </div>

        <section className="flex flex-col gap-[var(--space-md)]">
          <h2 className={TITLE}>How it works</h2>
          <ol className="grid gap-[var(--space-md)] [@media(min-width:600px)]:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className={CARD}>
                <p className={MONEY}>{step.n}</p>
                <p className={PROSE}>{step.what}</p>
              </li>
            ))}
          </ol>
        </section>

        <Footer current="/" />
      </Screen>
    );
  }

  return (
    <Screen
      layout="destination"
      aside={
        <>
          <MyGifts />
          <Footer current="/" />
        </>
      }
    >
      <YourMoney />
      <Link href="/fund" className={PRIMARY_BUTTON}>
        Offer a gift
      </Link>
      <Link href="/account" className={`${HELP} underline`}>
        Account, help and legal
      </Link>
    </Screen>
  );
}
