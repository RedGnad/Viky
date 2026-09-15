import type { Metadata } from "next";
import Link from "next/link";
import { AccountPanel } from "../components/AccountPanel";
import { Screen } from "../components/Screen";
import { SessionScope } from "../components/SessionScope";
import { ThemeSwitch } from "../components/ThemeSwitch";
import { CARD, HELP, PROSE } from "../components/ui";

export const metadata: Metadata = {
  title: "Account",
};

/**
 * Everything that is not a gift and not money.
 *
 * It exists so the rest of the product has no menu. Help, privacy, legal and the judges page used to sit in a
 * footer on every screen, which put four links at the bottom of a journey whose whole point is that there is
 * one way forward and one way back. They live here now, and every screen reaches this one place.
 */
const PAGES = [
  { href: "/privacy", label: "Privacy", what: "what Viky keeps, and what it never sees" },
  { href: "/legal", label: "Legal", what: "who runs Viky and under what terms" },
  { href: "/judges", label: "For judges", what: "the contracts, and how to check them yourself" },
] as const;

export default function Page() {
  return (
    <Screen
      layout="destination"
      title="Account"
      back="/"
      backLabel="Back to my gifts"
      aside={
        <>

      <section className={CARD}>
        <h2 className="font-medium">Lost your phone?</h2>
        <p className={PROSE}>
          Your account lives in your passkey, and your passkey is kept by Apple, Google or your password
          manager rather than by Viky. Sign in on the new phone the same way you did on the old one, and
          everything is there. There is nothing to write down and nothing we could send you.
        </p>
      </section>

      <nav className="flex flex-col gap-[var(--tap-gap)]">
        {PAGES.map((page) => (
          <Link key={page.href} href={page.href} className={`${CARD} block`}>
            <span className="font-medium">{page.label}</span>
            <span className={`block ${HELP}`}>{page.what}</span>
          </Link>
        ))}
      </nav>
        </>
      }
    >
      <AccountPanel />
      <SessionScope />
      <ThemeSwitch />
    </Screen>
  );
}
