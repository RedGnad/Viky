"use client";
import Link from "next/link";
import { useAccount } from "@/src/account/provider";
import { AccountPanel } from "./AccountPanel";
import { Footer } from "./Footer";
import { MyGifts } from "./MyGifts";
import { YourMoney } from "./YourMoney";
import { PRIMARY_BUTTON, PROSE, TITLE } from "./ui";

/**
 * The one destination, in the order that suits whoever is reading it.
 *
 * Two rules from the research pull in opposite directions, and both are right about a different person.
 * Somebody who already has gifts opens Viky to read a number, and 57 % of the time spent on a page is above
 * the fold with more than 42 % of it in the top fifth, so their money goes first. Somebody on a first visit
 * has no number to read: for them the top of the page is a passkey prompt for a product nobody has described,
 * which is what GOV.UK's start page pattern exists to prevent, and what Apple means by delaying the account
 * until after something useful has happened.
 *
 * So the order is decided by which of the two is reading. It is the same page either way, and nothing is
 * hidden from anybody: what changes is what comes first.
 */
export function HomeScreen() {
  const { address } = useAccount();

  const what = (
    <section className="flex flex-col gap-[var(--space-sm)]">
      <h1 className={TITLE}>The money is already in their name</h1>
      <p className={PROSE}>
        Put money behind someone&apos;s goal. It becomes theirs as they make verified progress, and whatever
        they do not earn comes back to you. Nobody profits from anyone failing.
      </p>
    </section>
  );

  const give = (
    <Link href="/fund" className={PRIMARY_BUTTON}>
      Put money behind someone&apos;s goal
    </Link>
  );

  if (!address) {
    return (
      <>
        {what}
        <AccountPanel />
        <Footer current="/" />
      </>
    );
  }

  return (
    <>
      <YourMoney />
      <MyGifts />
      {give}
      <AccountPanel />
      {what}
      <Footer current="/" />
    </>
  );
}
