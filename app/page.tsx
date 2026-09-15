import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "./components/Footer";
import { AccountPanel } from "./components/AccountPanel";
import { MyGifts } from "./components/MyGifts";
import { Screen } from "./components/Screen";
import { YourMoney } from "./components/YourMoney";
import { PRIMARY_BUTTON, PROSE, TITLE } from "./components/ui";

export const metadata: Metadata = {
  title: "Viky",
};

/**
 * The one destination. Money first, then what I receive, then what I give.
 *
 * The order is measured rather than chosen: 57 % of the time a person spends on a page is above the fold and
 * more than 42 % of it in the top fifth, so the thing they opened Viky to read goes there. What used to be
 * there was three paragraphs explaining what Viky is, above the money. An explanation is what somebody needs
 * once; the money is what they came back for.
 *
 * The explanation has not been deleted, it has moved below the gifts, where a first visit still meets it,
 * because a first visit has no money and no gifts to show and the page would otherwise be empty.
 */
export default function Page() {
  return (
    <Screen>
      <AccountPanel />
      <YourMoney />
      <MyGifts />

      <Link href="/fund" className={PRIMARY_BUTTON}>
        Put money behind someone&apos;s goal
      </Link>

      <section className="flex flex-col gap-[var(--space-sm)]">
        <h1 className={TITLE}>The money is already in their name</h1>
        <p className={PROSE}>
          Put money behind someone&apos;s goal. It becomes theirs as they make verified progress, and whatever
          they do not earn comes back to you. Nobody profits from anyone failing.
        </p>
      </section>

      <Footer current="/" />
    </Screen>
  );
}
